import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplicationMemo } from "@/types/application";

interface MemoRow {
  id: string;
  application_id: string;
  author: string;
  body: string;
  created_at: string;
}

function toMemo(r: MemoRow): ApplicationMemo {
  return {
    id: r.id,
    applicationId: r.application_id,
    author: r.author,
    body: r.body,
    createdAt: r.created_at,
  };
}

export async function listApplicationMemos(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<ApplicationMemo[]> {
  const { data, error } = await supabase
    .from("application_memos")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as MemoRow[]) ?? []).map(toMemo);
}

export async function insertApplicationMemo(
  supabase: SupabaseClient,
  input: { applicationId: string; author: string; body: string },
): Promise<ApplicationMemo> {
  const { data, error } = await supabase
    .from("application_memos")
    .insert({
      application_id: input.applicationId,
      author: input.author,
      body: input.body,
    })
    .select()
    .single();
  if (error) throw error;
  return toMemo(data as MemoRow);
}

export async function deleteApplicationMemo(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("application_memos").delete().eq("id", id);
  if (error) throw error;
}
