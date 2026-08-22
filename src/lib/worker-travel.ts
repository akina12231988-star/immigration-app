// 出入国の記録（パスポートのスタンプの日付）の整理。
// 1行が1往復: 母国出国日 → 日本入国日 → 日本出国日 → 母国入国日。
// まだ日本にいる人は日本出国日・母国入国日が空のまま。
// ここで並び順・日本滞在の長さ・回数のまとめを計算し、流れの図に使う。

export interface WorkerTravel {
  id: string;
  worker_id: string;
  home_departure_on: string | null;
  japan_entry_on: string | null;
  japan_exit_on: string | null;
  home_entry_on: string | null;
  landing_permission: string; // 上陸許可シールの在留資格（日本入国時のもの。0098）
  note: string;
  created_at: string;
}

export type WorkerTravelInput = Pick<
  WorkerTravel,
  | "home_departure_on"
  | "japan_entry_on"
  | "japan_exit_on"
  | "home_entry_on"
  | "landing_permission"
  | "note"
>;

// 並び替えに使う日付（入っているいちばん早い日）。全部空なら空文字（末尾へ）
export function travelSortKey(t: WorkerTravelInput): string {
  return (
    [t.home_departure_on, t.japan_entry_on, t.japan_exit_on, t.home_entry_on]
      .filter((d): d is string => !!d)
      .sort()[0] ?? ""
  );
}

// 古い順（1回目→2回目…）。日付の無い行は末尾
export function sortTravels<T extends WorkerTravelInput>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ka = travelSortKey(a);
    const kb = travelSortKey(b);
    if (ka === kb) return 0;
    if (ka === "") return 1;
    if (kb === "") return -1;
    return ka < kb ? -1 : 1;
  });
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

// 日本滞在の日数。日本出国日が無ければ今日までで数える（滞在中）。
// 日本入国日が無い・日付が逆のときは null
export function japanStayDays(
  t: Pick<WorkerTravelInput, "japan_entry_on" | "japan_exit_on">,
  today: string,
): number | null {
  if (!t.japan_entry_on) return null;
  const end = t.japan_exit_on || today;
  const days = daysBetween(t.japan_entry_on, end);
  return days >= 0 ? days : null;
}

// 日数を「◯年◯か月」「◯か月」「◯日」の読みやすい形にする（目安表示用）
export function formatStayDays(days: number): string {
  if (days < 31) return `${days}日`;
  const months = Math.floor(days / 30);
  if (months < 12) return `約${months}か月`;
  return `約${Math.floor(months / 12)}年${months % 12 ? `${months % 12}か月` : ""}`;
}

// この行の人がいま日本にいる扱いか（日本入国済みで日本出国が空）
export function isStayingInJapan(
  t: Pick<WorkerTravelInput, "japan_entry_on" | "japan_exit_on">,
): boolean {
  return !!t.japan_entry_on && !t.japan_exit_on;
}

// まとめ: 日本入国の回数と、いまどこにいる扱いか
export function travelSummary(list: WorkerTravelInput[]): {
  entries: number; // 日本入国の回数
  inJapan: boolean; // 最新の行で日本滞在中か
} {
  const sorted = sortTravels(list);
  const entries = sorted.filter((t) => t.japan_entry_on).length;
  const last = sorted.filter((t) => travelSortKey(t) !== "").at(-1);
  return { entries, inJapan: !!last && isStayingInJapan(last) };
}
