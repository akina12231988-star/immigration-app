import { describe, expect, it } from "vitest";
import {
  custodyGroupCountLabel,
  groupCustodyRows,
  NO_NATIONALITY_LABEL,
  NO_ORG_LABEL,
} from "./todo-custody-groups";

const row = (name: string, orgName: string, nationality: string) => ({
  name,
  orgName,
  nationality,
});

const rows = [
  row("A", "BASE株式会社", "ベトナム"),
  row("B", "BASE株式会社", "カンボジア"),
  row("C", "BASE株式会社", "ベトナム"),
  row("D", "あさひ工業", "ベトナム"),
  row("E", "", "インドネシア"),
  row("F", "あさひ工業", ""),
];

const names = (rs: { name: string }[]) => rs.map((r) => r.name);

describe("groupCustodyRows", () => {
  it("所属機関別は機関ごとに1つのまとめ（名前順・未設定は最後）", () => {
    const groups = groupCustodyRows(rows, "所属機関別");
    // 英字の機関名が先、そのあと五十音順。所属機関が決まっていない人は最後
    expect(groups.map((g) => [g.label, g.count])).toEqual([
      ["BASE株式会社", 3],
      ["あさひ工業", 2],
      [NO_ORG_LABEL, 1],
    ]);
    // 1段だけのときは小分けの見出しは空
    expect(groups[1].sub).toEqual([{ label: "", rows: [rows[3], rows[5]] }]);
  });

  it("所属機関別＞国籍別は、機関の中を国籍でまとめる", () => {
    const groups = groupCustodyRows(rows, "所属機関別＞国籍別");
    const base = groups.find((g) => g.label === "BASE株式会社")!;
    expect(base.count).toBe(3);
    expect(base.sub.map((s) => [s.label, names(s.rows)])).toEqual([
      ["カンボジア", ["B"]],
      ["ベトナム", ["A", "C"]],
    ]);
    // 国籍が未登録の人はその機関の最後にまとめる
    const asahi = groups.find((g) => g.label === "あさひ工業")!;
    expect(asahi.sub.map((s) => s.label)).toEqual(["ベトナム", NO_NATIONALITY_LABEL]);
  });

  it("国籍別は国籍ごとにまとめ、2段にすると中が所属機関別になる", () => {
    expect(groupCustodyRows(rows, "国籍別").map((g) => [g.label, g.count])).toEqual([
      ["インドネシア", 1],
      ["カンボジア", 1],
      ["ベトナム", 3],
      [NO_NATIONALITY_LABEL, 1],
    ]);
    const vn = groupCustodyRows(rows, "国籍別＞所属機関別").find((g) => g.label === "ベトナム")!;
    expect(vn.sub.map((s) => [s.label, names(s.rows)])).toEqual([
      ["BASE株式会社", ["A", "C"]],
      ["あさひ工業", ["D"]],
    ]);
  });

  it("元の並び（在留期限の順など）は入れ替えない", () => {
    const groups = groupCustodyRows(rows, "所属機関別");
    expect(names(groups[0].sub[0].rows)).toEqual(["A", "B", "C"]);
  });
});

describe("custodyGroupCountLabel", () => {
  it("まとめ方に合わせた言い方にする", () => {
    expect(custodyGroupCountLabel("所属機関別", 13)).toBe("所属機関13社");
    expect(custodyGroupCountLabel("所属機関別＞国籍別", 13)).toBe("所属機関13社");
    expect(custodyGroupCountLabel("国籍別", 4)).toBe("国籍4種類");
  });
});
