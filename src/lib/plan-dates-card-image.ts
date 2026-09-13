import {
  CARD_HEIGHT_MM,
  CARD_PX_PER_MM,
  CARD_WIDTH_MM,
  planDatesCardColumns,
  type CardLine,
} from "@/lib/plan-dates-card";

// 「支援計画書の日付」を名刺サイズの PNG に描く（ブラウザだけで動く。サーバーは使わない）。
// 印刷したときに 91mm × 55mm になるよう 300dpi 相当の大きさで描き、
// 左右2列に参考様式ごとの枠を並べる
export function drawPlanDatesCard(
  canvas: HTMLCanvasElement,
  dates: Record<string, string>,
  title: string, // 外国人の氏名など（一番上に出す）
  sub: string, // 申請番号など
): void {
  const w = Math.round(CARD_WIDTH_MM * CARD_PX_PER_MM);
  const h = Math.round(CARD_HEIGHT_MM * CARD_PX_PER_MM);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const mm = CARD_PX_PER_MM;
  const font = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "Meiryo", sans-serif';

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  // 切り取り用の枠線
  ctx.strokeStyle = "#999999";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  const margin = 3 * mm;
  let y = margin;
  // 見出し（氏名・申請番号）
  ctx.fillStyle = "#111111";
  ctx.textBaseline = "top";
  ctx.font = `bold ${3.2 * mm}px ${font}`;
  ctx.fillText(fit(ctx, title, w - margin * 2), margin, y);
  if (sub) {
    ctx.font = `${2.4 * mm}px ${font}`;
    const width = ctx.measureText(sub).width;
    ctx.fillText(sub, w - margin - width, y + 0.6 * mm);
  }
  y += 4.6 * mm;
  ctx.strokeStyle = "#333333";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(margin, y);
  ctx.lineTo(w - margin, y);
  ctx.stroke();
  y += 1.2 * mm;

  const [left, right] = planDatesCardColumns(dates);
  const gap = 2 * mm;
  const colWidth = (w - margin * 2 - gap) / 2;
  drawColumn(ctx, left, margin, y, colWidth, mm, font);
  drawColumn(ctx, right, margin + colWidth + gap, y, colWidth, mm, font);
}

function drawColumn(
  ctx: CanvasRenderingContext2D,
  lines: CardLine[],
  x: number,
  top: number,
  width: number,
  mm: number,
  font: string,
): void {
  const lineHeight = 4.2 * mm;
  let y = top;
  for (const l of lines) {
    if (l.kind === "heading") {
      // 参考様式の枠の見出し（薄い帯に太字）
      ctx.fillStyle = "#e8ecf3";
      ctx.fillRect(x, y, width, lineHeight - 0.6 * mm);
      ctx.fillStyle = "#111111";
      ctx.font = `bold ${2.3 * mm}px ${font}`;
      ctx.fillText(fit(ctx, l.label, width - 1.2 * mm), x + 0.6 * mm, y + 0.5 * mm);
    } else {
      ctx.fillStyle = "#333333";
      ctx.font = `${2.1 * mm}px ${font}`;
      ctx.fillText(fit(ctx, l.label, width * 0.44), x + 0.6 * mm, y + 0.6 * mm);
      ctx.fillStyle = "#111111";
      // 契約期間のように長い値は、入りきるまで少しずつ文字を小さくする
      const valueWidth = width * 0.54;
      let size = 2.3;
      ctx.font = `bold ${size * mm}px ${font}`;
      while (size > 1.7 && ctx.measureText(l.value).width > valueWidth) {
        size -= 0.1;
        ctx.font = `bold ${size * mm}px ${font}`;
      }
      ctx.fillText(fit(ctx, l.value, valueWidth), x + width * 0.46, y + 0.5 * mm + (2.3 - size) * mm * 0.4);
    }
    y += lineHeight;
  }
}

// 幅に入りきらない文字は「…」で切る
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

// PNG にして「名前を付けて」保存する
export async function downloadPlanDatesCard(
  dates: Record<string, string>,
  title: string,
  sub: string,
  fileName: string,
): Promise<void> {
  const canvas = document.createElement("canvas");
  drawPlanDatesCard(canvas, dates, title, sub);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("画像の作成に失敗しました");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
