// 随時報告書の一覧を「所属機関の名称」または「外国人の氏名」で絞り込む。
// 退職・契約内容変更・支援委託終了のどの記録も、届出書に載せる機関名の
// スナップショット（org_name）を持ち、無ければ機関マスタの名称を使う。
// 外国人は記録に紐づく workers（氏名・ふりがな）から探す。

import { matchesOrganizationName } from "@/lib/org-search";
import { matchesWorkerName } from "@/lib/worker-search";

export interface AdhocOrgRow {
  org_name: string;
  organizations: { id: string; name: string } | null;
  workers?: { name: string; kana?: string | null } | null;
}

// 検索の候補（機関名か外国人名か）
export interface AdhocSearchCandidate {
  id: string;
  name: string;
  kana?: string | null;
  kind: "org" | "worker";
}

// その記録の所属機関名（記録時点のスナップショットを優先）
export function adhocOrgName(row: AdhocOrgRow): string {
  return row.org_name || row.organizations?.name || "";
}

// 入力した機関名または外国人名で絞り込む（空欄なら全件。書き方の揺れは org-search / worker-search が吸収する）
export function matchesAdhocOrg(row: AdhocOrgRow, query: string): boolean {
  if (!query.trim()) return true;
  const orgName = adhocOrgName(row);
  if (orgName && matchesOrganizationName({ name: orgName }, query)) return true;
  return !!row.workers?.name && matchesWorkerName(row.workers, query);
}

// 検索の候補に出す機関名と外国人名（一覧に出ているものだけ・重複なし・五十音順。機関→外国人の順）
export function adhocOrgCandidates(rows: AdhocOrgRow[]): AdhocSearchCandidate[] {
  const orgs = new Set<string>();
  const workers = new Map<string, string | null | undefined>();
  for (const r of rows) {
    const name = adhocOrgName(r);
    if (name) orgs.add(name);
    if (r.workers?.name) workers.set(r.workers.name, r.workers.kana);
  }
  const byJa = (a: string, b: string) => a.localeCompare(b, "ja");
  return [
    ...[...orgs].sort(byJa).map((name) => ({ id: `org:${name}`, name, kind: "org" as const })),
    ...[...workers.keys()].sort(byJa).map((name) => ({ id: `worker:${name}`, name, kana: workers.get(name), kind: "worker" as const })),
  ];
}

// 候補の絞り込み（機関名は法人格や全角半角の揺れを吸収、外国人名はふりがなでも）。最大 limit 件
export function adhocSearchSuggestions<T extends AdhocSearchCandidate>(candidates: T[], query: string, limit = 8): T[] {
  if (!query.trim()) return [];
  return candidates
    .filter((c) => (c.kind === "org" ? matchesOrganizationName({ name: c.name }, query) : matchesWorkerName(c, query)))
    .slice(0, limit);
}
