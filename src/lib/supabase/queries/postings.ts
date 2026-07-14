import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobPosting, JobPostingInput } from "@/types/recruiting";

// 求人＋所属機関名＋応募/採用の集計をまとめて取得する形
export interface PostingWithStats extends JobPosting {
  organizations: { id: string; name: string } | null;
  job_applications: { id: string; result: string }[];
}

const SELECT = "*, organizations(id, name), job_applications(id, result)";

export async function listPostings(
  supabase: SupabaseClient,
): Promise<PostingWithStats[]> {
  const { data, error } = await supabase
    .from("job_postings")
    .select(SELECT)
    .order("received_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as PostingWithStats[]) ?? [];
}

export async function getPosting(
  supabase: SupabaseClient,
  id: string,
): Promise<PostingWithStats | null> {
  const { data, error } = await supabase
    .from("job_postings")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as PostingWithStats | null;
}

export async function insertPosting(
  supabase: SupabaseClient,
  input: JobPostingInput,
): Promise<JobPosting> {
  const { data, error } = await supabase
    .from("job_postings")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as JobPosting;
}

export async function updatePosting(
  supabase: SupabaseClient,
  id: string,
  input: Partial<JobPostingInput>,
): Promise<JobPosting> {
  const { data, error } = await supabase
    .from("job_postings")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as JobPosting;
}

export async function deletePosting(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("job_postings").delete().eq("id", id);
  if (error) throw error;
}
