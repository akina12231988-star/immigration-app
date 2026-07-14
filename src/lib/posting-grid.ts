import type { JobPosting } from "@/types/recruiting";

// Facebook掲載用の複数会社グリッド画像（ベトナム語）。
// 外国人が「何番の求人を希望」と返事しやすいよう、各会社に番号を振って一覧化する。

export interface GridPosting {
  prefecture: string; // Tỉnh làm việc
  job: string; // Công việc
  wage: string; // Lương giờ
  rent: string; // Tiền nhà
  utilities: string; // Điện nước ga
  gender: string; // Giới tính
  hireTiming: string; // Ngày vào công ty
}

const GENDER_VI: Record<string, string> = {
  不問: "Không giới hạn",
  男性: "Nam",
  女性: "Nữ",
};
const WAGE_KIND_VI: Record<string, string> = {
  時給: "",
  月給: "Lương tháng",
  日給: "Lương ngày",
  年収: "Lương năm",
};

// 求人1件をグリッド表示用に変換
export function toGridPosting(p: JobPosting): GridPosting {
  let wage: string;
  if (p.wage_amount != null) {
    const kv = WAGE_KIND_VI[p.wage_kind] ?? "";
    wage = kv ? `${kv} ${p.wage_amount.toLocaleString("en-US")} yên` : `${p.wage_amount.toLocaleString("en-US")} yên`;
  } else {
    wage = "Đàm phán";
  }
  return {
    prefecture: p.display_address || p.work_location || "",
    job: p.job_type || "",
    wage,
    rent: p.rent || "",
    utilities: p.utilities || "",
    gender: GENDER_VI[p.gender] ?? p.gender,
    hireTiming: p.hire_timing || "",
  };
}

const ROWS: { label: string; key: keyof GridPosting }[] = [
  { label: "Tỉnh làm việc", key: "prefecture" },
  { label: "Công việc", key: "job" },
  { label: "Lương giờ", key: "wage" },
  { label: "Tiền nhà", key: "rent" },
  { label: "Điện nước ga", key: "utilities" },
  { label: "Giới tính", key: "gender" },
  { label: "Ngày vào công ty", key: "hireTiming" },
];

export interface GridOptions {
  title: string; // 見出し（登録支援機関名など）
  tagline: string; // ベトナム語のキャッチ
  companyNames: string[]; // 各セルの会社名（掲載用）
}

// グリッド画像を Canvas に描画して PNG dataURL を返す（ブラウザ専用）
export function renderPostingsGrid(
  postings: GridPosting[],
  opts: GridOptions,
): string {
  const COLS = 3;
  const PAD = 24;
  const GAP = 10;
  const CELL_W = 400;
  const CELL_H = 330;
  const HEADER_H = 180;
  const rows = Math.max(1, Math.ceil(postings.length / COLS));

  const W = PAD * 2 + COLS * CELL_W + (COLS - 1) * GAP;
  const H = PAD + HEADER_H + rows * (CELL_H + GAP) + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // 背景（薄緑）
  ctx.fillStyle = "#c9e8cf";
  ctx.fillRect(0, 0, W, H);

  // ヘッダー
  ctx.textAlign = "center";
  ctx.fillStyle = "#14213d";
  ctx.font = "bold 52px sans-serif";
  ctx.fillText(`登録支援機関 ${opts.title}`.trim(), W / 2, PAD + 60);
  ctx.font = "bold 34px sans-serif";
  ctx.fillText("TOKUTEI VISA", W / 2, PAD + 108);
  if (opts.tagline) {
    ctx.fillStyle = "#c0392b";
    ctx.font = "500 22px sans-serif";
    ctx.fillText(opts.tagline, W / 2, PAD + 150);
  }

  // セル描画
  postings.forEach((p, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PAD + col * (CELL_W + GAP);
    const y = PAD + HEADER_H + row * (CELL_H + GAP);

    // セル背景
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, CELL_W, CELL_H);
    ctx.strokeStyle = "#7ec98b";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, CELL_W, CELL_H);

    // 背景の大きな番号
    ctx.fillStyle = "rgba(224, 122, 122, 0.35)";
    ctx.textAlign = "center";
    ctx.font = "bold 200px sans-serif";
    ctx.fillText(String(i + 1), x + CELL_W / 2, y + CELL_H / 2 + 70);

    // 会社名（1行目・赤太字・中央）
    const rowH = (CELL_H - 20) / (ROWS.length + 1);
    ctx.fillStyle = "#c0392b";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    fitText(ctx, opts.companyNames[i] ?? "", x + CELL_W / 2, y + 10 + rowH * 0.7, CELL_W - 30);

    // 各行（ラベル左・値右）
    ROWS.forEach((r, ri) => {
      const ry = y + 10 + rowH * (ri + 1) + rowH * 0.62;
      ctx.fillStyle = "#5b6b82";
      ctx.font = "500 19px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(r.label, x + 14, ry);
      ctx.fillStyle = "#14213d";
      ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "right";
      fitText(ctx, p[r.key] || "-", x + CELL_W - 14, ry, CELL_W * 0.52, true);
    });
  });

  return canvas.toDataURL("image/png");
}

// 幅に収まるようフォントを縮めて1行で描画
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  right = false,
) {
  const base = parseInt(ctx.font, 10) || 20;
  let size = base;
  const weight = ctx.font.includes("bold") ? "bold " : "500 ";
  while (size > 11) {
    ctx.font = `${weight}${size}px sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  ctx.fillText(text, x, y);
  void right;
}
