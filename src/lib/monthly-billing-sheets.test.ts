import { describe, expect, it } from "vitest";
import { summarizeMonthlyBilling, type BillingOrg, type BillingWorker } from "./monthly-billing";
import {
  ROSTER_HEADERS,
  billingFileName,
  monthlyBillingSheets,
  orgBillingSheets,
  summarySheet,
} from "./monthly-billing-sheets";

const MONTH = "2026-07";

function worker(over: Partial<BillingWorker> & { name: string }): BillingWorker {
  return {
    id: over.name,
    kana: "",
    nationality: "ベトナム",
    gender: "男",
    birth: "1995-09-13",
    residence_status: "特定技能1号",
    residence_card_no: "LJ20522488RG",
    residence_permit_date: "2025-01-01",
    residence_expiry_date: "2027-01-01",
    employment_start_on: "2025-01-01",
    assigned_office: "熊本",
    residence_note: "社宅",
    recurring_sales_no: "SP-0000000225",
    current_organization_id: "org-1",
    support: "支援対象",
    status: "在籍中",
    leaving_on: null,
    ...over,
  };
}

const orgs: BillingOrg[] = [
  { id: "org-1", name: "有限会社　國崎青果", intake: { support_fee: "15000" } } as BillingOrg,
  { id: "org-2", name: "（通貨💰）髙濱　伸吉", intake: { support_fee: "10000" } } as BillingOrg,
];

const billing = summarizeMonthlyBilling(
  [
    worker({ name: "BOEURN DANY" }),
    worker({ name: "LONH SOULIM", leaving_on: "2026-07-10" }),
    worker({ name: "NGUYEN QUANG LAN", current_organization_id: "org-2" }),
  ],
  orgs,
  MONTH,
);

describe("summarySheet", () => {
  it("サマリーは機関ごとの人数・当月退職・請求額合計に合計行がつく", () => {
    const sheet = summarySheet(billing);
    expect(sheet.name).toBe("サマリー");
    expect(sheet.rows[0]).toEqual(["在籍名簿サマリー"]);
    expect(sheet.rows[1]).toEqual(["基準日", "2026-07-31"]);
    expect(sheet.rows[3]).toEqual(["所属機関", "掲載人数", "うち当月退職", "支援費請求額合計"]);
    // 15000 + 4838（10/31日割り）
    expect(sheet.rows[4]).toEqual(["（通貨💰）髙濱　伸吉", 1, 0, 10000]);
    expect(sheet.rows[5]).toEqual(["有限会社　國崎青果", 2, 1, 19838]);
    expect(sheet.rows[6]).toEqual(["合計", 3, 1, 29838]);
  });
});

describe("orgBillingSheets", () => {
  it("機関ごとの在籍名簿は見出しと1人1行", () => {
    const kunisaki = billing.orgs.find((o) => o.organizationId === "org-1")!;
    const [sheet] = orgBillingSheets(kunisaki, billing);
    expect(sheet.name).toBe("有限会社　國崎青果");
    expect(sheet.rows[0]).toEqual(["在籍名簿（有限会社　國崎青果）"]);
    expect(sheet.rows[1]).toEqual(["基準日", "2026-07-31", "掲載人数", "2名（うち当月退職 1名）"]);
    expect(sheet.rows[3]).toEqual([...ROSTER_HEADERS]);

    const [first, second] = sheet.rows.slice(4, 6);
    expect(first[1]).toBe("BOEURN DANY");
    expect(first[14]).toBe("SP-0000000225"); // 定期売上No.
    expect(first[15]).toBe(15000); // 支援代（月額）
    expect(first[16]).toBe("2026-07-01〜2026-07-31");
    expect(first[17]).toBe("31/31");
    expect(first[18]).toBe("満額");
    expect(first[19]).toBe(15000);
    expect(first[20]).toBe("在籍中");

    expect(second[1]).toBe("LONH SOULIM");
    expect(second[18]).toBe("退職日まで日割");
    expect(second[19]).toBe(4838);
    expect(second[20]).toBe("退職");
    expect(second[21]).toBe("2026-07-10");

    // 末尾に合計行
    expect(sheet.rows[sheet.rows.length - 1][19]).toBe(19838);
  });

  it("その月に許可が下りた人は当月許可に印がつく", () => {
    const b = summarizeMonthlyBilling(
      [
        worker({
          name: "CHU THI SAM",
          residence_permit_date: "2026-07-17",
          employment_start_on: "2026-07-18",
        }),
      ],
      orgs,
      MONTH,
    );
    const [sheet] = orgBillingSheets(b.orgs[0], b);
    const row = sheet.rows[4];
    expect(row[9]).toBe("⭕"); // 当月許可
    expect(row[18]).toBe("許可日から日割");
    expect(row[19]).toBe(7258); // 15000 × 15/31 = 7258.06… → 7258
  });
});

describe("monthlyBillingSheets / billingFileName", () => {
  it("1シート目がサマリー、以降が機関ごと", () => {
    const sheets = monthlyBillingSheets(billing);
    expect(sheets.map((s) => s.name)).toEqual([
      "サマリー",
      "（通貨💰）髙濱　伸吉",
      "有限会社　國崎青果",
    ]);
  });

  it("ファイル名に年月（と機関名）が入る", () => {
    expect(billingFileName(billing)).toBe("在籍名簿_2026年7月.xlsx");
    expect(billingFileName(billing, "有限会社　國崎青果")).toBe(
      "在籍名簿_2026年7月_有限会社　國崎青果.xlsx",
    );
  });
});
