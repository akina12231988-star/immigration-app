// 特定技能総合保険の申込内容の添削。
//
// 保険の申込サイト（被保険者情報の一覧）のPDF、またはコピーして貼り付けた文字から、
// 氏名・生年月日・性別・保険期間（加入月数）・保険始期希望日・所属機関名を読み取り、
// システムの情報と合っているかを1人ずつ突き合わせる。
// 申込のあとに「入力し間違えていないか」を確かめるために使う。
//
// 読み取りの考え方（請求書PDFの照合と同じ）:
//   ・行の形や列の位置に頼らず、「システムに登録されている氏名」を手がかりに
//     1人分の範囲を切り出す。PDFでは氏名が2行に分かれたり、単語の途中で
//     空白が入ったり（「NHA N」）するため、空白を全部取り除いた形で探す
//   ・切り出した範囲の中から、日付（生年月日は古い年・始期希望日は新しい年）、
//     性別、「〇ヶ月」、所属機関名を拾う。列の順番が違っても読める
//   ・システムに無い氏名（大文字アルファベットで始まる行）も1人分として出し、
//     「該当者なし」と知らせる

import { normalizeOrgSearchText, orgSearchKeys } from "@/lib/org-search";
import {
  slashDate,
  sswInsuranceMonths,
  type SswInsuranceRow,
} from "@/lib/ssw-insurance";

// 1人分として読み取った内容（読み取れなかった項目は空）
export interface SswApplyLine {
  raw: string; // 読み取りに使った範囲の文字（空白をまとめたもの）
  name: string; // アルファベットの氏名（システムに居る人はシステムの表記）
  known: boolean; // システムの氏名で見つけたか（false は該当者なしの疑い）
  gender: string; // 男 / 女
  birth: string; // 生年月日 YYYY-MM-DD
  months: number | null; // 保険期間（〇ヶ月）
  startOn: string; // 着金日以降の保険始期希望日 YYYY-MM-DD
  orgName: string; // 特定技能所属機関名（読み取れた範囲）
}

// 日付の書き方の揺れ（2026/09/08・2026-09-08・1998年03月03日・1998.03.03）をそろえる
const DATE_RE = /(\d{4})\s*[/\-年.]\s*(\d{1,2})\s*[/\-月.]\s*(\d{1,2})\s*日?/g;

// 生年月日と保険始期希望日を分ける年。特定技能の制度は2019年からなので、
// これより前の年の日付は生年月日、あとの年の日付は始期希望日（や在留期限）とみなす
const BIRTH_BEFORE_YEAR = 2012;

function pad(n: string): string {
  return n.padStart(2, "0");
}

// 全角のアルファベットを半角に、小文字を大文字にそろえる（1文字ずつ・長さは変わらない）
function foldLetter(c: string): string {
  const code = c.charCodeAt(0);
  if (code >= 0xff21 && code <= 0xff3a) return String.fromCharCode(code - 0xff21 + 0x41); // Ａ-Ｚ
  if (code >= 0xff41 && code <= 0xff5a) return String.fromCharCode(code - 0xff41 + 0x41); // ａ-ｚ
  if (code >= 0x61 && code <= 0x7a) return String.fromCharCode(code - 0x20); // a-z
  return c;
}

const SPACE_RE = /[\s　]/;

// 氏名の突き合わせ用の形（空白なし・大文字）。
// 「VO  QUANG BEN」のように空白が2つあっても、PDFで「NHA N」と切れていても合う
export function normalizeApplyName(name: string): string {
  let out = "";
  for (const c of name) if (!SPACE_RE.test(c)) out += foldLetter(c);
  return out;
}

// 空白を取り除いた文字列と、その各文字が元の文字列のどこにあったか
function flatten(text: string): { flat: string; pos: number[] } {
  let flat = "";
  const pos: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (SPACE_RE.test(c)) continue;
    flat += foldLetter(c);
    pos.push(i);
  }
  return { flat, pos };
}

function isAsciiLetter(c: string | undefined): boolean {
  return c !== undefined && /[A-Za-zＡ-Ｚａ-ｚ]/.test(c);
}

// 1人分の始まり（氏名の位置）。start・end は元の文字列の位置
interface Anchor {
  start: number;
  end: number;
  name: string;
  known: boolean;
}

function overlaps(a: Anchor, list: Anchor[]): boolean {
  return list.some((b) => a.start < b.end && b.start < a.end);
}

// システムの氏名が出てくる場所を全部探す。長い氏名から先に探し、
// 「TRAN VAN A」が「TRAN VAN ANH」の中に紛れないよう、前後がアルファベットなら採らない
function findKnownAnchors(text: string, knownNames: string[]): Anchor[] {
  const { flat, pos } = flatten(text);
  const keys = new Map<string, string>(); // 突き合わせ用の形 → システムの表記
  for (const name of knownNames) {
    const key = normalizeApplyName(name);
    if (key.length >= 3 && !keys.has(key)) keys.set(key, name.trim());
  }
  const sorted = [...keys.entries()].sort((a, b) => b[0].length - a[0].length);

  const anchors: Anchor[] = [];
  for (const [key, name] of sorted) {
    for (let at = flat.indexOf(key); at >= 0; at = flat.indexOf(key, at + 1)) {
      const start = pos[at];
      const end = pos[at + key.length - 1] + 1;
      if (isAsciiLetter(text[start - 1]) || isAsciiLetter(text[end])) continue;
      const anchor = { start, end, name, known: true };
      if (!overlaps(anchor, anchors)) anchors.push(anchor);
    }
  }
  return anchors;
}

// システムに無い氏名。行の頭にある大文字アルファベット2語以上のまとまりを氏名とみなす
// （申込サイトの氏名は大文字で、表の1列目＝行の頭にある）
const UNKNOWN_NAME_RE = /^[ \t　]*([A-Z]{2,}(?:[ \t　]+[A-Z][A-Z'.-]*)+)/gm;

function findUnknownAnchors(text: string, known: Anchor[]): Anchor[] {
  const anchors: Anchor[] = [];
  for (const m of text.matchAll(UNKNOWN_NAME_RE)) {
    const start = m.index + m[0].length - m[1].length;
    const anchor = { start, end: start + m[1].length, name: m[1].replace(/\s+/g, " "), known: false };
    if (!overlaps(anchor, known) && !overlaps(anchor, anchors)) anchors.push(anchor);
  }
  return anchors;
}

// 1人分ずつの範囲（氏名から次の氏名の手前まで）
export interface SswApplyRecord {
  name: string;
  known: boolean;
  text: string;
}

export function splitSswApplyRecords(text: string, knownNames: string[]): SswApplyRecord[] {
  const known = findKnownAnchors(text, knownNames);
  const anchors = [...known, ...findUnknownAnchors(text, known)].sort((a, b) => a.start - b.start);

  const records: SswApplyRecord[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const next = anchors[i + 1];
    const body = text.slice(a.start, next ? next.start : text.length);
    const last = records[records.length - 1];
    // 同じ人の氏名が続けて出てきたら（氏名とふりがなの欄が別など）1人分にまとめる
    if (last && last.known && a.known && last.name === a.name) {
      last.text += body;
      continue;
    }
    records.push({ name: a.name, known: a.known, text: body });
  }
  return records;
}

// 会社らしい言葉（所属機関名を読み取れないときの手がかり）
const ORG_WORD_RE = /[^\s\t　]*(?:株式会社|有限会社|合同会社|農園|農場|牧場|法人|組合)[^\s\t　]*/;

// 1人分の範囲から各項目を読み取る。
//   orgNames … システムに登録されている所属機関名（読み取った範囲に出てくれば、その名前を使う）
export function parseSswApplyRecord(record: SswApplyRecord, orgNames: string[] = []): SswApplyLine {
  const text = record.text;
  const dates: { y: number; date: string }[] = [];
  const withoutDates = text.replace(DATE_RE, (_m, y: string, mo: string, d: string) => {
    dates.push({ y: Number(y), date: `${y}-${pad(mo)}-${pad(d)}` });
    return " ";
  });

  // 生年月日は古い年、始期希望日は新しい年の最初の日付（列の順番に頼らない）
  const birth = dates.find((d) => d.y < BIRTH_BEFORE_YEAR)?.date ?? "";
  const startOn = dates.find((d) => d.y >= BIRTH_BEFORE_YEAR)?.date ?? "";

  // 性別（男性・女性の表記も許す）。会社名などの中の字と混ざらないよう、
  // まわりが空白で区切られているものを先に探す
  const genderMatch =
    withoutDates.match(/(?:^|[\s　])(男性|女性|男|女)(?=$|[\s　])/) ??
    withoutDates.match(/(男性|女性|男|女)/);
  const gender = genderMatch ? genderMatch[1].replace("性", "") : "";

  // 保険期間（7ヶ月・7カ月・7か月・7ヵ月・7ケ月・7箇月）。日付は先に抜いてあるので月と混ざらない
  const monthsMatch = withoutDates.match(/(\d{1,2})\s*[ヶヵカケか箇]月/);
  const months = monthsMatch ? Number(monthsMatch[1]) : null;

  // 所属機関名: システムに登録されている機関名が出てくればそれ（長い名前から先に見る）、
  // 無ければ会社らしい言葉のまとまり
  const orgName =
    [...orgNames].sort((a, b) => b.length - a.length).find((o) => includesOrgName(text, o)) ??
    (withoutDates.match(ORG_WORD_RE)?.[0] ?? "").trim();

  return {
    raw: text.replace(/[\s　]+/g, " ").trim(),
    name: record.name,
    known: record.known,
    gender,
    birth,
    months,
    startOn,
    orgName,
  };
}

// 読み取った範囲に、その所属機関名が書かれているか。
// 法人格の有無（ベース株式会社／株式会社ベース／BASE）や全角・半角の違いは同じ扱い
export function includesOrgName(text: string, orgName: string): boolean {
  const body = normalizeOrgSearchText(text);
  if (!body) return false;
  // 法人格を取り除いた形が短すぎるとき（「株式会社A」→「a」）は誤って合わないよう、そのままの形だけで見る
  const keys = orgSearchKeys(orgName).filter((k, i) => i === 0 || k.length >= 2);
  return keys.some((k) => k.length > 0 && body.includes(k));
}

// 貼り付けた文字（またはPDFの行）から読み取る。
//   knownNames … システムの氏名（一覧に出ている人）。これを手がかりに1人分ずつ切り出す
//   orgNames   … システムの所属機関名
export function parseSswApplyText(
  text: string,
  knownNames: string[] = [],
  orgNames: string[] = [],
): SswApplyLine[] {
  return splitSswApplyRecords(text, knownNames).map((r) => parseSswApplyRecord(r, orgNames));
}

// PDFから取り出した行など、行の配列から読み取る
export function parseSswApplyLines(
  lines: string[],
  knownNames: string[] = [],
  orgNames: string[] = [],
): SswApplyLine[] {
  return parseSswApplyText(lines.join("\n"), knownNames, orgNames);
}

// 突き合わせの結果（1人ぶん）
export interface SswApplyIssue {
  field: string; // 生年月日 / 性別 / 保険期間 / 所属機関名
  expected: string; // システムの値
  actual: string; // 申込に書かれていた値
}

export interface SswApplyCheckRow {
  line: SswApplyLine;
  workerId: string | null;
  workerName: string; // 見つかったシステム上の氏名
  issues: SswApplyIssue[];
  ok: boolean; // 見つかって、違いも無い
}

export interface SswApplyCheckResult {
  rows: SswApplyCheckRow[];
  // 申込手続中なのに、貼り付けた内容に出てこない人（申込もれの疑い）
  missing: { id: string; name: string }[];
}

// 氏名が同じ人を探す（空白の入れ方・大文字小文字の違いは無視する）
function findWorker(rows: SswInsuranceRow[], name: string): SswInsuranceRow | undefined {
  const key = normalizeApplyName(name);
  if (!key) return undefined;
  return rows.find((r) => normalizeApplyName(r.worker.name) === key);
}

// 一覧の人の氏名（読み取りの手がかり）
export function sswApplyKnownNames(rows: SswInsuranceRow[]): string[] {
  return rows.map((r) => r.worker.name);
}

// 貼り付けた申込内容と、システムの情報を突き合わせる。
//   candidates … 氏名を探す先（一覧に出ている人みんな）
//   expected   … 申込に出てくるはずの人（申込手続中の人）。
//                ここに居るのに貼り付けに出てこない人を「申込もれの疑い」として返す
export function checkSswApply(
  lines: SswApplyLine[],
  candidates: SswInsuranceRow[],
  expected: SswInsuranceRow[] = candidates,
): SswApplyCheckResult {
  const seen = new Set<string>();
  const rows: SswApplyCheckRow[] = lines.map((line) => {
    const found = findWorker(candidates, line.name);
    if (!found) {
      return { line, workerId: null, workerName: "", issues: [], ok: false };
    }
    seen.add(found.worker.id);
    const w = found.worker;
    const issues: SswApplyIssue[] = [];

    if (line.birth && w.birth && line.birth !== w.birth) {
      issues.push({ field: "生年月日", expected: slashDate(w.birth), actual: slashDate(line.birth) });
    }
    if (line.gender && w.gender && line.gender !== w.gender) {
      issues.push({ field: "性別", expected: w.gender, actual: line.gender });
    }
    if (line.months !== null) {
      // 保険期間は、申込に書かれた始期希望日から在留期限までに必要な月数と比べる
      const need = sswInsuranceMonths(line.startOn, w.residence_expiry_date);
      if (need !== null && need !== line.months) {
        issues.push({
          field: "保険期間",
          expected: `${need}ヶ月（在留期限 ${slashDate(w.residence_expiry_date)} まで）`,
          actual: `${line.months}ヶ月`,
        });
      }
    }
    // 所属機関名: システムの機関名が読み取った範囲に出てくれば合っている。
    // 出てこなくて、別の機関名（会社らしい言葉）が書かれていたら違いとして知らせる
    if (found.orgName && line.orgName && !includesOrgName(line.raw, found.orgName)) {
      issues.push({ field: "所属機関名", expected: found.orgName, actual: line.orgName });
    }

    return {
      line,
      workerId: w.id,
      workerName: w.name,
      issues,
      ok: issues.length === 0,
    };
  });

  const missing = expected
    .filter((r) => !seen.has(r.worker.id))
    .map((r) => ({ id: r.worker.id, name: r.worker.name }));

  return { rows, missing };
}

// 結果の要約（「10件中 8件OK・1件に違い・1件は該当者なし」）
export function sswApplySummary(result: SswApplyCheckResult): string {
  const total = result.rows.length;
  const ok = result.rows.filter((r) => r.ok).length;
  const diff = result.rows.filter((r) => r.workerId && !r.ok).length;
  const unknown = result.rows.filter((r) => !r.workerId).length;
  return `${total}件を照合：合っている ${ok}件／違いあり ${diff}件／システムに該当者なし ${unknown}件`;
}
