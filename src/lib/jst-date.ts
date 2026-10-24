// 日本時間（JST）の「今日」の日付。
//
// これまでは new Date().toISOString() の日付（UTC）を使っていたため、
// 日本時間の 0:00〜8:59 のあいだは前日の日付になり、
// 「試験日を過ぎたのに合否が未確認」などの判定が朝のうちは1日遅れていた。
// このアプリの日付はすべて日本時間で考えるので、JST の日付を返す。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 渡した時刻の JST での日付（YYYY-MM-DD）
export function jstDateStr(at: Date): string {
  return new Date(at.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function todayJst(): string {
  return jstDateStr(new Date());
}
