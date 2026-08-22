// 出入国の記録（パスポートのスタンプの日付）の整理。
//
// 入力は「スタンプ1個ずつ」でも「1往復まとめて」でもよい。
// 入っている日付をぜんぶ時系列に並べ、自動で1往復（1回目・2回目…）にまとめる:
// ・母国出国 → 日本入国 → 日本出国 → 母国入国 の順に進む間は同じ往復
// ・順番が戻ったら（例: 母国出国がまた出てきたら）次の往復
// 母国のスタンプが無い往復は、日本入国〜日本出国だけで1回と数える。

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

// 古い順。日付の無い行は末尾
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

// ---- 1往復（1回目・2回目…）への自動まとめ ----

// 母国出国 → 日本入国 → 日本出国 → 母国入国 の順
const TRIP_KINDS = [
  "home_departure_on",
  "japan_entry_on",
  "japan_exit_on",
  "home_entry_on",
] as const;

export interface Trip {
  home_departure_on: string | null;
  japan_entry_on: string | null;
  japan_exit_on: string | null;
  home_entry_on: string | null;
  landing_permission: string; // この往復の日本入国の上陸許可
  sourceIds: string[]; // この往復に含まれる記録（worker_travels.id）。削除に使う
}

function emptyTrip(): Trip {
  return {
    home_departure_on: null,
    japan_entry_on: null,
    japan_exit_on: null,
    home_entry_on: null,
    landing_permission: "",
    sourceIds: [],
  };
}

// 記録の日付をぜんぶ時系列に並べて、1往復ずつにまとめる
export function buildTrips<T extends WorkerTravelInput & { id?: string }>(rows: T[]): Trip[] {
  interface Ev {
    date: string;
    kind: number; // TRIP_KINDS の位置
    landing: string;
    id?: string;
  }
  const events: Ev[] = [];
  for (const r of rows) {
    TRIP_KINDS.forEach((key, kind) => {
      const date = r[key];
      if (!date) return;
      events.push({
        date,
        kind,
        // 上陸許可は日本入国のスタンプに付くもの
        landing: kind === 1 ? (r.landing_permission ?? "").trim() : "",
        id: r.id,
      });
    });
  }
  // 同じ日は 母国出国 → 日本入国 → 日本出国 → 母国入国 の順
  events.sort((a, b) => (a.date === b.date ? a.kind - b.kind : a.date < b.date ? -1 : 1));

  const trips: Trip[] = [];
  let cur: Trip | null = null;
  let lastKind = -1;
  for (const e of events) {
    // 順番が進む間は同じ往復。戻ったら（または同じ種類が2回来たら）次の往復
    if (!cur || e.kind <= lastKind) {
      if (cur) trips.push(cur);
      cur = emptyTrip();
    }
    cur[TRIP_KINDS[e.kind]] = e.date;
    if (e.landing && !cur.landing_permission) cur.landing_permission = e.landing;
    if (e.id && !cur.sourceIds.includes(e.id)) cur.sourceIds.push(e.id);
    lastKind = e.kind;
  }
  if (cur) trips.push(cur);
  return trips;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

// この往復でいま日本にいる扱いか（日本入国済みで、日本出国も母国入国も無い）。
// いちばん新しい往復にだけ使う（古い往復は出国のスタンプが無いだけの可能性がある）
export function isTripStayingInJapan(
  t: Pick<Trip, "japan_entry_on" | "japan_exit_on" | "home_entry_on">,
): boolean {
  return !!t.japan_entry_on && !t.japan_exit_on && !t.home_entry_on;
}

// 日本滞在の日数。終わりは 日本出国日 →（無ければ）母国入国日 →
// （それも無く、いちばん新しい往復なら）今日。分からなければ null
export function tripStayDays(
  t: Pick<Trip, "japan_entry_on" | "japan_exit_on" | "home_entry_on">,
  today: string,
  isLast: boolean,
): number | null {
  if (!t.japan_entry_on) return null;
  const end = t.japan_exit_on || t.home_entry_on || (isLast ? today : null);
  if (!end) return null;
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

// まとめ: 日本入国の回数と、いま日本にいる扱いか（いちばん新しい往復で判定）
export function tripsSummary(trips: Trip[]): { entries: number; inJapan: boolean } {
  const entries = trips.filter((t) => t.japan_entry_on).length;
  const last = trips.at(-1);
  return { entries, inJapan: !!last && isTripStayingInJapan(last) };
}
