// 履歴書ツールの自由記述欄を日本語へ翻訳する安全なバックエンド（要件⑥）。
// APIキーはサーバー側のみで保持し、ブラウザから直接 Claude API を呼ばない構成。
//
// 【セキュリティ】このエンドポイントは有料APIを呼ぶため、無認証の公開プロキシに
// ならないよう既定では無効。運用者が明示的に有効化し、許可オリジンを指定して初めて動く。
//   ENABLE_TRANSLATE_API   … "true" のときのみ有効（未設定なら常に503）
//   TRANSLATE_ALLOWED_ORIGINS … 呼び出しを許可するオリジン（カンマ区切り、ワイルドカード不可）
//     例: https://akina12231988-star.github.io
//   TRANSLATE_SHARED_TOKEN … 任意。設定時は x-translate-token ヘッダ一致を必須にする
// CORS は許可オリジンのみ反射（* は使わない）。入力量にも上限を設けて濫用コストを抑制する。

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 濫用・コスト上限
const MAX_FIELDS = 40;
const MAX_FIELD_CHARS = 300;
const MAX_TOTAL_CHARS = 5000;

function allowedOrigins(): string[] {
  return (process.env.TRANSLATE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// 許可オリジンのときだけ CORS ヘッダを付与（未許可なら付けない＝ブラウザが遮断）
function corsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-translate-token",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && allowedOrigins().includes(origin)) {
    base["Access-Control-Allow-Origin"] = origin;
  }
  return base;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

interface TranslateBody {
  from?: string;
  texts?: Record<string, string>;
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);
  const json = (data: unknown, status = 200) =>
    NextResponse.json(data, { status, headers });

  // 1) 明示的に有効化されていなければ動かさない
  if (process.env.ENABLE_TRANSLATE_API !== "true") {
    return json({ error: "翻訳バックエンドは無効です", translations: {} }, 503);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ error: "翻訳バックエンドが未設定です", translations: {} }, 503);
  }

  // 2) オリジン許可制（許可リストが空なら全拒否）
  const allow = allowedOrigins();
  if (origin) {
    if (!allow.includes(origin)) return json({ error: "許可されていないオリジンです", translations: {} }, 403);
  } else if (allow.length > 0) {
    // Originヘッダの無い（＝ブラウザ以外の）リクエストは、許可リスト運用時は拒否
    return json({ error: "オリジンが確認できません", translations: {} }, 403);
  }

  // 3) 任意の共有トークン
  const sharedToken = process.env.TRANSLATE_SHARED_TOKEN;
  if (sharedToken && req.headers.get("x-translate-token") !== sharedToken) {
    return json({ error: "認証に失敗しました", translations: {} }, 401);
  }

  let body: TranslateBody;
  try {
    body = (await req.json()) as TranslateBody;
  } catch {
    return json({ error: "リクエストの解析に失敗しました", translations: {} }, 400);
  }

  const from = typeof body.from === "string" && body.from ? body.from : "外国語";
  const texts = body.texts && typeof body.texts === "object" ? body.texts : {};
  let total = 0;
  const payload: Record<string, string> = {};
  for (const [k, v] of Object.entries(texts)) {
    if (typeof v !== "string") continue;
    const val = v.trim();
    if (!val) continue;
    if (Object.keys(payload).length >= MAX_FIELDS) break;
    const clipped = val.slice(0, MAX_FIELD_CHARS);
    if (total + clipped.length > MAX_TOTAL_CHARS) break;
    total += clipped.length;
    payload[k] = clipped;
  }
  if (Object.keys(payload).length === 0) {
    return json({ translations: {} });
  }

  try {
    const client = new Anthropic({ apiKey });
    const prompt =
      `以下のJSONは${from}で書かれた特定技能外国人の履歴書フィールドです。` +
      `すべての値を自然で正確な日本語に翻訳してください。\n` +
      `ルール:\n` +
      `- 氏名・会社名などの固有名詞はローマ字のままにしてよい\n` +
      `- 空文字は空文字のまま\n` +
      `- JSONのキーは変更せず、値だけ翻訳する\n` +
      `- 説明や前置きは書かず、翻訳後のJSONオブジェクトのみを返す\n\n` +
      JSON.stringify(payload);

    const res = await client.messages.create(
      {
        model: "claude-haiku-4-5",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      },
      { timeout: 25000 },
    );

    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

    let translations: Record<string, string> = {};
    try {
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") translations[k] = v;
      }
    } catch {
      translations = payload; // 解析できない場合は原文を返す（フローを止めない）
    }
    return json({ translations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "翻訳に失敗しました";
    return json({ error: message, translations: payload }, 502);
  }
}
