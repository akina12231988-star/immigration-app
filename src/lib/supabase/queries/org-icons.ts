import { createAdminClient } from "@/lib/supabase/admin";

// 所属機関のアイコン画像（0221）の表示用の署名付きURLをまとめて作る（サーバーで使う）。
// 保存先 → URL。作れなかったものは入れない
export async function signOrgIconUrls(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  if (list.length === 0) return {};
  const admin = createAdminClient();
  if (!admin) return {};
  const { data } = await admin.storage.from("app-files").createSignedUrls(list, 60 * 60);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}
