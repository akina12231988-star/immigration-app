import type { Application } from "@/types/application";
import type { WorkerWithOrg } from "@/lib/supabase/queries/workers";
import { isResidenceRenewalTarget } from "@/lib/worker-alerts";
import { underReviewWorkerIds } from "@/lib/renewal-filter";

// 擬似行のIDに付ける接頭辞。実在の申請レコードと区別するために使う
const PLACEHOLDER_PREFIX = "renewal-placeholder-";

export function isRenewalPlaceholder(app: Application): boolean {
  return app.id.startsWith(PLACEHOLDER_PREFIX);
}

// 在留更新対象で「準備中」にした外国人を、申請一覧に「申請前＜準備中＞」として
// 表示するための擬似行を作る。実際に申請したら申請登録（/applications/new）で
// 実レコードを作成し、審査中になった時点で擬似行は消える。
export function buildRenewalPlaceholders(
  workers: WorkerWithOrg[],
  applications: Application[],
  today: string,
): Application[] {
  const underReview = new Set(underReviewWorkerIds(applications));
  // 実レコードとして「申請前」を登録済みの外国人は擬似行を出さない（二重表示防止）
  const hasPreApplication = new Set(
    applications
      .filter((a) => a.workerId && a.status === "申請前")
      .map((a) => a.workerId as string),
  );

  return workers
    .filter(
      (w) =>
        w.residence_renewal_status === "準備中" &&
        isResidenceRenewalTarget(w, today) &&
        !underReview.has(w.id) &&
        !hasPreApplication.has(w.id),
    )
    .sort((a, b) => (a.residence_expiry_date ?? "").localeCompare(b.residence_expiry_date ?? ""))
    .map((w) => ({
      id: `${PLACEHOLDER_PREFIX}${w.id}`,
      workerId: w.id,
      workerName: w.name,
      workerRenewalStatus: w.residence_renewal_status,
      organizationId: w.current_organization_id ?? null,
      organizationName: w.organizations?.name ?? null,
      name: w.name,
      applicationDate: "",
      applicationNumber: "",
      applicationContent: "",
      method: "窓口",
      emailLink: "",
      residenceExpiryAtApply: w.residence_expiry_date ?? undefined,
      isSelfApply: false,
      reportOrgHonorific: "御中",
      approvalReported: false,
      lineReported: false,
      notionSynced: false,
      approved: false,
      status: "申請前",
      assignee: "",
      createdAt: "",
      updatedAt: "",
    }));
}
