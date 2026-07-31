import type { WorkerOrgEmploymentStart } from "@/types/db";

// ---- 所属機関別の雇用開始日（workers.org_employment_starts jsonb） ----

// 保存済みの値（欠けたキーがあり得る）を完全な形に補完する
export function normalizeOrgEmploymentStarts(raw: unknown): WorkerOrgEmploymentStart[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => {
    const src = (e && typeof e === "object" ? e : {}) as Partial<WorkerOrgEmploymentStart>;
    return {
      organization_id: typeof src.organization_id === "string" ? src.organization_id : "",
      start_on: typeof src.start_on === "string" ? src.start_on : "",
    };
  });
}

// 機関IDに対応する雇用開始日（未登録は null）
export function employmentStartForOrg(
  entries: WorkerOrgEmploymentStart[],
  organizationId: string | null | undefined,
): string | null {
  if (!organizationId) return null;
  const hit = entries.find((e) => e.organization_id === organizationId && e.start_on);
  return hit ? hit.start_on : null;
}
