"use client";

import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import {
  createOnboardingDocTicket,
  registerOnboardingDocFile,
} from "@/app/(app)/onboarding/actions";

// 入社書類データのアップロード（保存・差し替え）。
// 画像は縮小し、PDF等はそのまま app-files バケットへ保存してメタデータを記録する。
export async function uploadOnboardingDoc(
  workerId: string,
  def: { key: string; label: string; num: number },
  file: File,
): Promise<void> {
  const { blob, mimeType, fileName } = await compressImage(file);
  const ticket = await createOnboardingDocTicket(workerId, def.key, fileName, mimeType);
  if (!ticket.ok) throw new Error(ticket.message);

  const { error } = await createClient()
    .storage.from("app-files")
    .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
  if (error) throw new Error(`アップロードに失敗しました: ${error.message}`);

  const result = await registerOnboardingDocFile(
    workerId,
    def.key,
    def.label,
    def.num,
    ticket.path,
    fileName,
    mimeType,
  );
  if (!result.ok) throw new Error(result.message);
}
