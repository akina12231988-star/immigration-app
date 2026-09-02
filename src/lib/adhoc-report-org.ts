// 随時報告書の一覧を「所属機関の名称」で絞り込む。
// 退職・契約内容変更・支援委託終了のどの記録も、届出書に載せる機関名の
// スナップショット（org_name）を持ち、無ければ機関マスタの名称を使う。

import { matchesOrganizationName } from "@/lib/org-search";

export interface AdhocOrgRow {
  org_name: string;
  organizations: { id: string; name: string } | null;
}

// その記録の所属機関名（記録時点のスナップショットを優先）
export function adhocOrgName(row: AdhocOrgRow): string {
  return row.org_name || row.organizations?.name || "";
}

// 入力した機関名で絞り込む（空欄なら全件。書き方の揺れは org-search が吸収する）
export function matchesAdhocOrg(row: AdhocOrgRow, query: string): boolean {
  if (!query.trim()) return true;
  return matchesOrganizationName({ name: adhocOrgName(row) }, query);
}

// 検索の候補に出す機関名（一覧に出ている機関だけ・重複なし・五十音順）
export function adhocOrgCandidates(rows: AdhocOrgRow[]): { id: string; name: string }[] {
  const names = new Set<string>();
  for (const r of rows) {
    const name = adhocOrgName(r);
    if (name) names.add(name);
  }
  return [...names]
    .sort((a, b) => a.localeCompare(b, "ja"))
    .map((name) => ({ id: name, name }));
}
