import type { SupabaseClient } from "@supabase/supabase-js";
import type { Employee, EmployeeInput } from "@/types/db";

// 弊社の従業員（支援責任者・支援担当者の選任元）。氏名順
export async function listEmployees(supabase: SupabaseClient): Promise<Employee[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .order("joined_on", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as Employee[]) ?? [];
}

export async function insertEmployee(
  supabase: SupabaseClient,
  input: EmployeeInput,
): Promise<Employee> {
  const { data, error } = await supabase.from("employees").insert(input).select().single();
  if (error) throw error;
  return data as Employee;
}

export async function updateEmployee(
  supabase: SupabaseClient,
  id: string,
  input: Partial<EmployeeInput>,
): Promise<Employee> {
  const { data, error } = await supabase
    .from("employees")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Employee;
}

export async function deleteEmployee(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) throw error;
}
