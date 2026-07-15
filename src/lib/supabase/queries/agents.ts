import type { SupabaseClient } from "@supabase/supabase-js";

export interface FilingAgent {
  id: string;
  name: string;
  note: string;
  created_at: string;
}

export async function listFilingAgents(supabase: SupabaseClient): Promise<FilingAgent[]> {
  const { data, error } = await supabase
    .from("filing_agents")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as FilingAgent[]) ?? [];
}

export async function insertFilingAgent(
  supabase: SupabaseClient,
  name: string,
): Promise<FilingAgent> {
  const { data, error } = await supabase
    .from("filing_agents")
    .insert({ name: name.trim() })
    .select()
    .single();
  if (error) throw error;
  return data as FilingAgent;
}
