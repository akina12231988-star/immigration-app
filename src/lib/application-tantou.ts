// 申請一覧の「担当者」での絞り込み。
//
// ここでいう担当者は「担当者（申請準備）」＝ 一覧の担当者の欄で選ぶ人で、
// 外国人ごとの申請準備の記録に紐づいています。
//
// これまでは所属機関の支援責任者・支援担当者を見て絞っていたため、
// 一覧に「市原　彩奈」と出ていても、機関マスタに登録が無いと1件も出ませんでした。
// 一覧に出ている担当者（申請準備）で絞るようにします。

// 氏名のくらべ方をそろえる（空白の入れ方の違いを無視する）
export function normalizeTantouName(name: string | null | undefined): string {
  return (name ?? "").replace(/[\s　]/g, "");
}

// その案件を、選んだ担当者（申請準備）で出すか
export function matchesApplicationTantou(
  filter: string,
  rowTantou: string | null | undefined,
): boolean {
  const target = normalizeTantouName(filter);
  if (!target) return true; // 「すべて」
  return normalizeTantouName(rowTantou) === target;
}

// 担当者（申請準備）ごとにまとめる（在留カード受け取り待ちの「担当者別に表示」）。
// 担当者の名前順に並べ、担当者が未定の案件は「未定」として最後にまとめる
export const TANTOU_UNSET = "未定";
export function groupByTantou<T>(rows: T[], tantouOf: (row: T) => string): { tantou: string; rows: T[] }[] {
  const map = new Map<string, { tantou: string; rows: T[] }>();
  for (const row of rows) {
    const name = (tantouOf(row) ?? "").trim();
    const key = name ? normalizeTantouName(name) : "";
    const g = map.get(key) ?? { tantou: name || TANTOU_UNSET, rows: [] };
    g.rows.push(row);
    map.set(key, g);
  }
  const groups = Array.from(map.entries());
  groups.sort(([ka, a], [kb, b]) => (ka === "" ? 1 : kb === "" ? -1 : a.tantou.localeCompare(b.tantou, "ja")));
  return groups.map(([, g]) => g);
}

// 絞り込みの選択肢。
// 決まった顔ぶれ（PREP_TANTOU_OPTIONS）に、実際に登録されている担当者を足す
// （一覧に出ているのに選べない、ということが無いように）。
export function tantouFilterOptions(
  base: readonly string[],
  used: readonly (string | null | undefined)[],
): string[] {
  const out = [...base];
  const seen = new Set(base.map(normalizeTantouName));
  for (const name of used) {
    const value = (name ?? "").trim();
    if (!value) continue;
    const key = normalizeTantouName(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
