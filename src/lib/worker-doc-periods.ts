import type { WorkHistoryRow } from "@/types/db";

// 在留カード・指定書の画像を「どの在籍期間のものか」で振り分けるための計算。
// 画面（WorkerDocuments）から切り出して、単体テストできるようにしている。

// 過去の在籍期間（所属機関ごと）。現在の在籍は "current" タブで表す
export interface OrgPeriod {
  key: string;
  org: string;
  start: string; // 雇用開始日
  end: string; // 退職日
}

// 職歴から「過去の」在籍期間を組み立てる。
// 本国での職歴は除外し、同じ機関が連続する職歴はひとつの在籍期間にまとめる。
// 退職日が今日以降の在籍（＝今も対象の期間）は過去ではなく「現在」として扱う。
export function buildPastPeriods(histories: WorkHistoryRow[], today: string): OrgPeriod[] {
  const rows = [...histories]
    .filter((h) => h.visa !== "本国での職歴")
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));

  const merged: { org: string; start: string; end: string | null }[] = [];
  for (const h of rows) {
    const org = h.org_name || "所属不明";
    const last = merged[merged.length - 1];
    if (last && last.org === org) {
      if (last.end !== null && (h.end_date === null || h.end_date > last.end)) {
        last.end = h.end_date;
      }
    } else {
      merged.push({ org, start: h.start_date, end: h.end_date });
    }
  }

  // 終了日があり、その日が過ぎている期間だけが「過去」タブ。
  // 継続中の在籍と、今日がまだ期間内の在籍は「現在」タブに含める
  return merged
    .filter(
      (p): p is { org: string; start: string; end: string } =>
        p.end !== null && p.end < today,
    )
    .sort((a, b) => (a.start > b.start ? -1 : 1))
    .map((p, i) => ({ key: `${p.start}-${i}`, org: p.org, start: p.start, end: p.end }));
}

// 画像の登録日から、どの在籍期間の画像かを判定する。
// 期間内ならその期間、どこにも入らなければ「現在」。
// ただし過去の期間同士の隙間に登録された画像は、日付が近いほうの過去期間に寄せる
export function periodKeyFor(createdAt: string, past: OrgPeriod[], hasOngoing: boolean): string {
  const d = createdAt.slice(0, 10);
  for (const p of past) {
    if (p.start <= d && d <= p.end) return p.key;
  }
  if (past.length === 0) return "current";
  const newest = past[0];
  // 最後の退職日より後は「現在」（次の雇用に向けた登録とみなす）
  if (d > newest.end) return "current";
  if (hasOngoing && past.every((p) => d < p.start)) return "current";
  // 過去期間の隙間・最初の期間より前 → 日付が最も近い過去期間へ
  let bestKey = newest.key;
  let bestDist = Infinity;
  for (const p of past) {
    const dist =
      d < p.start
        ? Date.parse(p.start) - Date.parse(d)
        : Date.parse(d) - Date.parse(p.end);
    if (dist < bestDist) {
      bestDist = dist;
      bestKey = p.key;
    }
  }
  return bestKey;
}

