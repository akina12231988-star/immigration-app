import { describe, expect, it } from "vitest";
import { summarizeMonthlyBilling, type BillingOrg, type BillingWorker } from "./monthly-billing";
import {
  ROSTER_HEADERS,
  billingFileName,
  leftThisMonthSheet,
  monthlyBillingSheets,
  orgBillingSheets,
  permittedThisMonthSheet,
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
    org_employment_starts: [],
    leaving_org_name: "",
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
    // 15000 + 4830（483円×10日）
    expect(sheet.rows[4]).toEqual(["（通貨💰）髙濱　伸吉", 1, 0, 10000]);
    expect(sheet.rows[5]).toEqual(["有限会社　國崎青果", 2, 1, 19830]);
    expect(sheet.rows[6]).toEqual(["合計", 3, 1, 29830]);
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
    expect(second[19]).toBe(4830);
    expect(second[20]).toBe("退職");
    expect(second[21]).toBe("2026-07-10");

    // 末尾に合計行
    expect(sheet.rows[sheet.rows.length - 1][19]).toBe(19830);
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
    expect(row[19]).toBe(7245); // 1日あたり 15000÷31 = 483（切り捨て）× 15日
  });
});

describe("monthlyBillingSheets / billingFileName", () => {
  it("サマリー・当月許可者・当月退職者のあとに機関ごとの名簿が並ぶ", () => {
    const sheets = monthlyBillingSheets(billing);
    expect(sheets.map((s) => s.name)).toEqual([
      "サマリー",
      "当月許可者",
      "当月退職者",
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

describe("当月許可者・当月退職者のシート", () => {
  // 新規（許可日から日割）・更新（満額（更新月））・前月以前の許可・当月退職を混ぜる
  const mixed = summarizeMonthlyBilling(
    [
      worker({ name: "以前から在籍" }), // 許可日2025-01-01。許可者リストには載らない
      worker({
        name: "新規のひと",
        residence_permit_date: "2026-07-24",
        employment_start_on: "2026-08-01",
      }),
      worker({
        name: "更新のひと",
        residence_permit_date: "2026-07-08",
        employment_start_on: "2025-07-28",
      }),
      worker({ name: "退職のひと", leaving_on: "2026-07-10" }),
    ],
    orgs,
    MONTH,
  );

  it("当月許可者は許可日が対象月の人だけ・許可日の古い順", () => {
    const sheet = permittedThisMonthSheet(mixed);
    expect(sheet.name).toBe("当月許可者");
    const names = sheet.rows.slice(4).map((r) => r[2]);
    expect(names).toEqual(["更新のひと", "新規のひと"]); // 7/8 → 7/24
    // 新規と更新は区分で見分けられる
    const kinds = sheet.rows.slice(4).map((r) => r[11]);
    expect(kinds).toEqual(["満額（更新月）", "許可日から日割"]);
    expect(sheet.rows[1]).toContain("2名");
  });

  it("当月退職者は退職日が対象月の人だけ", () => {
    const sheet = leftThisMonthSheet(mixed);
    expect(sheet.name).toBe("当月退職者");
    const rows = sheet.rows.slice(4);
    expect(rows.map((r) => r[2])).toEqual(["退職のひと"]);
    expect(rows[0][6]).toBe("2026-07-10"); // 退職日
    expect(sheet.rows[1]).toContain("1名");
  });

  it("該当者がいなければその旨を書く", () => {
    const none = summarizeMonthlyBilling([worker({ name: "以前から在籍" })], orgs, MONTH);
    expect(permittedThisMonthSheet(none).rows.at(-1)).toEqual([
      "当月に在留許可が下りた方はいません。",
    ]);
    expect(leftThisMonthSheet(none).rows.at(-1)).toEqual(["当月に退職された方はいません。"]);
  });

  it("ブックはサマリー・当月許可者・当月退職者・機関ごとの名簿の順に並ぶ", () => {
    const sheets = monthlyBillingSheets(mixed);
    expect(sheets.slice(0, 3).map((s) => s.name)).toEqual([
      "サマリー",
      "当月許可者",
      "当月退職者",
    ]);
  });
});
