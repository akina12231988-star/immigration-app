import type { SupabaseClient } from "@supabase/supabase-js";
import { reiwaYear } from "@/lib/onboarding";
import { todayStr } from "@/lib/application-alerts";
import { toIssueRequestRow, type IssueRequestRow } from "@/lib/issue-requests";

// 「発行依頼中」の書類を、外国人・TODO番号つきで全件取る。
// prep_doc_statuses（0045）に、準備リスト（application_prep_checklists）と
// 外国人（workers）をつないで読む。
export async function listIssueRequests(
  supabase: SupabaseClient,
): Promise<IssueRequestRow[]> {
  const { data, error } = await supabase
    .from("prep_doc_statuses")
    .select(
      "checklist_id, doc_id, status, note, updated_at, " +
        "application_prep_checklists!inner(id, todo_no, target_reiwa, worker_id, workers!inner(id, name))",
    )
    .neq("status", "")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const currentReiwa = reiwaYear(todayStr());
  type Row = {
    checklist_id: string;
    doc_id: string;
    status: string;
    note: string | null;
    updated_at: string;
    application_prep_checklists?: {
      todo_no: string | null;
      target_reiwa: number | null;
      worker_id: string;
      workers?: { id: string; name: string } | null;
    } | null;
  };
  return ((data as unknown as Row[]) ?? [])
    .map((r) => {
      const list = r.application_prep_checklists;
      return toIssueRequestRow({
        checklistId: r.checklist_id,
        docId: r.doc_id,
        status: r.status,
        note: r.note ?? "",
        updatedAt: r.updated_at,
        workerId: list?.workers?.id ?? list?.worker_id ?? "",
        workerName: list?.workers?.name ?? "（不明）",
        todoNo: list?.todo_no ?? "",
        targetReiwa: list?.target_reiwa ?? null,
        currentReiwa,
      });
    })
    .filter((r): r is IssueRequestRow => r !== null);
}
