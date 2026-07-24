// 添付データをPDF化してダウンロードするためのクライアント側ユーティリティ。
// PDFはそのまま、画像（JPEG/PNG/WebPなど）はブラウザで描画してPDF1ページに変換する。
// Blob（同一オリジン）としてダウンロードするので、日本語のファイル名も文字化けせず保存できる。
import { jsPDF } from "jspdf";

const isPdf = (mimeType: string) => mimeType === "application/pdf";

// 画像を1枚のPDF（画像の縦横比そのままの1ページ）に変換する
async function imageToPdfBlob(bytes: ArrayBuffer, mimeType: string): Promise<Blob> {
  const src = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("画像を読み込めませんでした"));
      el.src = src;
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error("画像サイズを取得できませんでした");

    // canvasに描いてJPEGへ正規化（WebPなどjsPDF非対応の形式にも対応するため）
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas を利用できません");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    const jpeg = canvas.toDataURL("image/jpeg", 0.92);

    // ページを画像と同じ大きさ（px単位）にして余白なしで貼り付ける
    const doc = new jsPDF({ orientation: w >= h ? "landscape" : "portrait", unit: "px", format: [w, h] });
    doc.addImage(jpeg, "JPEG", 0, 0, w, h);
    return doc.output("blob");
  } finally {
    URL.revokeObjectURL(src);
  }
}

// 添付データのバイト列をPDFのBlobにする。PDFはそのまま返す。
// 画像はPDF化する。変換できない場合は元データのBlobを返す（呼び出し側でフォールバック名を使う）。
export async function toPdfBlob(
  bytes: ArrayBuffer,
  mimeType: string,
): Promise<{ blob: Blob; converted: boolean }> {
  if (isPdf(mimeType)) return { blob: new Blob([bytes], { type: "application/pdf" }), converted: true };
  if (mimeType.startsWith("image/")) {
    try {
      return { blob: await imageToPdfBlob(bytes, mimeType), converted: true };
    } catch {
      // HEICなどブラウザで描画できない形式は元データのまま渡す
      return { blob: new Blob([bytes], { type: mimeType }), converted: false };
    }
  }
  return { blob: new Blob([bytes], { type: mimeType }), converted: false };
}

// Blobを指定ファイル名でダウンロードする（同一オリジンのため download 属性が有効）
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
