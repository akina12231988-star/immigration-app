import type { SupabaseClient } from "@supabase/supabase-js";
import type { Worker, WorkerInput, WorkerWithHistories } from "@/types/db";
import type { ParsedWorker } from "@/lib/ssw/import";

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
}

export async function listWorkersBrief(
  supabase: SupabaseClient,
): Promise<WorkerBrief[]> {
  const { data, error } = await supabase
    .from("workers")
    .select("id, name, current_organization_id")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as WorkerBrief[]) ?? [];
}

// 在留更新・パスポート更新の一覧用: 外国人＋現在の所属機関名
export interface WorkerWithOrg extends Worker {
  organizations: { name: string } | null;
}

export async function listWorkersWithOrg(
  supabase: SupabaseClient,
): Promise<WorkerWithOrg[]> {
  const { data, error } = await supabase
    .from("workers")
    .select("*, organizations(name)")
    .order("residence_expiry_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data as WorkerWithOrg[]) ?? [];
}

export async function insertWorker(
  supabase: SupabaseClient,
  input: WorkerInput,
): Promise<Worker> {
  const { data, error } = await supabase
    .from("workers")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as Worker;
}

export async function updateWorker(
  supabase: SupabaseClient,
  id: string,
  input: Partial<WorkerInput>,
): Promise<Worker> {
  const { data, error } = await supabase
    .from("workers")
    .update(input)
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
