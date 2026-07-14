"use client";

import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { createWorkerPhotoTicket, registerWorkerPhoto } from "@/app/(app)/workers/actions";

// 顔写真: 圧縮 → 署名付きURL発行 → 直接PUT → workers.photo_path 更新 → 署名付きURL返却
export async function uploadWorkerPhoto(workerId: string, file: File): Promise<string> {
  // 顔写真は JPEG 化。PNG透過は白背景に変換する
  const { blob, mimeType, fileName } = await compressImage(file, 800, 0.9, true);
  const ticket = await createWorkerPhotoTicket(workerId, fileName, mimeType);
  if (!ticket.ok) throw new Error(ticket.message);

  const { error } = await createClient()
    .storage.from("app-files")
    .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
  if (error) throw new Error(`アップロードに失敗しました: ${error.message}`);

  const result = await registerWorkerPhoto(workerId, ticket.path);
  if (!result.ok) throw new Error(result.message);
  return result.url;
}
