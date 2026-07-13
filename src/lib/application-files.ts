"use client";

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

  const { error } = await createClient()
    .storage.from("app-files")
    .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
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
