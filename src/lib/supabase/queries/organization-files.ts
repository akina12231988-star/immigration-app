import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrganizationFileRow } from "@/types/db";

// 所属機関の添付ファイル（見積書など）を新しい順に取得
export async function listOrganizationFiles(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<OrganizationFileRow[]> {
  const { data, error } = await supabase
    .from("organization_files")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as OrganizationFileRow[]) ?? [];
}
