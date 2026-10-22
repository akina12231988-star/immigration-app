import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildVisaHistory,
  type VisaHistoryApplication,
  type VisaHistoryCard,
  type VisaHistoryManual,
  type VisaHistoryRow,
} from "@/lib/visa-history";

// 在留資格の履歴のうち、手で入れた分（worker_visa_history・0138）

export type VisaHistoryInput = Omit<VisaHistoryManual, "id">;

export async function listVisaHistory(
  supabase: SupabaseClient,
  workerId: string,
): Promise<VisaHistoryManual[]> {
  // hidden（0153）が未適用でも読めるよう select("*") にして、無ければ false 扱い
  const { data, error } = await supabase
    .from("worker_visa_history")
    .select("*")
    .eq("worker_id", workerId)
    .order("permit_date", { ascending: true });
  if (error) throw error;
  return ((data as (VisaHistoryManual & { hidden?: boolean | null })[]) ?? []).map((r) => ({
    id: r.id,
    permit_date: r.permit_date,
    status: r.status,
    kind: r.kind,
    expiry_date: r.expiry_date,
    card_no: r.card_no,
    note: r.note,
    hidden: r.hidden === true,
  }));
}

// 自動で出ている許可を履歴から外す（「削除」。元の申請・在留カードの記録は残る）
export async function hideVisaHistory(
  supabase: SupabaseClient,
  workerId: string,
  input: { permit_date: string; status: string },
): Promise<void> {
  const { error } = await supabase
    .from("worker_visa_history")
    .insert({ worker_id: workerId, permit_date: input.permit_date, status: input.status, hidden: true });
  if (error) throw error;
}

export async function insertVisaHistory(
  supabase: SupabaseClient,
  workerId: string,
  input: VisaHistoryInput,
): Promise<void> {
  const { error } = await supabase
    .from("worker_visa_history")
    .insert({ worker_id: workerId, ...input });
  if (error) throw error;
}

export async function updateVisaHistory(
  supabase: SupabaseClient,
  id: string,
  input: VisaHistoryInput,
): Promise<void> {
  const { error } = await supabase.from("worker_visa_history").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteVisaHistory(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("worker_visa_history").delete().eq("id", id);
  if (error) throw error;
}

// 在留資格の履歴（許可ごと）を全部組み立てて返す。
// 元データは、申請一覧の許可欄・在留カードの記録（0137）・手で入れた分（0138）・今の在留カード。
// 0137/0138 が未適用の環境でも、読めた分だけで組み立てる（労働者名簿の履歴などに使う）
export async function listVisaHistoryRows(
  supabase: SupabaseClient,
  worker: {
    id: string;
    residence_card_no: string;
    residence_status: string;
    residence_permit_date: string | null;
    residence_expiry_date: string | null;
    residence_period?: string;
  },
): Promise<VisaHistoryRow[]> {
  const [apps, cards, manual] = await Promise.all([
    supabase
      .from("immigration_applications")
      .select("content, approved, approval_date, granted_permit_date, granted_expiry_date, granted_card_no, visa_at_grant")
      .eq("worker_id", worker.id)
      .then(({ data }) => (data as VisaHistoryApplication[] | null) ?? []),
    supabase
      .from("worker_card_history")
      .select("residence_card_no, residence_status, residence_permit_date, residence_expiry_date")
      .eq("worker_id", worker.id)
      .then(({ data }) => (data as VisaHistoryCard[] | null) ?? []),
    listVisaHistory(supabase, worker.id).catch(() => [] as VisaHistoryManual[]),
  ]);
  return buildVisaHistory({
    apps: apps.map((a) => ({
      content: a.content ?? "",
      approved: !!a.approved,
      approval_date: a.approval_date,
      granted_permit_date: a.granted_permit_date,
      granted_expiry_date: a.granted_expiry_date,
      granted_card_no: a.granted_card_no ?? "",
      visa_at_grant: a.visa_at_grant ?? "",
    })),
    cards: cards.map((c) => ({
      residence_card_no: c.residence_card_no ?? "",
      residence_status: c.residence_status ?? "",
      residence_permit_date: c.residence_permit_date,
      residence_expiry_date: c.residence_expiry_date,
    })),
    manual,
    current: worker.residence_permit_date
      ? {
          residence_card_no: worker.residence_card_no ?? "",
          residence_status: worker.residence_status ?? "",
          residence_permit_date: worker.residence_permit_date,
          residence_expiry_date: worker.residence_expiry_date,
          residence_period: worker.residence_period ?? "",
        }
      : null,
  });
}
