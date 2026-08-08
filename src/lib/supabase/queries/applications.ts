import type { SupabaseClient } from "@supabase/supabase-js";
import { monthEnd } from "@/lib/sales";
import type {
  Application,
  ApplicationContent,
  ApplicationMethod,
  ApplicationStatus,
  OrgHonorific,
} from "@/types/application";
import type { ImmigrationApplicationRow } from "@/types/db";

// workers / organizations を JOIN したときの行型
type RowWithRefs = ImmigrationApplicationRow & {
  workers: { id: string; name: string; residence_renewal_status: string | null } | null;
  organizations: { id: string; name: string } | null;
};

const SELECT =
  "*, workers(id, name, residence_renewal_status), organizations(id, name)";

function toApplication(row: RowWithRefs): Application {
  return {
    id: row.id,
    workerId: row.worker_id,
    workerName: row.workers?.name ?? null,
    workerRenewalStatus: row.workers?.residence_renewal_status ?? null,
    organizationId: row.organization_id ?? null,
    organizationName: row.organizations?.name ?? null,
    name: row.name,
    applicationDate: row.application_date,
    applicationNumber: row.application_no,
    applicationContent: row.content as ApplicationContent | "",
    method: (row.method as ApplicationMethod) ?? "窓口",
    emailLink: row.email_link ?? "",
    residenceExpiryAtApply: row.residence_expiry_at_apply ?? undefined,
    isSelfApply: row.is_self_apply ?? false,
    receiptImageUrl: row.receipt_image_url ?? undefined,
    noticeImageUrl: row.notice_image_url ?? undefined,
    residenceCardImageUrl: row.residence_card_image_url ?? undefined,
    approvalDate: row.approval_date ?? undefined,
    receiptScheduledOn: row.receipt_scheduled_on ?? undefined,
    receiptReason: row.receipt_reason ?? undefined,
    grantedCardNo: row.granted_card_no ?? undefined,
    grantedPermitDate: row.granted_permit_date ?? undefined,
    grantedExpiryDate: row.granted_expiry_date ?? undefined,
    employmentStartOn: row.employment_start_on ?? undefined,
    visaAtGrant: row.visa_at_grant ?? undefined,
    reportOrgHonorific: (row.report_org_honorific as OrgHonorific) ?? "御中",
    cardReceivedOn: row.card_received_on ?? undefined,
    withdrawnOn: row.withdrawn_on ?? undefined,
    approvalReported: row.approval_reported ?? false,
    lineReported: row.line_reported,
    notionSynced: row.notion_synced,
    approved: row.approved,
    status: row.status as ApplicationStatus,
    assignee: row.assignee,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// アプリ側の Partial<Application> を DB 列名へ変換（updated_at はトリガー任せ）
function toRowPatch(patch: Partial<Application>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.workerId !== undefined) row.worker_id = patch.workerId;
  if ("organizationId" in patch) row.organization_id = patch.organizationId ?? null;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.applicationDate !== undefined) row.application_date = patch.applicationDate;
  if (patch.applicationNumber !== undefined) row.application_no = patch.applicationNumber;
  if (patch.applicationContent !== undefined) row.content = patch.applicationContent;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.assignee !== undefined) row.assignee = patch.assignee;
  if (patch.lineReported !== undefined) row.line_reported = patch.lineReported;
  if (patch.notionSynced !== undefined) row.notion_synced = patch.notionSynced;
  if (patch.approved !== undefined) row.approved = patch.approved;
  if (patch.approvalDate !== undefined) row.approval_date = patch.approvalDate ?? null;
  if (patch.method !== undefined) row.method = patch.method;
  if (patch.emailLink !== undefined) row.email_link = patch.emailLink;
  if ("residenceExpiryAtApply" in patch)
    row.residence_expiry_at_apply = patch.residenceExpiryAtApply ?? null;
  if (patch.isSelfApply !== undefined) row.is_self_apply = patch.isSelfApply;
  if ("receiptScheduledOn" in patch) row.receipt_scheduled_on = patch.receiptScheduledOn ?? null;
  if (patch.receiptReason !== undefined) row.receipt_reason = patch.receiptReason;
  if (patch.grantedCardNo !== undefined) row.granted_card_no = patch.grantedCardNo;
  if ("grantedPermitDate" in patch) row.granted_permit_date = patch.grantedPermitDate ?? null;
  if ("grantedExpiryDate" in patch) row.granted_expiry_date = patch.grantedExpiryDate ?? null;
  if ("employmentStartOn" in patch) row.employment_start_on = patch.employmentStartOn ?? null;
  if (patch.visaAtGrant !== undefined) row.visa_at_grant = patch.visaAtGrant;
  if (patch.reportOrgHonorific !== undefined) row.report_org_honorific = patch.reportOrgHonorific;
  if (patch.cardReceivedOn !== undefined) row.card_received_on = patch.cardReceivedOn ?? null;
  // 取下げの取り消しで null に戻せるよう、キーの存在で判定する
  if ("withdrawnOn" in patch) row.withdrawn_on = patch.withdrawnOn ?? null;
  if (patch.approvalReported !== undefined) row.approval_reported = patch.approvalReported;
  return row;
}

export async function listApplications(supabase: SupabaseClient): Promise<Application[]> {
  const { data, error } = await supabase
    .from("immigration_applications")
    .select(SELECT)
    .order("application_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as RowWithRefs[]) ?? []).map(toApplication);
}

// 外国人詳細ページ用: 紐づく申請のみ（受付日の新しい順）
export async function listApplicationsByWorker(
  supabase: SupabaseClient,
  workerId: string,
): Promise<Application[]> {
  const { data, error } = await supabase
    .from("immigration_applications")
    .select(SELECT)
    .eq("worker_id", workerId)
    .order("application_date", { ascending: false });
  if (error) throw error;
  return ((data as RowWithRefs[]) ?? []).map(toApplication);
}

export type NewApplication = Omit<
  Application,
  "id" | "createdAt" | "updatedAt" | "workerName"
>;

export async function insertApplication(
  supabase: SupabaseClient,
  input: NewApplication,
): Promise<Application> {
  const { data, error } = await supabase
    .from("immigration_applications")
    .insert(toRowPatch(input))
    .select(SELECT)
    .single();
  if (error) throw error;
  return toApplication(data as RowWithRefs);
}

export async function updateApplicationRow(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Application>,
): Promise<Application> {
  const { data, error } = await supabase
    .from("immigration_applications")
    .update(toRowPatch(patch))
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return toApplication(data as RowWithRefs);
}

// 対象月に許可が下りた申請の「申請内容」を外国人ごとに返す（worker_id → 申請内容）。
// 請求書の備考で新規（在留資格の変更）と更新（在留期間の更新）を区別するために使う。
// 同じ月に複数あれば許可日の新しいものを採る
export async function listPermitContentsByMonth(
  supabase: SupabaseClient,
  month: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("immigration_applications")
    .select("worker_id, application_content, granted_permit_date")
    .gte("granted_permit_date", `${month}-01`)
    .lte("granted_permit_date", monthEnd(`${month}-01`))
    .order("granted_permit_date", { ascending: false });
  if (error) throw error;

  const rows =
    (data as
      | { worker_id: string | null; application_content: string | null }[]
      | null) ?? [];
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (!r.worker_id || out[r.worker_id]) continue;
    out[r.worker_id] = r.application_content ?? "";
  }
  return out;
}

// 許可が下りた申請の記録（外国人ごとの在留許可の履歴）。
//
// workers.residence_permit_date は「現在の在留資格の許可日」なので、更新許可が
// 下りると日付が上書きされ、その人が過去の月の名簿から消えてしまう。
// 過去の月を作り直しても同じ結果になるよう、申請に残っている許可の履歴を使う
export interface GrantedPermit {
  workerId: string;
  permitDate: string; // 在留許可日 YYYY-MM-DD
  visa: string; // 許可時の在留資格（未登録なら空）
  content: string; // 申請内容（在留期間の更新許可 など）
}

export async function listGrantedPermits(
  supabase: SupabaseClient,
): Promise<GrantedPermit[]> {
  const { data, error } = await supabase
    .from("immigration_applications")
    .select("worker_id, granted_permit_date, visa_at_grant, application_content")
    .not("granted_permit_date", "is", null)
    .order("granted_permit_date", { ascending: false });
  if (error) throw error;

  return (
    (data as
      | {
          worker_id: string | null;
          granted_permit_date: string;
          visa_at_grant: string | null;
          application_content: string | null;
        }[]
      | null) ?? []
  )
    .filter((r) => r.worker_id)
    .map((r) => ({
      workerId: r.worker_id as string,
      permitDate: r.granted_permit_date,
      visa: r.visa_at_grant ?? "",
      content: r.application_content ?? "",
    }));
}
