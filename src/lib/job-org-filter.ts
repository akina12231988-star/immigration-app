// 求職一覧を「応募先の企業」で絞り込む。
//
// 同じ会社に何人も応募していることが多いため、会社を選ぶとその会社の応募だけを見られるようにする。
// 選択肢には、その会社の応募件数と採用の件数を出す（どこで採用が出ているかが分かる）。

export interface JobOrgRow {
  organization_id: string;
  result: string;
  organizations?: { id: string; name: string } | null;
  job_postings?: { display_company: string } | null;
}

export interface JobOrgOption {
  id: string; // organization_id
  name: string; // 画面に出す会社名
  total: number; // その会社への応募の件数
  hired: number; // うち採用の件数
}

// 応募先の表示名（求人票の掲載社名を優先し、無ければ所属機関の名称）
export function jobOrgName(row: JobOrgRow): string {
  return row.job_postings?.display_company || row.organizations?.name || "応募先なし";
}

// 絞り込みの選択肢。採用の多い順 → 応募の多い順 → 会社名の順に並べる
export function jobOrgOptions(rows: JobOrgRow[]): JobOrgOption[] {
  const map = new Map<string, JobOrgOption>();
  for (const row of rows) {
    const id = row.organization_id;
    if (!id) continue;
    const option = map.get(id) ?? { id, name: jobOrgName(row), total: 0, hired: 0 };
    option.total += 1;
    if (row.result === "採用") option.hired += 1;
    map.set(id, option);
  }
  return [...map.values()].sort(
    (a, b) => b.hired - a.hired || b.total - a.total || a.name.localeCompare(b.name, "ja"),
  );
}

// 採用が出ている会社だけの選択肢（「採用された企業」で見たいとき）
export function hiredOrgOptions(rows: JobOrgRow[]): JobOrgOption[] {
  return jobOrgOptions(rows).filter((o) => o.hired > 0);
}
