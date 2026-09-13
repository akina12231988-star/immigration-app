import { PLAN_DATE_GROUPS, SUPPORT_CONTRACT_YEARS, contractPeriodEnd } from "@/lib/support-plan-dates";

// 「支援計画書の日付」を名刺サイズ（91mm × 55mm）の画像にして保存するための組み立て。
// 画面の一覧表と同じ参考様式ごとの枠を、左右2列に分けて1枚に収める
export const CARD_WIDTH_MM = 91;
export const CARD_HEIGHT_MM = 55;
// 印刷でにじまないよう 300dpi 相当で描く（1mm ≒ 11.8px）
export const CARD_DPI = 300;
export const CARD_PX_PER_MM = CARD_DPI / 25.4;

export interface CardLine {
  kind: "heading" | "row";
  label: string;
  value: string; // 見出しは空
}

// 名刺に収めるための短い項目名（画面の一覧表の項目名は長いので、行のキーごとに置き換える）
const SHORT_LABELS: Record<string, string> = {
  con: "雇用契約日",
  cond: "雇用条件書作成日",
  es: "雇用開始日",
  period: "雇用契約期間",
  eeEnd: "雇用終了日",
  doc: "書類作成日",
  guid: "事前ガイダンス",
  orient: "生活オリエン",
  scPeriod: "契約期間（5年間）",
  apply: "申請予定日",
  sign: "署名日",
};

// 名刺では「2026/8/5」の形（短くて読みやすい）
export function cardDate(ymd: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((ymd ?? "").trim());
  if (!m) return ymd ?? "";
  return `${Number(m[1])}/${Number(m[2])}/${Number(m[3])}`;
}

// 左列: 1-5号・1-6号 / 右列: 1-17号・1-25号・その他（行数がほぼ釣り合う分け方）
export function planDatesCardColumns(dates: Record<string, string>): [CardLine[], CardLine[]] {
  const period = (start: string | undefined, years?: number) =>
    start ? `${cardDate(start)}〜${cardDate(contractPeriodEnd(start, years))}` : "";
  const lines = PLAN_DATE_GROUPS.map((g) => [
    { kind: "heading" as const, label: g.title, value: "" },
    ...g.rows.map((r) => ({
      kind: "row" as const,
      // 1-25号の支援委託契約日は雇用契約日と同じ日なので、名刺ではその旨を短く添える
      label: r.key === "con" && g.title.includes("1-25") ? "支援委託契約日" : (SHORT_LABELS[r.key] ?? r.label),
      value:
        r.key === "period" ? period(dates.es) : r.key === "scPeriod" ? period(dates.con, SUPPORT_CONTRACT_YEARS) : cardDate(dates[r.key]),
    })),
  ]);
  return [lines.slice(0, 2).flat(), lines.slice(2).flat()];
}

// 保存するファイル名（氏名_申請番号_支援計画書の日付（横）.png）
export function planDatesCardFileName(workerName: string, todoNo: string, orientation: "landscape" | "portrait" = "landscape"): string {
  const safe = (v: string) => v.replace(/[\\/:*?"<>|]/g, "・").trim();
  const kind = orientation === "portrait" ? "支援計画書の日付（縦）" : "支援計画書の日付（横）";
  return `${[safe(workerName), safe(todoNo), kind].filter(Boolean).join("_")}.png`;
}
