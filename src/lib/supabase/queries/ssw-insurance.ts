import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SSW_CANCEL_TODO_TITLE,
  SSW_INSURANCE_TODO_KIND,
  SSW_JOIN_TODO_TITLE,
  type SswInsuranceWorker,
} from "@/lib/ssw-insurance";
import { insertTodo, type TodoRow } from "@/lib/supabase/queries/todos";

// 特定技能総合保険の読み書き（0139_ssw_insurance.sql）

const COLUMNS = [
  "id",
  "name",
  "kana",
  "nationality",
  "gender",
  "birth",
  "status",
  "residence_status",
  "residence_expiry_date",
  "leaving_on",
  "current_organization_id",
  "messenger_link",
  "ssw_insurance_link",
  "ssw_insurance_expiry_date",
  "ssw_insurance_self_join",
  "ssw_insurance_no",
  "ssw_insurance_declined",
  "ssw_insurance_declined_on",
  "ssw_insurance_declined_org_id",
  "ssw_insurance_note",
].join(", ");

export async function listSswInsuranceWorkers(
  supabase: SupabaseClient,
): Promise<SswInsuranceWorker[]> {
  const { data, error } = await supabase
    .from("workers")
    // 所属機関名は画面側で機関マスタから引くので、ここでは埋め込まない
    // （workers から organizations への関連が増えると埋め込みがあいまいになるため）
    .select(COLUMNS)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as unknown as SswInsuranceWorker[]) ?? [];
}

// 意思確認の結果・証明書番号・有効期限の保存
export interface SswInsurancePatch {
  ssw_insurance_no?: string;
  ssw_insurance_expiry_date?: string | null;
  ssw_insurance_self_join?: boolean;
  ssw_insurance_declined?: boolean;
  ssw_insurance_declined_on?: string | null;
  ssw_insurance_declined_org_id?: string | null;
  ssw_insurance_note?: string;
}

export async function updateSswInsurance(
  supabase: SupabaseClient,
  workerId: string,
  patch: SswInsurancePatch,
): Promise<void> {
  const { error } = await supabase.from("workers").update(patch).eq("id", workerId);
  if (error) throw error;
}

// 被保険者証明書（画像・PDFのメタデータ）
export interface SswCertRow {
  id: string;
  worker_id: string;
  cert_no: string;
  expiry_date: string | null;
  file_name: string;
  mime_type: string;
  created_at: string;
}

export async function listSswCerts(
  supabase: SupabaseClient,
  workerId: string,
): Promise<SswCertRow[]> {
  const { data, error } = await supabase
    .from("worker_ssw_insurance_certs")
    .select("id, worker_id, cert_no, expiry_date, file_name, mime_type, created_at")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as SswCertRow[]) ?? [];
}

// 特定技能総合保険のTODO（加入手続き・解約手続き）を作る。
// 同じ内容の未完了のTODOがすでにあるときは作らずにその行を返す（二重に増やさない）
export async function ensureSswTodo(
  supabase: SupabaseClient,
  workerId: string,
  title: typeof SSW_JOIN_TODO_TITLE | typeof SSW_CANCEL_TODO_TITLE,
): Promise<{ row: TodoRow | null; created: boolean }> {
  const { data } = await supabase
    .from("todos")
    .select("*")
    .eq("kind", SSW_INSURANCE_TODO_KIND)
    .eq("worker_id", workerId)
    .eq("title", title);
  const rows = ((data as TodoRow[] | null) ?? []).filter(
    (r) => !r.deleted_at && r.status !== "完了",
  );
  if (rows.length > 0) return { row: rows[0], created: false };
  const row = await insertTodo(supabase, {
    kind: SSW_INSURANCE_TODO_KIND,
    worker_id: workerId,
    title,
    status: "未着手",
  });
  return { row, created: true };
}

// 退職の記録を保存したときに、解約手続きのTODOを作る。
// 保険に加入していない人には作らない。マイグレーション未適用など失敗しても
// 退職の保存自体は止めない（呼び出し側で握りつぶす）
export async function ensureSswCancelTodoOnLeaving(
  supabase: SupabaseClient,
  workerId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("workers")
    .select("ssw_insurance_expiry_date")
    .eq("id", workerId)
    .maybeSingle();
  if (error) throw error;
  const expiry = (data as { ssw_insurance_expiry_date: string | null } | null)
    ?.ssw_insurance_expiry_date;
  if (!expiry) return;
  await ensureSswTodo(supabase, workerId, SSW_CANCEL_TODO_TITLE);
}
