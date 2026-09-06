import { describe, expect, it } from "vitest";
import {
  buildVisaHistory,
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
