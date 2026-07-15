import type { SupabaseClient } from "@supabase/supabase-js";
import type { Worker, WorkerInput, WorkerWithHistories } from "@/types/db";
import type { ParsedWorker } from "@/lib/ssw/import";
import type { ImportedWorker } from "@/lib/import";

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
  errors: string[];
}

// 旧JSONの取り込み。legacy_id で UPSERT し、職歴は legacy_id を持つ人のぶんを入れ替える。
// 同じファイルを再取込しても重複しない（legacy_id 単位で職歴を消してから入れ直す）。
export async function importWorkers(
  supabase: SupabaseClient,
  parsed: ParsedWorker[],
): Promise<ImportSummary> {
  const summary: ImportSummary = { inserted: 0, updated: 0, historyInserted: 0, errors: [] };

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

      const workerFields = {
        name: p.name,
        kana: p.kana,
        nationality: p.nationality,
        birth: p.birth,
        residence_card_no: p.residence_card_no,
        field: p.field,
        note: p.note,
        legacy_id: p.legacy_id,
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

// 履歴書PDF等から取り込んだ ImportedWorker を登録する（要件⑩⑪）。
// legacy_id（pdf:氏名:生年月日）で UPSERT し、職歴は入れ替える。既存のJSON取込と
// 同様に、同じPDFを再アップロードしても重複しない。職歴は行数制限なしで全件登録する。
export async function importDocumentWorkers(
  supabase: SupabaseClient,
  workers: ImportedWorker[],
): Promise<ImportSummary> {
  const summary: ImportSummary = { inserted: 0, updated: 0, historyInserted: 0, errors: [] };

  for (const w of workers) {
    try {
      if (!w.name) {
        summary.errors.push("氏名が読み取れなかったレコードをスキップ");
        continue;
      }

      let existingId: string | null = null;
      const { data: found } = await supabase
        .from("workers")
        .select("id")
        .eq("legacy_id", w.legacy_id)
        .maybeSingle();
      existingId = (found as { id: string } | null)?.id ?? null;

      // 空の項目で既存データを潰さないよう、値があるフィールドのみ送る。
      const fields: Record<string, unknown> = { name: w.name, legacy_id: w.legacy_id };
      const put = (k: string, v: string | null) => {
        if (v != null && v !== "") fields[k] = v;
      };
      put("kana", w.kana);
      put("nationality", w.nationality);
      put("birth", w.birth);
      put("residence_status", w.residence_status);
      put("residence_expiry_date", w.residence_expiry_date);
      put("field", w.field);
      put("specialty_grade", w.specialty_grade);
      put("other_qualifications", w.other_qualifications);
      put("health_note", w.health_note);
      put("family_note", w.family_note);
      put("note", w.note);

      let workerId: string;
      if (existingId) {
        const { error } = await supabase.from("workers").update(fields).eq("id", existingId);
        if (error) throw error;
        workerId = existingId;
        summary.updated += 1;
        await supabase.from("work_histories").delete().eq("worker_id", workerId);
      } else {
        const { data, error } = await supabase
          .from("workers")
          .insert(fields)
          .select("id")
          .single();
        if (error) throw error;
        workerId = (data as { id: string }).id;
        summary.inserted += 1;
      }

      // start_date は NOT NULL のため、開始日不明の職歴は登録できない
      const insertable = w.histories.filter((h) => h.start_date);
      const droppedNoStart = w.histories.length - insertable.length;
      if (droppedNoStart > 0) {
        summary.errors.push(`${w.name}: 開始年月のない職歴 ${droppedNoStart} 件は登録できませんでした`);
      }
      if (insertable.length > 0) {
        const rows = insertable.map((h) => ({
          worker_id: workerId,
          visa: h.visa,
          start_date: h.start_date,
          end_date: h.end_date,
          org_name: h.org_name,
          role: h.role,
          note: h.note,
        }));
        const { error } = await supabase.from("work_histories").insert(rows);
        if (error) throw error;
        summary.historyInserted += insertable.length;
      }
    } catch (err) {
      summary.errors.push(`${w.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return summary;
}
