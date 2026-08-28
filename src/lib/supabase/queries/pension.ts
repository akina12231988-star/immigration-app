import type { SupabaseClient } from "@supabase/supabase-js";
import type { PensionMonthCodes } from "@/lib/pension";
import { parseMonthCodes } from "@/lib/pension";

export interface PensionRecordRow {
  symbols: string; // 記号コードのカンマ区切り（月が分からない古い記録もここに残る）
  note: string;
  apply_month: string; // 申請月（"YYYY-MM"）。2か月前までの24か月分を確認する（0124）
  months: PensionMonthCodes; // 月ごとの記号（0124）
}

const EMPTY: PensionRecordRow = { symbols: "", note: "", apply_month: "", months: {} };

// 0124 が未適用でも画面が動くように、新しい列が無いときは従来の列だけで読む
const COLUMNS = "symbols, note, apply_month, months";
const LEGACY_COLUMNS = "symbols, note";

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // PostgREST: 42703 = undefined_column、スキーマキャッシュ未反映は PGRST204
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /apply_month|months/.test(error.message ?? "")
  );
}

export async function getPensionRecord(
  supabase: SupabaseClient,
  workerId: string,
): Promise<PensionRecordRow> {
  const read = async (columns: string) =>
    supabase.from("pension_records").select(columns).eq("worker_id", workerId).maybeSingle();

  let { data, error } = await read(COLUMNS);
  if (error && isMissingColumn(error)) ({ data, error } = await read(LEGACY_COLUMNS));
  if (error) throw error;
  if (!data) return { ...EMPTY };

  const row = data as unknown as Partial<PensionRecordRow>;
  return {
    symbols: row.symbols ?? "",
    note: row.note ?? "",
    apply_month: row.apply_month ?? "",
    months: parseMonthCodes(row.months),
  };
}

export async function upsertPensionRecord(
  supabase: SupabaseClient,
  workerId: string,
  record: PensionRecordRow,
): Promise<void> {
  const write = async (payload: Record<string, unknown>) =>
    supabase.from("pension_records").upsert({ worker_id: workerId, ...payload }, {
      onConflict: "worker_id",
    });

  const { error } = await write({ ...record });
  // 0124 が未適用のあいだは、月ごとの記号は保存できないが記号・メモは保存する
  if (error && isMissingColumn(error)) {
    const { error: legacyError } = await write({ symbols: record.symbols, note: record.note });
    if (legacyError) throw legacyError;
    throw new Error(
      "月ごとの記号を保存できませんでした（データベースの更新 0124 が未適用です）。記号とメモは保存しました。",
    );
  }
  if (error) throw error;
}
