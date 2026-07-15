import { describe, expect, it } from "vitest";
import { parseLegacyJson } from "./import";

describe("parseLegacyJson", () => {
  it("workers 配列と history をマッピングする", () => {
    const raw = {
      workers: [
        {
          id: "w1",
          name: "グエン",
          kana: "グエン",
          nationality: "ベトナム",
          birth: "1995/3/1",
          residenceCard: "AB123",
          field: "食品",
          history: [
            { visa: "特定技能1号", start: "2022-04-01", end: "2023-03-31", org: "A社", role: "製造" },
            { visa: "技能実習", start: "2019/04/01", end: null },
          ],
        },
      ],
    };
    const r = parseLegacyJson(raw);
    expect(r.workerCount).toBe(1);
    expect(r.historyCount).toBe(2);
    const w = r.workers[0];
    expect(w.legacy_id).toBe("w1");
    expect(w.birth).toBe("1995-03-01");
    expect(w.residence_card_no).toBe("AB123");
    expect(w.histories[0].end_date).toBe("2023-03-31");
    expect(w.histories[1].end_date).toBeNull();
  });

  it("トップレベルが配列でも受け付ける", () => {
    const r = parseLegacyJson([{ name: "田中" }]);
    expect(r.workerCount).toBe(1);
  });

  it("v1 periods[] は特定技能1号として取り込む", () => {
    const raw = [{ name: "リー", periods: [{ start: "2021-01-01", end: "2021-12-31" }] }];
    const r = parseLegacyJson(raw);
    expect(r.historyCount).toBe(1);
    expect(r.workers[0].histories[0].visa).toBe("特定技能1号");
  });

  it("未知の在留資格は「その他」に補正し記録する", () => {
    const raw = [{ name: "A", history: [{ visa: "謎ビザ", start: "2020-01-01" }] }];
    const r = parseLegacyJson(raw);
    expect(r.workers[0].histories[0].visa).toBe("その他");
    expect(r.skipped.some((s) => s.includes("謎ビザ"))).toBe(true);
  });

  it("氏名なし・開始日なしはスキップする", () => {
    const raw = [
      { name: "" },
      { name: "B", history: [{ visa: "特定技能1号" }] },
    ];
    const r = parseLegacyJson(raw);
    expect(r.workerCount).toBe(1); // 氏名なしは除外
    expect(r.workers[0].histories.length).toBe(0); // 開始日なしは除外
    expect(r.skipped.length).toBeGreaterThanOrEqual(2);
  });

  it("在籍状況・在留情報・Messenger・所属機関名（Notion在籍履歴形式）を取り込む", () => {
    const raw = [
      {
        legacy_id: "notion-1",
        name: "グエン バン A",
        status: "在籍中",
        residence_status: "特定技能1号",
        residence_permit_date: "2026-07-01",
        residence_expiry_date: "2027-07-22",
        messenger_link: "https://www.facebook.com/messages/t/123",
        organization_name: "澤村　博文",
      },
    ];
    const r = parseLegacyJson(raw);
    const w = r.workers[0];
    expect(w.status).toBe("在籍中");
    expect(w.residence_status).toBe("特定技能1号");
    expect(w.residence_permit_date).toBe("2026-07-01");
    expect(w.residence_expiry_date).toBe("2027-07-22");
    expect(w.messenger_link).toBe("https://www.facebook.com/messages/t/123");
    expect(w.organization_name).toBe("澤村　博文");
  });

  it("未知の在籍状況はスキップして記録する（既定値に委ねる）", () => {
    const raw = [{ name: "C", status: "謎ステータス" }];
    const r = parseLegacyJson(raw);
    expect(r.workers[0].status).toBeUndefined();
    expect(r.skipped.some((s) => s.includes("謎ステータス"))).toBe(true);
  });
});
