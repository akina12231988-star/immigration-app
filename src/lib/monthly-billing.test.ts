import { describe, expect, it } from "vitest";
import {
  billingExclusionReason,
  billingRowFor,
  currentMonth,
  daysText,
  invoiceBilledOn,
  invoiceDueOn,
  isBilledInMonth,
  isBillableResidence,
  isMonthStr,
  monthLabel,
  monthRange,
  orgMonthlyFee,
  periodText,
  summarizeMonthlyBilling,
  type BillingOrg,
  type BillingWorker,
} from "./monthly-billing";

const MONTH = "2026-07";

function worker(over: Partial<BillingWorker> & { name: string }): BillingWorker {
  return {
    id: over.name,
    kana: "",
    nationality: "ベトナム",
    gender: "男",
    birth: null,
    residence_status: "特定技能1号",
    residence_card_no: "",
    residence_permit_date: "2025-01-01",
    residence_expiry_date: null,
    employment_start_on: "2025-01-01",
    assigned_office: "",
    residence_note: "",
    recurring_sales_no: "",
    current_organization_id: "org-1",
    support: "支援対象",
    status: "在籍中",
    leaving_on: null,
    ...over,
  };
}

function org(id: string, name: string, fee: string): BillingOrg {
  return { id, name, intake: { support_fee: fee } } as BillingOrg;
}

describe("年月の扱い", () => {
  it("YYYY-MM の形を判定する", () => {
    expect(isMonthStr("2026-07")).toBe(true);
    expect(isMonthStr("2026-13")).toBe(false);
    expect(isMonthStr("2026-7")).toBe(false);
  });

  it("月初・月末を返す", () => {
    expect(monthRange("2026-07")).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("表示用の年月と今月", () => {
    expect(monthLabel("2026-07")).toBe("2026年7月");
    expect(currentMonth("2026-07-31")).toBe("2026-07");
  });
});

describe("isBillableResidence", () => {
  it("特定技能1号と特定活動（特定技能1号移行準備）が対象", () => {
    expect(isBillableResidence("特定技能1号")).toBe(true);
    expect(isBillableResidence("特定技能1号更新")).toBe(true);
    expect(isBillableResidence("特定活動（特定技能1号移行準備）")).toBe(true);
    expect(isBillableResidence("特定技能2号")).toBe(false);
    expect(isBillableResidence("技能実習")).toBe(false);
    expect(isBillableResidence("")).toBe(false);
  });
});

describe("isBilledInMonth（その月に1日でも在籍していたか）", () => {
  it("在籍中の支援対象者は対象", () => {
    expect(isBilledInMonth(worker({ name: "A" }), MONTH)).toBe(true);
  });

  it("月の途中で退職した人も対象（1日でも在籍している）", () => {
    expect(isBilledInMonth(worker({ name: "B", leaving_on: "2026-07-10" }), MONTH)).toBe(true);
  });

  it("前月までに退職した人は対象外", () => {
    expect(isBilledInMonth(worker({ name: "C", leaving_on: "2026-06-30" }), MONTH)).toBe(false);
  });

  it("翌月に許可が下りる人は対象外", () => {
    expect(
      isBilledInMonth(worker({ name: "D", residence_permit_date: "2026-08-01" }), MONTH),
    ).toBe(false);
  });

  it("支援対象外・許可日なしは対象外", () => {
    expect(isBilledInMonth(worker({ name: "E", support: "支援対象外" }), MONTH)).toBe(false);
    expect(isBilledInMonth(worker({ name: "F", residence_permit_date: null }), MONTH)).toBe(false);
  });
});

describe("billingRowFor（1人分の請求額）", () => {
  it("まるまる在籍していれば満額", () => {
    const row = billingRowFor(worker({ name: "A" }), MONTH, 15000);
    expect(row).toMatchObject({ kind: "満額", amount: 15000, days: 31, monthDays: 31 });
    expect(periodText(row)).toBe("2026-07-01〜2026-07-31");
    expect(daysText(row)).toBe("31/31");
  });

  it("その月に支援が始まった人は許可日から日割り（小数点以下は切り捨て）", () => {
    // 1日あたり 15000÷31 = 483（切り捨て）× 8日 = 3,864
    const row = billingRowFor(
      worker({
        name: "B",
        residence_permit_date: "2026-07-24",
        employment_start_on: "2026-08-01",
      }),
      MONTH,
      15000,
    );
    expect(row).toMatchObject({ kind: "許可日から日割", days: 8, amount: 3864 });
    expect(periodText(row)).toBe("2026-07-24〜2026-07-31");
  });

  it("その月に退職した人は退職日まで日割り", () => {
    // 1日あたり 15000÷31 = 483（切り捨て）× 10日 = 4,830
    const row = billingRowFor(worker({ name: "C", leaving_on: "2026-07-10" }), MONTH, 15000);
    expect(row).toMatchObject({ kind: "退職日まで日割", days: 10, amount: 4830, leftThisMonth: true });
    expect(periodText(row)).toBe("2026-07-01〜2026-07-10");
  });

  it("更新でその月に許可が下りた人は日割りせず満額（すでに支援している）", () => {
    const row = billingRowFor(
      worker({
        name: "D",
        residence_status: "特定技能1号更新",
        residence_permit_date: "2026-07-08",
        employment_start_on: "2025-07-28",
      }),
      MONTH,
      15000,
    );
    expect(row).toMatchObject({ kind: "満額（更新月）", amount: 15000, days: 31 });
  });

  it("支援代が未登録なら金額は0", () => {
    expect(billingRowFor(worker({ name: "E" }), MONTH, 0).amount).toBe(0);
  });

  it("月末が31日でない月でも日数で割る", () => {
    // 2026年2月は28日。1日あたり 15000÷28 = 535（切り捨て）× 14日 = 7,490
    const row = billingRowFor(worker({ name: "F", leaving_on: "2026-02-14" }), "2026-02", 15000);
    expect(row).toMatchObject({ days: 14, monthDays: 28, amount: 7490 });
  });
});

describe("orgMonthlyFee", () => {
  it("所属機関の支援代（月額）を数値で返す", () => {
    expect(orgMonthlyFee(org("org-1", "A社", "15000"))).toBe(15000);
    expect(orgMonthlyFee(org("org-1", "A社", "20,000円/人"))).toBe(20000);
    expect(orgMonthlyFee(org("org-1", "A社", ""))).toBe(0);
    expect(orgMonthlyFee(undefined)).toBe(0);
  });
});

describe("summarizeMonthlyBilling", () => {
  const orgs = [org("org-1", "國崎青果", "15000"), org("org-2", "髙濱　伸吉", "10000")];

  it("所属機関ごとに人数・当月退職・請求額をまとめる", () => {
    const workers = [
      worker({ name: "BOEURN DANY" }),
      worker({ name: "CHEN SOLEU" }),
      worker({ name: "LONH SOULIM", leaving_on: "2026-07-10" }),
      worker({ name: "NGUYEN QUANG LAN", current_organization_id: "org-2" }),
      worker({ name: "前月退職", leaving_on: "2026-06-30" }), // 対象外
    ];
    const result = summarizeMonthlyBilling(workers, orgs, MONTH);

    expect(result.month).toBe(MONTH);
    expect(result.monthEndOn).toBe("2026-07-31");
    expect(result.orgs.map((o) => o.organizationName)).toEqual(["國崎青果", "髙濱　伸吉"]);

    const kunisaki = result.orgs[0];
    expect(kunisaki.rows.map((r) => r.worker.name)).toEqual([
      "BOEURN DANY",
      "CHEN SOLEU",
      "LONH SOULIM",
    ]);
    expect(kunisaki.leftCount).toBe(1);
    // 15000 + 15000 + 4830（483円×10日）
    expect(kunisaki.total).toBe(34830);

    expect(result.totalPeople).toBe(4);
    expect(result.totalLeft).toBe(1);
    expect(result.totalAmount).toBe(34830 + 10000);
  });

  it("支援代が未登録の機関の人を拾い出す", () => {
    const result = summarizeMonthlyBilling(
      [worker({ name: "A", current_organization_id: "org-9" })],
      [org("org-9", "未登録社", "")],
      MONTH,
    );
    expect(result.unpriced.map((r) => r.worker.name)).toEqual(["A"]);
    expect(result.totalAmount).toBe(0);
  });

  it("所属機関が未設定の人もまとめて出す", () => {
    const result = summarizeMonthlyBilling(
      [worker({ name: "A", current_organization_id: null })],
      orgs,
      MONTH,
    );
    expect(result.orgs[0].organizationName).toBe("所属機関未設定");
  });
});

describe("billingExclusionReason（名簿に載らない理由）", () => {
  const base = {
    id: "W",
    name: "TEST",
    kana: "",
    nationality: "",
    gender: "",
    birth: null,
    residence_status: "特定技能1号",
    residence_card_no: "",
    residence_permit_date: "2026-07-01",
    residence_expiry_date: null,
    employment_start_on: null,
    assigned_office: "",
    residence_note: "",
    recurring_sales_no: "",
    current_organization_id: "org-1",
    support: "支援対象",
    status: "在籍中",
    leaving_on: null,
  } as BillingWorker;

  it("名簿に載る人と支援対象でない人は null", () => {
    expect(billingExclusionReason(base, "2026-08")).toBeNull();
    expect(billingExclusionReason({ ...base, support: "支援対象外" }, "2026-08")).toBeNull();
  });
  it("在留資格が対象外・未設定", () => {
    expect(billingExclusionReason({ ...base, residence_status: "技能実習" }, "2026-08")).toBe(
      "在留資格が対象外（技能実習）",
    );
    expect(billingExclusionReason({ ...base, residence_status: "" }, "2026-08")).toBe(
      "在留資格が未設定",
    );
  });
  it("在留許可日が未登録・対象月より後", () => {
    expect(
      billingExclusionReason({ ...base, residence_permit_date: null }, "2026-08"),
    ).toBe("在留許可日が未登録");
    expect(
      billingExclusionReason({ ...base, residence_permit_date: "2026-09-15" }, "2026-08"),
    ).toBe("在留許可日が対象月より後（2026-09-15）");
  });
  it("対象月より前に退職済み", () => {
    expect(billingExclusionReason({ ...base, leaving_on: "2026-07-20" }, "2026-08")).toBe(
      "対象月より前に退職済み（退職日 2026-07-20）",
    );
    // 対象月内の退職は名簿に載る（退職日まで日割）ので null
    expect(billingExclusionReason({ ...base, leaving_on: "2026-08-10" }, "2026-08")).toBeNull();
  });
});

describe("請求日・支払期限", () => {
  it("請求日は対象月の翌月1日", () => {
    expect(invoiceBilledOn("2026-06")).toBe("2026-07-01");
    expect(invoiceBilledOn("2026-08")).toBe("2026-09-01");
  });
  it("年をまたぐ対象月でも翌年1月1日になる", () => {
    expect(invoiceBilledOn("2026-12")).toBe("2027-01-01");
    expect(invoiceDueOn("2026-12")).toBe("2027-01-31");
  });
  it("支払期限は請求日と同じ月の末日（うるう年も正しい）", () => {
    expect(invoiceDueOn("2026-06")).toBe("2026-07-31");
    expect(invoiceDueOn("2028-01")).toBe("2028-02-29");
  });
  it("年月の形でなければ空文字", () => {
    expect(invoiceBilledOn("2026-13")).toBe("");
    expect(invoiceDueOn("")).toBe("");
  });
});
