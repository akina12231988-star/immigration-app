import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_PREP_META, type PrepChecklistMeta } from "@/lib/application-prep";
import {
  EMPTY_HEALTH_DETAIL,
  isHealthDetailComplete,
  type HealthCheckDetail,
} from "@/lib/health-check";
import { reiwaYear } from "@/lib/onboarding";
import { prepMissingRowsOf, type PrepDocStatusDetail, type PrepMissingRow } from "@/lib/prep-missing";

// 申請準備で「まだ揃っていない書類」を、外国人をまたいで全件取る。
//
// 対象にするのは、申請準備のリスト（application_prep_checklists）があり、申請種別が入っていて、
// 退職・帰国していない外国人。TODO番号ごとに複数リストがあるので、
// 申請一覧の進捗（listPrepStatuses）と同じく「申請種別が入っている最新のリスト」を代表として使う。
// 埋め込みの結合は外部キーやRLSの都合で失敗することがあるため、テーブルごとに読んでつなぐ。

type ChecklistRow = {
  id: string;
  worker_id: string;
  todo_no: string | null;
  app_type: string | null;
  app_content: string | null;
  has_kokuho: boolean | null;
  has_nenkin: boolean | null;
  target_reiwa: number | null;
  kenshin_items_ok: boolean | null;
  tantou: string | null;
  cert_pattern: string | null;
};

type WorkerRow = {
  id: string;
  name: string;
  status: string | null;
  nationality: string | null;
  photo_path: string | null;
  health_check_on: string | null;
  current_organization_id: string | null;
  application_prep_organization_id: string | null;
};

type StatusRow = {
  checklist_id: string;
  doc_id: string;
  status: string | null;
  note: string | null;
  date_on: string | null;
  memo?: string | null;
  use_reiwa?: number | null;
};

type HealthRow = {
  worker_id: string;
  form_type: string | null;
  checked_items: string | null;
  needs_followup: boolean | null;
  followup_memo: string | null;
  followup_result: string | null;
};

// 申請の途中（審査中・在留カード受け取り待ち）の人は、もう出しているので対象から外す
export async function listPrepMissingRows(
  supabase: SupabaseClient,
  today: string,
  excludeWorkerIds: string[] = [],
): Promise<PrepMissingRow[]> {
  const { data: checklists, error } = await supabase
    .from("application_prep_checklists")
    .select(
      "id, worker_id, todo_no, app_type, app_content, has_kokuho, has_nenkin, target_reiwa, kenshin_items_ok, tantou, cert_pattern",
    )
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
  const workerIds = [...listByWorker.keys()];
  if (workerIds.length === 0) return [];

  const checklistIds = [...listByWorker.values()].map((c) => c.id);
  const [workersRes, statusesRes, docsRes, healthsRes, cardsRes, passportsRes] = await Promise.all([
    supabase
      .from("workers")
      .select(
        "id, name, status, nationality, photo_path, health_check_on, current_organization_id, application_prep_organization_id",
      )
      .in("id", workerIds),
    // memo（0161）・use_reiwa（0164）が未適用でも読めるよう * で取る
    supabase.from("prep_doc_statuses").select("*").in("checklist_id", checklistIds),
    supabase.from("onboarding_documents").select("worker_id, doc_key, storage_path").in("worker_id", workerIds),
    supabase
      .from("health_check_details")
      .select("worker_id, form_type, checked_items, needs_followup, followup_memo, followup_result")
      .in("worker_id", workerIds)
      .then((r) => r, () => ({ data: [] as HealthRow[] })),
    supabase
      .from("worker_documents")
      .select("worker_id")
      .eq("kind", "在留カード")
      .in("worker_id", workerIds)
      .then((r) => r, () => ({ data: [] as { worker_id: string }[] })),
    supabase
      .from("worker_passport_files")
      .select("worker_id")
      .in("worker_id", workerIds)
      .then((r) => r, () => ({ data: [] as { worker_id: string }[] })),
  ]);

  const workers = (workersRes.data as WorkerRow[] | null) ?? [];
  const alive = workers.filter((w) => w.status !== "退職" && w.status !== "帰国");

  // 所属機関の名前（申請準備で選んだ機関があればそれ、無ければ現在の機関）
  const orgIds = [
    ...new Set(
      alive
        .map((w) => w.application_prep_organization_id || w.current_organization_id)
        .filter((id): id is string => !!id),
    ),
  ];
  let orgNameById = new Map<string, string>();
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase.from("organizations").select("id, name").in("id", orgIds);
    orgNameById = new Map(((orgs as { id: string; name: string }[] | null) ?? []).map((o) => [o.id, o.name]));
  }

  // チェックリストごとの準備状況
  const statusByChecklist = new Map<string, Record<string, PrepDocStatusDetail>>();
  const yearsByChecklist = new Map<string, Record<string, number | null>>();
  for (const r of ((statusesRes.data as StatusRow[] | null) ?? [])) {
    const m = statusByChecklist.get(r.checklist_id) ?? {};
    m[r.doc_id] = {
      status: r.status ?? "",
      note: r.note ?? "",
      dateOn: r.date_on ?? null,
      memo: r.memo ?? "",
    };
    statusByChecklist.set(r.checklist_id, m);
    const y = yearsByChecklist.get(r.checklist_id) ?? {};
    y[r.doc_id] = r.use_reiwa ?? null;
    yearsByChecklist.set(r.checklist_id, y);
  }

  const filledByWorker = new Map<string, Set<string>>();
  for (const d of ((docsRes.data as { worker_id: string; doc_key: string; storage_path: string }[] | null) ?? [])) {
    if (!d.storage_path) continue;
    const set = filledByWorker.get(d.worker_id) ?? new Set<string>();
    set.add(d.doc_key);
    filledByWorker.set(d.worker_id, set);
  }

  const healthByWorker = new Map<string, HealthCheckDetail>();
  for (const h of ((healthsRes.data as HealthRow[] | null) ?? [])) {
    healthByWorker.set(h.worker_id, {
      form_type: (h.form_type ?? "") as HealthCheckDetail["form_type"],
      checked_items: h.checked_items ?? "",
      needs_followup: h.needs_followup ?? false,
      followup_memo: h.followup_memo ?? "",
      followup_result: h.followup_result ?? "",
    });
  }

  const hasCard = new Set(
    ((cardsRes.data as { worker_id: string }[] | null) ?? []).map((r) => r.worker_id),
  );
  const hasPassport = new Set(
    ((passportsRes.data as { worker_id: string }[] | null) ?? []).map((r) => r.worker_id),
  );

  const currentReiwa = reiwaYear(today);
  return alive.flatMap((w) => {
    const c = listByWorker.get(w.id);
    if (!c) return [];
    const meta: PrepChecklistMeta = {
      ...EMPTY_PREP_META,
      app_type: (c.app_type ?? "") as PrepChecklistMeta["app_type"],
      app_content: c.app_content ?? "",
      has_kokuho: c.has_kokuho ?? false,
      has_nenkin: c.has_nenkin ?? false,
      target_reiwa: c.target_reiwa ?? null,
      kenshin_items_ok: c.kenshin_items_ok ?? false,
      tantou: c.tantou ?? "",
      cert_pattern: (c.cert_pattern ?? "") as PrepChecklistMeta["cert_pattern"],
    };
    const filled = filledByWorker.get(w.id) ?? new Set<string>();
    const orgId = w.application_prep_organization_id || w.current_organization_id || null;
    return prepMissingRowsOf({
      workerId: w.id,
      workerName: w.name,
      orgId,
      orgName: orgId ? (orgNameById.get(orgId) ?? "") : "",
      todoNo: c.todo_no ?? "",
      checklistId: c.id,
      meta,
      nationality: w.nationality ?? "",
      sources: {
        filledDocKeys: filled,
        yearOverrides: yearsByChecklist.get(c.id) ?? {},
        photoPath: w.photo_path,
        hasResidenceCard: hasCard.has(w.id),
        hasPassportFile: hasPassport.has(w.id),
        healthComplete: isHealthDetailComplete(
          healthByWorker.get(w.id) ?? EMPTY_HEALTH_DETAIL,
          filled.has("kenshin"),
          w.health_check_on,
          today,
        ),
      },
      docStatuses: statusByChecklist.get(c.id) ?? {},
      currentReiwa,
    });
  });
}
