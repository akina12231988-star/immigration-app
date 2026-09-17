import type { SupabaseClient } from "@supabase/supabase-js";
import { reiwaYear } from "@/lib/onboarding";
import { todayStr } from "@/lib/application-alerts";
import { followupRequestRows, toIssueRequestRow, type IssueRequestRow } from "@/lib/issue-requests";

// 「〜依頼中」の書類を、外国人・TODO番号つきで全件取る。
// prep_doc_statuses（0045）→ 準備リスト（application_prep_checklists）→ 外国人（workers）の順に
// 別々に読んでつなぐ（埋め込みの結合は外部キーやRLSの都合で失敗することがあるため使わない）
export async function listIssueRequests(
  supabase: SupabaseClient,
): Promise<IssueRequestRow[]> {
  const { data, error } = await supabase
    .from("prep_doc_statuses")
    // memo（0161）が未適用でも読めるよう * で取る
    .select("*")
    .neq("status", "")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  type Row = {
    checklist_id: string;
    doc_id: string;
    status: string;
    note: string | null;
    date_on: string | null;
    memo?: string | null;
    updated_at: string;
  };
  const rows = (data as Row[] | null) ?? [];
  if (rows.length === 0) return [];

  const checklistIds = [...new Set(rows.map((r) => r.checklist_id))];
  const { data: lists, error: listErr } = await supabase
    .from("application_prep_checklists")
    .select("id, todo_no, target_reiwa, worker_id")
    .in("id", checklistIds);
  if (listErr) throw listErr;
  type ListRow = { id: string; todo_no: string | null; target_reiwa: number | null; worker_id: string };
  const listById = new Map(((lists as ListRow[] | null) ?? []).map((l) => [l.id, l]));

  const workerIds = [...new Set([...listById.values()].map((l) => l.worker_id))];
  const { data: workers, error: workerErr } =
    workerIds.length > 0
      ? await supabase.from("workers").select("id, name").in("id", workerIds)
      : { data: [], error: null };
  if (workerErr) throw workerErr;
  const nameById = new Map(((workers as { id: string; name: string }[] | null) ?? []).map((w) => [w.id, w.name]));

  const currentReiwa = reiwaYear(todayStr());
  return rows
    .map((r) => {
      const list = listById.get(r.checklist_id);
      if (!list) return null; // 準備リストが消えている行は出さない
      return toIssueRequestRow({
        checklistId: r.checklist_id,
        docId: r.doc_id,
        status: r.status,
        note: r.note ?? "",
        dateOn: r.date_on,
        memo: r.memo ?? "",
        updatedAt: r.updated_at,
        workerId: list.worker_id,
        workerName: nameById.get(list.worker_id) ?? "（不明）",
        todoNo: list.todo_no ?? "",
        targetReiwa: list.target_reiwa ?? null,
        currentReiwa,
      });
    })
    .filter((r): r is IssueRequestRow => r !== null);
}

// 外国人詳細の「あとでやる手続き」（転居手続き・国保/国民年金の加入）で依頼を記録した分。
// 退職・帰国した人は除く。0119（followups 列）が未適用なら空
export async function listFollowupRequests(supabase: SupabaseClient): Promise<IssueRequestRow[]> {
  const { data, error } = await supabase
    .from("workers")
    .select("id, name, status, followups")
    .not("status", "in", '("退職","帰国")')
    .order("name", { ascending: true });
  if (error) throw error;
  return followupRequestRows(
    (data as { id: string; name: string; followups?: unknown }[] | null) ?? [],
  );
}
