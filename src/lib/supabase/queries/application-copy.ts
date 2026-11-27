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
  // この所属機関にいま「在籍中」で登録している人数（在留資格ごと）。常勤職員数の確認用
  orgWorkerCounts: OrgWorkerCounts | null;
}

export interface OrgWorkerCounts {
  ssw1: number; // 特定技能1号
  ssw2: number; // 特定技能2号
  trainee: number; // 技能実習
  katsudo: number; // 特定活動（特定技能1号以降準備など）
  other: number; // そのほか・在留資格が未登録
}

// この機関に「在籍中」で登録している人を在留資格ごとに数える（読めなければ null）
async function countOrgWorkers(supabase: SupabaseClient, orgId: string): Promise<OrgWorkerCounts | null> {
  const { data, error } = await supabase
    .from("workers")
    .select("residence_status")
    .eq("current_organization_id", orgId)
    .eq("status", "在籍中");
  if (error) return null;
  const out: OrgWorkerCounts = { ssw1: 0, ssw2: 0, trainee: 0, katsudo: 0, other: 0 };
  for (const r of (data as { residence_status: string | null }[] | null) ?? []) {
    const v = (r.residence_status ?? "").replace(/[１２３]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    if (v.includes("特定活動")) out.katsudo += 1;
    else if (v.includes("特定技能2号")) out.ssw2 += 1;
    else if (v.includes("特定技能1号")) out.ssw1 += 1;
    else if (v.includes("技能実習")) out.trainee += 1;
    else out.other += 1;
  }
  return out;
}

export async function loadApplicationCopyData(
  supabase: SupabaseClient,
  { workerId, orgId, todoNo }: { workerId: string; orgId: string | null; todoNo: string },
): Promise<ApplicationCopyData> {
  const [worker, org, wages, histories, planDates, custodian, orgWorkerCounts] = await Promise.all([
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
    orgId ? countOrgWorkers(supabase, orgId).catch(() => null) : Promise.resolve(null),
  ]);
  return { worker, org, wages, histories, planDates, custodian, orgWorkerCounts };
}
