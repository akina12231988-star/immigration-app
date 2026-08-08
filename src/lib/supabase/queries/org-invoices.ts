import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgInvoice } from "@/types/db";

// ---- 所属機関ごとの請求・入金の記録（org_invoices） ----
// 督促状のもとになる台帳。月ごとの請求と入金を保存し、記録を積み上げていく

// 機関の請求記録を古い月から順に一覧する（画面でも督促状でも上から下へ年月が流れる）
export async function listOrgInvoices(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<OrgInvoice[]> {
  const { data, error } = await supabase
    .from("org_invoices")
    .select("*")
    .eq("organization_id", organizationId)
    .order("month", { ascending: true });
  if (error) throw error;
  return (data as OrgInvoice[]) ?? [];
}

// ---- 請求書を作成したかどうか（月末の作業の進み具合の確認用） ----

// 一覧に出すのは「作成済みか」を判断するのに要る列だけ（機関が多いので軽く保つ）
export const ORG_INVOICE_STATUS_FIELDS = [
  "id",
  "organization_id",
  "month",
  "invoice_created_on",
  "invoice_no",
  "amount",
  "paid",
] as const;

export type OrgInvoiceStatus = Pick<
  OrgInvoice,
  (typeof ORG_INVOICE_STATUS_FIELDS)[number]
>;

// 対象の年月の記録を機関をまたいで一覧する（請求書作成の画面で機関ごとの状態を出す）
export async function listOrgInvoicesByMonth(
  supabase: SupabaseClient,
  month: string,
): Promise<OrgInvoiceStatus[]> {
  const { data, error } = await supabase
    .from("org_invoices")
    .select(ORG_INVOICE_STATUS_FIELDS.join(","))
    .eq("month", month);
  if (error) throw error;
  return (data as unknown as OrgInvoiceStatus[]) ?? [];
}

// 請求書を作成した／作成を取り消した、を記録する。記録がまだ無い機関×月なら作る。
// 渡した列だけ書き換わるので、すでに入っている請求書番号や入金の記録は消えない
export async function setOrgInvoiceCreated(
  supabase: SupabaseClient,
  input: {
    organization_id: string;
    month: string;
    billed_on: string;
    due_on: string;
    invoice_created_on: string | null; // null で「未作成」に戻す
  },
): Promise<OrgInvoiceStatus> {
  const { data, error } = await supabase
    .from("org_invoices")
    .upsert(input, { onConflict: "organization_id,month" })
    .select(ORG_INVOICE_STATUS_FIELDS.join(","))
    .single();
  if (error) throw error;
  return data as unknown as OrgInvoiceStatus;
}

// 請求（請求書番号・実際の請求金額）を保存する。同じ機関×月なら上書き。
// paid / paid_on を渡さなければ更新対象に含まれないので、すでにある入金の記録は保たれる
// （過去分をあとからまとめて登録するときは入金済み額・入金日も一緒に渡す）
export async function upsertOrgInvoice(
  supabase: SupabaseClient,
  input: Pick<
    OrgInvoice,
    | "organization_id"
    | "month"
    | "billed_on"
    | "invoice_no"
    | "amount_excl"
    | "tax"
    | "tax_free"
    | "amount"
    | "due_on"
  > &
    Partial<Pick<OrgInvoice, "paid" | "paid_on">>,
): Promise<OrgInvoice> {
  const { data, error } = await supabase
    .from("org_invoices")
    .upsert(input, { onConflict: "organization_id,month" })
    .select()
    .single();
  if (error) throw error;
  return data as OrgInvoice;
}

// 入金の記録などの部分更新（入金済み額・入金日・メモ）
export async function updateOrgInvoice(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<
    Pick<
      OrgInvoice,
      | "invoice_no"
      | "amount_excl"
      | "tax"
      | "tax_free"
      | "amount"
      | "paid"
      | "paid_on"
      | "note"
    >
  >,
): Promise<void> {
  const { error } = await supabase.from("org_invoices").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteOrgInvoice(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("org_invoices").delete().eq("id", id);
  if (error) throw error;
}
