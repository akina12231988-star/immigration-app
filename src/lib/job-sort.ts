// 求職一覧（応募）の並び替え。
//
// 採用年月日（結果日）や雇用開始日の準備をするときに、日付の順で並べ直せるようにする。
// 日付が入っていない応募は、新しい順・古い順のどちらでも最後にまとめる
// （「これから決まるもの」が上に来ると、日付の並びが読めなくなるため）。

export const JOB_SORTS = [
  "応募日（新しい順）",
  "応募日（古い順）",
  "採用年月日（新しい順）",
  "採用年月日（古い順）",
  "雇用開始日（新しい順）",
  "雇用開始日（古い順）",
] as const;

export type JobSort = (typeof JOB_SORTS)[number];

export const DEFAULT_JOB_SORT: JobSort = "応募日（新しい順）";

// 並び替えに使う日付を取り出す（無ければ null）
export interface JobSortRow {
  applied_on: string;
  result_on?: string | null;
}

function sortKey(
  sort: JobSort,
  row: JobSortRow,
  employmentStartOf: (row: JobSortRow) => string | null,
): string | null {
  if (sort.startsWith("応募日")) return row.applied_on || null;
  if (sort.startsWith("採用年月日")) return row.result_on || null;
  return employmentStartOf(row) || null;
}

function isDescending(sort: JobSort): boolean {
  return sort.endsWith("（新しい順）");
}

// 応募を指定の並びに並べ替える（元の配列は変えない）。
// employmentStartOf: その応募の雇用開始日を返す関数（外国人の情報から求める）
export function sortJobApplications<T extends JobSortRow>(
  rows: T[],
  sort: JobSort,
  employmentStartOf: (row: T) => string | null = () => null,
): T[] {
  const desc = isDescending(sort);
  return [...rows].sort((a, b) => {
    const ka = sortKey(sort, a, employmentStartOf as (row: JobSortRow) => string | null);
    const kb = sortKey(sort, b, employmentStartOf as (row: JobSortRow) => string | null);
    // 日付が無いものは、どちらの順でも最後にまとめる
    if (!ka && !kb) return b.applied_on.localeCompare(a.applied_on);
    if (!ka) return 1;
    if (!kb) return -1;
    const d = desc ? kb.localeCompare(ka) : ka.localeCompare(kb);
    // 同じ日なら応募日の新しい順で並べる（毎回同じ並びになるように）
    return d !== 0 ? d : b.applied_on.localeCompare(a.applied_on);
  });
}
