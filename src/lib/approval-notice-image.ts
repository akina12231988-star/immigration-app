import type { Application } from "@/types/application";

// 「許可のお知らせ」画像。
//
// 入管から許可の連絡（はがき・通知書・メール）が来た申請を複数選び、
// 1人1枠で「連絡が来た日・名前・所属機関・担当者・取次士・預り番号・申請日・申請番号・申請内容」を
// 並べた1枚の画像（PNG）にする。人数が多いときは数枚に分け、右上に「許可人数10名（1枚目／2枚）」と出す。Messenger のグループに貼って、まとめて知らせるためのもの。
// 画像はブラウザの Canvas だけで描く（サーバーは使わない）。
//
// このファイルの前半はデータの組み立て（テストできる純粋関数）、後半が Canvas への描画。

// 連絡が来た手段
export const APPROVAL_NOTICE_VIAS = ["はがき", "メール", "窓口", "電話"] as const;
export type ApprovalNoticeVia = (typeof APPROVAL_NOTICE_VIAS)[number];

// 1枚に入れる人数（多いときはこの人数ずつ複数枚に分ける）
export const APPROVAL_NOTICE_PER_IMAGE = 5;

// 画像の1枠ぶん
export interface ApprovalNoticeItem {
  id: string;
  name: string;
  org: string; // 所属機関（未設定なら「所属機関未設定」）
  tantou: string; // 担当者（申請準備のTODOの担当者。空なら「—」）
  assignee: string; // 取次士（空なら「—」）
  custodyNo: string; // 預り番号（預かっていなければ「—」）
  applicationDate: string; // 申請日
  applicationNo: string; // 申請番号（空なら「未登録」）
  content: string; // 申請内容（空なら「未登録」）
  noticeDate: string; // 許可の連絡が来た日
  via: string; // はがき / メール など（空なら出さない）
}

// 人ごとの「連絡が来た日・手段」（まとめて決めた値を人ごとに直せる）
export interface ApprovalNoticeOverride {
  noticeDate?: string;
  via?: string;
}

export type ApprovalNoticeSource = Pick<
  Application,
  | "id"
  | "name"
  | "organizationName"
  | "assignee"
  | "applicationDate"
  | "applicationNumber"
  | "applicationContent"
  | "approvalDate"
>;

const dash = (v: string | null | undefined, empty = "—"): string => (v && v.trim() ? v.trim() : empty);

// 連絡が来た日の初期値: 申請に許可日があればその日、無ければ今日
export function defaultNoticeDate(app: Pick<Application, "approvalDate">, today: string): string {
  return app.approvalDate || today;
}

// 選んだ申請を画像の枠の並びにする
export function buildApprovalNoticeItems(
  apps: ApprovalNoticeSource[],
  opts: {
    today: string;
    via: string; // まとめて決めた手段
    custodyNoLabel: (app: ApprovalNoticeSource) => string;
    tantouLabel?: (app: ApprovalNoticeSource) => string; // 担当者（申請準備のTODOの担当者）
    overrides?: Record<string, ApprovalNoticeOverride>;
  },
): ApprovalNoticeItem[] {
  return apps.map((a) => {
    const o = opts.overrides?.[a.id] ?? {};
    return {
      id: a.id,
      name: dash(a.name, "氏名未登録"),
      org: dash(a.organizationName, "所属機関未設定"),
      tantou: dash(opts.tantouLabel?.(a)),
      assignee: dash(a.assignee),
      custodyNo: dash(opts.custodyNoLabel(a)),
      applicationDate: dash(a.applicationDate),
      applicationNo: dash(a.applicationNumber, "未登録"),
      content: dash(a.applicationContent, "未登録"),
      noticeDate: o.noticeDate || defaultNoticeDate(a, opts.today),
      via: o.via ?? opts.via,
    };
  });
}

// 1枚あたりの人数で分ける（size が 1 未満なら1枚にまとめる）
export function chunkApprovalNoticeItems<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const n = size >= 1 ? Math.floor(size) : items.length;
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

// 2026-10-17 → 2026年10月17日（形が違えばそのまま）
export function formatJpDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}

// 見出しの日付: 全員同じ日ならその日、違う日が混ざれば「10月16日〜10月17日」
export function approvalNoticeHeadline(items: Pick<ApprovalNoticeItem, "noticeDate">[]): string {
  const dates = Array.from(new Set(items.map((i) => i.noticeDate).filter(Boolean))).sort();
  if (dates.length === 0) return "許可のお知らせ";
  if (dates.length === 1) return `許可のお知らせ　${formatJpDate(dates[0])}`;
  return `許可のお知らせ　${formatJpDate(dates[0])}〜${formatJpDate(dates[dates.length - 1])}`;
}

// 右上の人数の表示: 「許可人数10名」と、複数枚なら「1枚目／2枚（1〜5番）」
export function approvalNoticeCountLabel(total: number, page = 1, pages = 1, from = 1, to = total): { count: string; page: string } {
  return {
    count: `許可人数 ${total}名`,
    page: pages > 1 ? `${page}枚目／${pages}枚（${from}〜${to}番）` : "",
  };
}

// 保存するときのファイル名（例: 許可のお知らせ_2026-10-17_3名.png、複数枚なら _1of2 を付ける）
export function approvalNoticeFileName(date: string, count: number, page = 1, pages = 1): string {
  const part = pages > 1 ? `_${page}of${pages}` : "";
  return `許可のお知らせ_${date}_${count}名${part}.png`;
}

// ---- ここから Canvas への描画 ----

const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "Meiryo", sans-serif';
const W = 1080; // 画像の幅（スマホで読める大きさ）
const PAD = 44;
const BLUE = "#1f4e9c";
const GREEN_BG = "#e8f3ea";
const GREEN_FG = "#1f6b35";
const FIELD_BG = "#f3f5f9";
const BORDER = "#d5d9e0";

type Ctx = CanvasRenderingContext2D;

// 文字を枠幅に収まるよう1文字ずつ折り返す（日本語は単語の区切りが無いため）
export function wrapByWidth(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let cur = "";
    for (const ch of Array.from(para)) {
      const next = cur + ch;
      if (cur && measure(next) > maxWidth) {
        lines.push(cur);
        cur = ch;
      } else {
        cur = next;
      }
    }
    lines.push(cur);
  }
  return lines.length ? lines : [""];
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

interface Field {
  label: string;
  value: string;
  ok?: boolean; // 緑の枠（連絡が来た日）
}

// 項目の並び（行ごと）。1行目: 連絡が来た日・担当者・取次士、2行目: 預り番号・申請日・申請番号、3行目: 申請内容（幅いっぱい）
export function fieldRowsOf(item: ApprovalNoticeItem): Field[][] {
  const notice = item.via ? `${item.noticeDate}（${item.via}）` : item.noticeDate;
  return [
    [
      { label: "許可の連絡が来た日", value: notice, ok: true },
      { label: "担当者", value: item.tantou },
      { label: "取次士", value: item.assignee },
    ],
    [
      { label: "預り番号", value: item.custodyNo },
      { label: "申請日", value: item.applicationDate },
      { label: "申請番号", value: item.applicationNo },
    ],
    [{ label: "申請内容", value: item.content }],
  ];
}

// 1枠の高さを先に計算する（申請内容が長いと行が増える）
function cardLayout(ctx: Ctx, item: ApprovalNoticeItem, innerX: number, innerW: number) {
  const gap = 18;
  const valueFont = `bold 22px ${FONT}`;
  ctx.font = valueFont;
  // 行ごとに項目の幅を決める（3つなら3等分、1つなら幅いっぱい）
  const rows = fieldRowsOf(item).map((row) => {
    const fieldW = (innerW - gap * (row.length - 1)) / row.length;
    return row.map((f) => ({
      ...f,
      fieldW,
      lines: wrapByWidth((s) => ctx.measureText(s).width, f.value, fieldW - 28),
    }));
  });
  const rowHeights = rows.map((r) => 8 + 17 + 4 + Math.max(...r.map((f) => f.lines.length)) * 27 + 8);
  ctx.font = `bold 34px ${FONT}`;
  const nameLines = wrapByWidth((s) => ctx.measureText(s).width, item.name, innerW);
  ctx.font = `22px ${FONT}`;
  const orgLines = wrapByWidth((s) => ctx.measureText(s).width, item.org, innerW);
  const headH = nameLines.length * 40 + orgLines.length * 28 + 4;
  const height = 20 + headH + 14 + rowHeights.reduce((n, h) => n + h, 0) + 10 * (rowHeights.length - 1) + 18;
  return { rows, rowHeights, nameLines, orgLines, headH, height, gap };
}

export interface ApprovalNoticeDrawOptions {
  generatedAt?: string; // 右下に出す作成日時（例: 2026-10-17 15:07）
  footer?: string; // 左下に出す文（既定: アプリ名）
  total?: number; // 許可人数（全体。複数枚に分けたときも全体の人数を出す）
  page?: number; // 何枚目か（1〜）
  pages?: number; // 全部で何枚か
  startIndex?: number; // この枚の1人目の通し番号（1〜。2枚目なら 6 など）
}

// 画像を描く。canvas の大きさはこの関数が決める
export function drawApprovalNoticeImage(
  canvas: HTMLCanvasElement,
  items: ApprovalNoticeItem[],
  opts: ApprovalNoticeDrawOptions = {},
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 先に全体の高さを計算
  const cardX = PAD;
  const cardW = W - PAD * 2;
  const innerX = cardX + 26 + 52 + 20; // 枠の左余白 + 番号丸 + 間隔
  const innerW = cardX + cardW - 26 - innerX;
  canvas.width = W;
  canvas.height = 10; // 計測用（measureText に幅は関係ない）
  const layouts = items.map((it) => cardLayout(ctx, it, innerX, innerW));
  const total = opts.total ?? items.length;
  const page = opts.page ?? 1;
  const pages = opts.pages ?? 1;
  const startIndex = opts.startIndex ?? 1;
  const countLabel = approvalNoticeCountLabel(total, page, pages, startIndex, startIndex + items.length - 1);
  // 右上に枚数の行が増えるぶん見出しを高くする
  const headerExtra = countLabel.page ? 22 : 0;
  const headerH = 40 + 26 + 44 + headerExtra + 14 + 4 + 22;
  const bodyH = layouts.reduce((n, l) => n + l.height + 18, 0);
  const footerH = 6 + 20 + 36;
  canvas.height = headerH + bodyH + footerH;

  // 背景
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "top";

  // 見出し
  let y = 40;
  ctx.fillStyle = "#555555";
  ctx.font = `20px ${FONT}`;
  ctx.fillText("入管から許可の連絡（はがき・通知書）が届きました", PAD, y);
  y += 26;
  // 見出し（右上の人数の欄にかぶらないよう、長いときは文字を小さくする）
  const headline = approvalNoticeHeadline(items);
  const headlineMax = W - PAD * 2 - 330;
  let headlineSize = 38;
  ctx.font = `bold ${headlineSize}px ${FONT}`;
  while (headlineSize > 22 && ctx.measureText(headline).width > headlineMax) {
    headlineSize -= 2;
    ctx.font = `bold ${headlineSize}px ${FONT}`;
  }
  ctx.fillStyle = "#111111";
  ctx.fillText(headline, PAD, y + (38 - headlineSize) / 2);
  // 右上: 許可人数（全体）と、複数枚なら何枚目か
  ctx.textAlign = "right";
  ctx.fillStyle = BLUE;
  ctx.font = `bold 24px ${FONT}`;
  ctx.fillText(countLabel.count, W - PAD, y - 4);
  let ry = y + 26;
  if (countLabel.page) {
    ctx.fillStyle = "#111111";
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillText(countLabel.page, W - PAD, ry);
    ry += 22;
  }
  ctx.fillStyle = "#555555";
  ctx.font = `16px ${FONT}`;
  ctx.fillText("在留カード受け取りの準備をお願いします", W - PAD, ry);
  ctx.textAlign = "left";
  y += 44 + headerExtra + 14;
  ctx.fillStyle = BLUE;
  ctx.fillRect(PAD, y, W - PAD * 2, 4);
  y += 4 + 22;

  // 枠
  items.forEach((item, idx) => {
    const l = layouts[idx];
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 2;
    roundRect(ctx, cardX, y, cardW, l.height, 18);
    ctx.stroke();

    // 番号の丸
    const cx = cardX + 26 + 26;
    const cy = y + 20 + 26 + 4;
    ctx.fillStyle = BLUE;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 26px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(startIndex + idx), cx, cy + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    // 名前・所属機関
    let yy = y + 20;
    ctx.fillStyle = "#111111";
    ctx.font = `bold 34px ${FONT}`;
    for (const line of l.nameLines) {
      ctx.fillText(line, innerX, yy);
      yy += 40;
    }
    ctx.fillStyle = "#333333";
    ctx.font = `22px ${FONT}`;
    for (const line of l.orgLines) {
      ctx.fillText(line, innerX, yy + 2);
      yy += 28;
    }
    yy = y + 20 + l.headH + 14;

    // 項目（3列 × 2行 ＋ 申請内容の1行）
    l.rows.forEach((row, ri) => {
      const rh = l.rowHeights[ri];
      row.forEach((f, ci) => {
        const fx = innerX + ci * (f.fieldW + l.gap);
        ctx.fillStyle = f.ok ? GREEN_BG : FIELD_BG;
        roundRect(ctx, fx, yy, f.fieldW, rh, 10);
        ctx.fill();
        ctx.fillStyle = "#666666";
        ctx.font = `15px ${FONT}`;
        ctx.fillText(f.label, fx + 14, yy + 8);
        ctx.fillStyle = f.ok ? GREEN_FG : "#111111";
        ctx.font = `bold 22px ${FONT}`;
        f.lines.forEach((line, li) => ctx.fillText(line, fx + 14, yy + 8 + 17 + 4 + li * 27));
      });
      yy += rh + 10;
    });

    y += l.height + 18;
  });

  // 下の行
  y += 6;
  ctx.fillStyle = "#777777";
  ctx.font = `16px ${FONT}`;
  ctx.fillText(opts.footer ?? "外国人管理アプリ「在留カード受け取り待ち」から作成", PAD, y);
  if (opts.generatedAt) {
    ctx.textAlign = "right";
    ctx.fillText(opts.generatedAt, W - PAD, y);
    ctx.textAlign = "left";
  }
}

// Canvas を PNG の Blob にする
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画像を作れませんでした"))), "image/png");
  });
}

// 画像をクリップボードにコピーする（対応していないブラウザでは false）
export async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
  try {
    // Safari は Promise で渡す必要がある
    await navigator.clipboard.write([new ClipboardItem({ "image/png": canvasToPngBlob(canvas) })]);
    return true;
  } catch {
    try {
      const blob = await canvasToPngBlob(canvas);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return true;
    } catch {
      return false;
    }
  }
}

// 作成日時の表示（2026-10-17 15:07）
export function nowLabel(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
