// 健康診断の有効期限は「受診日の1年後」。今日がその日以前なら有効。

// 受診日（YYYY-MM-DD）→ 有効期限（YYYY-MM-DD）。1年後に同じ日が無い場合（2/29）は月末に丸める。
export function healthCheckValidUntil(examOn: string | null): string {
  if (!examOn) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(examOn);
  if (!m) return "";
  const day = Number(m[3]);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, day));
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

// 今日時点でまだ有効か（有効期限当日までは有効）。受診日未設定は無効扱い。
export function isHealthCheckValid(examOn: string | null, today: string): boolean {
  const until = healthCheckValidUntil(examOn);
  return !!until && today <= until;
}
