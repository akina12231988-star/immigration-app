import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EMPTY_PREP_META,
  evaluatePrepChecklist,
  type PrepChecklistMeta,
} from "@/lib/application-prep";
import {
  EMPTY_HEALTH_DETAIL,
  isHealthDetailComplete,
  type HealthCheckDetail,
} from "@/lib/health-check";

// 申請準備の進捗（申請一覧「申請前＜準備中＞」で一目で分かるようにするため）。
export interface PrepStatus {
  appTypeSet: boolean; // 申請種別が選択済みか（未設定ならチェックリスト未開始）
  total: number; // 必要書類数
  missing: number; // 不足数
  photoPath: string | null; // 添付モーダル用
  healthCheckOn: string | null; // 添付モーダル用
}

type ChecklistRow = {
  worker_id: string;
  app_type: string | null;
  has_kokuho: boolean | null;
  has_nenkin: boolean | null;
  target_reiwa: number | null;
  kenshin_items_ok: boolean | null;
};
type DocRow = { worker_id: string; doc_key: string; storage_path: string };
type HealthRow = {
  worker_id: string;
  form_type: string | null;
  checked_items: string | null;
  needs_followup: boolean | null;
  followup_memo: string | null;
  followup_result: string | null;
};
type WorkerRow = { id: string; photo_path: string | null; health_check_on: string | null };

// 複数の外国人の準備状況をまとめて計算する。
export async function listPrepStatuses(
  supabase: SupabaseClient,
  workerIds: string[],
  today: string,
): Promise<Map<string, PrepStatus>> {
  const result = new Map<string, PrepStatus>();
  if (workerIds.length === 0) return result;

  const [checklistsRes, docsRes, healthsRes, workersRes] = await Promise.all([
    supabase
      .from("application_prep_checklists")
      .select("worker_id, app_type, has_kokuho, has_nenkin, target_reiwa, kenshin_items_ok")
      .in("worker_id", workerIds),
    supabase
      .from("onboarding_documents")
      .select("worker_id, doc_key, storage_path")
      .in("worker_id", workerIds),
    supabase
      .from("health_check_details")
      .select("worker_id, form_type, checked_items, needs_followup, followup_memo, followup_result")
      .in("worker_id", workerIds),
    supabase.from("workers").select("id, photo_path, health_check_on").in("id", workerIds),
  ]);

  const metaByWorker = new Map<string, PrepChecklistMeta>();
  for (const c of (checklistsRes.data as ChecklistRow[]) ?? []) {
    metaByWorker.set(c.worker_id, {
      app_type: (c.app_type ?? "") as PrepChecklistMeta["app_type"],
      has_kokuho: c.has_kokuho ?? false,
      has_nenkin: c.has_nenkin ?? false,
      target_reiwa: c.target_reiwa ?? null,
      kenshin_items_ok: c.kenshin_items_ok ?? false,
    });
  }

  const filledByWorker = new Map<string, Set<string>>();
  for (const d of (docsRes.data as DocRow[]) ?? []) {
    if (!d.storage_path) continue;
    if (!filledByWorker.has(d.worker_id)) filledByWorker.set(d.worker_id, new Set());
    filledByWorker.get(d.worker_id)!.add(d.doc_key);
  }

  const healthByWorker = new Map<string, HealthCheckDetail>();
  for (const h of (healthsRes.data as HealthRow[]) ?? []) {
    healthByWorker.set(h.worker_id, {
      form_type: (h.form_type ?? "") as HealthCheckDetail["form_type"],
      checked_items: h.checked_items ?? "",
      needs_followup: h.needs_followup ?? false,
      followup_memo: h.followup_memo ?? "",
      followup_result: h.followup_result ?? "",
    });
  }

  const workerById = new Map<string, WorkerRow>();
  for (const w of (workersRes.data as WorkerRow[]) ?? []) workerById.set(w.id, w);

  for (const id of workerIds) {
    const meta = metaByWorker.get(id) ?? EMPTY_PREP_META;
    const filled = filledByWorker.get(id) ?? new Set<string>();
    const wk = workerById.get(id);
    const photoPath = wk?.photo_path ?? null;
    const healthCheckOn = wk?.health_check_on ?? null;
    const healthComplete = isHealthDetailComplete(
      healthByWorker.get(id) ?? EMPTY_HEALTH_DETAIL,
      filled.has("kenshin"),
      healthCheckOn,
      today,
    );
    const { items, missing } = evaluatePrepChecklist(meta, {
      filledDocKeys: filled,
      photoPath,
      healthComplete,
    });
    result.set(id, {
      appTypeSet: !!meta.app_type,
      total: items.length,
      missing: missing.length,
      photoPath,
      healthCheckOn,
    });
  }
  return result;
}
