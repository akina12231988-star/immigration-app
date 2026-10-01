import type { SupabaseClient } from "@supabase/supabase-js";
import { stageOfStatus, type TodoStatusOption } from "@/lib/todo";
import { defaultStampFeePayer, type StampFeeUnknownRow } from "@/lib/stamp-fee";

// 収入印紙代の負担（本人負担／会社負担）が未設定の申請を、外国人をまたいで全件取る。
//
// 対象は「まだ揃っていない書類」と同じ: 申請準備のリストがあり、申請種別が入っていて、
// 退職・帰国していない外国人の、申請種別が入っている最新のリスト。
// 申請準備のTODOの経過が「完了」のもの、入管へ出した後の人（審査中など）は出さない。
// 有限会社國崎青果は画面で自動的に本人負担になるので、未設定でも出さない。
// 0175 未適用でも読めるよう select("*") で取り、無い列は未設定として扱う

type ChecklistRow = {
  id: string;
  worker_id: string;
  todo_no: string | null;
  app_type: string | null;
  app_content: string | null;
  tantou: string | null;
  stamp_fee_payer?: string | null;
};

type WorkerRow = {
  id: string;
  name: string;
  status: string | null;
  current_organization_id: string | null;
  application_prep_organization_id: string | null;
};

type TodoRow = {
  todo_no: string | null;
  worker_id: string | null;
  status: string | null;
  deleted_at: string | null;
};

export async function listStampFeeUnknownRows(
  supabase: SupabaseClient,
  excludeWorkerIds: string[] = [],
): Promise<StampFeeUnknownRow[]> {
  const { data: checklists, error } = await supabase
    .from("application_prep_checklists")
    .select("*")
    .neq("app_type", "")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  // 外国人ごとの代表リスト（申請種別が入っている最新のもの）
  const excluded = new Set(excludeWorkerIds);
  const listByWorker = new Map<string, ChecklistRow>();
  for (const c of ((checklists as ChecklistRow[] | null) ?? [])) {
    if (!c.app_type || excluded.has(c.worker_id)) continue;
    if (!listByWorker.has(c.worker_id)) listByWorker.set(c.worker_id, c);
  }
  // 負担が決まっているものは外す
  for (const [workerId, c] of [...listByWorker.entries()]) {
    if ((c.stamp_fee_payer ?? "").trim()) listByWorker.delete(workerId);
  }
  if (listByWorker.size === 0) return [];

  // 申請準備のTODOの経過（進捗状況）。完了のものは出さない
  const [todosRes, todoOptionsRes] = await Promise.all([
    supabase
      .from("todos")
      .select("todo_no, worker_id, status, deleted_at")
      .eq("kind", "申請準備")
      .then((r) => r, () => ({ data: [] as TodoRow[] })),
    supabase
      .from("todo_status_options")
      .select("id, kind, stage, name, sort_no")
      .eq("kind", "申請準備")
      .then((r) => r, () => ({ data: [] as TodoStatusOption[] })),
  ]);
  const todoOptions = (todoOptionsRes.data as TodoStatusOption[] | null) ?? [];
  const doneTodoKeys = new Set<string>();
  for (const t of ((todosRes.data as TodoRow[] | null) ?? [])) {
    if (t.deleted_at) continue;
    if (stageOfStatus(t.status ?? "", todoOptions) === "完了") {
      doneTodoKeys.add(`${t.worker_id ?? ""}|${t.todo_no ?? ""}`);
    }
  }
  for (const [workerId, c] of [...listByWorker.entries()]) {
    if (doneTodoKeys.has(`${workerId}|${c.todo_no ?? ""}`)) listByWorker.delete(workerId);
  }
  const workerIds = [...listByWorker.keys()];
  if (workerIds.length === 0) return [];

  const { data: ws, error: wErr } = await supabase
    .from("workers")
    .select("id, name, status, current_organization_id, application_prep_organization_id")
    .in("id", workerIds);
  if (wErr) throw wErr;
  const workers = (((ws as WorkerRow[] | null) ?? [])).filter((w) => w.status !== "退職" && w.status !== "帰国");

  // 所属機関の名前（申請準備で選んだ機関があればそれ、無ければ現在の機関）
  const orgIds = [
    ...new Set(
      workers
        .map((w) => w.application_prep_organization_id || w.current_organization_id)
        .filter((id): id is string => !!id),
    ),
  ];
  let orgNameById = new Map<string, string>();
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase.from("organizations").select("id, name").in("id", orgIds);
    orgNameById = new Map(((orgs as { id: string; name: string }[] | null) ?? []).map((o) => [o.id, o.name]));
  }

  const rows: StampFeeUnknownRow[] = [];
  for (const w of workers) {
    const c = listByWorker.get(w.id);
    if (!c) continue;
    const orgId = w.application_prep_organization_id || w.current_organization_id || "";
    const orgName = orgId ? (orgNameById.get(orgId) ?? "") : "";
    // 有限会社國崎青果は自動で本人負担（未設定扱いにしない）
    if (defaultStampFeePayer(orgName)) continue;
    rows.push({
      workerId: w.id,
      workerName: w.name,
      todoNo: c.todo_no ?? "",
      appContent: c.app_content ?? "",
      tantou: c.tantou ?? "",
      orgId,
      orgName,
    });
  }
  return rows;
}
