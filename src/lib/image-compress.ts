// スマホ撮影画像（数MB）をアップロード前に縮小する。
// 長辺 maxDim px・JPEG化で、受付票・通知書・在留カードの記録用途には十分な画質を保つ。
export async function compressImage(
  file: File,
  maxDim = 1600,
  quality = 0.85,
  fillWhite = false, // PNG透過などを白背景に変換する（顔写真用）
): Promise<{ blob: Blob; mimeType: string; fileName: string }> {
  // 画像以外（PDF等）や縮小に失敗した場合は原本のまま返す
  if (!file.type.startsWith("image/")) {
    return { blob: file, mimeType: file.type, fileName: file.name };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    // 透過部分を白で塗ってから描画（JPEG化で黒くならないように・顔写真の背景透過対策）
    if (fillWhite) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("toBlob failed");

    const fileName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return { blob, mimeType: "image/jpeg", fileName };
  } catch {
    return { blob: file, mimeType: file.type, fileName: file.name };
  }
}
