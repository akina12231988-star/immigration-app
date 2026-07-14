"use client";

import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { createWorkerDocTicket, registerWorkerDoc } from "@/app/(app)/workers/actions";

type WorkerDocKind = "在留カード" | "指定書";

// 在留カード・指定書の差し替え登録（履歴は worker_documents に追記）
export async function uploadWorkerDoc(
  workerId: string,
  kind: WorkerDocKind,
  file: File,
): Promise<void> {
  const { blob, mimeType, fileName } = await compressImage(file);
  const ticket = await createWorkerDocTicket(workerId, kind, fileName, mimeType);
  if (!ticket.ok) throw new Error(ticket.message);

  const { error } = await createClient()
    .storage.from("app-files")
    .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
  if (error) throw new Error(`アップロードに失敗しました: ${error.message}`);

  const result = await registerWorkerDoc(workerId, kind, ticket.path, fileName, mimeType);
  if (!result.ok) throw new Error(result.message);
}
