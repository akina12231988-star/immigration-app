import { describe, expect, it } from "vitest";
import { parseCsv, parseNotionCsv } from "./notion-csv";

describe("parseCsv", () => {
  it("引用符内のカンマ・改行を1フィールドとして扱う", () => {
    const rows = parseCsv('a,"b,c","d\ne"\n1,2,3\n');
    expect(rows[0]).toEqual(["a", "b,c", "d\ne"]);
    expect(rows[1]).toEqual(["1", "2", "3"]);
  });
});

describe("parseNotionCsv", () => {
  it("Notion在籍履歴CSVを外国人＋職歴に変換する", () => {
    const csv = [
      "外国人の名前,フリガナ,国籍,生年月日,在留カード番号,在留資格（当時）,在留許可日,在留期限日,所属機関,退職日,在籍状況,性別,メッセンジャー",
      "GUEN VAN A (https://app.notion.com/p/guen-abc?pvs=21),グエン バン アー,ベトナム,1995年3月1日,AB123,特定技能１号,2022年4月1日,2023年4月1日,A社,,在籍中,男,https://m.me/xxx",
      "GUEN VAN A (https://app.notion.com/p/guen-abc?pvs=21),グエン バン アー,ベトナム,1995年3月1日,AB123,特定技能１号更新,2023年4月1日,2026年4月1日,A社,,在籍中,男,https://m.me/xxx",
    ].join("\n");

    const r = parseNotionCsv(csv);
    expect(r.workerCount).toBe(1);
    const w = r.workers[0];
    expect(w.name).toBe("GUEN VAN A");
    expect(w.legacy_id).toBe("https://app.notion.com/p/guen-abc");
    expect(w.kana).toBe("グエン バン アー");
    expect(w.birth).toBe("1995-03-01");
    expect(w.residence_status).toBe("特定技能1号");
    expect(w.residence_expiry_date).toBe("2026-04-01");
    expect(w.messenger_link).toBe("https://m.me/xxx");
    expect(w.organization_name).toBe("A社");
    expect(w.status).toBe("在籍中");
    // 2期間: 全角「１号」も正規化される
    expect(w.histories.length).toBe(2);
    expect(w.histories[0].visa).toBe("特定技能1号");
    expect(w.histories[0].end_date).toBe("2023-04-01"); // 前の期間は在留期限で終了
    expect(w.histories[1].end_date).toBeNull(); // 最新・在籍中は継続
  });

  it("退職者は状態=退職・最新期間の終了日は退職日になる", () => {
    const csv = [
      "外国人の名前,在留資格（当時）,在留許可日,在留期限日,所属機関,退職日,在籍状況",
      "TRAN B,特定技能１号,2022年4月1日,2025年4月1日,B社,2024年5月10日,退職",
    ].join("\n");
    const r = parseNotionCsv(csv);
    const w = r.workers[0];
    expect(w.status).toBe("退職");
    expect(w.histories[0].end_date).toBe("2024-05-10");
  });
});
