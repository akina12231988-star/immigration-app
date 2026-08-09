import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MonthlySupportRegistration,
  SalesEntryInput,
  SalesEntryRow,
  SalesEntryStatus,
} from "@/types/db";

// ---- freee販売への売上登録（sales_entries） ----

// 一覧（外国人名・在留許可日・所属機関名つき）。登録待ちの確認や許可日での絞り込みに使う
export interface SalesEntryWithRefs extends SalesEntryRow {
  workers: { name: string; residence_permit_date: string | null } | null;
  organizations: { name: string } | null;
}

export async function listSalesEntries(
  supabase: SupabaseClient,
): Promise<SalesEntryWithRefs[]> {
  const { data, error } = await supabase
    .from("sales_entries")
    .select("*, workers(name, residence_permit_date), organizations(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as SalesEntryWithRefs[]) ?? [];
}

export async function listSalesEntriesByWorker(
  supabase: SupabaseClient,
  workerId: string,
): Promise<SalesEntryRow[]> {
  const { data, error } = await supabase
    .from("sales_entries")
    .select("*")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as SalesEntryRow[]) ?? [];
}

export async function insertSalesEntries(
  supabase: SupabaseClient,
  inputs: SalesEntryInput[],
): Promise<SalesEntryRow[]> {
  if (inputs.length === 0) return [];
  const { data, error } = await supabase.from("sales_entries").insert(inputs).select();
  if (error) throw error;
  return (data as SalesEntryRow[]) ?? [];
}

export async function updateSalesEntry(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<SalesEntryInput>,
): Promise<void> {
  const { error } = await supabase.from("sales_entries").update(patch).eq("id", id);
  if (error) throw error;
}

// 登録済み・対象外への切り替え（登録済みは伝票番号と登録日も記録）
export async function setSalesEntryStatus(
  supabase: SupabaseClient,
  id: string,
  status: SalesEntryStatus,
  extra: { freee_no?: string; registered_on?: string | null } = {},
): Promise<void> {
  await updateSalesEntry(supabase, id, {
    status,
    ...(extra.freee_no !== undefined ? { freee_no: extra.freee_no } : {}),
    ...(extra.registered_on !== undefined ? { registered_on: extra.registered_on } : {}),
  });
}

export async function deleteSalesEntry(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("sales_entries").delete().eq("id", id);
  if (error) throw error;
}

// ---- ◯月分の支援代のfreee登録記録（monthly_support_registrations） ----

// 対象の年月の登録記録を一覧する（請求書作成でボタンの状態表示に使う）
export async function listMonthlySupportRegistrations(
  supabase: SupabaseClient,
  month: string,
): Promise<MonthlySupportRegistration[]> {
  const { data, error } = await supabase
    .from("monthly_support_registrations")
    .select("*")
    .eq("month", month);
  if (error) throw error;
  return (data as MonthlySupportRegistration[]) ?? [];
}

// 「freee売上登録」ボタン: ◯月分の支援代（サポート代）を登録した記録を残す。
// 先にメモだけ保存されている場合もあるため upsert にする（note は指定しないので保たれる）
export async function addMonthlySupportRegistration(
  supabase: SupabaseClient,
  input: Pick<MonthlySupportRegistration, "worker_id" | "month" | "fee_name" | "registered_on">,
): Promise<MonthlySupportRegistration> {
  const { data, error } = await supabase
    .from("monthly_support_registrations")
    .upsert(input, { onConflict: "worker_id,month" })
    .select()
    .single();
  if (error) throw error;
  return data as MonthlySupportRegistration;
}

// 登録記録の取り消し（押し間違いの訂正用）
export async function deleteMonthlySupportRegistration(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("monthly_support_registrations")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// 登録記録だけを取り消してメモは残す（メモがある行の取消用）
export async function clearMonthlySupportRegistration(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("monthly_support_registrations")
    .update({ registered_on: null })
    .eq("id", id);
  if (error) throw error;
}

// メモ（この月に請求しない理由など）を保存する。記録行が無ければ作る。
// registered_on は指定しないため、freee登録済みの記録はそのまま保たれる
export async function upsertMonthlySupportNote(
  supabase: SupabaseClient,
  input: Pick<MonthlySupportRegistration, "worker_id" | "month" | "fee_name" | "note">,
): Promise<MonthlySupportRegistration> {
  const { data, error } = await supabase
    .from("monthly_support_registrations")
    .upsert(input, { onConflict: "worker_id,month" })
    .select()
    .single();
  if (error) throw error;
  return data as MonthlySupportRegistration;
}

// 「この月の支援代を請求しない」の切り替え。記録行が無ければ作る。
// registered_on・note は指定しないため、freee登録済みの記録やメモはそのまま保たれる
export async function upsertMonthlySupportNoCharge(
  supabase: SupabaseClient,
  input: Pick<MonthlySupportRegistration, "worker_id" | "month" | "fee_name" | "no_charge">,
): Promise<MonthlySupportRegistration> {
  const { data, error } = await supabase
    .from("monthly_support_registrations")
    .upsert(input, { onConflict: "worker_id,month" })
    .select()
    .single();
  if (error) throw error;
  return data as MonthlySupportRegistration;
}

// ---- 許可売上No.・保険No.（売上明細の伝票番号を1人1つにまとめたもの） ----
// 許可時の売上（申請）と特定技能総合保険の freee 伝票番号は sales_entries に入っている。
// 名簿や外国人詳細で見やすくするため、外国人ごとに一番新しい1件を取り出す。
// 番号そのものは sales_entries 側で持ち続けるので、申請ごとの履歴は残る。

export interface WorkerSalesNo {
  entryId: string; // 書き換え先の sales_entries の行
  freeeNo: string;
  itemName: string;
  createdAt: string;
}

export interface WorkerSalesNos {
  permit: WorkerSalesNo | null; // 許可売上No.（申請の明細）
  insurance: WorkerSalesNo | null; // 保険No.（特定技能総合保険の明細）
}

// 外国人ID → 許可売上No.・保険No.
export async function listWorkerSalesNos(
  supabase: SupabaseClient,
): Promise<Record<string, WorkerSalesNos>> {
  const { data, error } = await supabase
    .from("sales_entries")
    .select("id, worker_id, kind, item_name, freee_no, created_at")
    .in("kind", ["申請", "保険"])
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data as
    | {
        id: string;
        worker_id: string;
        kind: string;
        item_name: string;
        freee_no: string;
        created_at: string;
      }[]
    | null) ?? [];

  const out: Record<string, WorkerSalesNos> = {};
  for (const r of rows) {
    const bucket = (out[r.worker_id] ??= { permit: null, insurance: null });
    const key = r.kind === "保険" ? "insurance" : "permit";
    // 新しい順に並んでいるので、最初に来たものだけを採る
    if (bucket[key]) continue;
    bucket[key] = {
      entryId: r.id,
      freeeNo: r.freee_no,
      itemName: r.item_name,
      createdAt: r.created_at,
    };
  }
  return out;
}

// 売上明細の伝票番号だけを書き換える（名簿・外国人詳細からの直接編集用）
export async function setSalesEntryFreeeNo(
  supabase: SupabaseClient,
  entryId: string,
  freeeNo: string,
): Promise<void> {
  const { error } = await supabase
    .from("sales_entries")
    .update({ freee_no: freeeNo })
    .eq("id", entryId);
  if (error) throw error;
}

// 名簿で許可売上No.・保険No.を入れたときに、その番号だけの売上明細を作る。
// 更新申請の人は申請詳細の売上登録を通していないことがあり、書き換える行が無いと
// 番号を残せないため、名簿から番号を入れた時点で行のほうを用意する。
// 金額はfreee側にあるので0のままにし、番号がある＝登録済みとして扱う
export async function createSalesNoEntry(
  supabase: SupabaseClient,
  params: {
    workerId: string;
    organizationId: string | null;
    kind: "申請" | "保険";
    itemName: string;
    description: string;
    freeeNo: string;
    registeredOn: string;
  },
): Promise<WorkerSalesNo> {
  const { data, error } = await supabase
    .from("sales_entries")
    .insert({
      worker_id: params.workerId,
      organization_id: params.organizationId,
      kind: params.kind,
      item_name: params.itemName,
      description: params.description,
      amount: 0,
      taxable: params.kind !== "保険", // 特定技能総合保険は非課税
      status: "登録済み",
      freee_no: params.freeeNo,
      registered_on: params.registeredOn,
    })
    .select("id, freee_no, item_name, created_at")
    .single();
  if (error) throw error;
  const row = data as { id: string; freee_no: string; item_name: string; created_at: string };
  return {
    entryId: row.id,
    freeeNo: row.freee_no,
    itemName: row.item_name,
    createdAt: row.created_at,
  };
}
