import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrganizationContact, OrganizationContactInput } from "@/lib/organization-contacts";

// ---- 所属機関との連絡の記録（0203_organization_contacts.sql） ----

export async function listOrganizationContacts(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<OrganizationContact[]> {
  const { data, error } = await supabase
    .from("organization_contacts")
    .select("*")
    .eq("organization_id", organizationId)
    .order("contacted_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as OrganizationContact[]) ?? [];
}

export async function insertOrganizationContact(
  supabase: SupabaseClient,
  input: OrganizationContactInput,
): Promise<OrganizationContact> {
  const { data, error } = await supabase
    .from("organization_contacts")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as OrganizationContact;
}

export async function updateOrganizationContact(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Omit<OrganizationContactInput, "organization_id">>,
): Promise<void> {
  const { error } = await supabase.from("organization_contacts").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteOrganizationContact(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("organization_contacts").delete().eq("id", id);
  if (error) throw error;
}
