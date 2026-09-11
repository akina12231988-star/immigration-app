"use client";

import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import type { ReminderImageKind } from "@/types/db";
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
  kind: ReminderImageKind = "screenshot", // 立替の領収書・返金の証拠は kind を変えて登録する
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
    kind,
  });
  if (!result.ok) throw new Error(result.message);
  return result.id;
}
