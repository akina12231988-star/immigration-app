import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluatePrepChecklist,
  prepProgressOf,
  type PrepChecklistMeta,
  type PrepProgress,
} from "@/lib/application-prep";

// TODO番号ごとの準備リスト1件分（メタ情報＋識別子＋追加項目）
export interface PrepChecklistRow extends PrepChecklistMeta {
  id: string;
  todo_no: string; // Notion 申請TODO番号（'' = 番号未設定の旧データ）
  joint_kind: string; // 単独申請か連名申請か（'' / 単独 / 連名。0105）
  joint_worker_id: string | null; // 連名相手の外国人
  joint_todo_no: string; // 連名相手のTODO番号
  joint_lead: string; // 連名申請の筆頭者（'' / 本人 / 相手。0111）
  sign_status: string; // 本人から署名をもらったかのステータス
  planned_app_on: string | null; // 申請予定日（健康診断書の有効チェックに使う。0112）
}

// 外国人の準備リストを全件取得（更新が新しい順）。
// select("*") にして、0105未適用でも追加項目が undefined → 既定値で動くようにする
export async function listPrepChecklists(
  supabase: SupabaseClient,
  workerId: string,
): Promise<PrepChecklistRow[]> {
  const { data, error } = await supabase
    .from("application_prep_checklists")
    .select("*")
    .eq("worker_id", workerId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data as PrepChecklistRow[]) ?? []).map((r) => ({
    id: r.id,
    todo_no: r.todo_no ?? "",
    app_type: r.app_type ?? "",
    app_content: r.app_content ?? "",
    has_kokuho: r.has_kokuho ?? false,
    has_nenkin: r.has_nenkin ?? false,
    target_reiwa: r.target_reiwa ?? null,
    kenshin_items_ok: r.kenshin_items_ok ?? false,
    tantou: r.tantou ?? "",
    cert_pattern: r.cert_pattern ?? "",
    joint_kind: r.joint_kind ?? "",
    joint_worker_id: r.joint_worker_id ?? null,
    joint_todo_no: r.joint_todo_no ?? "",
    joint_lead: r.joint_lead ?? "",
    sign_status: r.sign_status ?? "",
    planned_app_on: r.planned_app_on ?? null,
  }));
}

// この外国人を連名相手として設定している準備リスト（相手側からのリンク）。
// どちらの申請準備TODOからも「誰と連名で筆頭者が誰か」が分かるようにする
export interface JointLinkFrom {
  worker_id: string; // 設定した側（相手）の外国人
  worker_name: string;
  todo_no: string; // 相手のTODO番号
  joint_todo_no: string; // こちら（この外国人）のTODO番号として登録された番号
  joint_lead: string; // 筆頭者（'' / 本人=相手側が筆頭 / 相手=この外国人が筆頭）
}

export async function listJointLinksTo(
  supabase: SupabaseClient,
  workerId: string,
): Promise<JointLinkFrom[]> {
  // 0111未適用でも動くよう select("*") で読み、無い列は空として扱う
  const { data, error } = await supabase
    .from("application_prep_checklists")
    .select("*")
    .eq("joint_worker_id", workerId);
  if (error) throw error;
  const rows = ((data as PrepChecklistRow[]) ?? []).filter((r) => (r.joint_kind ?? "") === "連名");
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((r) => (r as unknown as { worker_id: string }).worker_id))];
  const { data: ws } = await supabase.from("workers").select("id, name").in("id", ids);
  const nameById = new Map(
    (((ws as { id: string; name: string }[] | null) ?? [])).map((w) => [w.id, w.name]),
  );
  return rows.map((r) => {
    const workerIdOfRow = (r as unknown as { worker_id: string }).worker_id;
    return {
      worker_id: workerIdOfRow,
      worker_name: nameById.get(workerIdOfRow) ?? "",
      todo_no: r.todo_no ?? "",
      joint_todo_no: r.joint_todo_no ?? "",
      joint_lead: r.joint_lead ?? "",
    };
  });
}

// 追加項目（単独/連名・連名相手・署名ステータス）の保存。0105_prep_checklist_extras.sql が必要
export async function updatePrepChecklistExtras(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<
    Pick<
      PrepChecklistRow,
      | "joint_kind"
      | "joint_worker_id"
      | "joint_todo_no"
      | "joint_lead"
      | "sign_status"
      | "planned_app_on"
    >
  >,
): Promise<void> {
  const { error } = await supabase
    .from("application_prep_checklists")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

// 準備リストのTODO番号を変更する（書類の準備状況はリストid紐付けのためそのまま残る）
export async function updatePrepChecklistTodoNo(
  supabase: SupabaseClient,
  id: string,
  todoNo: string,
): Promise<void> {
  const { error } = await supabase
    .from("application_prep_checklists")
    .update({ todo_no: todoNo })
    .eq("id", id);
  if (error) throw error;
}

// TODO番号を指定して保存（同じ番号があれば更新、無ければ新規作成）
export async function upsertPrepChecklist(
  supabase: SupabaseClient,
  workerId: string,
  todoNo: string,
  meta: PrepChecklistMeta,
): Promise<void> {
  const { error } = await supabase
    .from("application_prep_checklists")
    .upsert(
      { worker_id: workerId, todo_no: todoNo, ...meta },
      { onConflict: "worker_id,todo_no" },
    );
  if (error) throw error;
}

// 担当者だけを保存する（そのTODO番号のリストが無ければ作成する）。
// 申請一覧「申請前＜入管提出！！＞」からのインライン編集用。他のメタ情報は変更しない
// 担当者（申請準備）の一覧。申請一覧を担当者で絞り込むのに使う。
// 担当者は「外国人 × 申請TODO番号」で持つため、その形の対応表で返す
// （キーは `${worker_id} ${todo_no}`。listPrepStatuses と同じ引き方）。
// 表示中のページに関わらず全件で絞れるよう、一覧をまとめて取る
export async function listPrepTantou(
  supabase: SupabaseClient,
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("application_prep_checklists")
    .select("worker_id, todo_no, tantou, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const rows =
    (data as { worker_id: string; todo_no: string | null; tantou: string | null }[] | null) ?? [];
  const out: Record<string, string> = {};
  for (const r of rows) {
    const key = `${r.worker_id} ${r.todo_no ?? ""}`;
    if (out[key] === undefined) out[key] = r.tantou ?? "";
  }
  return out;
}

export async function upsertPrepTantou(
  supabase: SupabaseClient,
  workerId: string,
  todoNo: string,
  tantou: string,
): Promise<void> {
  const { error } = await supabase
    .from("application_prep_checklists")
    .upsert(
      { worker_id: workerId, todo_no: todoNo, tantou },
      { onConflict: "worker_id,todo_no" },
    );
  if (error) throw error;
}

// TODO番号の準備リストを削除する
export async function deletePrepChecklist(
  supabase: SupabaseClient,
  workerId: string,
  todoNo: string,
): Promise<void> {
  const { error } = await supabase
    .from("application_prep_checklists")
    .delete()
    .eq("worker_id", workerId)
    .eq("todo_no", todoNo);
  if (error) throw error;
}

// ---- 書類ごとの準備状況（prep_doc_statuses） ----

export interface PrepDocStatusRow {
  id: string;
  checklist_id: string;
  doc_id: string;
  status: string; // 選択した準備状況（'' = 未選択）
  note: string; // 依頼先・理由書・メモ
  amount: string; // 金額（未納額など）
  date_on: string | null; // 受診日など
  tracking_out: string; // レターパック追跡番号（送付）
  tracking_back: string; // レターパック追跡番号（返信用）
  mail_after_apply: boolean; // 申請後に発行され次第、入管へ郵送する
  attach_items: string; // 添付する資料項目（カンマ区切り。年金記録: 年金記録/免除申請書）
}

export type PrepDocStatusInput = Omit<PrepDocStatusRow, "id" | "checklist_id" | "doc_id">;

export const EMPTY_PREP_DOC_STATUS: PrepDocStatusInput = {
  status: "",
  note: "",
  amount: "",
  date_on: null,
  tracking_out: "",
  tracking_back: "",
  mail_after_apply: false,
  attach_items: "",
};

// チェックリスト1件分の書類ステータスを全件取得
export async function listPrepDocStatuses(
  supabase: SupabaseClient,
  checklistId: string,
): Promise<PrepDocStatusRow[]> {
  const { data, error } = await supabase
    .from("prep_doc_statuses")
    .select("*")
    .eq("checklist_id", checklistId);
  if (error) throw error;
  return (data as PrepDocStatusRow[]) ?? [];
}

// 書類1件分のステータスを保存（無ければ作成）
export async function upsertPrepDocStatus(
  supabase: SupabaseClient,
  checklistId: string,
  docId: string,
  input: PrepDocStatusInput,
): Promise<void> {
  const { error } = await supabase
    .from("prep_doc_statuses")
    .upsert(
      { checklist_id: checklistId, doc_id: docId, ...input },
      { onConflict: "checklist_id,doc_id" },
    );
  if (error) throw error;
}

// 申請後に入管へ郵送する書類（mail_after_apply）を外国人単位で取得。
// 申請詳細でのアラート表示用（TODO番号つき）
export interface MailAfterApplyDoc {
  doc_id: string;
  todo_no: string;
}

export async function listMailAfterApplyDocs(
  supabase: SupabaseClient,
  workerId: string,
): Promise<MailAfterApplyDoc[]> {
  const { data: lists, error: listErr } = await supabase
    .from("application_prep_checklists")
    .select("id, todo_no")
    .eq("worker_id", workerId);
  if (listErr) throw listErr;
  const checklists = (lists as { id: string; todo_no: string | null }[]) ?? [];
  if (checklists.length === 0) return [];

  const { data, error } = await supabase
    .from("prep_doc_statuses")
    .select("doc_id, checklist_id")
    .in("checklist_id", checklists.map((c) => c.id))
    .eq("mail_after_apply", true);
  if (error) throw error;
  const todoById = new Map(checklists.map((c) => [c.id, c.todo_no ?? ""]));
  return ((data as { doc_id: string; checklist_id: string }[]) ?? []).map((r) => ({
    doc_id: r.doc_id,
    todo_no: todoById.get(r.checklist_id) ?? "",
  }));
}

// ---- 必要書類がどれだけ揃ったか（申請準備のTODO一覧の「書類 ○%」） ----

// 外国人×TODO番号ごとの進捗。キーは `${worker_id} ${todo_no}`（listPrepTantou と同じ引き方）。
// 判定に使う材料（準備リスト・書類の準備状況・添付・顔写真・在留カード・パスポート）を
// まとめて取得して、チェックリストと同じ evaluatePrepChecklist で計算する。
// 材料の一部が読めなくても「揃っていない」として計算し、画面が止まらないようにする
export async function listPrepProgress(
  supabase: SupabaseClient,
  workerIds: string[],
): Promise<Record<string, PrepProgress>> {
  if (workerIds.length === 0) return {};

  // 準備リスト（0105以降の追加列が無くても動くよう select("*")）
  const { data: listData, error } = await supabase
    .from("application_prep_checklists")
    .select("*")
    .in("worker_id", workerIds)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const lists =
    (listData as (PrepChecklistRow & { worker_id: string })[] | null) ?? [];
  if (lists.length === 0) return {};

  const [docsRes, workersRes, cardsRes, passportsRes, statusRes] = await Promise.all([
    supabase
      .from("onboarding_documents")
      .select("worker_id, doc_key, storage_path")
      .in("worker_id", workerIds),
    supabase.from("workers").select("id, photo_path").in("id", workerIds),
    supabase
      .from("worker_documents")
      .select("worker_id")
      .eq("kind", "在留カード")
      .in("worker_id", workerIds),
    supabase.from("worker_passport_files").select("worker_id").in("worker_id", workerIds),
    supabase
      .from("prep_doc_statuses")
      .select("checklist_id, doc_id, status")
      .in("checklist_id", lists.map((l) => l.id)),
  ]);

  // 外国人ごとの添付済みキー（storage_path があるものだけ）
  const filledByWorker = new Map<string, Set<string>>();
  for (const d of (docsRes.data as
    | { worker_id: string; doc_key: string; storage_path: string | null }[]
    | null) ?? []) {
    if (!d.storage_path) continue;
    const set = filledByWorker.get(d.worker_id) ?? new Set<string>();
    set.add(d.doc_key);
    filledByWorker.set(d.worker_id, set);
  }
  const photoByWorker = new Map(
    (((workersRes.data as { id: string; photo_path: string | null }[] | null) ?? [])).map((w) => [
      w.id,
      w.photo_path,
    ]),
  );
  const cardWorkers = new Set(
    (((cardsRes.data as { worker_id: string }[] | null) ?? [])).map((r) => r.worker_id),
  );
  const passportWorkers = new Set(
    (((passportsRes.data as { worker_id: string }[] | null) ?? [])).map((r) => r.worker_id),
  );
  // 準備リストごとの「書類ID → 選択中の準備状況」
  const statusByList = new Map<string, Record<string, string>>();
  for (const r of (statusRes.data as
    | { checklist_id: string; doc_id: string; status: string | null }[]
    | null) ?? []) {
    const cur = statusByList.get(r.checklist_id) ?? {};
    cur[r.doc_id] = r.status ?? "";
    statusByList.set(r.checklist_id, cur);
  }

  const out: Record<string, PrepProgress> = {};
  for (const l of lists) {
    const filledDocKeys = filledByWorker.get(l.worker_id) ?? new Set<string>();
    const meta: PrepChecklistMeta = {
      app_type: l.app_type ?? "",
      app_content: l.app_content ?? "",
      has_kokuho: l.has_kokuho ?? false,
      has_nenkin: l.has_nenkin ?? false,
      target_reiwa: l.target_reiwa ?? null,
      kenshin_items_ok: l.kenshin_items_ok ?? false,
      tantou: l.tantou ?? "",
      cert_pattern: l.cert_pattern ?? "",
    };
    const { items } = evaluatePrepChecklist(
      meta,
      {
        filledDocKeys,
        photoPath: photoByWorker.get(l.worker_id) ?? null,
        healthComplete: filledDocKeys.has("kenshin"),
        hasResidenceCard: cardWorkers.has(l.worker_id),
        hasPassportFile: passportWorkers.has(l.worker_id),
      },
      statusByList.get(l.id) ?? {},
    );
    const key = `${l.worker_id} ${l.todo_no ?? ""}`;
    // 同じ組み合わせが複数あるときは更新の新しい方を優先（並びが updated_at の降順のため先勝ち）
    if (out[key] === undefined) out[key] = prepProgressOf(items);
  }
  return out;
}

// 申請準備に追加したときに、選んだ準備の内容（只今の状況）を
// そのTODO番号の準備リストの「申請種別」に入れる（0121）。
// 必要書類のチェックリストを決める app_type も、内容から自動で決まる。
export async function upsertPrepAppContent(
  supabase: SupabaseClient,
  workerId: string,
  todoNo: string,
  appContent: string,
  appType: string,
): Promise<void> {
  const { error } = await supabase
    .from("application_prep_checklists")
    .upsert(
      { worker_id: workerId, todo_no: todoNo, app_content: appContent, app_type: appType },
      { onConflict: "worker_id,todo_no" },
    );
  if (error) throw error;
}
