import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ContractChangeInput,
  ContractChangeRow,
  Organization,
  Worker,
} from "@/types/db";

// 契約内容変更の随時報告書（参考様式第3-1-1号。0133）

// 一覧用: 外国人の氏名・リンク類と機関名を同時取得
export interface ContractChangeWithRefs extends ContractChangeRow {
  workers: {
    id: string;
    name: string;
    kana: string;
    messenger_link: string;
    notion_link: string;
  } | null;
  organizations: { id: string; name: string } | null;
}

const SELECT =
  "*, workers(id, name, kana, messenger_link, notion_link), organizations(id, name)";

export async function listContractChanges(
  supabase: SupabaseClient,
): Promise<ContractChangeWithRefs[]> {
  const { data, error } = await supabase
    .from("contract_changes")
    .select(SELECT)
    .order("changed_on", { ascending: false });
  if (error) throw error;
  return (data as ContractChangeWithRefs[]) ?? [];
}

// 届出書の作成用: 様式の①欄に必要な外国人情報と、③欄の機関情報を全て取得
export interface ContractChangeForForms extends ContractChangeRow {
  workers: Worker | null;
  organizations: Organization | null;
}

export async function getContractChangeForForms(
  supabase: SupabaseClient,
  id: string,
): Promise<ContractChangeForForms | null> {
  const { data, error } = await supabase
    .from("contract_changes")
    .select("*, workers(*), organizations(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as ContractChangeForForms | null;
}

export async function insertContractChange(
  supabase: SupabaseClient,
  input: ContractChangeInput,
): Promise<ContractChangeRow> {
  const { data, error } = await supabase
    .from("contract_changes")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as ContractChangeRow;
}

// 記録の書き換え（内容の編集だけでなく、進み具合・投函日・追跡番号の更新にも使う）
export type ContractChangePatch = Partial<
  Omit<ContractChangeRow, "id" | "created_by" | "created_at" | "updated_at">
>;

export async function updateContractChange(
  supabase: SupabaseClient,
  id: string,
  input: ContractChangePatch,
): Promise<ContractChangeRow> {
  const { data, error } = await supabase
    .from("contract_changes")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as ContractChangeRow;
}

export async function deleteContractChange(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("contract_changes").delete().eq("id", id);
  if (error) throw error;
}
