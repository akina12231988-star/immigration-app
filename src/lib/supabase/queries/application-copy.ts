import { listWorkerWages } from "@/lib/supabase/queries/wages";
import { findPlanDatesForTodo, listPlanDates } from "@/lib/supabase/queries/plan-dates";
import { getAppSetting } from "@/lib/supabase/queries/app-settings";
import { CUSTODIAN_SETTING_KEY } from "@/lib/custody";
import type { CopyWorker } from "@/lib/application-copy";
import type { Organization, WorkHistoryRow, WorkerWage } from "@/types/db";
import type { SupabaseClient } from "@supabase/supabase-js";

// 申請準備 ＞ 申請書に貼る情報のもとになるデータ。
// 「申請書に貼る情報」の一覧と、添付PDFの記載チェックの両方で同じものを読む。

export interface ApplicationCopyData {
  worker: CopyWorker | null;
  org: Organization | null;
  wages: WorkerWage[];
  histories: WorkHistoryRow[];
  planDates: Record<string, string>;
  // 登録支援機関の上書き（app_settings。無ければ既定値）
  custodian: Record<string, unknown> | null;
}

export async function loadApplicationCopyData(
  supabase: SupabaseClient,
  { workerId, orgId, todoNo }: { workerId: string; orgId: string | null; todoNo: string },
): Promise<ApplicationCopyData> {
  const [worker, org, wages, histories, planDates, custodian] = await Promise.all([
    supabase
      .from("workers")
      .select("*")
      .eq("id", workerId)
      .maybeSingle()
      .then(({ data }) => (data as CopyWorker | null) ?? null),
    orgId
      ? supabase
          .from("organizations")
          .select("*")
          .eq("id", orgId)
          .maybeSingle()
          .then(({ data }) => (data as Organization | null) ?? null)
      : Promise.resolve(null),
    listWorkerWages(supabase, workerId).catch(() => [] as WorkerWage[]),
    supabase
      .from("work_histories")
      .select("*")
      .eq("worker_id", workerId)
      .then(({ data }) => (data as WorkHistoryRow[] | null) ?? []),
    listPlanDates(supabase, workerId)
      .then((rows) => findPlanDatesForTodo(rows, todoNo)?.dates ?? {})
      .catch(() => ({}) as Record<string, string>),
    // 0149 未適用でも既定値で表示できるようにエラーは無視する
    getAppSetting<Record<string, unknown>>(supabase, CUSTODIAN_SETTING_KEY).catch(() => null),
  ]);
  return { worker, org, wages, histories, planDates, custodian };
}
