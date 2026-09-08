// 履歴書ツールの自動翻訳の受け口（/api/translate）の判定ロジック（テストできる形）。
// 呼び出し元は、このシステムの中の履歴書ツール（/resume）と、GitHub Pages の旧ツール。

// 呼び出しを許す元のURL。環境変数 TRANSLATE_ALLOWED_ORIGINS（カンマ区切り）で増やせる
export const DEFAULT_TRANSLATE_ORIGINS = ["https://akina12231988-star.github.io"];
export const MAX_TRANSLATE_TEXTS = 60;
export const MAX_TRANSLATE_TEXT_LENGTH = 300;

export function translateAllowedOrigins(extra: string | undefined): string[] {
  const list = (extra ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return [...DEFAULT_TRANSLATE_ORIGINS, ...list];
}

// 呼び出し元がこのシステム自身（/resume の履歴書ツール）なら Host と一致する
export function isSameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export function isTranslateOriginAllowed(
  origin: string | null,
  extra: string | undefined,
  host: string | null = null,
): boolean {
  if (!origin) return false;
  return isSameOrigin(origin, host) || translateAllowedOrigins(extra).includes(origin);
}

// 送られてきた texts のうち、翻訳する項目（文字だけ・空でない）を件数と長さで絞る
export function pickTranslateTexts(texts: unknown): [string, string][] {
  if (!texts || typeof texts !== "object") return [];
  return Object.entries(texts as Record<string, unknown>)
    .filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== "")
    .slice(0, MAX_TRANSLATE_TEXTS)
    .map(([k, v]) => [k.slice(0, 20), v.trim().slice(0, MAX_TRANSLATE_TEXT_LENGTH)]);
}
