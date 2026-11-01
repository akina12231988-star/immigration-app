// 画像のURL（受付票など、Storage の署名付きURL）の画像をクリップボードにコピーする。
// クリップボードに入れられる画像は PNG だけなので、JPEG などは canvas で PNG にしてから入れる。
// Safari は ClipboardItem に Promise を渡さないと「ユーザー操作の外」と扱われるので、Promise のまま渡す。
// 対応していないブラウザ・読み込めなかったときは false（「画像を開く」から保存してもらう）

async function toPngBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`画像を読み込めませんでした（${res.status}）`);
  const blob = await res.blob();
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を変換できませんでした");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画像を変換できませんでした"))), "image/png");
  });
}

export async function copyImageUrlToClipboard(url: string): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": toPngBlob(url) })]);
    return true;
  } catch {
    try {
      const blob = await toPngBlob(url);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return true;
    } catch {
      return false;
    }
  }
}
