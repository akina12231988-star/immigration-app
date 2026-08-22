// 求人の有効期限まわり。
//
// 運用: 求人は受付日から3か月有効。有効期限（valid_until）を入れていない求人は
// 受付日から3か月（の前日）を期限として扱う。
// 3か月を過ぎても採用人数が足りない求人は、募集を延長するか締め切るかを
// 求人一覧で決めてもらう（延長すると期限が3か月延びる）。

export const POSTING_VALID_MONTHS = 3;

// YYYY-MM-DD に月数を足す（月末は繰り上げず、その月の末日に丸める）
export function addMonthsYmd(ymd: string, months: number): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const first = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(Number(m[3]), lastDay));
  return first.toISOString().slice(0, 10);
}

// 求人の有効期限。valid_until があればそれ、無ければ受付日から3か月（の前日）
export function postingValidUntil(
  receivedOn: string,
  validUntil?: string | null,
): string {
  if (validUntil) return validUntil;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) return "";
  const d = new Date(`${addMonthsYmd(receivedOn, POSTING_VALID_MONTHS)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// 期限を過ぎたのに採用人数が足りない募集中の求人か
// （延長するか締め切るかを決めてもらう対象）
export function needsExtensionDecision(
  p: {
    status: string;
    received_on: string;
    valid_until?: string | null;
    openings: number | null;
    hired: number;
  },
  today: string,
): boolean {
  if (p.status !== "募集中") return false;
  const until = postingValidUntil(p.received_on, p.valid_until);
  if (!until || today <= until) return false;
  return p.openings == null || p.hired < p.openings;
}

// 延長後の有効期限（今の期限から3か月）
export function extendedValidUntil(
  receivedOn: string,
  validUntil?: string | null,
): string {
  const until = postingValidUntil(receivedOn, validUntil);
  return until ? addMonthsYmd(until, POSTING_VALID_MONTHS) : "";
}
