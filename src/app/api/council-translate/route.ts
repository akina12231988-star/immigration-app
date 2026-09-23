import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { COUNCIL_LANGS, type CouncilLang } from "@/lib/council-list";

// 協力確認書の一覧表（参考様式1-17号（別紙））の営業所名・市区町村などを、支援対象者の言語に訳す。
// 地名はローマ字にし、行政区分（県・市・町など）だけをその言語の言葉にする
// （例: クメール語「長崎県雲仙市」→「ខេត្ត Nagasaki, ទីក្រុង Unzen」）。ログインしている職員だけが使える
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXTS = 60;
const MAX_LENGTH = 100;

const Output = z.object({
  translations: z.array(z.object({ source: z.string(), translated: z.string() })),
});

export async function POST(req: NextRequest) {
  const me = await getMyProfile();
  if (!me || me.role === "viewer") return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "自動翻訳の設定がありません（Vercel の環境変数 ANTHROPIC_API_KEY）。訳は表の中で手で入力できます。" },
      { status: 503 },
    );
  }
  let body: { lang?: unknown; texts?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const lang = COUNCIL_LANGS.find((l) => l.code === body.lang);
  const texts = Array.isArray(body.texts)
    ? body.texts.filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => t.slice(0, MAX_LENGTH)).slice(0, MAX_TEXTS)
    : [];
  if (!lang) return NextResponse.json({ error: "言語が不正です" }, { status: 400 });
  if (texts.length === 0) return NextResponse.json({ translations: {} });

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(Output) },
      system:
        "あなたは特定技能外国人の支援計画書（参考様式1-17号の別紙）を翻訳する担当者です。" +
        "日本の営業所名・市区町村名・確認方法を、指定された言語に訳してください。" +
        "地名はヘボン式ローマ字（長音記号なし。例: 雲仙→Unzen、八代→Yatsushiro）で書き、" +
        "都道府県・市・区・町・村・郡などの行政区分だけをその言語の言葉にします。" +
        "例（クメール語）: 長崎県雲仙市 → ខេត្ត Nagasaki, ទីក្រុង Unzen ／ 愛野営業所 → សាខា Aino ／ 北海道安平町 → Hokkaido, ឃុំ Abira。" +
        "例（英語）: 長崎県雲仙市 → Unzen City, Nagasaki ／ 愛野営業所 → Aino Branch。" +
        "説明は付けず、訳だけを返します。",
      messages: [
        {
          role: "user",
          content:
            `訳す言語: ${lang.name}\n次の各文を訳してください。source は元の文のまま返してください。\n` +
            JSON.stringify(texts),
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return NextResponse.json({ error: "翻訳できませんでした" }, { status: 502 });
    }
    const out: Record<string, string> = {};
    for (const t of response.parsed_output.translations) {
      if (texts.includes(t.source) && t.translated.trim()) out[t.source] = t.translated.trim();
    }
    return NextResponse.json({ translations: out, lang: lang.code as CouncilLang });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "翻訳サーバーが混み合っています。少し待ってからやり直してください" }, { status: 429 });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "翻訳サーバーの設定が正しくありません（APIキー）" }, { status: 503 });
    }
    const message = err instanceof Anthropic.APIError ? `${err.status}: ${err.message}` : String(err);
    console.error("[council-translate]", message);
    return NextResponse.json({ error: "翻訳に失敗しました" }, { status: 502 });
  }
}
