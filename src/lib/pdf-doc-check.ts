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
export type PdfCheckKind = "text" | "name" | "date" | "cardNo" | "orgName";

export interface PdfCheckItem {
  key: string;
  label: string; // 「氏名」「生年月日」など
  value: string; // 登録内容
  kind: PdfCheckKind;
  // 書かれていないときに注意色で出すか（氏名など、本人の書類なら必ずあるはずのもの）
  important?: boolean;
  // 照合に使う別の書き方（姓名の順が逆、ミドルネーム無しなど）
  alternatives?: string[];
  // 「違う値」を探すときに見るラベル（日付用）。空の配列を渡すと「違う値」は探さない
  labels?: string[];
}

export interface PdfCheckResult extends PdfCheckItem {
  status: PdfCheckStatus;
  found: string[]; // 「違う値」のときに見つかった値
  where: string[]; // その値が書かれていたところ（「7ページ」など）
  alsoFound: string[]; // 「違う値」のとき、登録どおりに書かれていたところ
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

// ---- 会社の種類（法人格） ----

// 「株式会社◯◯」と「有限会社◯◯」のように、名前は同じで種類だけ違う書類が混ざることがある。
// 名前の部分と種類を分けて持ち、種類だけ違う書き方を「違う値」として見つける
export const CORP_KINDS = [
  "株式会社",
  "有限会社",
  "合同会社",
  "合資会社",
  "合名会社",
  "一般社団法人",
  "公益社団法人",
  "一般財団法人",
  "公益財団法人",
  "医療法人社団",
  "医療法人",
  "社会福祉法人",
  "学校法人",
  "宗教法人",
  "農事組合法人",
  "特定非営利活動法人",
  "事業協同組合",
  "協同組合",
] as const;

export function splitCorpKind(name: string): { kind: string; core: string } {
  const n = normalizeForMatch(name);
  for (const k of CORP_KINDS) {
    if (n.startsWith(k)) return { kind: k, core: n.slice(k.length) };
    if (n.endsWith(k)) return { kind: k, core: n.slice(0, -k.length) };
  }
  return { kind: "", core: n };
}

// 名前の部分は合っているのに、別の種類（株式会社／有限会社など）で書かれている書き方を返す
export function otherCorpNames(name: string, text: string): string[] {
  const { kind, core } = splitCorpKind(name);
  if (!core) return [];
  const hay = normalizeForMatch(text);
  const out: string[] = [];
  for (const k of CORP_KINDS) {
    if (k === kind) continue;
    if (hay.includes(k + core)) out.push(k + core);
    else if (hay.includes(core + k)) out.push(core + k);
  }
  return out;
}

// 1項目ぶんの照合
export function checkItem(item: PdfCheckItem, text: string): PdfCheckResult {
  const base = { ...item, found: [] as string[], where: [] as string[], alsoFound: [] as string[] };
  const value = (item.value ?? "").trim();
  if (!value) return { ...base, status: "missing" };

  const hay = item.kind === "name" ? normalizeName(text) : normalizeForMatch(text);
  const candidates = [value, ...(item.alternatives ?? [])]
    .map((v) => (item.kind === "name" ? normalizeName(v) : normalizeForMatch(v)))
    .filter(Boolean);

  if (item.kind === "date") {
    const want = findDates(value)[0] ?? value;
    if (findDates(text).includes(want)) return { ...base, status: "found" };
    // 「生年月日」の欄に別の日付が書かれていたら、取り違えの疑いとして出す。
    // 日付の種類がそれと分かる項目（labels）だけで見る
    const labels = item.labels ?? ["生年月日", "生 年 月 日", "出生の年月日"];
    if (labels.length === 0) return { ...base, status: "missing" };
    const other = datesAfterLabel(text, labels).filter((d) => d !== want);
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

  if (item.kind === "orgName") {
    if (hay.includes(normalizeForMatch(value))) return { ...base, status: "found" };
    // 「株式会社◯◯」と「有限会社◯◯」のような、種類だけ違う書き方を見つける
    const other = otherCorpNames(value, text);
    if (other.length > 0) return { ...base, status: "different", found: other };
    // 種類を書いていないだけ（「◯◯」だけ）なら、名前は合っているので一致にする
    const { core } = splitCorpKind(value);
    return core && hay.includes(core)
      ? { ...base, status: "found" }
      : { ...base, status: "missing" };
  }

  return candidates.some((c) => hay.includes(c))
    ? { ...base, status: "found" }
    : { ...base, status: "missing" };
}

// ---- 束（何ページもある書類一式）の照合 ----

export interface PdfCheckPage {
  label: string; // 「7ページ」「申請書.pdf 3ページ」など、見つけた場所の呼び名
  text: string;
}

// 入管へ出す書類一式は、いろいろな書類が1つの束になっている。
// どれか1ページにでも登録どおり書かれていれば「一致」、
// 別の値が書かれているページがあれば、たとえ他のページが合っていても「違う値」として出す
// （1ページ目だけ会社の種類が違う、というような取り違えを見落とさないため）。
export function checkPdfPages(items: PdfCheckItem[], pages: PdfCheckPage[]): PdfCheckResult[] {
  return items.map((item) => {
    const okWhere: string[] = [];
    const ngWhere: string[] = [];
    const ngValues: string[] = [];
    for (const p of pages) {
      const r = checkItem(item, p.text);
      if (r.status === "found") okWhere.push(p.label);
      else if (r.status === "different") {
        ngWhere.push(p.label);
        ngValues.push(...r.found);
      }
    }
    if (ngValues.length > 0) {
      return {
        ...item,
        status: "different",
        found: [...new Set(ngValues)],
        where: ngWhere,
        alsoFound: okWhere,
      };
    }
    if (okWhere.length > 0) {
      return { ...item, status: "found", found: [], where: okWhere, alsoFound: [] };
    }
    return { ...item, status: "missing", found: [], where: [], alsoFound: [] };
  });
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
      { key: "orgName", label: "所属機関の名称", value: org.name ?? "", kind: "orgName" },
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

// ---- 申請準備の詳細（申請書に貼る情報）から照合する項目を組み立てる ----
//
// 申請準備の「申請書に貼る情報」は、そのまま入管へ出す書類に書く値。
// 同じ値が、添付した完成書類にそのとおり書かれているかを見る。
//
// 項目は80個ほどあるが、そのまま全部を照合すると
//   ・「男」「無」のような短い値 … どの書類にも当たってしまう
//   ・「◯年◯か月」のような計算値 … 書類にはその形で書かれていない
// ので、照合しても意味のないものは外す。

export interface PrepCheckRow {
  label: string;
  value: string;
}

// 照合しない項目（計算した値・書類にその形で書かれないもの）
const PREP_SKIP_LABEL = /職歴|通算在留期間|保証金|違約金|届出|確認方法|自由記入/;

// 住所の項目（番地以降は書き方が割れるので市区町村までで見る）
const PREP_ADDRESS_LABEL = /住所|所在地|居住地|住居地/;

// 日付（YYYY-MM-DD）を「2024年4月1日」の形にする（画面に出すため。照合はどちらでもできる）
function ymdJa(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : ymd;
}

function prepKind(label: string, value: string): PdfCheckKind {
  if (/在留カード番号/.test(label)) return "cardNo";
  if (/生年月日/.test(label)) return "date";
  if (/名称|会社名|事業所名/.test(label)) return "orgName";
  if (/フリガナ|氏名|代表者|責任者|担当者/.test(label)) return "name";
  if (findDates(value).length > 0 && normalizeForMatch(value).length <= 12) return "date";
  return "text";
}

// importantValues には、その書類一式に必ず書かれているはずの値
// （本人の氏名・生年月日・国籍・在留カード番号、特定技能所属機関の名称）を渡す。
// 見つからないときに注意色で出す
export function buildPrepCheckItems(
  rows: PrepCheckRow[],
  importantValues: string[] = [],
): PdfCheckItem[] {
  const out: PdfCheckItem[] = [];
  const seen = new Set<string>();
  // 日付は「2000-05-02」と「2000年5月2日」のどちらで渡されても同じものとして見る
  const same = (v: string) => findDates(v)[0] ?? normalizeForMatch(v);
  const important = new Set(importantValues.map(same).filter((v) => v.length >= 3));
  const push = (label: string, value: string, kind: PdfCheckKind) => {
    const norm = kind === "date" ? (findDates(value)[0] ?? "") : normalizeForMatch(value);
    // 短い値はどの書類にも当たってしまうので照合しない
    if (norm.length < 3) return;
    const key = `${kind}:${norm}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      key: `prep${out.length}`,
      label,
      value: kind === "date" ? ymdJa(value) : value,
      kind,
      important: important.has(same(value)),
      alternatives: kind === "name" ? nameAlternatives(value) : undefined,
      // 日付は「生年月日」だけ、欄に別の日付が入っていないかまで見る
      labels: kind === "date" && !/生年月日/.test(label) ? [] : undefined,
    });
  };

  for (const row of rows) {
    const label = (row.label ?? "").trim();
    const value = (row.value ?? "").trim();
    if (!label || !value) continue;
    if (PREP_SKIP_LABEL.test(label)) continue;

    if (PREP_ADDRESS_LABEL.test(label)) {
      push(`${label}（市区町村まで）`, addressHead(value), "text");
      continue;
    }
    const dates = findDates(value);
    if (dates.length >= 2) {
      // 「2024年4月1日 から 2026年3月31日 まで」のような期間は、日付ごとに見る
      dates.forEach((d, i) => push(`${label}（${i + 1}つ目の日付）`, d, "date"));
      continue;
    }
    // 長い説明文はそのまま書かれないので照合しない
    if (normalizeForMatch(value).length > 40) continue;
    push(label, value, prepKind(label, value));
  }
  return out;
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
