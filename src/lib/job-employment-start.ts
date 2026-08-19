import type { WorkerOrgEmploymentStart } from "@/types/db";

// 求職一覧で「雇用開始済み」を判定するのに必要な外国人の情報だけ
export interface EmploymentStartWorker {
  id: string;
  employment_start_on?: string | null; // 今の所属機関での雇用開始日
  current_organization_id?: string | null;
  org_employment_starts?: WorkerOrgEmploymentStart[] | null; // 所属機関別の雇用開始日
}

// その外国人が、その所属機関で雇用開始しているか（開始日を返す。まだなら null）。
// 所属機関別の記録（org_employment_starts）を優先し、無ければ
// 今その機関にいる人だけ「雇用開始日」を使う（会社・機関マスタの名簿と同じ考え方）。
export function employmentStartAt(
  worker: EmploymentStartWorker | undefined,
  organizationId: string | null | undefined,
): string | null {
  if (!worker) return null;
  const list = Array.isArray(worker.org_employment_starts) ? worker.org_employment_starts : [];
  if (organizationId) {
    for (const e of list) {
      if (e?.organization_id === organizationId && e.start_on) return e.start_on;
    }
    if (worker.current_organization_id === organizationId && worker.employment_start_on) {
      return worker.employment_start_on;
    }
    return null;
  }
  // 応募に所属機関が無い場合は、どこかで雇用開始していれば「済み」とみなす
  const any = list.find((e) => e?.start_on)?.start_on;
  return any ?? worker.employment_start_on ?? null;
}

export function hasEmploymentStarted(
  worker: EmploymentStartWorker | undefined,
  organizationId: string | null | undefined,
): boolean {
  return !!employmentStartAt(worker, organizationId);
}
