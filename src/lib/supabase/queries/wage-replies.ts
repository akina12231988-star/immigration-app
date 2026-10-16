import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrganizationWageReply, OrganizationWageReplyInput } from "@/lib/wage-stats";

// ---- 最低賃金の改定ごとの所属機関からの回答（organization_wage_replies・0181） ----

export async function listWageReplies(supabase: SupabaseClient): Promise<OrganizationWageReply[]> {
  const { data, error } = await supabase
    .from("organization_wage_replies")
    .select("*")
    .order("effective_on", { ascending: false });
  if (error) throw error;
  return (data as OrganizationWageReply[]) ?? [];
}

// 機関×改定の適用日で1行。あれば更新、無ければ追加
export async function upsertWageReply(
  supabase: SupabaseClient,
  input: OrganizationWageReplyInput,
): Promise<OrganizationWageReply> {
  const { data, error } = await supabase
    .from("organization_wage_replies")
    .upsert(input, { onConflict: "organization_id,effective_on" })
    .select()
    .single();
  if (error) throw error;
  return data as OrganizationWageReply;
}
