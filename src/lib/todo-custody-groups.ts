// 「預かり番号がまだ出ていない人」のまとめ方（申請準備の一覧で使う）。
//
// 所属機関別・国籍別のどちらでまとめるかを選べるようにし、
// 「所属機関別＞国籍別」のように2段でまとめることもできる。
// 並びは名前順（英字が先、そのあと五十音順）で、未登録（所属機関・国籍が入っていない人）は最後にまとめる。

export const CUSTODY_GROUP_MODES = [
  "所属機関別＞国籍別",
  "所属機関別",
  "国籍別＞所属機関別",
  "国籍別",
] as const;
export type CustodyGroupMode = (typeof CUSTODY_GROUP_MODES)[number];

export const NO_ORG_LABEL = "（所属機関未設定）";
export const NO_NATIONALITY_LABEL = "（国籍未登録）";

// まとめる元になる1件（TODOの行に出している内容）
export interface CustodyGroupItem {
  orgName: string;
  nationality: string;
}

// まとめた結果。sub は中の小分け（1段だけのときは label が空の1件になる）
export interface CustodyGroup<T> {
  label: string;
  count: number;
  sub: { label: string; rows: T[] }[];
}

// 外側（大きいまとめ）が所属機関かどうか
function outerIsOrg(mode: CustodyGroupMode): boolean {
  return mode === "所属機関別" || mode === "所属機関別＞国籍別";
}

// 2段でまとめるか
function hasSub(mode: CustodyGroupMode): boolean {
  return mode === "所属機関別＞国籍別" || mode === "国籍別＞所属機関別";
}

function labelOf(item: CustodyGroupItem, isOrg: boolean): string {
  if (isOrg) return item.orgName || NO_ORG_LABEL;
  return item.nationality || NO_NATIONALITY_LABEL;
}

// 未登録のまとめは最後、それ以外は名前順（英字が先、そのあと五十音順）
function compareLabel(a: string, b: string): number {
  const placeholder = (s: string) => s === NO_ORG_LABEL || s === NO_NATIONALITY_LABEL;
  if (placeholder(a) !== placeholder(b)) return placeholder(a) ? 1 : -1;
  return a.localeCompare(b, "ja");
}

// 選んだまとめ方で並べ替える。行の順番（在留期限の順など）は呼び出し側のまま
export function groupCustodyRows<T extends CustodyGroupItem>(
  rows: T[],
  mode: CustodyGroupMode,
): CustodyGroup<T>[] {
  const isOrgOuter = outerIsOrg(mode);
  const outer = new Map<string, T[]>();
  for (const row of rows) {
    const key = labelOf(row, isOrgOuter);
    outer.set(key, [...(outer.get(key) ?? []), row]);
  }

  return [...outer.entries()]
    .sort((a, b) => compareLabel(a[0], b[0]))
    .map(([label, group]) => {
      if (!hasSub(mode)) {
        return { label, count: group.length, sub: [{ label: "", rows: group }] };
      }
      const inner = new Map<string, T[]>();
      for (const row of group) {
        const key = labelOf(row, !isOrgOuter);
        inner.set(key, [...(inner.get(key) ?? []), row]);
      }
      return {
        label,
        count: group.length,
        sub: [...inner.entries()]
          .sort((a, b) => compareLabel(a[0], b[0]))
          .map(([subLabel, subRows]) => ({ label: subLabel, rows: subRows })),
      };
    });
}

// まとめの数の言い方（見出しに出す。所属機関なら「所属機関13社」）
export function custodyGroupCountLabel(mode: CustodyGroupMode, groupCount: number): string {
  return outerIsOrg(mode) ? `所属機関${groupCount}社` : `国籍${groupCount}種類`;
}
