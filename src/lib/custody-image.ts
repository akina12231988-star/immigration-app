"use client";

import { createClient } from "@/lib/supabase/client";
import { createCustodyImageTicket } from "@/app/(app)/custody/actions";

// 在留カード写真の前処理（azk-receipt の resize + autoCrop を移植）。
// 長辺1280pxに縮小し、白背景の余白を検出して自動でトリミングする。

const MAX_DIM = 1280;
const CROP_THRESHOLD = 235; // これより明るい画素は「余白」とみなす
const CROP_PAD = 6;

export interface ProcessedImage {
  blob: Blob;
  dataUrl: string;
}

export async function processCardImage(file: File): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const W = Math.round(bitmap.width * scale);
  const H = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(bitmap, 0, 0, W, H);
  bitmap.close();

  // 自動クロップ: 端の白い余白を検出
  const data = ctx.getImageData(0, 0, W, H).data;
  const isDark = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return (
      data[i] < CROP_THRESHOLD || data[i + 1] < CROP_THRESHOLD || data[i + 2] < CROP_THRESHOLD
    );
  };
  const rowHasDark = (y: number) => {
    for (let x = 0; x < W; x++) if (isDark(x, y)) return true;
    return false;
  };
  const colHasDark = (x: number) => {
    for (let y = 0; y < H; y++) if (isDark(x, y)) return true;
    return false;
  };
  let top = 0;
  let bottom = H - 1;
  let left = 0;
  let right = W - 1;
  while (top < H && !rowHasDark(top)) top++;
  while (bottom > top && !rowHasDark(bottom)) bottom--;
  while (left < W && !colHasDark(left)) left++;
  while (right > left && !colHasDark(right)) right--;
  top = Math.max(0, top - CROP_PAD);
  bottom = Math.min(H - 1, bottom + CROP_PAD);
  left = Math.max(0, left - CROP_PAD);
  right = Math.min(W - 1, right + CROP_PAD);

  // 5%以上余白を削れる場合だけトリミングする
  const trimmed =
    top > H * 0.05 || H - 1 - bottom > H * 0.05 || left > W * 0.05 || W - 1 - right > W * 0.05;
  let outCanvas = canvas;
  if (trimmed) {
    const cw = right - left + 1;
    const ch = bottom - top + 1;
    outCanvas = document.createElement("canvas");
    outCanvas.width = cw;
    outCanvas.height = ch;
    outCanvas.getContext("2d")!.drawImage(canvas, left, top, cw, ch, 0, 0, cw, ch);
  }

  const dataUrl = outCanvas.toDataURL("image/jpeg", 0.88);
  const blob = await new Promise<Blob | null>((resolve) =>
    outCanvas.toBlob(resolve, "image/jpeg", 0.88),
  );
  if (!blob) throw new Error("画像の変換に失敗しました");
  return { blob, dataUrl };
}

// 在留カード画像を非公開バケットへアップロードし、保存パスを返す
export async function uploadCustodyCardImage(
  blob: Blob,
  slot: "front" | "back",
): Promise<string> {
  const ticket = await createCustodyImageTicket(slot);
  if (!ticket.ok) throw new Error(ticket.message);
  const { error } = await createClient()
    .storage.from("app-files")
    .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(`アップロードに失敗しました: ${error.message}`);
  return ticket.path;
}
