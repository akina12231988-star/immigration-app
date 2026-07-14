import type { SupabaseClient } from "@supabase/supabase-js";
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
  workers: { id: string; name: string } | null;
  organizations: { id: string; name: string } | null;
};

const SELECT = "*, workers(id, name), organizations(id, name)";

function toApplication(row: RowWithRefs): Application {
  return {
    id: row.id,
    workerId: row.worker_id,
    workerName: row.workers?.name ?? null,
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
