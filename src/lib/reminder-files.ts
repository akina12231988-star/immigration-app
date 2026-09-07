"use client";

import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import {
  createReminderImageTicket,
  registerReminderImage,
} from "@/app/(app)/reminders/actions";

// 督促の会話のスクショ（画像）のアップロード。
// 画像は縮小してから app-files バケットへ保存し、督促に紐づけて記録する
export async function uploadReminderImage(
  reminderId: string,
  file: File,
  caption = "",
): Promise<string> {
  const { blob, mimeType, fileName } = await compressImage(file);
  const ticket = await createReminderImageTicket(reminderId, fileName, mimeType);
  if (!ticket.ok) throw new Error(ticket.message);

  const { error } = await createClient()
    .storage.from("app-files")
    .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
  if (error) throw new Error(`アップロードに失敗しました: ${error.message}`);

  const result = await registerReminderImage({
    reminderId,
    path: ticket.path,
    fileName,
    mimeType,
    caption,
  });
  if (!result.ok) throw new Error(result.message);
  return result.id;
}
