import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrientationRow } from "@/types/db";

export interface OrientationWithRefs extends OrientationRow {
  workers: { id: string; name: string; current_organization_id: string | null } | null;
  organizations: { id: string; name: string } | null;
}

const SELECT =
  "*, workers(id, name, current_organization_id), organizations(id, name)";

export async function listOrientations(
  supabase: SupabaseClient,
): Promise<OrientationWithRefs[]> {
  const { data, error } = await supabase
    .from("orientations")
    .select(SELECT)
    .order("scheduled_on", { ascending: true });
  if (error) throw error;
  return (data as OrientationWithRefs[]) ?? [];
}

export type OrientationInput = Omit<
  OrientationRow,
  "id" | "created_at" | "updated_at"
>;

export async function insertOrientation(
  supabase: SupabaseClient,
  input: OrientationInput,
): Promise<OrientationRow> {
  const { data, error } = await supabase
    .from("orientations")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as OrientationRow;
}

export async function updateOrientation(
  supabase: SupabaseClient,
  id: string,
  input: Partial<OrientationInput>,
): Promise<OrientationRow> {
  const { data, error } = await supabase
    .from("orientations")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as OrientationRow;
}

export async function deleteOrientation(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("orientations").delete().eq("id", id);
  if (error) throw error;
}

// 申請に対応する生活オリエンテーションが無ければ作成する（雇用開始日保存時）
export async function ensureOrientationForApplication(
  supabase: SupabaseClient,
  params: {
    applicationId: string;
    workerId: string;
    organizationId: string | null;
    scheduledOn: string;
    employmentStartOn: string | null;
  },
): Promise<void> {
  const { data } = await supabase
    .from("orientations")
    .select("id")
    .eq("application_id", params.applicationId)
    .maybeSingle();
  if (data) {
    // 既にあれば予定日・雇用開始日を更新（在留資格や雇用開始日を後から変えた場合に追従）
    await supabase
      .from("orientations")
      .update({
        scheduled_on: params.scheduledOn,
        employment_start_on: params.employmentStartOn,
        organization_id: params.organizationId,
      })
      .eq("id", (data as { id: string }).id);
    return;
  }
  await supabase.from("orientations").insert({
    application_id: params.applicationId,
    worker_id: params.workerId,
    organization_id: params.organizationId,
    scheduled_on: params.scheduledOn,
    employment_start_on: params.employmentStartOn,
    status: "未実施",
  });
}
