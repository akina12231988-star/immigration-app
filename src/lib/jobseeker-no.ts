// 求職受付番号（求職管理簿）の自動採番。
//
// 形式は「R{令和の年}KS-{連番}」（例: R8KS-3。R8 = 令和8年、KS = 求職）。
// 連番は同じ年（同じ前置き）の中で 1 から増える。
// 応募の登録時に、番号がまだ無い外国人へ自動で振る。あとから手で直すこともできる。

// 受付年月日（YYYY-MM-DD）から前置きを作る（2026年 → R8KS）。令和元年 = 2019年
export function jobseekerNoPrefix(dateIso: string): string {
  const year = Number((dateIso ?? "").slice(0, 4));
  if (!Number.isInteger(year) || year < 2019) return "";
  return `R${year - 2018}KS`;
}

// 登録済みの番号一覧から、その年の次の番号を返す。
// 形式に合わない番号（手で付けた独自の番号）は数えず、そのまま残る
export function nextJobseekerNo(
  existing: (string | null | undefined)[],
  dateIso: string,
): string {
  const prefix = jobseekerNoPrefix(dateIso);
  if (!prefix) return "";
  let max = 0;
  for (const raw of existing) {
    const v = (raw ?? "").normalize("NFKC").toUpperCase().trim();
    const m = v.match(/^(R\d{1,2}KS)-(\d+)$/);
    if (m && m[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  return `${prefix}-${max + 1}`;
}
