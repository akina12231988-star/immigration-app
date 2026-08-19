import { PDFDocument, degrees } from "pdf-lib";

// PDFのページ大きさをA4縦にそろえる。
//
// スマホのスキャンアプリで作ったPDFは、ページごとに大きさがバラバラなことがあり
// （撮った範囲がそのままページの大きさになる）、開いたときに1ページ目だけ
// 小さく見えたりする。アップロード時に各ページをA4に載せ直して統一する。
// 中身は縮小・拡大するだけで、切れたり歪んだりはしない（縦横比は保つ）。

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 20;
// これ以内の差は「A4と同じ」とみなして変換しない（無駄な再保存を避ける）
const TOLERANCE = 4;

function isA4Portrait(width: number, height: number): boolean {
  return Math.abs(width - A4.width) <= TOLERANCE && Math.abs(height - A4.height) <= TOLERANCE;
}

// ページの大きさがそろっていないPDFをA4縦に統一して返す。
// 変換が要らない（すでに全ページA4縦）・PDFとして読めない場合は null（原本のまま使う）
export async function normalizePdfToA4(
  bytes: ArrayBuffer | Uint8Array,
): Promise<Uint8Array | null> {
  let src: PDFDocument;
  try {
    src = await PDFDocument.load(bytes);
  } catch {
    return null; // 暗号化・壊れたPDFは原本のまま
  }
  const pages = src.getPages();
  if (pages.length === 0) return null;
  const needsFix = pages.some((p) => {
    const { width, height } = p.getSize();
    return !isA4Portrait(width, height) || p.getRotation().angle !== 0;
  });
  if (!needsFix) return null;

  try {
    const out = await PDFDocument.create();
    const embedded = await out.embedPages(pages);
    for (let i = 0; i < embedded.length; i++) {
      const ep = embedded[i];
      // 回転指定のあるページは、回転後の見た目の縦横で置く
      const rot = ((pages[i].getRotation().angle % 360) + 360) % 360;
      const sideways = rot === 90 || rot === 270;
      const srcW = sideways ? ep.height : ep.width;
      const srcH = sideways ? ep.width : ep.height;
      const scale = Math.min((A4.width - MARGIN * 2) / srcW, (A4.height - MARGIN * 2) / srcH);
      const w = ep.width * scale;
      const h = ep.height * scale;
      const page = out.addPage([A4.width, A4.height]);
      const cx = A4.width / 2;
      const cy = A4.height / 2;
      if (rot === 0) {
        page.drawPage(ep, { x: cx - w / 2, y: cy - h / 2, width: w, height: h });
      } else {
        // 回転して中央に置く（drawPage は左下起点で回るため、位置を回転にあわせてずらす）
        const rad = (rot * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        // 描画枠（w×h）を rot 回転したときの中心が (cx, cy) に来る左下位置
        const centerX = (w / 2) * cos - (h / 2) * sin;
        const centerY = (w / 2) * sin + (h / 2) * cos;
        page.drawPage(ep, {
          x: cx - centerX,
          y: cy - centerY,
          width: w,
          height: h,
          rotate: degrees(rot),
        });
      }
    }
    return await out.save();
  } catch {
    return null; // 変換に失敗したら原本のまま
  }
}
