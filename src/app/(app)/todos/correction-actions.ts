"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";

// 申請書類の訂正記録（チェック後）の添付画像。
// 非公開バケット app-files（todo-corrections/）に保存し、署名付きURLで
// アップロード・表示する（パスポートの記録の添付と同じ方式）。
const BUCKET = "app-files";
const TTL = 60 * 60;
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;

interface Err {
  ok: false;
  message: string;
}

async function requireStaff(): Promise<boolean> {
  const me = await getMyProfile();
  return !!me && me.role !== "viewer";
}

export interface TodoCorrectionView {
  id: string;
  doc_name: string;
  content: string;
  file_name: string;
  url: string; // 画像の署名付きURL（画像なしは ''）
  created_at: string;
}

// 訂正記録の一覧（画像の署名付きURL付き・古い順）
export async function listTodoCorrections(
  todoId: string,
): Promise<TodoCorrectionView[]> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return [];
  const { data } = await admin
    .from("todo_corrections")
    .select("*")
    .eq("todo_id", todoId)
    .order("created_at", { ascending: true });
  const rows =
    (data as {
      id: string;
      doc_name: string;
      content: string;
      storage_path: string;
      file_name: string;
      created_at: string;
    }[]) ?? [];
  return Promise.all(
    rows.map(async (r) => {
      let url = "";
      if (r.storage_path) {
        const { data: signed } = await admin.storage
          .from(BUCKET)
          .createSignedUrl(r.storage_path, TTL);
        url = signed?.signedUrl ?? "";
      }
      return {
        id: r.id,
        doc_name: r.doc_name,
        content: r.content,
        file_name: r.file_name,
        url,
        created_at: r.created_at,
      };
    }),
  );
}

// 訂正箇所の画像アップロード用の署名付きURLを発行
export async function createTodoCorrectionTicket(
  todoId: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true; path: string; token: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!ALLOWED_MIME.test(mimeType)) return { ok: false, message: "画像またはPDFのみ登録できます" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー（SERVICE_ROLE_KEY 未設定）" };
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
  const rawExt = fileName.includes(".") ? (fileName.split(".").pop() ?? "") : "";
  const ext = /^[a-zA-Z0-9]{1,8}$/.test(rawExt) ? rawExt.toLowerCase() : "bin";
  const path = `todo-corrections/${todoId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

// 訂正記録を保存する（画像はアップロード済みのパスを渡す。画像なしでも記録できる）
export async function registerTodoCorrection(
  todoId: string,
  input: { doc_name: string; content: string; path?: string; fileName?: string; mimeType?: string },
): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (input.path && !input.path.startsWith(`todo-corrections/${todoId}/`)) {
    return { ok: false, message: "不正なパス" };
  }
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { error } = await admin.from("todo_corrections").insert({
    todo_id: todoId,
    doc_name: input.doc_name,
    content: input.content,
    storage_path: input.path ?? "",
    file_name: input.fileName ?? "",
    mime_type: input.mimeType ?? "",
    created_by: me?.id ?? null,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// 訂正記録の削除（画像の実体も消す）
export async function deleteTodoCorrection(id: string): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data } = await admin
    .from("todo_corrections")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (path) await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
  const { error } = await admin.from("todo_corrections").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
