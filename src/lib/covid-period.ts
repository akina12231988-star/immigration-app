// 新型コロナの帰国困難による特定活動（就労可）が出ていた期間。
//
// 2020年3月ごろから帰国便が減り、5月以降に「特定活動（帰国困難）」の特例が始まった。
// 特例は令和4年（2022年）5月31日に終了が公表され、在留期限が令和4年11月1日までの人に
// 「今回限り」で最長4か月（〜2023年3月ごろ）の更新が認められて終わった。
// 職歴の期間がこの範囲から外れていたら「コロナか確認してください」と案内する。
export const COVID_PERIOD = { start: "2020-03-01", end: "2023-03-31" } as const;

export const COVID_VISA = "特定活動（コロナ帰国困難）";

// 期間がコロナの帰国困難の期間に収まっているか（終了日が空なら今日までとして見る）
export function isWithinCovidPeriod(start: string, end: string | null, today: string): boolean {
  if (!start) return true; // 開始日が未入力のときは判定しない
  const last = end || today;
  return start >= COVID_PERIOD.start && last <= COVID_PERIOD.end;
}

// 期間がコロナの期間から外れているときの案内（収まっていれば空）
export function covidPeriodAlert(start: string, end: string | null, today: string): string {
  if (isWithinCovidPeriod(start, end, today)) return "";
  return `その期間はコロナ発生期間（${COVID_PERIOD.start.replace(/-/g, "/")}〜${COVID_PERIOD.end.replace(/-/g, "/")}）ではありません。コロナか確認してください`;
}
