import { describe, expect, it } from "vitest";
import {
  attachVisaHistoryDocs,
  buildVisaHistory,
  groupVisaHistoryByOrg,
  NO_ORG_GROUP,
  orgAtDate,
  grantLabel,
  statusFromContent,
  type VisaHistoryApplication,
} from "./visa-history";

const app = (over: Partial<VisaHistoryApplication>): VisaHistoryApplication => ({
  content: "",
  approved: true,
  approval_date: null,
  granted_permit_date: null,
  granted_expiry_date: null,
  granted_card_no: "",
  visa_at_grant: "",
  ...over,
});

describe("grantLabel", () => {
  it("申請の内容で言い方を変える", () => {
    expect(grantLabel("特定技能1号", "在留期間更新許可")).toBe("特定技能1号 更新許可");
    expect(grantLabel("特定技能1号", "在留資格変更許可（特定技能）")).toBe("特定技能1号 ビザ許可");
    expect(grantLabel("特定技能1号", "在留資格認定証明書交付")).toBe("特定技能1号 認定");
    expect(grantLabel("", "在留期間更新許可")).toBe("在留資格 更新許可");
  });
});

describe("statusFromContent", () => {
  it("許可時の在留資格が入っていないときは申請の内容から読む", () => {
    expect(statusFromContent("在留資格変更許可（特定技能）")).toBe("特定技能");
    expect(statusFromContent("特定活動ビザ更新の申請")).toBe("特定活動");
    expect(statusFromContent("在留期間更新許可")).toBe("");
  });
});

describe("buildVisaHistory", () => {
  it("申請一覧・在留カードの記録・今の在留カードを、許可日の古い順に並べる", () => {
    const rows = buildVisaHistory({
      apps: [
        app({
          content: "在留資格変更許可（特定活動）",
          granted_permit_date: "2023-10-05",
          granted_expiry_date: "2024-04-05",
          granted_card_no: "AA11111111AA",
          visa_at_grant: "特定活動",
        }),
        app({
          content: "在留資格変更許可（特定技能）",
          granted_permit_date: "2024-04-23",
          granted_expiry_date: "2025-04-23",
          granted_card_no: "BB22222222BB",
          visa_at_grant: "特定技能1号",
        }),
      ],
      cards: [
        {
          residence_card_no: "CC33333333CC",
          residence_status: "特定技能1号",
          residence_permit_date: "2025-04-23",
          residence_expiry_date: "2026-04-23",
        },
      ],
      current: {
        residence_card_no: "LJ8268506RD",
        residence_status: "特定技能1号",
        residence_permit_date: "2026-04-23",
        residence_expiry_date: "2027-04-23",
        residence_period: "1年",
      },
    });

    expect(rows.map((r) => [r.permitDate, r.label])).toEqual([
      ["2023-10-05", "特定活動 ビザ許可"],
      ["2024-04-23", "特定技能1号 ビザ許可"],
      ["2025-04-23", "特定技能1号 ビザ許可"],
      ["2026-04-23", "特定技能1号 ビザ許可"],
    ]);
    // いちばん新しい行が今の在留カード
    expect(rows[3]).toMatchObject({ cardNo: "LJ8268506RD", isCurrent: true });
    expect(rows[0].expiryDate).toBe("2024-04-05");
  });

  it("同じ許可が申請一覧とカードの記録の両方にあってもまとめる（更新の言い方を残す）", () => {
    const rows = buildVisaHistory({
      apps: [
        app({
          content: "在留期間更新許可",
          granted_permit_date: "2026-04-23",
          visa_at_grant: "特定技能1号",
        }),
      ],
      cards: [
        {
          residence_card_no: "LJ8268506RD",
          residence_status: "特定技能1号",
          residence_permit_date: "2026-04-23",
          residence_expiry_date: "2027-04-23",
        },
      ],
      current: null,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      label: "特定技能1号 更新許可",
      expiryDate: "2027-04-23",
      cardNo: "LJ8268506RD",
    });
  });

  it("許可日が無い申請・許可されていない申請は出さない", () => {
    const rows = buildVisaHistory({
      apps: [
        app({ content: "在留期間更新許可", approved: false, visa_at_grant: "特定技能1号" }),
        app({ content: "在留期間更新許可", approved: false, approval_date: "2026-01-05" }),
      ],
      cards: [],
      current: null,
    });
    expect(rows).toEqual([]);
  });

  it("手で入れた分は、自動で出る分より優先して出る", () => {
    const rows = buildVisaHistory({
      apps: [
        app({
          content: "在留期間更新許可",
          granted_permit_date: "2026-04-23",
          granted_expiry_date: "2027-04-23",
          visa_at_grant: "特定技能1号",
        }),
      ],
      cards: [],
      current: null,
      manual: [
        {
          id: "m1",
          permit_date: "2022-06-01",
          status: "特定活動",
          kind: "ビザ許可",
          expiry_date: "2023-06-01",
          card_no: "ZZ00000000ZZ",
          note: "紙の記録から入力",
        },
        // 自動で出る分と同じ許可日・在留資格。手で入れたほうに差し替わる
        {
          id: "m2",
          permit_date: "2026-04-23",
          status: "特定技能1号",
          kind: "更新許可",
          expiry_date: "2027-04-23",
          card_no: "LJ8268506RD",
          note: "",
        },
      ],
    });
    expect(rows.map((r) => [r.permitDate, r.label, r.manualId])).toEqual([
      ["2022-06-01", "特定活動 ビザ許可", "m1"],
      ["2026-04-23", "特定技能1号 更新許可", "m2"],
    ]);
    expect(rows[1].cardNo).toBe("LJ8268506RD");
  });

  it("在留許可日が無い申請は許可日で並べる", () => {
    const rows = buildVisaHistory({
      apps: [app({ content: "在留期間更新許可", approved: true, approval_date: "2022-06-01" })],
      cards: [],
      current: null,
    });
    expect(rows[0].permitDate).toBe("2022-06-01");
  });
});

describe("attachVisaHistoryDocs", () => {
  const docs = [
    { kind: "在留カード", url: "card-2024", date: "2024-04-25" },
    { kind: "指定書", url: "shitei-2024", date: "2024-04-26" },
    { kind: "在留カード", url: "card-2026", date: "2026-04-24" },
    { kind: "在留カード", url: "card-2026-new", date: "2026-05-01" },
    // 最初の許可より前に登録した画像は、どの許可にも付けない
    { kind: "在留カード", url: "card-old", date: "2023-01-01" },
  ];

  it("その許可の日から次の許可の前日までに登録した画像を結び付ける", () => {
    const rows = attachVisaHistoryDocs(
      [{ permitDate: "2024-04-23" }, { permitDate: "2026-04-23" }],
      docs,
    );
    expect(rows[0]).toMatchObject({
      residenceCardUrl: "card-2024",
      designationUrl: "shitei-2024",
    });
    // いちばん新しい許可は、それ以降でいちばん新しい画像
    expect(rows[1]).toMatchObject({ residenceCardUrl: "card-2026-new", designationUrl: "" });
  });

  it("許可の日より前の画像しか無ければ空のまま", () => {
    const rows = attachVisaHistoryDocs([{ permitDate: "2026-04-23" }], [
      { kind: "在留カード", url: "card-old", date: "2023-01-01" },
    ]);
    expect(rows[0].residenceCardUrl).toBe("");
  });
});

describe("orgAtDate / groupVisaHistoryByOrg", () => {
  const histories = [
    { org_name: "有限会社 國崎青果", start_date: "2024-04-01", end_date: "2026-08-09", visa: "特定技能1号" },
    { org_name: "西田 博幸", start_date: "2026-08-12", end_date: null, visa: "特定技能1号" },
    // 本国での職歴は所属機関として使わない
    { org_name: "ベトナムの会社", start_date: "2020-01-01", end_date: "2023-12-31", visa: "本国での職歴" },
  ];

  it("その許可の日に在籍していた会社を返す", () => {
    expect(orgAtDate(histories, "2025-04-23")).toBe("有限会社 國崎青果");
    expect(orgAtDate(histories, "2026-09-01")).toBe("西田 博幸");
    // どの在籍期間にも入らない日（入社前・在籍の切れ目）は空
    expect(orgAtDate(histories, "2026-08-10")).toBe("");
    expect(orgAtDate(histories, "2021-05-05")).toBe("");
  });

  it("所属機関ごとにまとめ、いちばん古い許可の順に並べる", () => {
    const groups = groupVisaHistoryByOrg(
      [
        { permitDate: "2026-09-15" },
        { permitDate: "2024-04-23" },
        { permitDate: "2025-04-23" },
        { permitDate: "2021-05-05" }, // 在籍期間に当てはまらない
      ],
      histories,
    );
    expect(groups.map((g) => [g.org, g.rows.map((r) => r.permitDate)])).toEqual([
      ["有限会社 國崎青果", ["2024-04-23", "2025-04-23"]],
      ["西田 博幸", ["2026-09-15"]],
      [NO_ORG_GROUP, ["2021-05-05"]],
    ]);
  });
});
