import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReferralFee, ReferralFeeInput } from "@/types/db";
import { referralWorkerOrgKey } from "@/lib/referral-ledger-status";

// ---- 人材紹介（あっせん）手数料の台帳（referral_fees） ----

// 一覧（外国人の在留許可日・在留資格、所属機関名つき）。紹介手数料台帳で使う
export interface ReferralFeeWithRefs extends ReferralFee {
  workers: {
    name: string;
    residence_permit_date: string | null;
    residence_status: string;
  } | null;
  organizations: { name: string } | null;
}

export async function listReferralFees(
  supabase: SupabaseClient,
): Promise<ReferralFeeWithRefs[]> {
  const { data, error } = await supabase
    .from("referral_fees")
    .select("*, workers(name, residence_permit_date, residence_status), organizations(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ReferralFeeWithRefs[]) ?? [];
}

export async function insertReferralFee(
  supabase: SupabaseClient,
  input: ReferralFeeInput,
): Promise<ReferralFee> {
  const { data, error } = await supabase
    .from("referral_fees")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as ReferralFee;
}

export async function updateReferralFee(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<ReferralFeeInput>,
): Promise<void> {
  const { error } = await supabase.from("referral_fees").update(patch).eq("id", id);
  if (error) throw error;
}

// ---- 名簿（請求書作成）から紹介手数料No.を扱うための取り出し ----

// 名簿の1マスに出す紹介手数料。台帳（referral_fees）の1行と1対1で結びつく
export interface WorkerReferralFee {
  feeId: string; // 書き換え先の referral_fees の行
  salesNo: string; // 紹介売上No.（freee販売）
  paidOn: string | null; // 入金年月日（未入金なら null）
  fee: number; // 手数料（円・税抜）
}

// 外国人ID → 紹介手数料（1人に複数あるときは新しい1件）。
// 名簿で紹介手数料No.を出すために使う
export async function listWorkerReferralFees(
  supabase: SupabaseClient,
): Promise<Record<string, WorkerReferralFee>> {
  const { data, error } = await supabase
    .from("referral_fees")
    .select("id, worker_id, sales_no, paid_on, fee, created_at")
    .not("worker_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows =
    (data as
      | {
          id: string;
          worker_id: string;
          sales_no: string;
          paid_on: string | null;
          fee: number;
        }[]
      | null) ?? [];

  const out: Record<string, WorkerReferralFee> = {};
  for (const r of rows) {
    // 新しい順に並んでいるので、最初に来たものだけを採る
    if (out[r.worker_id]) continue;
    out[r.worker_id] = {
      feeId: r.id,
      salesNo: r.sales_no,
      paidOn: r.paid_on,
      fee: r.fee,
    };
  }
  return out;
}

// 名簿で紹介手数料No.を入れたときに、台帳の行がまだ無ければ作る。
// 台帳ページで手数料や紹介年月日をあとから足せるよう、ここでは番号だけ持たせる
export async function createReferralFeeForSalesNo(
  supabase: SupabaseClient,
  params: {
    workerId: string;
    organizationId: string | null;
    workerName: string;
    salesNo: string;
  },
): Promise<WorkerReferralFee> {
  const { data, error } = await supabase
    .from("referral_fees")
    .insert({
      worker_id: params.workerId,
      organization_id: params.organizationId,
      worker_name: params.workerName,
      sales_no: params.salesNo,
    })
    .select("id, sales_no, paid_on, fee")
    .single();
  if (error) throw error;
  const row = data as { id: string; sales_no: string; paid_on: string | null; fee: number };
  return { feeId: row.id, salesNo: row.sales_no, paidOn: row.paid_on, fee: row.fee };
}

// ---- 求職一覧（応募）から台帳を見るための取り出し ----

// 求職一覧の1件（応募）に出す台帳の状態
export interface ApplicationReferralFee {
  feeId: string; // referral_fees の行
  salesNo: string; // 紹介売上No.（freee販売）
  fee: number; // 手数料（円・税抜）
  billedOn: string | null; // 請求年月日
  paidOn: string | null; // 入金年月日
}

// 応募ID → 台帳の行（1応募に複数あるときは新しい1件）。
// 0078未適用だと列が無くてエラーになるため、呼び出し側で catch して空にする
export async function listReferralFeesByApplication(
  supabase: SupabaseClient,
): Promise<Record<string, ApplicationReferralFee>> {
  const { data, error } = await supabase
    .from("referral_fees")
    .select("id, job_application_id, sales_no, fee, billed_on, paid_on, created_at")
    .not("job_application_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows =
    (data as
      | {
          id: string;
          job_application_id: string;
          sales_no: string;
          fee: number;
          billed_on: string | null;
          paid_on: string | null;
        }[]
      | null) ?? [];

  const out: Record<string, ApplicationReferralFee> = {};
  for (const r of rows) {
    if (out[r.job_application_id]) continue; // 新しい順なので最初の1件だけ
    out[r.job_application_id] = {
      feeId: r.id,
      salesNo: r.sales_no,
      fee: r.fee,
      billedOn: r.billed_on,
      paidOn: r.paid_on,
    };
  }
  return out;
}

// 応募と紐づいていない台帳の行の「外国人＋所属機関」の鍵。
// 手数料管理簿の画面から直接足した行は応募と紐づかないため、
// 求職一覧で「台帳に未追加」を数えるときに、この鍵で照らし合わせて二重登録を防ぐ。
// 0078未適用だと列が無くてエラーになるため、呼び出し側で catch して空にする
export async function listUnlinkedReferralFeeKeys(
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("referral_fees")
    .select("worker_id, organization_id")
    .is("job_application_id", null);
  if (error) throw error;
  const rows =
    (data as { worker_id: string | null; organization_id: string | null }[] | null) ?? [];
  return [...new Set(rows.map((r) => referralWorkerOrgKey(r.worker_id, r.organization_id)))];
}

export async function deleteReferralFee(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("referral_fees").delete().eq("id", id);
  if (error) throw error;
}
