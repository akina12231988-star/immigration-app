import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { warekiDate } from "@/lib/dependents";
import { birthSeireki } from "@/lib/person-copy";
import { canonicalSubmissionKey } from "@/lib/submission-list";

// ---- 理由書（申請準備の提出書類一覧表の行ごとに作って添付する。0233） ----

export const REASON_LETTER_MIGRATION = "0233_prep_reason_letters.sql";
export const REASON_LETTER_DEFAULT_TITLE = "理由書";
export const REASON_LETTER_DEFAULT_ADDRESSEE = "出入国在留管理庁長官 殿";

// 最後に入れる項目
export interface ReasonLetterOptions {
  name: boolean; // 申請人の氏名
  nationality: boolean; // 申請人の国籍・地域
  birth: boolean; // 申請人の生年月日
  sign: boolean; // 申請人の署名欄
  supportOrg: boolean; // 登録支援機関の名称
}
export const DEFAULT_REASON_LETTER_OPTIONS: ReasonLetterOptions = {
  name: true,
  nationality: true,
  birth: true,
  sign: true,
  supportOrg: false,
};
export const REASON_LETTER_OPTION_LABELS: Record<keyof ReasonLetterOptions, string> = {
  name: "申請人の氏名",
  nationality: "国籍・地域",
  birth: "生年月日",
  sign: "署名欄",
  supportOrg: "登録支援機関の名称",
};

export interface ReasonLetter {
  title: string;
  addressee: string;
  letterDate: string; // 表示する文字（例: 令和8年11月23日）
  body: string;
  options: ReasonLetterOptions;
}

export function normalizeReasonLetterOptions(v: unknown): ReasonLetterOptions {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_REASON_LETTER_OPTIONS };
  for (const k of Object.keys(out) as (keyof ReasonLetterOptions)[]) {
    if (typeof o[k] === "boolean") out[k] = o[k] as boolean;
  }
  return out;
}

// 新しく作るときの最初の内容（日付は今日を令和で）
export function emptyReasonLetter(today: string): ReasonLetter {
  return {
    title: REASON_LETTER_DEFAULT_TITLE,
    addressee: REASON_LETTER_DEFAULT_ADDRESSEE,
    letterDate: warekiDate(today),
    body: "",
    options: { ...DEFAULT_REASON_LETTER_OPTIONS },
  };
}

// 理由書を添付する保存キー（onboarding_documents.doc_key）。行に直接添付する書類とは別のキーにする
export function reasonLetterDocKey(rowKey: string): string {
  return `prep_reason_${rowKey.replace(/-/g, "_")}`;
}
// 候補を探すときの書類のキー（2号の同じ書類も1号のキーにそろえる）
export function reasonLetterFormKey(rowKey: string): string {
  return canonicalSubmissionKey(rowKey);
}

// 理由書の最後に並べる行（選んだ項目だけ）
export function reasonLetterFooterLines(
  options: ReasonLetterOptions,
  person: { name: string; nationality: string; birth: string | null },
  supportOrgName: string,
): string[] {
  const lines: string[] = [];
  if (options.name || options.nationality || options.birth || options.sign) lines.push("申請人");
  if (options.name) lines.push(`氏名　${person.name}`);
  if (options.nationality) lines.push(`国籍・地域　${person.nationality}`);
  if (options.birth) lines.push(`生年月日　${birthSeireki(person.birth)}`);
  if (options.sign) lines.push("署名　＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿");
  if (options.supportOrg && supportOrgName.trim()) {
    if (lines.length > 0) lines.push("");
    lines.push(`登録支援機関　${supportOrgName.trim()}`);
  }
  return lines;
}

// 幅に収まるよう1文字ずつ折り返す（改行はそのまま）
export function wrapReasonText(text: string, width: number, measure: (t: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const ch of para) {
      if (line && measure(line + ch) > width) {
        out.push(line);
        line = ch;
      } else line += ch;
    }
    out.push(line);
  }
  return out;
}

// A4 縦の理由書の PDF を作る（日付は右上、題名は中央、宛先・本文・最後の項目）
export async function buildReasonLetterPdf(
  fontBytes: Uint8Array | ArrayBuffer,
  letter: ReasonLetter,
  footerLines: string[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false }); // subset: true だと字が欠ける（ほかの様式と同じ）
  const W = 595.28;
  const H = 841.89;
  const M = 70; // 左右の余白
  const black = rgb(0, 0, 0);
  let page = doc.addPage([W, H]);
  let y = H - 70;
  const text = (s: string, x: number, size: number) => page.drawText(s, { x, y, size, font, color: black });

  // 日付（右寄せ）
  const dateSize = 11;
  if (letter.letterDate.trim()) text(letter.letterDate.trim(), W - M - font.widthOfTextAtSize(letter.letterDate.trim(), dateSize), dateSize);
  y -= 50;
  // 題名（中央）
  const title = letter.title.trim() || REASON_LETTER_DEFAULT_TITLE;
  const titleSize = 20;
  text(title, (W - font.widthOfTextAtSize(title, titleSize)) / 2, titleSize);
  y -= 50;
  // 宛先
  if (letter.addressee.trim()) {
    text(letter.addressee.trim(), M, 12);
    y -= 40;
  }
  // 本文
  const size = 11;
  const lh = size * 1.9;
  const newPageIfNeeded = (need: number) => {
    if (y - need < 60) {
      page = doc.addPage([W, H]);
      y = H - 70;
    }
  };
  for (const line of wrapReasonText(letter.body, W - M * 2, (t) => font.widthOfTextAtSize(t, size))) {
    newPageIfNeeded(lh);
    if (line) text(line, M, size);
    y -= lh;
  }
  // 最後の項目（右寄り・ページの下の方。本文が長ければ本文の後）
  if (footerLines.length > 0) {
    const fsz = 11;
    const flh = fsz * 2;
    const blockH = footerLines.length * flh;
    y = Math.min(y - 30, 60 + blockH);
    newPageIfNeeded(blockH);
    const x = W / 2 - 10;
    for (const line of footerLines) {
      if (line) text(line, x, fsz);
      y -= flh;
    }
  }
  return doc.save();
}
