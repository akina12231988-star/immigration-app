import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EmploymentInput,
  EmploymentRow,
  JobApplicationInput,
  JobApplicationRow,
} from "@/types/recruiting";

// 応募＋外国人名＋求人（掲載会社名）を結合した形
export interface ApplicationWithRefs extends JobApplicationRow {
  workers: { id: string; name: string } | null;
  organizations: { id: string; name: string } | null;
  job_postings: { id: string; display_company: string; job_type: string } | null;
}

const APP_SELECT =
  "*, workers(id, name), organizations(id, name), job_postings(id, display_company, job_type)";

export async function listApplicationsByWorker(
  supabase: SupabaseClient,
  workerId: string,
): Promise<ApplicationWithRefs[]> {
  const { data, error } = await supabase
    .from("job_applications")
    .select(APP_SELECT)
    .eq("worker_id", workerId)
    .order("applied_on", { ascending: false });
  if (error) throw error;
  return (data as ApplicationWithRefs[]) ?? [];
}

export async function listApplicationsByPosting(
  supabase: SupabaseClient,
  postingId: string,
): Promise<ApplicationWithRefs[]> {
  const { data, error } = await supabase
    .from("job_applications")
    .select(APP_SELECT)
    .eq("job_posting_id", postingId)
    .order("applied_on", { ascending: false });
  if (error) throw error;
  return (data as ApplicationWithRefs[]) ?? [];
}

// 選考中の横断一覧（面接日順）
export async function listActiveApplications(
  supabase: SupabaseClient,
): Promise<ApplicationWithRefs[]> {
  const { data, error } = await supabase
    .from("job_applications")
    .select(APP_SELECT)
    .eq("result", "選考中")
    .order("interview_on", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data as ApplicationWithRefs[]) ?? [];
}

export async function insertApplication(
  supabase: SupabaseClient,
  input: JobApplicationInput,
): Promise<JobApplicationRow> {
  const { data, error } = await supabase
    .from("job_applications")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as JobApplicationRow;
}

export async function updateApplication(
  supabase: SupabaseClient,
  id: string,
  input: Partial<JobApplicationInput>,
): Promise<JobApplicationRow> {
  const { data, error } = await supabase
    .from("job_applications")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as JobApplicationRow;
}

export async function deleteApplication(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("job_applications").delete().eq("id", id);
  if (error) throw error;
}

// 採用登録（employments）。挿入時にトリガーが workers.current_organization_id を更新する
export async function insertEmployment(
  supabase: SupabaseClient,
  input: EmploymentInput,
): Promise<EmploymentRow> {
  const { data, error } = await supabase
    .from("employments")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as EmploymentRow;
}
