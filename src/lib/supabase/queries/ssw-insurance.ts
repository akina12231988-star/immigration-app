import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SSW_CANCEL_TODO_TITLE,
  SSW_INSURANCE_TODO_KIND,
  SSW_JOIN_TODO_TITLE,
  isSswCancelable,
  type SswInsuranceWorker,
} from "@/lib/ssw-insurance";
import { todayStr } from "@/lib/ssw/calc";
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
  "support",
  "residence_status",
  "residence_expiry_date",
  "residence_permit_date",
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

// 申込サイトに合わせた申込の項目（0171）: 振込日・加入依頼 受付番号・加入依頼日・保険始期
const APPLY_COLUMNS = [
  "ssw_insurance_paid_on",
  "ssw_insurance_request_no",
  "ssw_insurance_requested_on",
  "ssw_insurance_start_on",
].join(", ");

// 外国人詳細の「特定技能総合保険」の枠で使う項目（0139・0147）
export const SSW_INSURANCE_DETAIL_COLUMNS = [
  "ssw_insurance_no",
  "ssw_insurance_expiry_date",
  "ssw_insurance_cancel_mailed_on",
  "ssw_insurance_cancel_tracking_no",
  "ssw_insurance_refund_amount",
  "ssw_insurance_refund_sales_no",
].join(", ");

export async function listSswInsuranceWorkers(
  supabase: SupabaseClient,
): Promise<SswInsuranceWorker[]> {
  // 所属機関名は画面側で機関マスタから引くので、ここでは埋め込まない
  // （workers から organizations への関連が増えると埋め込みがあいまいになるため）。
  // 申込の項目（0171）は未適用の環境でも読めるよう、失敗したら無しで読み直す
  const withApply = await supabase
    .from("workers")
    .select(`${COLUMNS}, ${APPLY_COLUMNS}`)
    .order("name", { ascending: true });
  if (!withApply.error) return (withApply.data as unknown as SswInsuranceWorker[]) ?? [];
  const { data, error } = await supabase
    .from("workers")
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
  // 解約手続き・解約金（0147）
  ssw_insurance_cancel_mailed_on?: string | null;
  ssw_insurance_cancel_tracking_no?: string;
  ssw_insurance_refund_amount?: number | null;
  ssw_insurance_refund_sales_no?: string;
  // 申込（0171）
  ssw_insurance_paid_on?: string | null;
  ssw_insurance_request_no?: string;
  ssw_insurance_requested_on?: string | null;
  ssw_insurance_start_on?: string | null;
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
  kind?: string; // 被保険者証 / 解約金（0147。未適用の環境では undefined ＝ 被保険者証）
  invoice_url?: string; // 請求書のリンク先（0170。未適用の環境では undefined）
  created_at: string;
}

export const SSW_CERT_KIND_CERT = "被保険者証";
export const SSW_CERT_KIND_REFUND = "解約金";

export function sswCertKind(row: Pick<SswCertRow, "kind">): string {
  return row.kind || SSW_CERT_KIND_CERT;
}

export async function listSswCerts(
  supabase: SupabaseClient,
  workerId: string,
): Promise<SswCertRow[]> {
  // kind 列は 0147 で追加。未適用の環境でも読めるように、失敗したら kind なしで読み直す
  const withKind = await supabase
    .from("worker_ssw_insurance_certs")
    .select("id, worker_id, cert_no, expiry_date, file_name, mime_type, kind, created_at")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  if (!withKind.error) {
    // 請求書のリンク先（0170）。未適用の環境では読めないので、読めたときだけ足す
    const links = await supabase
      .from("worker_ssw_insurance_certs")
      .select("id, invoice_url")
      .eq("worker_id", workerId);
    const byId = new Map(
      ((links.error ? [] : links.data) as { id: string; invoice_url: string }[] | null ?? []).map((r) => [r.id, r.invoice_url]),
    );
    return ((withKind.data as SswCertRow[]) ?? []).map((r) => ({ ...r, invoice_url: byId.get(r.id) ?? "" }));
  }
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

// 退職の記録を保存したとき・退職の随時届出（様式）を作ったときに、解約手続きのTODOを作る。
// 保険に加入していない人・解約できない人（証明書番号か有効期限が無い、有効期限から4か月以上）には作らない。マイグレーション未適用など失敗しても
// 退職の保存自体は止めない（呼び出し側で握りつぶす）。
// 画面で「作った／すでにある／加入していない」を伝えられるように結果を返す
export interface SswCancelTodoResult {
  outcome: "created" | "exists" | "notInsured";
  todoNo: string; // 作った（またはすでにあった）TODOの番号。notInsured のときは空
}

export async function ensureSswCancelTodoOnLeaving(
  supabase: SupabaseClient,
  workerId: string,
): Promise<SswCancelTodoResult> {
  const { data, error } = await supabase
    .from("workers")
    .select("ssw_insurance_no, ssw_insurance_expiry_date")
    .eq("id", workerId)
    .maybeSingle();
  if (error) throw error;
  const w = data as { ssw_insurance_no: string | null; ssw_insurance_expiry_date: string | null } | null;
  // 証明書番号と有効期限が入っていて、有効期限から4か月たっていない人だけ（それ以外は解約できない）
  if (!w || !isSswCancelable({ ssw_insurance_no: w.ssw_insurance_no ?? "", ssw_insurance_expiry_date: w.ssw_insurance_expiry_date }, todayStr())) {
    return { outcome: "notInsured", todoNo: "" };
  }
  const { row, created } = await ensureSswTodo(supabase, workerId, SSW_CANCEL_TODO_TITLE);
  return { outcome: created ? "created" : "exists", todoNo: row?.todo_no ?? "" };
}

// 特定技能総合保険の売上（保険No.）。請求を立てた人の番号を一覧に出し、
// その番号に対して「保険に加入した」記録を残せるようにする（0142）
export interface SswSalesRow {
  id: string;
  worker_id: string;
  freee_no: string;
  amount: number;
  registered_on: string | null;
  insurance_joined_on: string | null;
  created_at: string;
}

export async function listSswInsuranceSales(
  supabase: SupabaseClient,
): Promise<SswSalesRow[]> {
  const { data, error } = await supabase
    .from("sales_entries")
    .select("id, worker_id, freee_no, amount, registered_on, insurance_joined_on, created_at")
    .eq("kind", "保険")
    .order("created_at", { ascending: false });
  // 0142 が未適用でも画面が開けるように、列が無いときは番号だけ取り直す
  if (error) {
    const { data: fallback, error: err2 } = await supabase
      .from("sales_entries")
      .select("id, worker_id, freee_no, amount, registered_on, created_at")
      .eq("kind", "保険")
      .order("created_at", { ascending: false });
    if (err2) throw error;
    return ((fallback as Omit<SswSalesRow, "insurance_joined_on">[] | null) ?? []).map((r) => ({
      ...r,
      insurance_joined_on: null,
    }));
  }
  return (data as SswSalesRow[]) ?? [];
}

// 売上（保険No.）に、保険へ加入した日を記録する（null で取り消し）
export async function setSalesInsuranceJoined(
  supabase: SupabaseClient,
  salesEntryId: string,
  joinedOn: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("sales_entries")
    .update({ insurance_joined_on: joinedOn })
    .eq("id", salesEntryId);
  if (error) throw error;
}
