"use client";

import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { normalizePdfToA4 } from "@/lib/pdf-normalize";
import { createWorkerDocTicket, registerWorkerDoc } from "@/app/(app)/workers/actions";

type WorkerDocKind =
  | "在留カード"
  | "指定書"
  | "雇用契約書"
  | "雇用条件書"
  | "雇用契約書（日付なし）"
  | "雇用条件書（日付なし）"
  | "雇用保険 離職票"
  | "雇用保険 被保険者証";

// 在留カード・指定書・雇用契約書・雇用条件書・雇用保険の書類の登録
// （差し替えても前の分は worker_documents に履歴として残る）
export async function uploadWorkerDoc(
  workerId: string,
  kind: WorkerDocKind,
  file: File,
  organizationId?: string | null, // 雇用契約書・雇用条件書は会社ごとに保管する
  effectiveOn?: string | null, // 過去の在籍期間タブから登録するとき、その期間の日付
): Promise<void> {
  const { blob: compressed, mimeType, fileName } = await compressImage(file);
  // スキャンPDFはページごとに大きさが違うことがあるので、A4に統一してから保存する
  let blob: Blob = compressed;
  if (mimeType === "application/pdf") {
    const normalized = await normalizePdfToA4(await compressed.arrayBuffer());
    if (normalized) blob = new Blob([normalized as BlobPart], { type: "application/pdf" });
  }
  const ticket = await createWorkerDocTicket(workerId, kind, fileName, mimeType, organizationId);
  if (!ticket.ok) throw new Error(ticket.message);

  const { error } = await createClient()
    .storage.from("app-files")
    .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
  if (error) throw new Error(`アップロードに失敗しました: ${error.message}`);

  const result = await registerWorkerDoc(
    workerId,
    kind,
    ticket.path,
    fileName,
    mimeType,
    organizationId,
    effectiveOn,
  );
  if (!result.ok) throw new Error(result.message);
}
