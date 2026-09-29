// ---- 添付PDFの記載チェック（申請準備の詳細） ----
//
// 添付したPDFの文字を読み、外国人の登録内容（氏名・フリガナ・生年月日・在留カード番号・
// 国籍・住所）と所属機関の登録内容（名称・住所・電話番号・代表者）が
// そのまま書かれているかを見る。別人の書類が混ざっていないか、
// 引っ越し前の住所のままではないか、といった取り違えを見つけるためのもの。
//
// PDFの文字の取り出し（pdfjs）は画面側で行い、このファイルは
// 「取り出した文字列をどう照合するか」だけを持つ（テストできる形）。
// 読み取りも照合も端末の中で終わり、外部へは送らない。
//
// 判定は3つ。
//   一致       … 登録内容がそのまま書かれていた
//   違う値     … 同じ種類の値が書かれているが、登録内容と違う（在留カード番号・ラベル付きの生年月日）
//   見つからない … 書かれていなかった（その書類には元々無い項目かもしれない）
// 「見つからない＝間違い」ではないので、画面では断定せず確認をうながす。

export type PdfCheckStatus = "found" | "different" | "missing";

// 照合する項目の種類。種類ごとに「違う値」の見つけ方が変わる
export type PdfCheckKind = "text" | "name" | "date" | "cardNo";

export interface PdfCheckItem {
  key: string;
  label: string; // 「氏名」「生年月日」など
  value: string; // 登録内容
  kind: PdfCheckKind;
  // 書かれていないときに注意色で出すか（氏名など、本人の書類なら必ずあるはずのもの）
  important?: boolean;
  // 照合に使う別の書き方（姓名の順が逆、ミドルネーム無しなど）
  alternatives?: string[];
}

export interface PdfCheckResult extends PdfCheckItem {
  status: PdfCheckStatus;
  found: string[]; // 「違う値」のときに見つかった値
}

// ---- 文字の正規化 ----

// 照合用にそろえる（全角→半角、空白・記号を落とす、大文字に）。
// PDFは字の間に空白が入りがちなので、空白は全部落として比べる
export function normalizeForMatch(s: string): string {
  return (s ?? "")
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .replace(/[・･,，.。、]/g, "")
    .replace(/[‐-‒–—―ー−]/g, "-")
    .toUpperCase();
}

// カタカナ→ひらがな（フリガナの書き方の違いを吸収する）
export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// 氏名の照合用。カナはひらがなにそろえる
function normalizeName(s: string): string {
  return toHiragana(normalizeForMatch(s));
}

// ---- 日付 ----

const ERA_BASE: Record<string, number> = { 令和: 2018, 平成: 1988, 昭和: 1925, 大正: 1911, 明治: 1867 };

// 文字列の中の日付を YYYY-MM-DD にして全部返す（西暦・令和・平成などに対応）
export function findDates(text: string): string[] {
  const s = (text ?? "").normalize("NFKC");
  const out: string[] = [];
  const push = (y: number, m: number, d: number) => {
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return;
    out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  };
  // 令和3年5月3日 / 令和元年5月3日
  for (const m of s.matchAll(/(令和|平成|昭和|大正|明治)\s*(元|\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g)) {
    const base = ERA_BASE[m[1]];
    const year = m[2] === "元" ? 1 : Number(m[2]);
    push(base + year, Number(m[3]), Number(m[4]));
  }
  // 2001年5月3日
  for (const m of s.matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g)) {
    push(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  // 2001/5/3 ・ 2001-05-03 ・ 2001.5.3
  for (const m of s.matchAll(/(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})/g)) {
    push(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  return [...new Set(out)];
}

// ---- 在留カード番号 ----

// 在留カード番号の形（英字2＋数字8＋英字2）
export const RESIDENCE_CARD_NO_RE = /[A-Z]{2}\d{8}[A-Z]{2}/g;

export function findResidenceCardNos(text: string): string[] {
  return [...new Set((text ?? "").normalize("NFKC").toUpperCase().match(RESIDENCE_CARD_NO_RE) ?? [])];
}

// ---- ラベルの後ろの値 ----

// 「生年月日 2001年5月3日」のように、ラベルの直後に書かれた日付を取り出す
export function datesAfterLabel(text: string, labels: string[]): string[] {
  const s = (text ?? "").normalize("NFKC");
  const out: string[] = [];
  for (const label of labels) {
    const re = new RegExp(`${label}[^0-9]{0,8}([^\\n]{0,24})`, "g");
    for (const m of s.matchAll(re)) out.push(...findDates(m[1]));
  }
  return [...new Set(out)];
}

// ---- 照合 ----

// 住所の照合用。番地以降は書き方が割れるので市区町村までで見る。
// 都道府県は「熊本市東区…」のように省かれた書類があるので落とす
// （政令指定都市は区まで見る。例: 熊本県熊本市東区小山3-8-87 → 熊本市東区）
export function addressHead(address: string): string {
  const body = normalizeForMatch(address).replace(/^.+?[都道府県]/, "");
  return (/^(.+?市.+?区)/.exec(body) ?? /^(.+?[市区町村])/.exec(body))?.[1] ?? body.slice(0, 10);
}

// 1項目ぶんの照合
export function checkItem(item: PdfCheckItem, text: string): PdfCheckResult {
  const base = { ...item, found: [] as string[] };
  const value = (item.value ?? "").trim();
  if (!value) return { ...base, status: "missing" };

  const hay = item.kind === "name" ? normalizeName(text) : normalizeForMatch(text);
  const candidates = [value, ...(item.alternatives ?? [])]
    .map((v) => (item.kind === "name" ? normalizeName(v) : normalizeForMatch(v)))
    .filter(Boolean);

  if (item.kind === "date") {
    const want = findDates(value)[0] ?? value;
    if (findDates(text).includes(want)) return { ...base, status: "found" };
    // 「生年月日」の欄に別の日付が書かれていたら、取り違えの疑いとして出す
    const labeled = datesAfterLabel(text, ["生年月日", "生 年 月 日", "出生の年月日"]);
    const other = labeled.filter((d) => d !== want);
    return other.length > 0
      ? { ...base, status: "different", found: other }
      : { ...base, status: "missing" };
  }

  if (item.kind === "cardNo") {
    const want = normalizeForMatch(value);
    const found = findResidenceCardNos(text);
    if (found.includes(want)) return { ...base, status: "found" };
    const other = found.filter((n) => n !== want);
    return other.length > 0
      ? { ...base, status: "different", found: other }
      : { ...base, status: "missing" };
  }

  return candidates.some((c) => hay.includes(c))
    ? { ...base, status: "found" }
    : { ...base, status: "missing" };
}

export function checkPdfText(items: PdfCheckItem[], text: string): PdfCheckResult[] {
  return items.map((i) => checkItem(i, text));
}

// ---- 照合する項目を組み立てる ----

export interface PdfCheckWorker {
  name: string;
  kana?: string;
  birth?: string | null;
  residence_card_no?: string;
  nationality?: string;
  address?: string;
}

export interface PdfCheckOrganization {
  name: string;
  address?: string;
  tel?: string;
  representative?: string;
}

// 氏名の別の書き方（「NGUYEN VAN A」→「A NGUYEN VAN」のように姓名が入れ替わっている書類がある）
function nameAlternatives(name: string): string[] {
  const parts = name.trim().split(/[\s　]+/).filter(Boolean);
  if (parts.length < 2) return [];
  return [[...parts.slice(1), parts[0]].join(""), [parts.at(-1)!, ...parts.slice(0, -1)].join("")];
}

export function buildPdfCheckItems(
  worker: PdfCheckWorker,
  org?: PdfCheckOrganization | null,
): PdfCheckItem[] {
  const items: PdfCheckItem[] = [
    {
      key: "name",
      label: "氏名",
      value: worker.name ?? "",
      kind: "name",
      important: true,
      alternatives: nameAlternatives(worker.name ?? ""),
    },
    { key: "kana", label: "フリガナ", value: worker.kana ?? "", kind: "name" },
    { key: "birth", label: "生年月日", value: worker.birth ?? "", kind: "date", important: true },
    {
      key: "card",
      label: "在留カード番号",
      value: worker.residence_card_no ?? "",
      kind: "cardNo",
    },
    { key: "nationality", label: "国籍", value: worker.nationality ?? "", kind: "text" },
    {
      key: "address",
      label: "住所（市区町村まで）",
      value: addressHead(worker.address ?? ""),
      kind: "text",
    },
  ];
  if (org) {
    items.push(
      { key: "orgName", label: "所属機関の名称", value: org.name ?? "", kind: "text" },
      {
        key: "orgAddress",
        label: "所属機関の住所（市区町村まで）",
        value: addressHead(org.address ?? ""),
        kind: "text",
      },
      { key: "orgTel", label: "所属機関の電話番号", value: org.tel ?? "", kind: "text" },
      { key: "orgRep", label: "所属機関の代表者", value: org.representative ?? "", kind: "name" },
    );
  }
  // 登録されていない項目は照合しない（「見つからない」が並ぶだけになるため）
  return items.filter((i) => (i.value ?? "").trim() !== "");
}

// ---- まとめ ----

export interface PdfCheckSummary {
  different: number; // 違う値が見つかった項目
  missingImportant: number; // 氏名・生年月日など、あるはずなのに見つからなかった項目
  found: number;
  total: number;
}

export function pdfCheckSummary(results: PdfCheckResult[]): PdfCheckSummary {
  return {
    different: results.filter((r) => r.status === "different").length,
    missingImportant: results.filter((r) => r.status === "missing" && r.important).length,
    found: results.filter((r) => r.status === "found").length,
    total: results.length,
  };
}

// 画面の見出しに出す一言
export function pdfCheckHeadline(s: PdfCheckSummary): string {
  if (s.different > 0) return `登録内容と違う値が ${s.different}件 見つかりました`;
  if (s.missingImportant > 0) return `本人の情報が見つかりませんでした（${s.missingImportant}件）`;
  return `登録内容と食い違うところは見つかりませんでした（一致 ${s.found}/${s.total}件）`;
}
