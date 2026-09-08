// 自由記述の日本語化。
//   1) 内蔵辞書（国籍・言語・続柄・病気・職種などの決まった語）で確実に変換（通信なし）
//   2) 残った非日本語の自由記述は、このシステムの /api/translate（サーバー側でAPIキーを持つ）で翻訳
//   3) 翻訳サーバーに届かなくても、原文のまま履歴書は必ず作れる
// すでに日本語の入力（住所・会社名など）と氏名は翻訳しない。

import { RESUME_LANG_JA, type ResumeLang } from "./i18n";
import { FREE_TEXT_KEYS, RESUME_DICT } from "./options";
import type { ResumeData } from "./form";

export const TRANSLATE_ENDPOINT = "/api/translate";
export const TRANSLATE_TIMEOUT_MS = 25000;

export const NOTE_SERVER_UNREACHABLE =
  "翻訳サーバーに接続できなかったため、一部の自由記述は入力言語のまま出力しました。";

export function hasJapanese(s: string): boolean {
  return /[぀-ヿ㐀-鿿]/.test(String(s ?? ""));
}

// 辞書の引き方: 小文字・空白1つ・末尾の句読点なし
export function dictJa(s: string): string | null {
  if (!s) return null;
  const k = String(s)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,。、･・･]+$/, "");
  return RESUME_DICT[k] ?? null;
}

// 翻訳サーバーの呼び出し（テストで差し替えられるように関数で受ける）
export type TranslateFn = (from: string, texts: Record<string, string>) => Promise<Record<string, string>>;

export const fetchTranslations: TranslateFn = async (from, texts) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TRANSLATE_TIMEOUT_MS);
  try {
    const res = await fetch(TRANSLATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, texts }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const out = (await res.json()) as { translations?: Record<string, string> };
    return out?.translations ?? {};
  } finally {
    clearTimeout(timer);
  }
};

interface Slot {
  get: () => string;
  set: (v: string) => void;
}

// 翻訳の対象になる欄（自由記述・会社名・続柄・仕事）を列挙する
function freeTextSlots(d: ResumeData): Slot[] {
  const slots: Slot[] = FREE_TEXT_KEYS.map((k) => ({
    get: () => d[k],
    set: (v) => {
      d[k] = v;
    },
  }));
  d.careers.forEach((c) => {
    slots.push({ get: () => c.comp, set: (v) => (c.comp = v) });
  });
  d.families.forEach((f) => {
    slots.push({ get: () => f.rel, set: (v) => (f.rel = v) });
    slots.push({ get: () => f.job, set: (v) => (f.job = v) });
  });
  return slots;
}

// 入力内容を日本語にする（元のデータは変えず、コピーを返す）
export async function translateResumeData(
  src: ResumeData,
  lang: ResumeLang,
  translate: TranslateFn = fetchTranslations,
): Promise<ResumeData> {
  const d: ResumeData = structuredClone(src);
  d.translateNote = "";
  if (lang === "ja") return d; // 日本語入力はそのまま

  const slots = freeTextSlots(d);
  // 1) 内蔵辞書で確定変換
  for (const s of slots) {
    const t = s.get();
    if (t && !hasJapanese(t)) {
      const ja = dictJa(t);
      if (ja) s.set(ja);
    }
  }
  // 2) 辞書で変換できなかった非日本語の自由記述
  const rest = slots.filter((s) => s.get() && !hasJapanese(s.get()));
  if (rest.length === 0) return d;

  // 3) 翻訳サーバーで残りを翻訳
  const texts: Record<string, string> = {};
  rest.forEach((s, i) => {
    texts[`t${i}`] = s.get();
  });
  try {
    const tr = await translate(RESUME_LANG_JA[lang] ?? lang, texts);
    rest.forEach((s, i) => {
      const v = tr[`t${i}`];
      if (typeof v === "string" && v !== "") s.set(v);
    });
  } catch {
    d.translateNote = NOTE_SERVER_UNREACHABLE;
  }
  return d;
}
