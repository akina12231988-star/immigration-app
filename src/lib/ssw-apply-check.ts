// 特定技能総合保険の申込内容の添削。
//
// 保険の申込サイト（被保険者情報の一覧）をコピーして貼り付けると、
// 氏名・生年月日・性別・保険期間（加入月数）・所属機関名が
// システムの情報と合っているかを1行ずつ突き合わせる。
// 申込のあとに「入力し間違えていないか」を確かめるために使う。

import { normalizeSearchText } from "@/lib/worker-search";
import { matchesOrganizationName } from "@/lib/org-search";
import {
  slashDate,
  sswInsuranceMonths,
  type SswInsuranceRow,
} from "@/lib/ssw-insurance";

// 貼り付けた1行から読み取った内容（読み取れなかった項目は空）
export interface SswApplyLine {
  raw: string;
  name: string; // アルファベットの氏名
  gender: string; // 男 / 女
  birth: string; // 生年月日 YYYY-MM-DD
  months: number | null; // 保険期間（〇ヶ月）
  startOn: string; // 着金日以降の保険始期希望日 YYYY-MM-DD
  orgName: string; // 特定技能所属機関名
}

// 日付の書き方の揺れ（2026/09/08・2026-09-08・1998年03月03日）をそろえる
const DATE_RE = /(\d{4})\s*[/\-年.]\s*(\d{1,2})\s*[/\-月.]\s*(\d{1,2})\s*日?/g;

function pad(n: string): string {
  return n.padStart(2, "0");
}

// 1行を読み取る。列の位置ではなく「日付」「性別」「〇ヶ月」の形で拾うので、
// タブ区切り・空白区切り・改行のずれがあっても読める
export function parseSswApplyLine(raw: string): SswApplyLine | null {
  const line = raw.trim();
  if (!line) return null;

  const dates: string[] = [];
  const withoutDates = line.replace(DATE_RE, (_m, y: string, mo: string, d: string) => {
    dates.push(`${y}-${pad(mo)}-${pad(d)}`);
    return " ";
  });

  // 氏名（アルファベット。2文字以上の大文字のまとまり）
  const nameMatch = line.match(/[A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z'.-]+)*/);
  const name = (nameMatch?.[0] ?? "").trim();

  // 性別（男性・女性の表記も許す）
  const genderMatch = withoutDates.match(/(男性|女性|男|女)/);
  const gender = genderMatch ? genderMatch[1].replace("性", "") : "";

  // 保険期間（7ヶ月・7カ月・7か月・7ヵ月・7ケ月）。日付は先に抜いてあるので月と混ざらない
  const monthsMatch = withoutDates.match(/(\d{1,2})\s*[ヶヵカケか]月/);
  const months = monthsMatch ? Number(monthsMatch[1]) : null;

  // 所属機関名: 会社らしい日本語のまとまり（株式会社・有限会社・農園 など）か、
  // 行の最後にある日本語のまとまりを使う
  const orgMatch =
    withoutDates.match(/[^\s\t]*(?:株式会社|有限会社|合同会社|農園|農場|牧場)[^\s\t]*/) ??
    withoutDates.match(/[一-龥ぁ-んァ-ヶ][^\s\t]*$/);
  const orgName = (orgMatch?.[0] ?? "").trim();

  if (!name && dates.length === 0) return null;

  return {
    raw: line,
    name,
    gender,
    // 日付は「生年月日 → 保険始期希望日」の順に出てくる
    birth: dates[0] ?? "",
    months,
    startOn: dates[1] ?? "",
    orgName,
  };
}

export function parseSswApplyText(text: string): SswApplyLine[] {
  return text
    .split(/\r?\n/)
    .map(parseSswApplyLine)
    .filter((l): l is SswApplyLine => l !== null);
}

// 突き合わせの結果（1行ぶん）
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
  const key = normalizeSearchText(name);
  if (!key) return undefined;
  return (
    rows.find((r) => normalizeSearchText(r.worker.name) === key) ??
    rows.find((r) => normalizeSearchText(r.worker.name).includes(key))
  );
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
    if (line.orgName && found.orgName && !matchesOrganizationName({ name: found.orgName }, line.orgName)) {
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
