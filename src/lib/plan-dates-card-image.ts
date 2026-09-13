import {
  CARD_HEIGHT_MM,
  CARD_PX_PER_MM,
  CARD_WIDTH_MM,
  planDatesCardColumns,
  type CardLine,
} from "@/lib/plan-dates-card";

// 「支援計画書の日付」を名刺サイズの PNG に描く（ブラウザだけで動く。サーバーは使わない）。
// 印刷したときに 91mm × 55mm（横）または 55mm × 91mm（縦）になるよう 300dpi 相当の大きさで描く。
// 白黒（黒と灰色だけ）で描くので、モノクロ印刷でもそのまま使える。
// 横は左右2列、縦は1列に参考様式ごとの枠を並べる。
// 雇用契約期間のように長い値は、項目名の下の行に全幅で出して途切れないようにする
export type CardOrientation = "landscape" | "portrait";

// 描く1行。value は「項目名の下に全幅で出す値」の行
type RenderLine =
  | { kind: "heading"; text: string }
  | { kind: "row"; label: string; value: string }
  | { kind: "value"; text: string };

const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "Meiryo", sans-serif';

export function drawPlanDatesCard(
  canvas: HTMLCanvasElement,
  dates: Record<string, string>,
  title: string, // 外国人の氏名など（一番上に出す）
  sub: string, // 申請番号など
  orientation: CardOrientation = "landscape",
): void {
  const mm = CARD_PX_PER_MM;
  const wMm = orientation === "landscape" ? CARD_WIDTH_MM : CARD_HEIGHT_MM;
  const hMm = orientation === "landscape" ? CARD_HEIGHT_MM : CARD_WIDTH_MM;
  const w = Math.round(wMm * mm);
  const h = Math.round(hMm * mm);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  // 切り取り用の枠線
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  const margin = 3 * mm;
  let y = margin;
  // 見出し（氏名・申請番号）
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";
  ctx.font = `bold ${3.2 * mm}px ${FONT}`;
  const subWidth = sub ? measure(ctx, `${2.4 * mm}px ${FONT}`, sub) + 2 * mm : 0;
  ctx.font = `bold ${3.2 * mm}px ${FONT}`;
  ctx.fillText(fit(ctx, title, w - margin * 2 - subWidth), margin, y);
  if (sub) {
    ctx.font = `${2.4 * mm}px ${FONT}`;
    ctx.fillText(sub, w - margin - ctx.measureText(sub).width, y + 0.6 * mm);
  }
  y += 4.6 * mm;
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(margin, y);
  ctx.lineTo(w - margin, y);
  ctx.stroke();
  y += 1.2 * mm;

  const [left, right] = planDatesCardColumns(dates);
  const gap = 2 * mm;
  const columns: { lines: CardLine[]; x: number; width: number }[] =
    orientation === "landscape"
      ? [
          { lines: left, x: margin, width: (w - margin * 2 - gap) / 2 },
          { lines: right, x: margin + (w - margin * 2 - gap) / 2 + gap, width: (w - margin * 2 - gap) / 2 },
        ]
      : [{ lines: [...left, ...right], x: margin, width: w - margin * 2 }];

  // 列ごとに描く行を決めてから、いちばん行数の多い列が下の余白に収まる行の高さにする
  const rendered = columns.map((c) => ({ ...c, lines: toRenderLines(ctx, c.lines, c.width, mm) }));
  const maxLines = Math.max(...rendered.map((c) => c.lines.length), 1);
  const lineHeight = Math.min(4.2 * mm, (h - y - margin) / maxLines);
  for (const c of rendered) drawColumn(ctx, c.lines, c.x, y, c.width, lineHeight, mm);
}

// 値が右側の欄に入りきらない行は、項目名の行と値の行（全幅）に分ける
function toRenderLines(ctx: CanvasRenderingContext2D, lines: CardLine[], width: number, mm: number): RenderLine[] {
  const out: RenderLine[] = [];
  const valueWidth = width * 0.54 - 0.6 * mm;
  for (const l of lines) {
    if (l.kind === "heading") {
      out.push({ kind: "heading", text: l.label });
    } else if (measure(ctx, `bold ${2.3 * mm}px ${FONT}`, l.value) <= valueWidth) {
      out.push({ kind: "row", label: l.label, value: l.value });
    } else {
      out.push({ kind: "row", label: l.label, value: "" });
      out.push({ kind: "value", text: l.value });
    }
  }
  return out;
}

function drawColumn(
  ctx: CanvasRenderingContext2D,
  lines: RenderLine[],
  x: number,
  top: number,
  width: number,
  lineHeight: number,
  mm: number,
): void {
  let y = top;
  for (const l of lines) {
    if (l.kind === "heading") {
      // 参考様式の枠の見出し（薄い灰色の帯に太字）
      ctx.fillStyle = "#e0e0e0";
      ctx.fillRect(x, y, width, lineHeight - 0.6 * mm);
      ctx.fillStyle = "#000000";
      ctx.font = `bold ${2.3 * mm}px ${FONT}`;
      ctx.fillText(fit(ctx, l.text, width - 1.2 * mm), x + 0.6 * mm, y + 0.5 * mm);
    } else if (l.kind === "row") {
      ctx.fillStyle = "#222222";
      ctx.font = `${2.1 * mm}px ${FONT}`;
      ctx.fillText(fit(ctx, l.label, width * 0.44), x + 0.6 * mm, y + 0.6 * mm);
      if (l.value) {
        ctx.fillStyle = "#000000";
        ctx.font = `bold ${2.3 * mm}px ${FONT}`;
        ctx.fillText(fit(ctx, l.value, width * 0.54), x + width * 0.46, y + 0.5 * mm);
      }
    } else {
      // 項目名の下に全幅で出す値（雇用契約期間など）
      ctx.fillStyle = "#000000";
      ctx.font = `bold ${2.3 * mm}px ${FONT}`;
      ctx.fillText(fit(ctx, l.text, width - 3 * mm), x + 2.4 * mm, y + 0.3 * mm);
    }
    y += lineHeight;
  }
}

function measure(ctx: CanvasRenderingContext2D, font: string, text: string): number {
  ctx.font = font;
  return ctx.measureText(text).width;
}

// 幅に入りきらない文字は「…」で切る（最後の手段。ふつうは行を分けるので使われない）
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
  orientation: CardOrientation = "landscape",
): Promise<void> {
  const canvas = document.createElement("canvas");
  drawPlanDatesCard(canvas, dates, title, sub, orientation);
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
