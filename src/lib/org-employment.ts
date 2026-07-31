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

// 機関の雇用開始日を追加・更新した新しい配列を返す（同じ機関の行があれば日付を上書き）。
// 申請詳細の「雇用開始日・在留資格を保存」からの自動連携に使う
export function upsertOrgEmploymentStart(
  entries: WorkerOrgEmploymentStart[],
  organizationId: string,
  startOn: string,
): WorkerOrgEmploymentStart[] {
  if (entries.some((e) => e.organization_id === organizationId)) {
    return entries.map((e) =>
      e.organization_id === organizationId ? { ...e, start_on: startOn } : e,
    );
  }
  return [...entries, { organization_id: organizationId, start_on: startOn }];
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
