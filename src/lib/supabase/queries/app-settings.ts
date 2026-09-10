import type { SupabaseClient } from "@supabase/supabase-js";

// ---- アプリ全体の設定（0149_app_settings.sql）----
// key ごとに jsonb の値を1つ持つ。無ければ null（画面側で既定値を使う）

export async function getAppSetting<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  key: string,
): Promise<Partial<T> | null> {
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  const v = (data as { value: unknown } | null)?.value;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Partial<T>) : null;
}

// 値をまるごと置き換えて保存する（無ければ作る）
export async function setAppSetting(
  supabase: SupabaseClient,
  key: string,
  value: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert({ key, value }, { onConflict: "key" });
  if (error) throw error;
}
