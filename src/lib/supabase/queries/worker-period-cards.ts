import type { SupabaseClient } from "@supabase/supabase-js";
import type { PeriodCardInput } from "@/lib/worker-period-cards";

// 在籍していた時（過去の在籍期間）の在留カード情報（worker_period_cards・0136）

export interface WorkerPeriodCardRow extends PeriodCardInput {
  id: string;
  worker_id: string;
  period_key: string;
  org_name: string;
  period_start: string | null;
  period_end: string | null;
}

export async function listWorkerPeriodCards(
  supabase: SupabaseClient,
  workerId: string,
): Promise<WorkerPeriodCardRow[]> {
  const { data, error } = await supabase
    .from("worker_period_cards")
    .select("*")
    .eq("worker_id", workerId);
  if (error) throw error;
  return (data as WorkerPeriodCardRow[]) ?? [];
}

// その在籍期間の内容を保存（無ければ作成、あれば上書き）
export async function upsertWorkerPeriodCard(
  supabase: SupabaseClient,
  input: {
    workerId: string;
    periodKey: string;
    orgName: string;
    periodStart: string;
    periodEnd: string;
    card: PeriodCardInput;
  },
): Promise<void> {
  const { error } = await supabase.from("worker_period_cards").upsert(
    {
      worker_id: input.workerId,
      period_key: input.periodKey,
      org_name: input.orgName,
      period_start: input.periodStart || null,
      period_end: input.periodEnd || null,
      ...input.card,
    },
    { onConflict: "worker_id,period_key" },
  );
  if (error) throw error;
}
