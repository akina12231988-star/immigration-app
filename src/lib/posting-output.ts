import { formatWage, type JobPosting } from "@/types/recruiting";

// Facebook掲載用の会社名・住所は掲載用フィールドを優先し、無ければ機関マスタ名で補う
export function postingDisplayName(p: JobPosting, orgName?: string): string {
  return p.display_company || orgName || "（会社名未設定）";
}

// 掲載用テキスト（コピーしてそのまま投稿できる定型文）
export function generatePostingText(p: JobPosting, orgName?: string): string {
  const lines: string[] = [];
  lines.push("【求人のお知らせ】");
  lines.push("");
  lines.push(`◆ 会社：${postingDisplayName(p, orgName)}`);
  if (p.display_address) lines.push(`◆ 勤務地：${p.display_address}`);
  if (p.job_type) lines.push(`◆ 職種：${p.job_type}`);
  lines.push(`◆ 募集人数：${p.openings}名`);
  if (p.gender !== "不問") lines.push(`◆ 性別：${p.gender}`);
  if (p.target_nationality) lines.push(`◆ 対象国籍：${p.target_nationality}`);
  lines.push(`◆ 給与：${formatWage(p.wage_kind, p.wage_amount)}`);
  if (p.employment_period) lines.push(`◆ 雇用期間：${p.employment_period}`);
  if (p.hire_timing) lines.push(`◆ 採用予定：${p.hire_timing}`);
  if (p.note) {
    lines.push("");
    lines.push(p.note);
  }
  lines.push("");
  lines.push("ご興味のある方はお気軽にお問い合わせください。");
  return lines.join("\n");
}

// 掲載カードを Canvas に描画して PNG の dataURL を返す（外部ライブラリ不使用）。
// ブラウザでのみ動作する。
export function renderPostingCard(p: JobPosting, orgName?: string): string {
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const NAVY = "#16325c";
  const NAVY_STRONG = "#0e223f";
  const RED = "#b7282e";
  const TEXT = "#14213d";
  const MUTED = "#5b6b82";

  // 背景
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  // 外枠
  ctx.strokeStyle = "#dbe2ea";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  // ヘッダー帯
  ctx.fillStyle = NAVY;
  ctx.fillRect(20, 20, W - 40, 190);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "bold 84px sans-serif";
  ctx.fillText("求人募集", W / 2, 138);
  ctx.font = "500 34px sans-serif";
  ctx.fillStyle = "#c7d4e8";
  ctx.fillText("特定技能・技能実習", W / 2, 182);

  // 会社名
  ctx.textAlign = "left";
  ctx.fillStyle = NAVY_STRONG;
  ctx.font = "bold 58px sans-serif";
  wrapText(ctx, postingDisplayName(p, orgName), 90, 320, W - 180, 66);

  // 勤務地
  let y = 400;
  if (p.display_address) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 40px sans-serif";
    ctx.fillText(`📍 ${p.display_address}`, 90, y);
    y += 70;
  }

  // 項目行
  const rows: [string, string][] = [];
  if (p.job_type) rows.push(["職種", p.job_type]);
  rows.push(["募集人数", `${p.openings}名`]);
  if (p.gender !== "不問") rows.push(["性別", p.gender]);
  if (p.target_nationality) rows.push(["対象国籍", p.target_nationality]);
  rows.push(["給与", formatWage(p.wage_kind, p.wage_amount)]);
  if (p.employment_period) rows.push(["雇用期間", p.employment_period]);
  if (p.hire_timing) rows.push(["採用予定", p.hire_timing]);

  y += 20;
  for (const [label, value] of rows) {
    ctx.fillStyle = NAVY;
    ctx.fillRect(90, y - 38, 10, 48);
    ctx.fillStyle = MUTED;
    ctx.font = "bold 38px sans-serif";
    ctx.fillText(label, 120, y);
    ctx.fillStyle = TEXT;
    ctx.font = "bold 44px sans-serif";
    ctx.fillText(value, 380, y);
    y += 82;
  }

  // フッター
  ctx.fillStyle = RED;
  ctx.fillRect(20, H - 120, W - 40, 100);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "bold 40px sans-serif";
  ctx.fillText("お気軽にお問い合わせください", W / 2, H - 55);

  return canvas.toDataURL("image/png");
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const chars = [...text];
  let line = "";
  let cy = y;
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = ch;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}
