import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  DEFAULT_TRANSLATE_ORIGINS,
  isTranslateOriginAllowed,
  pickTranslateTexts,
} from "@/lib/translate-api";

// 履歴書ツール（tokutei-rireki）の自動翻訳の受け口。
//
// ツール（このシステムの /resume と、GitHub Pages の旧ツール）は本人の入力
// （会社名・住所・趣味など、内蔵辞書で日本語にできない自由記述）を
//   POST { from: "ベトナム語", texts: { t0: "...", t1: "..." } }
// で送ってくる。ここで日本語に訳して { translations: { t0: "...", ... } } を返す。
// APIキー（ANTHROPIC_API_KEY）はサーバーだけが持ち、ブラウザには出さない。
//
// ツールはログインしていない外国人本人がスマホで使うため、この受け口はログイン不要。
// そのかわり、呼び出し元（Origin）を履歴書ツールの公開URLに限り、件数・文字数も絞る。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// このシステムの中の履歴書ツール（/resume）からの呼び出し（同じサーバー）はいつでも許す
function originAllowed(req: NextRequest): boolean {
  return isTranslateOriginAllowed(
    req.headers.get("origin"),
    process.env.TRANSLATE_ALLOWED_ORIGINS,
    req.headers.get("host"),
  );
}

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": originAllowed(req) ? (origin as string) : DEFAULT_TRANSLATE_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, req: NextRequest) {
  return NextResponse.json(body, { status, headers: corsHeaders(req) });
}

// ブラウザの事前確認（CORS）
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

const Output = z.object({
  translations: z.array(
    z.object({
      key: z.string(),
      ja: z.string(),
    }),
  ),
});

export async function POST(req: NextRequest) {
  if (!originAllowed(req)) {
    return json({ error: "この呼び出し元からは使えません" }, 403, req);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "翻訳サーバーの設定がありません（ANTHROPIC_API_KEY）" }, 503, req);
  }

  let body: { from?: unknown; texts?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "不正なリクエストです" }, 400, req);
  }
  const from = typeof body.from === "string" ? body.from.slice(0, 40) : "";
  const texts = body.texts && typeof body.texts === "object" ? (body.texts as Record<string, unknown>) : null;
  if (!texts) return json({ error: "不正なリクエストです" }, 400, req);

  const entries = pickTranslateTexts(texts);
  if (entries.length === 0) return json({ translations: {} }, 200, req);

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(Output) },
      system:
        "あなたは特定技能外国人の履歴書を日本語に直す翻訳者です。渡された短い文（会社名・住所・趣味・病名・仕事の内容など）を、日本の履歴書にそのまま書ける自然な日本語に訳してください。" +
        "固有名詞（会社名・地名・人名）は一般的な日本語表記（カタカナや通称）にし、分からないときは原文のままにします。" +
        "説明や補足は付けず、訳した文だけを返します。すでに日本語のものはそのまま返します。",
      messages: [
        {
          role: "user",
          content:
            `入力した言語: ${from || "不明"}\n` +
            "次の各項目を日本語に訳してください。key はそのまま返してください。\n" +
            JSON.stringify(Object.fromEntries(entries), null, 0),
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return json({ error: "翻訳できませんでした" }, 502, req);
    }
    const out: Record<string, string> = {};
    for (const t of response.parsed_output.translations) {
      if (t.key in texts && t.ja.trim()) out[t.key] = t.ja.trim();
    }
    return json({ translations: out }, 200, req);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: "翻訳サーバーが混み合っています。少し待ってからやり直してください" }, 429, req);
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return json({ error: "翻訳サーバーの設定が正しくありません（APIキー）" }, 503, req);
    }
    const message = err instanceof Anthropic.APIError ? `${err.status}: ${err.message}` : String(err);
    console.error("[translate]", message);
    return json({ error: "翻訳に失敗しました" }, 502, req);
  }
}
