"use client";

import { isNetworkError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import {
  createUploadTicket,
  registerApplicationFile,
} from "@/app/(app)/applications/actions";
import type { ApplicationFile, ApplicationFileKind } from "@/types/application";

// 圧縮 → 署名付きアップロードURL発行 → Storageへ直接PUT → メタデータ登録 の一連
export async function uploadApplicationFile(
  applicationId: string,
  kind: ApplicationFileKind,
  file: File,
): Promise<ApplicationFile> {
  const { blob, mimeType, fileName } = await compressImage(file);

  const ticket = await createUploadTicket(applicationId, kind, fileName, mimeType);
  if (!ticket.ok) throw new Error(ticket.message);

  // スマホは電波が一瞬切れて送れないことがあるので、通信の失敗は2回までやり直す
  let error: { message: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
    ({ error } = await createClient()
      .storage.from("app-files")
      .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType }));
    if (!error || !isNetworkError(error.message)) break;
  }
  if (error) throw new Error(`アップロードに失敗しました: ${error.message}`);

  const result = await registerApplicationFile(
    applicationId,
    kind,
    ticket.path,
    fileName,
    mimeType,
  );
  if (!result.ok) throw new Error(result.message);
  return result.file;
}
