// 外国人の住所歴。課税・納税証明書は「その年度の1月1日時点の住所」の市区町村へ請求するため、
// 住所歴から基準日時点の住所を判定する。

export interface WorkerAddress {
  id: string;
  worker_id: string;
  moved_on: string; // YYYY-MM-DD（転入日）
  address: string;
  kind: string;
  note: string;
  created_at: string;
}

// 令和年 → 西暦の1月1日（例: 令和7年 → 2025-01-01）。課税年度の基準日。
export function reiwaJan1(reiwa: number): string {
  return `${2018 + reiwa}-01-01`;
}

// 基準日（date）時点で有効な住所 = moved_on が date 以前で最も新しいもの。無ければ null。
export function addressOnDate(
  addresses: WorkerAddress[],
  date: string,
): WorkerAddress | null {
  const eligible = addresses
    .filter((a) => a.moved_on <= date)
    .sort((a, b) => (a.moved_on < b.moved_on ? 1 : -1));
  return eligible[0] ?? null;
}
