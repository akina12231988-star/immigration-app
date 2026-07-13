import type { SupabaseClient } from "@supabase/supabase-js";
import type { Organization, OrganizationInput } from "@/types/db";

export async function listOrganizations(
  supabase: SupabaseClient,
): Promise<Organization[]> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as Organization[]) ?? [];
}

export async function insertOrganization(
  supabase: SupabaseClient,
  input: OrganizationInput,
): Promise<Organization> {
  const { data, error } = await supabase
    .from("organizations")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as Organization;
}

export async function updateOrganization(
  supabase: SupabaseClient,
  id: string,
  input: Partial<OrganizationInput>,
): Promise<Organization> {
  const { data, error } = await supabase
    .from("organizations")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Organization;
}

// 所属中の外国人がいる場合、workers.current_organization_id は on delete set null で外れる
export async function deleteOrganization(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("organizations").delete().eq("id", id);
  if (error) throw error;
}
