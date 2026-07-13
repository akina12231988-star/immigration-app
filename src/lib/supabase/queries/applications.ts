import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Application,
  ApplicationContent,
  ApplicationMethod,
  ApplicationStatus,
} from "@/types/application";
import type { ImmigrationApplicationRow } from "@/types/db";

// workers を JOIN したときの行型
type RowWithWorker = ImmigrationApplicationRow & {
  workers: { id: string; name: string } | null;
};

const SELECT = "*, workers(id, name)";

function toApplication(row: RowWithWorker): Application {
  return {
    id: row.id,
    workerId: row.worker_id,
    workerName: row.workers?.name ?? null,
    name: row.name,
    applicationDate: row.application_date,
    applicationNumber: row.application_no,
    applicationContent: row.content as ApplicationContent | "",
    method: (row.method as ApplicationMethod) ?? "窓口",
    emailLink: row.email_link ?? "",
    receiptImageUrl: row.receipt_image_url ?? undefined,
    noticeImageUrl: row.notice_image_url ?? undefined,
    residenceCardImageUrl: row.residence_card_image_url ?? undefined,
    approvalDate: row.approval_date ?? undefined,
    cardReceivedOn: row.card_received_on ?? undefined,
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
  if (patch.cardReceivedOn !== undefined) row.card_received_on = patch.cardReceivedOn ?? null;
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
  return ((data as RowWithWorker[]) ?? []).map(toApplication);
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
  return ((data as RowWithWorker[]) ?? []).map(toApplication);
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
  return toApplication(data as RowWithWorker);
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
  return toApplication(data as RowWithWorker);
}
