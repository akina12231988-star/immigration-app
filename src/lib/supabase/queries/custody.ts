import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CustodyAction,
  CustodyEventRow,
  CustodyInput,
  CustodyRecord,
} from "@/types/db";

// 一覧・預かり証表示用: 預かりレコード＋外国人の基本情報
export interface CustodyWithWorker extends CustodyRecord {
  workers: {
    id: string;
    name: string;
    kana: string;
    nationality: string;
    birth: string | null;
    residence_card_no: string;
    residence_status: string;
    residence_expiry_date: string | null;
    passport_no: string;
    passport_expiry_date: string | null;
    worker_code: string | null;
  } | null;
}

const SELECT =
  "*, workers(id, name, kana, nationality, birth, residence_card_no, residence_status, residence_expiry_date, passport_no, passport_expiry_date, worker_code)";

export async function listCustody(supabase: SupabaseClient): Promise<CustodyWithWorker[]> {
  const { data, error } = await supabase
    .from("custody_records")
    .select(SELECT)
    .order("storage_no", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as CustodyWithWorker[]) ?? [];
}

export async function getCustody(
  supabase: SupabaseClient,
  id: string,
): Promise<CustodyWithWorker | null> {
  const { data, error } = await supabase
    .from("custody_records")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as CustodyWithWorker | null;
}

// 現に預かり中（返却済み以外）の外国人ごとの保管番号。申請一覧で「預かり番号」を
// 表示するために worker_id → storage_no のマップを返す。1人が複数の預かり中番号を
// 持つことは稀だが、その場合は小さい番号を採用する（番号昇順で先勝ち）。
export async function listActiveCustodyNoByWorker(
  supabase: SupabaseClient,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("custody_records")
    .select("worker_id, storage_no")
    .neq("status", "返却済み")
    .order("storage_no", { ascending: true });
  if (error) throw error;
  const map = new Map<string, number>();
  for (const r of (data as { worker_id: string; storage_no: number }[]) ?? []) {
    if (r.worker_id && !map.has(r.worker_id)) map.set(r.worker_id, r.storage_no);
  }
  return map;
}

// 現に預かり中（返却済み以外）の保管番号一覧（自動採番・重複チェック用）
export async function listActiveStorageNos(supabase: SupabaseClient): Promise<number[]> {
  const { data, error } = await supabase
    .from("custody_records")
    .select("storage_no")
    .neq("status", "返却済み");
  if (error) throw error;
  return ((data as { storage_no: number }[]) ?? []).map((r) => r.storage_no);
}

export async function listCustodyEvents(
  supabase: SupabaseClient,
  custodyId: string,
): Promise<CustodyEventRow[]> {
  const { data, error } = await supabase
    .from("custody_events")
    .select("*")
    .eq("custody_id", custodyId)
    .order("happened_at", { ascending: false });
  if (error) throw error;
  return (data as CustodyEventRow[]) ?? [];
}

// 持ち出す人の名簿（custody_persons）
export async function listCustodyPersons(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("custody_persons")
    .select("name")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data as { name: string }[]) ?? []).map((r) => r.name);
}

export async function addCustodyPerson(supabase: SupabaseClient, name: string): Promise<void> {
  const { error } = await supabase.from("custody_persons").insert({ name: name.trim() });
  // 既に登録済みなら成功扱い
  if (error && !`${error.code}`.startsWith("23")) throw error;
}

// 預かり登録（預かり証発行）。レコード作成と同時に「預かり」イベントを履歴に残す
export async function createCustody(
  supabase: SupabaseClient,
  input: CustodyInput,
  person: string,
): Promise<CustodyRecord> {
  const { data, error } = await supabase
    .from("custody_records")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  const record = data as CustodyRecord;
  const { error: evError } = await supabase.from("custody_events").insert({
    custody_id: record.id,
    action: "預かり",
    person,
    purpose: input.content,
  });
  if (evError) throw evError;
  return record;
}

// 持出・戻し・本人返却。イベントを追記し、レコードの状態を更新する
export async function recordCustodyAction(
  supabase: SupabaseClient,
  custodyId: string,
  action: Exclude<CustodyAction, "預かり">,
  person: string,
  purpose: string,
): Promise<CustodyWithWorker> {
  const { error: evError } = await supabase.from("custody_events").insert({
    custody_id: custodyId,
    action,
    person,
    purpose,
  });
  if (evError) throw evError;

  const patch =
    action === "持出"
      ? { status: "持出中", holder: person, held_since: new Date().toISOString() }
      : action === "ボックスへ戻す"
        ? { status: "ボックス保管中", holder: "", held_since: null }
        : {
            status: "返却済み",
            holder: "",
            held_since: null,
            returned_on: new Date().toISOString().slice(0, 10),
          };
  const { data, error } = await supabase
    .from("custody_records")
    .update(patch)
    .eq("id", custodyId)
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as CustodyWithWorker;
}
