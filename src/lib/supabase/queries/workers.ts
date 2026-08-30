import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingWorker } from "@/lib/monthly-billing";
import type {
  Worker,
  WorkerInput,
  WorkerPastRecurringSale,
  WorkerWithHistories,
} from "@/types/db";
import type { ParsedWorker } from "@/lib/ssw/import";
import type { SupportWorker } from "@/lib/support-system";
import {
  letterForNationality,
  nextWorkerCode,
  shouldReissueWorkerCode,
} from "@/lib/worker-code";
import {
  normalizeOrgEmploymentStarts,
  upsertOrgEmploymentStart,
} from "@/lib/org-employment";

// 支援体制の集計用: 所属機関ごとの1号特定技能外国人数を数えるための最小項目
export async function listWorkersForSupport(
  supabase: SupabaseClient,
): Promise<SupportWorker[]> {
  const { data, error } = await supabase
    .from("workers")
    .select("current_organization_id, support, status, residence_status");
  if (error) throw error;
  return (data as SupportWorker[]) ?? [];
}

// 一覧用: 全外国人＋職歴を一括取得（通算計算はクライアント側で行う）
export async function listWorkersWithHistories(
  supabase: SupabaseClient,
): Promise<WorkerWithHistories[]> {
  const { data, error } = await supabase
    .from("workers")
    .select("*, work_histories(*)")
    .order("created_at", { ascending: true })
    .order("start_date", { referencedTable: "work_histories", ascending: true });
  if (error) throw error;
  return (data as WorkerWithHistories[]) ?? [];
}

export async function getWorkerWithHistories(
  supabase: SupabaseClient,
  id: string,
): Promise<WorkerWithHistories | null> {
  const { data, error } = await supabase
    .from("workers")
    .select("*, work_histories(*)")
    .eq("id", id)
    .order("start_date", { referencedTable: "work_histories", ascending: true })
    .maybeSingle();
  if (error) throw error;
  return data as WorkerWithHistories | null;
}

// 選択用の軽量な外国人一覧（id・氏名・現在の所属機関のみ）
export interface WorkerBrief {
  id: string;
  name: string;
  current_organization_id: string | null;
  address: string; // 現在の住所（郵送請求ツールで請求先判断の参考に表示）
}

export async function listWorkersBrief(
  supabase: SupabaseClient,
): Promise<WorkerBrief[]> {
  const { data, error } = await supabase
    .from("workers")
    .select("id, name, current_organization_id, address")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as WorkerBrief[]) ?? [];
}

// 月末の請求書作成用: 在籍名簿と支援費の日割りに必要な項目のみ
export async function listWorkersForBilling(
  supabase: SupabaseClient,
): Promise<BillingWorker[]> {
  const { data, error } = await supabase
    .from("workers")
    .select(
      "id, name, kana, nationality, gender, birth, residence_status, residence_card_no, " +
        "residence_permit_date, residence_expiry_date, employment_start_on, assigned_office, " +
        "residence_note, recurring_sales_no, current_organization_id, support, status, leaving_on, " +
        // 当月中の転職（前の機関の退職精算と新しい機関の日割りに分ける）の判定用と、
        // 前の機関の行に出す過去の定期売上No.
        "org_employment_starts, leaving_org_name, past_recurring_sales",
    )
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as unknown as BillingWorker[]) ?? [];
}

// 定期売上No.（freee販売の定期売上の伝票番号）だけを更新する
export async function setWorkerRecurringSalesNo(
  supabase: SupabaseClient,
  workerId: string,
  recurringSalesNo: string,
): Promise<void> {
  const { error } = await supabase
    .from("workers")
    .update({ recurring_sales_no: recurringSalesNo })
    .eq("id", workerId);
  if (error) throw error;
}

// 過去の定期売上No.（転職前の所属機関の番号）だけを更新する
export async function setWorkerPastRecurringSales(
  supabase: SupabaseClient,
  workerId: string,
  entries: WorkerPastRecurringSale[],
): Promise<void> {
  const { error } = await supabase
    .from("workers")
    .update({ past_recurring_sales: entries })
    .eq("id", workerId);
  if (error) throw error;
}

// 退職＜随時報告＞用: 氏名検索とリンク表示・所属機関の確認に必要な項目のみ
export interface WorkerForResignation {
  id: string;
  name: string;
  kana: string;
  messenger_link: string;
  notion_link: string;
  current_organization_id: string | null;
  leaving_on: string | null;
  leaving_todo: string;
}

export async function listWorkersForResignation(
  supabase: SupabaseClient,
): Promise<WorkerForResignation[]> {
  const { data, error } = await supabase
    .from("workers")
    .select(
      "id, name, kana, messenger_link, notion_link, current_organization_id, leaving_on, leaving_todo",
    )
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as WorkerForResignation[]) ?? [];
}

// 在留更新・パスポート更新の一覧用: 外国人＋現在の所属機関名。
// 一覧は全件を取るので、表示・判定に使う列だけに絞って通信量を抑える
// （メモ・家族・住所・扶養などの長い項目は詳細ページで取る）。
// 列を足すときは WORKER_LIST_COLUMNS と型の両方に足すこと
export const WORKER_LIST_FIELDS = [
  "id",
  "name",
  "kana",
  "nationality",
  "birth",
  "gender",
  "residence_card_no",
  "field",
  "support",
  "status",
  "current_organization_id",
  "residence_status",
  "residence_permit_date",
  "residence_expiry_date",
  "passport_no",
  "passport_expiry_date",
  "notion_link",
  "messenger_link",
  "residence_renewal_status",
  "residence_renewal_todo",
  "application_prep_kind",
  "application_prep_organization_id",
  "leaving_on",
  "employment_start_on",
  "assigned_office",
  "residence_note",
  "recurring_sales_no",
  "ssw_insurance_expiry_date",
  "ssw_insurance_self_join",
  "worker_code",
  "jobseeker_no",
] as const;

const WORKER_LIST_COLUMNS = `${WORKER_LIST_FIELDS.join(", ")}, organizations(name)`;

export type WorkerWithOrg = Pick<Worker, (typeof WORKER_LIST_FIELDS)[number]> & {
  organizations: { name: string } | null;
};

export async function listWorkersWithOrg(
  supabase: SupabaseClient,
): Promise<WorkerWithOrg[]> {
  const { data, error } = await supabase
    .from("workers")
    .select(WORKER_LIST_COLUMNS)
    .order("residence_expiry_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data as unknown as WorkerWithOrg[]) ?? [];
}

// 入社書類メール用: 氏名と初期値（雇用開始日・配属先・居住地・許可日・所属）を取得
export interface WorkerForOnboarding {
  id: string;
  name: string;
  employment_start_on: string | null;
  assigned_office: string;
  residence_note: string;
  residence_permit_date: string | null;
  current_organization_id: string | null;
}

export async function listWorkersForOnboarding(
  supabase: SupabaseClient,
): Promise<WorkerForOnboarding[]> {
  const { data, error } = await supabase
    .from("workers")
    .select(
      "id, name, employment_start_on, assigned_office, residence_note, residence_permit_date, current_organization_id",
    )
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as WorkerForOnboarding[]) ?? [];
}

// 外国人IDを国籍から自動採番する（例: V-3）
async function generateWorkerCode(
  supabase: SupabaseClient,
  nationality: string,
): Promise<string> {
  const letter = letterForNationality(nationality);
  const { data } = await supabase
    .from("workers")
    .select("worker_code")
    .like("worker_code", `${letter}-%`);
  const codes = ((data as { worker_code: string | null }[]) ?? []).map((r) => r.worker_code);
  return nextWorkerCode(letter, codes);
}

export async function insertWorker(
  supabase: SupabaseClient,
  input: WorkerInput,
): Promise<Worker> {
  const worker_code = await generateWorkerCode(supabase, input.nationality);
  const { data, error } = await supabase
    .from("workers")
    .insert({ ...input, worker_code })
    .select()
    .single();
  if (error) throw error;
  return data as Worker;
}

// 所属機関別の雇用開始日を1件だけ入れ直す（所属機関の在籍者一覧からその場で入力する用）。
// 既存の記録を読んでから同じ機関の行を上書きするので、他の機関の分は消えない。
// 現在の所属機関の分は、労働者名簿・印刷で使う employment_start_on にも反映する
export async function setOrgEmploymentStart(
  supabase: SupabaseClient,
  workerId: string,
  organizationId: string,
  startOn: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("workers")
    .select("org_employment_starts, current_organization_id")
    .eq("id", workerId)
    .single();
  if (error) throw error;
  const row = data as {
    org_employment_starts: unknown;
    current_organization_id: string | null;
  };
  const entries = upsertOrgEmploymentStart(
    normalizeOrgEmploymentStarts(row.org_employment_starts),
    organizationId,
    startOn,
  );
  const patch: Partial<WorkerInput> = { org_employment_starts: entries };
  if (row.current_organization_id === organizationId) patch.employment_start_on = startOn;
  await updateWorker(supabase, workerId, patch);
}

export async function updateWorker(
  supabase: SupabaseClient,
  id: string,
  input: Partial<WorkerInput>,
): Promise<Worker> {
  // 申請登録から作った外国人は国籍がまだ無いためIDが X-1 になる。
  // あとから国籍を登録したら、その国の英字（カンボジアなら C）でIDを振り直す
  const patch: Partial<WorkerInput> & { worker_code?: string } = { ...input };
  if (input.nationality !== undefined) {
    const { data: current } = await supabase
      .from("workers")
      .select("worker_code")
      .eq("id", id)
      .maybeSingle();
    const code = (current as { worker_code: string | null } | null)?.worker_code ?? null;
    if (shouldReissueWorkerCode(code, input.nationality)) {
      patch.worker_code = await generateWorkerCode(supabase, input.nationality);
    }
  }

  const { data, error } = await supabase
    .from("workers")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Worker;
}

// 職歴は on delete cascade で同時に削除される
export async function deleteWorker(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("workers").delete().eq("id", id);
  if (error) throw error;
}

export interface ImportSummary {
  inserted: number;
  updated: number;
  historyInserted: number;
  orgsCreated: number;
  errors: string[];
}

// organization_name（表記ゆれのない完全一致）を organizations.id に解決する。
// 無ければ新規作成し、以後の同名参照でも使い回す（同じ取込内で重複作成しない）。
async function resolveOrganizationId(
  supabase: SupabaseClient,
  cache: Map<string, string>,
  name: string,
): Promise<string | null> {
  const key = name.trim();
  if (!key) return null;
  const cached = cache.get(key);
  if (cached) return cached;

  const { data: existing } = await supabase
    .from("organizations")
    .select("id")
    .eq("name", key)
    .maybeSingle();
  if (existing) {
    const id = (existing as { id: string }).id;
    cache.set(key, id);
    return id;
  }

  const { data: created, error } = await supabase
    .from("organizations")
    .insert({ name: key })
    .select("id")
    .single();
  if (error) throw error;
  const id = (created as { id: string }).id;
  cache.set(key, id);
  return id;
}

// 旧JSONの取り込み。legacy_id で UPSERT し、職歴は legacy_id を持つ人のぶんを入れ替える。
// 同じファイルを再取込しても重複しない（legacy_id 単位で職歴を消してから入れ直す）。
// organization_name が付いていれば会社・機関マスタに名称で解決し、無ければ新規作成する。
export async function importWorkers(
  supabase: SupabaseClient,
  parsed: ParsedWorker[],
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    inserted: 0,
    updated: 0,
    historyInserted: 0,
    orgsCreated: 0,
    errors: [],
  };
  const orgCache = new Map<string, string>();

  for (const p of parsed) {
    try {
      // 既存判定（legacy_id があるもののみ突き合わせ。無ければ常に新規）
      let existingId: string | null = null;
      if (p.legacy_id) {
        const { data } = await supabase
          .from("workers")
          .select("id")
          .eq("legacy_id", p.legacy_id)
          .maybeSingle();
        existingId = (data as { id: string } | null)?.id ?? null;
      }

      let current_organization_id: string | null = null;
      if (p.organization_name) {
        const beforeSize = orgCache.size;
        current_organization_id = await resolveOrganizationId(supabase, orgCache, p.organization_name);
        if (orgCache.size > beforeSize) summary.orgsCreated += 1;
      }

      const workerFields = {
        name: p.name,
        kana: p.kana,
        nationality: p.nationality,
        birth: p.birth,
        residence_card_no: p.residence_card_no,
        field: p.field,
        note: p.note,
        legacy_id: p.legacy_id,
        ...(p.status !== undefined ? { status: p.status } : {}),
        ...(p.residence_status !== undefined ? { residence_status: p.residence_status } : {}),
        ...(p.residence_permit_date !== undefined
          ? { residence_permit_date: p.residence_permit_date }
          : {}),
        ...(p.residence_expiry_date !== undefined
          ? { residence_expiry_date: p.residence_expiry_date }
          : {}),
        ...(p.messenger_link !== undefined ? { messenger_link: p.messenger_link } : {}),
        ...(current_organization_id ? { current_organization_id } : {}),
      };

      let workerId: string;
      if (existingId) {
        const { error } = await supabase.from("workers").update(workerFields).eq("id", existingId);
        if (error) throw error;
        workerId = existingId;
        summary.updated += 1;
        // 再取込時は既存職歴を消してから入れ直す
        await supabase.from("work_histories").delete().eq("worker_id", workerId);
      } else {
        const { data, error } = await supabase
          .from("workers")
          .insert(workerFields)
          .select("id")
          .single();
        if (error) throw error;
        workerId = (data as { id: string }).id;
        summary.inserted += 1;
      }

      if (p.histories.length > 0) {
        const rows = p.histories.map((h) => ({ ...h, worker_id: workerId }));
        const { error } = await supabase.from("work_histories").insert(rows);
        if (error) throw error;
        summary.historyInserted += p.histories.length;
      }
    } catch (err) {
      summary.errors.push(
        `${p.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return summary;
}

// 只今の状況の自動更新（申請準備・申請登録）で使う、現在の状況・支援区分・状態。
// current_situation 列が無い（0093未適用）環境でも、支援区分・状態だけは取れるようにする
export interface WorkerSituationInfo {
  current_situation: string;
  support: string;
  status: string;
}

export async function fetchWorkerSituationInfo(
  supabase: SupabaseClient,
  workerId: string,
): Promise<WorkerSituationInfo> {
  const { data, error } = await supabase
    .from("workers")
    .select("current_situation, support, status")
    .eq("id", workerId)
    .maybeSingle();
  if (!error && data) {
    const d = data as Partial<WorkerSituationInfo>;
    return {
      current_situation: d.current_situation ?? "",
      support: d.support ?? "",
      status: d.status ?? "",
    };
  }
  const fallback = await supabase
    .from("workers")
    .select("support, status")
    .eq("id", workerId)
    .maybeSingle();
  const d = (fallback.data ?? {}) as Partial<WorkerSituationInfo>;
  return { current_situation: "", support: d.support ?? "", status: d.status ?? "" };
}
