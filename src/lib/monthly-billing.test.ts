import { describe, expect, it } from "vitest";
import {
  billingExclusionReason,
  billingRowFor,
  currentMonth,
  currentOrgLeavingOn,
  implausibleDateNote,
  isPlausibleYmd,
  daysText,
  invoiceBilledOn,
  invoiceDueOn,
  referralBilledOnPatch,
  isBilledInMonth,
  isBillableResidence,
  isMonthStr,
  monthLabel,
  monthRange,
  orgMonthlyFee,
  periodText,
  recurringSalesNoForRow,
  leftThisMonthRows,
  permittedThisMonthRows,
  summarizeMonthlyBilling,
  markBeforeSsw2,
  supportedBeforeSsw2,
  ssw2SupportEndOnFirstDay,
  type BillingOrg,
  employmentStartForOrg,
  rosterOrderRows,
  sortRowsByEmploymentStart,
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
    residence_renewal_status: "",
    leaving_on: null,
    org_employment_starts: [],
    leaving_org_name: "",
    past_recurring_sales: [],
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
    // 全角の数字で登録されていても同じ（「在留資格が対象外」と出て名簿から抜けないように）
    expect(isBillableResidence("特定技能１号")).toBe(true);
    expect(isBillableResidence("特定活動（特定技能１号移行準備）")).toBe(true);
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

  it("「請求しない」の人は名簿に載せたまま0円・区分「請求しない」で合計から外す", () => {
    const workers = [worker({ name: "BOEURN DANY" }), worker({ name: "CHEN SOLEU" })];
    const result = summarizeMonthlyBilling(
      workers,
      orgs,
      MONTH,
      new Set(["CHEN SOLEU"]), // worker() は name を id に使う
    );
    const kunisaki = result.orgs[0];
    expect(kunisaki.rows.map((r) => [r.worker.name, r.kind, r.amount])).toEqual([
      ["BOEURN DANY", "満額", 15000],
      ["CHEN SOLEU", "請求しない", 0],
    ]);
    expect(kunisaki.total).toBe(15000);
    expect(result.totalAmount).toBe(15000);
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
    residence_renewal_status: "",
    leaving_on: null,
  } as BillingWorker;

  it("名簿に載る人は null", () => {
    expect(billingExclusionReason(base, "2026-08")).toBeNull();
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

// 8月に更新許可が下りた人は、workers の在留許可日が2026-08-05に上書きされる。
// 7月分では「その月にはすでに在籍していた」印を立てて名簿に載せるが、
// 在留許可日は実際の値のままにする（名簿・エクセルに本当の許可日を出すため）
describe("更新許可からその月の在籍が分かっている人", () => {
  const renewed = worker({
    name: "DOEU",
    residence_permit_date: "2026-08-05",
    employment_start_on: "2025-04-01",
    resident_before_month: true,
  });

  it("在留許可日が対象月より後でも名簿に載る", () => {
    expect(isBilledInMonth(renewed, MONTH)).toBe(true);
    expect(billingExclusionReason(renewed, MONTH)).toBeNull();
  });

  it("印が無ければこれまでどおり名簿から外れる", () => {
    const without = { ...renewed, resident_before_month: false };
    expect(isBilledInMonth(without, MONTH)).toBe(false);
    expect(billingExclusionReason(without, MONTH)).toBe("在留許可日が対象月より後（2026-08-05）");
  });

  it("満額で、在留許可日は実際の値のまま", () => {
    const row = billingRowFor(renewed, MONTH, 15000);
    expect(row.kind).toBe("満額");
    expect(row.amount).toBe(15000);
    expect(row.periodFrom).toBe("2026-07-01");
    expect(row.periodTo).toBe("2026-07-31");
    // 差し替えていないので、表示に使う在留許可日は実際の許可日のまま
    expect(row.worker.residence_permit_date).toBe("2026-08-05");
  });

  it("その月に退職していれば退職日まで日割りになる", () => {
    const row = billingRowFor({ ...renewed, leaving_on: "2026-07-10" }, MONTH, 31000);
    expect(row.kind).toBe("退職日まで日割");
    expect(row.periodFrom).toBe("2026-07-01");
    expect(row.periodTo).toBe("2026-07-10");
  });

  it("支援区分が支援対象でなければ理由を出す", () => {
    expect(billingExclusionReason({ ...renewed, support: "支援開始前" }, MONTH)).toBe(
      "支援区分が「支援開始前」のまま（請求するなら「支援対象」に変えてください）",
    );
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

describe("支援区分が理由で名簿に載らない人", () => {
  const base = worker({ name: "TEST", residence_permit_date: "2026-07-01" });

  it("ほかの条件を満たしているのに支援開始前のままなら理由を出す", () => {
    expect(billingExclusionReason({ ...base, support: "支援開始前" }, MONTH)).toBe(
      "支援区分が「支援開始前」のまま（請求するなら「支援対象」に変えてください）",
    );
  });

  it("支援対象外も同じように出す（変え忘れを拾うため）", () => {
    expect(billingExclusionReason({ ...base, support: "支援対象外" }, MONTH)).toBe(
      "支援区分が「支援対象外」のまま（請求するなら「支援対象」に変えてください）",
    );
  });

  it("在留資格から対象外の人は挙げない（特定技能2号など）", () => {
    expect(
      billingExclusionReason(
        { ...base, support: "支援対象外", residence_status: "特定技能2号" },
        MONTH,
      ),
    ).toBeNull();
  });

  it("前月までに退職した人・翌月に許可が下りる人も挙げない", () => {
    expect(
      billingExclusionReason({ ...base, support: "支援対象外", leaving_on: "2026-06-30" }, MONTH),
    ).toBeNull();
    expect(
      billingExclusionReason(
        { ...base, support: "支援開始前", residence_permit_date: "2026-08-01" },
        MONTH,
      ),
    ).toBeNull();
  });
});

describe("referralBilledOnPatch（紹介手数料台帳の請求年月日の自動入力）", () => {
  it("番号を入れたときは対象月の請求日（翌月1日）。すでに入っていればそのまま", () => {
    expect(referralBilledOnPatch(null, "2026-09")).toBe("2026-10-01");
    expect(referralBilledOnPatch("", "2026-09")).toBe("2026-10-01");
    expect(referralBilledOnPatch("2026-08-01", "2026-09")).toBe("2026-08-01");
    expect(referralBilledOnPatch(null, "bad")).toBeNull();
  });
  it("入金を記録したときに請求年月日が空なら入金日", () => {
    expect(referralBilledOnPatch(null, "2026-09", "2026-07-30")).toBe("2026-07-30");
    expect(referralBilledOnPatch("2026-08-01", "2026-09", "2026-07-30")).toBe("2026-08-01");
  });
});

describe("雇用開始日の年の打ち間違い（0206-09-04 など）", () => {
  it("1900〜2100年の日付だけ妥当", () => {
    expect(isPlausibleYmd("2026-09-04")).toBe(true);
    expect(isPlausibleYmd("0206-09-04")).toBe(false);
    expect(isPlausibleYmd("2206-09-04")).toBe(false);
    expect(isPlausibleYmd("")).toBe(false);
    expect(isPlausibleYmd(null)).toBe(false);
    expect(implausibleDateNote("0206-09-04")).toContain("日付が不正です（0206-09-04）");
    expect(implausibleDateNote("2026-09-04")).toBeNull();
    expect(implausibleDateNote("")).toBeNull();
  });

  it("不正な雇用開始日は未登録あつかいにして、許可月は新規として許可日から日割りする", () => {
    // ZIKRIYUL FAHMI の例: 9/3 許可、雇用開始日が 0206-09-04 と入っていた
    const w = worker({
      name: "ZIKRIYUL FAHMI",
      residence_permit_date: "2026-09-03",
      employment_start_on: "0206-09-04",
    });
    const row = billingRowFor(w, "2026-09", 15000);
    expect(row.kind).toBe("許可日から日割");
    expect(row.periodFrom).toBe("2026-09-03");
    expect(row.days).toBe(28);
    // 正しい日付なら同じ結果、対象月より前の雇用開始日なら更新月の満額
    expect(billingRowFor({ ...w, employment_start_on: "2026-09-04" }, "2026-09", 15000).kind).toBe("許可日から日割");
    expect(billingRowFor({ ...w, employment_start_on: "2024-09-04" }, "2026-09", 15000).kind).toBe("満額（更新月）");
  });
});

describe("当月中の転職（前の機関を退職 → 新しい機関で開始）", () => {
  // LE THI DIU の例: 8/9 に org-old を退職し、8/10 に org-new で許可・雇用開始
  const transferWorker = () =>
    worker({
      name: "LE THI DIU",
      residence_permit_date: "2026-08-10",
      employment_start_on: "2026-08-10",
      leaving_on: "2026-08-09",
      current_organization_id: "org-new",
      org_employment_starts: [
        { organization_id: "org-old", start_on: "2024-04-01", contract_on: "", conditions_on: "" },
        { organization_id: "org-new", start_on: "2026-08-10", contract_on: "", conditions_on: "" },
      ],
      leaving_org_name: "前の会社",
    });
  const orgs = [org("org-old", "前の会社", "10,000円"), org("org-new", "新しい会社", "10,000円")];

  it("新しい機関の行は許可日から日割（退職あつかいにしない）", () => {
    const billing = summarizeMonthlyBilling([transferWorker()], orgs, "2026-08");
    const newOrg = billing.orgs.find((o) => o.organizationId === "org-new")!;
    expect(newOrg.rows).toHaveLength(1);
    const row = newOrg.rows[0];
    expect(row.kind).toBe("許可日から日割");
    expect(row.periodFrom).toBe("2026-08-10");
    expect(row.periodTo).toBe("2026-08-31");
    expect(row.days).toBe(22);
    expect(row.amount).toBe(Math.floor(10000 / 31) * 22); // 322円 × 22日 = 7,084円
    expect(row.leftThisMonth).toBe(false);
    expect(newOrg.leftCount).toBe(0);
  });

  it("前の機関には退職日までの日割りの行が出る", () => {
    const billing = summarizeMonthlyBilling([transferWorker()], orgs, "2026-08");
    const oldOrg = billing.orgs.find((o) => o.organizationId === "org-old")!;
    expect(oldOrg.rows).toHaveLength(1);
    const row = oldOrg.rows[0];
    expect(row.kind).toBe("退職日まで日割");
    expect(row.periodFrom).toBe("2026-08-01");
    expect(row.periodTo).toBe("2026-08-09");
    expect(row.days).toBe(9);
    expect(row.amount).toBe(Math.floor(10000 / 31) * 9); // 322円 × 9日 = 2,898円
    expect(row.leftThisMonth).toBe(true);
    expect(row.transferredOut).toBe(true);
    expect(oldOrg.leftCount).toBe(1);
  });

  it("許可者リストには新しい機関の行だけ出る（前の機関の退職精算は出さない）", () => {
    const billing = summarizeMonthlyBilling([transferWorker()], orgs, "2026-08");
    const permitted = permittedThisMonthRows(billing);
    expect(permitted).toHaveLength(1);
    expect(permitted[0].org.organizationId).toBe("org-new");
  });

  it("退職者リストには前の機関の行が出る", () => {
    const billing = summarizeMonthlyBilling([transferWorker()], orgs, "2026-08");
    const left = leftThisMonthRows(billing);
    expect(left).toHaveLength(1);
    expect(left[0].org.organizationId).toBe("org-old");
  });

  // 転職の翌月以降: 退職日（前の機関のもの）が残っていても、今の機関では在籍中として満額で載る
  it("翌月以降は、前の機関の退職日が残っていても今の機関の名簿に満額で載る", () => {
    const w = transferWorker();
    expect(currentOrgLeavingOn(w)).toBeNull();
    expect(isBilledInMonth(w, "2026-09")).toBe(true);
    expect(billingExclusionReason(w, "2026-09")).toBeNull();
    const billing = summarizeMonthlyBilling([w], orgs, "2026-09");
    expect(billing.orgs).toHaveLength(1);
    expect(billing.orgs[0].organizationId).toBe("org-new");
    const row = billing.orgs[0].rows[0];
    expect(row.kind).toBe("満額");
    expect(row.amount).toBe(10000);
    expect(row.leftThisMonth).toBe(false);
    // 前の機関には行が出ない（転職月だけ退職精算の行が出る）
    expect(leftThisMonthRows(billing)).toHaveLength(0);
  });

  it("所属機関別の記録が無くても、雇用開始年月日が退職日より後なら今の機関では在籍中", () => {
    const w = { ...transferWorker(), org_employment_starts: [] };
    expect(currentOrgLeavingOn(w)).toBeNull();
    expect(isBilledInMonth(w, "2026-09")).toBe(true);
  });

  it("今の機関で雇用が始まったあとに退職した人は、これまでどおり退職日で判定する", () => {
    const w = worker({
      name: "退職した人",
      employment_start_on: "2025-01-01",
      leaving_on: "2026-08-09",
      current_organization_id: "org-old",
      org_employment_starts: [{ organization_id: "org-old", start_on: "2025-01-01", contract_on: "", conditions_on: "" }],
    });
    expect(currentOrgLeavingOn(w)).toBe("2026-08-09");
    expect(isBilledInMonth(w, "2026-09")).toBe(false);
    expect(billingExclusionReason(w, "2026-09")).toBe("対象月より前に退職済み（退職日 2026-08-09）");
    // 退職月は退職日まで日割り
    const billing = summarizeMonthlyBilling([w], [org("org-old", "前の会社", "10,000円")], "2026-08");
    expect(billing.orgs[0].rows[0].kind).toBe("退職日まで日割");
    expect(billing.orgs[0].rows[0].periodTo).toBe("2026-08-09");
  });

  it("前の機関が分からないときは、新しい機関の行だけ（退職あつかいにしない）", () => {
    const w = { ...transferWorker(), org_employment_starts: [] };
    const billing = summarizeMonthlyBilling([w], orgs, "2026-08");
    expect(billing.orgs).toHaveLength(1);
    const row = billing.orgs[0].rows[0];
    expect(row.kind).toBe("許可日から日割");
    expect(row.periodTo).toBe("2026-08-31");
  });

  it("同じ機関で許可のあとに退職した人は今までどおり1行（転職あつかいにしない）", () => {
    const w = worker({
      name: "普通の退職",
      residence_permit_date: "2026-08-05",
      employment_start_on: "2026-08-05",
      leaving_on: "2026-08-20",
      current_organization_id: "org-new",
    });
    const billing = summarizeMonthlyBilling([w], orgs, "2026-08");
    expect(billing.orgs).toHaveLength(1);
    const row = billing.orgs[0].rows[0];
    expect(row.kind).toBe("許可日から日割");
    expect(row.periodFrom).toBe("2026-08-05");
    expect(row.periodTo).toBe("2026-08-20");
    expect(row.leftThisMonth).toBe(true);
  });
});

describe("recurringSalesNoForRow（転職者の前の機関の行は過去の番号）", () => {
  const orgs2 = [org("org-old", "前の会社", "10,000円"), org("org-new", "新しい会社", "10,000円")];
  const w = () =>
    worker({
      name: "LE THI DIU",
      residence_permit_date: "2026-08-10",
      employment_start_on: "2026-08-10",
      leaving_on: "2026-08-09",
      current_organization_id: "org-new",
      recurring_sales_no: "SP-0000000391",
      org_employment_starts: [
        { organization_id: "org-old", start_on: "2024-04-01", contract_on: "", conditions_on: "" },
        { organization_id: "org-new", start_on: "2026-08-10", contract_on: "", conditions_on: "" },
      ],
      past_recurring_sales: [{ organization_id: "org-old", sales_no: "SP-0000000327" }],
    });

  it("前の機関の行は過去の定期売上No.、新しい機関の行は現在の番号", () => {
    const billing = summarizeMonthlyBilling([w()], orgs2, "2026-08");
    const oldRow = billing.orgs.find((o) => o.organizationId === "org-old")!.rows[0];
    const newRow = billing.orgs.find((o) => o.organizationId === "org-new")!.rows[0];
    expect(recurringSalesNoForRow(oldRow, "org-old")).toBe("SP-0000000327");
    expect(recurringSalesNoForRow(newRow, "org-new")).toBe("SP-0000000391");
  });

  it("過去の番号が未登録なら空（画面では「—」）", () => {
    const noPast = { ...w(), past_recurring_sales: [] };
    const billing = summarizeMonthlyBilling([noPast], orgs2, "2026-08");
    const oldRow = billing.orgs.find((o) => o.organizationId === "org-old")!.rows[0];
    expect(recurringSalesNoForRow(oldRow, "org-old")).toBe("");
  });
});

describe("特定技能2号への移行月（許可日の前日まで日割りで支援終了）", () => {
  const orgs2 = [org("org-1", "田中輝久", "10,000円")];
  const ssw2 = (over: Partial<BillingWorker> = {}) =>
    worker({
      name: "TRAN THI LAN PHUONG",
      residence_status: "特定技能2号",
      residence_permit_date: "2026-08-24",
      employment_start_on: "2022-07-29",
      ...over,
    });

  it("2号の許可月は、月初〜許可日の前日の日割りで名簿に載る", () => {
    const billing = summarizeMonthlyBilling([ssw2()], orgs2, "2026-08");
    expect(billing.orgs).toHaveLength(1);
    const row = billing.orgs[0].rows[0];
    expect(row.kind).toBe("2号移行前日まで日割");
    expect(row.periodFrom).toBe("2026-08-01");
    expect(row.periodTo).toBe("2026-08-23");
    expect(row.days).toBe(23);
    expect(row.amount).toBe(Math.floor(10000 / 31) * 23); // 322円 × 23日 = 7,406円
    expect(billingExclusionReason(ssw2(), "2026-08")).toBe(null);
  });

  it("支援区分を支援対象外に変えたあとも、移行月の行は出る", () => {
    const billing = summarizeMonthlyBilling([ssw2({ support: "支援対象外" })], orgs2, "2026-08");
    expect(billing.orgs[0].rows[0].kind).toBe("2号移行前日まで日割");
  });

  it("移行月の翌月からは請求しない（支援区分の変え忘れは除外理由で知らせる）", () => {
    const billing = summarizeMonthlyBilling([ssw2()], orgs2, "2026-09");
    expect(billing.orgs).toHaveLength(0);
    expect(billingExclusionReason(ssw2(), "2026-09")).toContain("在留資格が対象外");
  });

  it("2号の更新許可の月は対象にしない（支援はすでに終わっている）", () => {
    const renewed = ssw2({ residence_status: "特定技能2号更新" });
    const billing = summarizeMonthlyBilling([renewed], orgs2, "2026-08");
    expect(billing.orgs).toHaveLength(0);
  });

  it("許可日が1日のときは前日が前月になるため、その月の請求は無し", () => {
    const firstDay = ssw2({ residence_permit_date: "2026-08-01" });
    const billing = summarizeMonthlyBilling([firstDay], orgs2, "2026-08");
    expect(billing.orgs).toHaveLength(0);
  });
});

describe("employmentStartForOrg / sortRowsByEmploymentStart", () => {
  const ORG = "org-1";

  it("所属機関別の雇用開始日を優先し、無ければ雇用開始年月日を使う", () => {
    expect(
      employmentStartForOrg(
        {
          employment_start_on: "2026-01-01",
          org_employment_starts: [{ organization_id: ORG, start_on: "2026-04-01" }],
        },
        ORG,
      ),
    ).toBe("2026-04-01");
    // 別の機関の記録しか無いときは雇用開始年月日
    expect(
      employmentStartForOrg(
        {
          employment_start_on: "2026-01-01",
          org_employment_starts: [{ organization_id: "other", start_on: "2026-04-01" }],
        },
        ORG,
      ),
    ).toBe("2026-01-01");
    // どちらも無ければ空
    expect(
      employmentStartForOrg({ employment_start_on: null, org_employment_starts: [] }, ORG),
    ).toBe("");
  });

  it("rosterOrderRows は名簿のNo.の並び（雇用開始日の古い順）を返す", () => {
    // エクセルの在籍名簿と、請求書と照合で押すPDFのNo.は、必ずこの並びで振る
    const row = (name: string, start: string | null) => ({
      worker: worker({ name, employment_start_on: start }),
    });
    const rows = [
      row("B", "2026-05-01"),
      row("A", "2025-04-01"),
      row("C", null),
    ] as unknown as Parameters<typeof sortRowsByEmploymentStart>[0];
    const ordered = rosterOrderRows({ organizationId: ORG, rows });
    expect(ordered.map((r) => r.worker.name)).toEqual(["A", "B", "C"]);
    // 渡した配列は並べ替えない（画面の並びに影響しない）
    expect(rows.map((r) => r.worker.name)).toEqual(["B", "A", "C"]);
  });

  it("雇用開始日の古い順に並べ、未登録は最後・同じ日は氏名順にする", () => {
    const row = (name: string, start: string | null) => ({
      worker: worker({ name, employment_start_on: start }),
    });
    const rows = [
      row("B", "2026-05-01"),
      row("X", null),
      row("A", "2026-05-01"),
      row("C", "2025-04-01"),
    ] as unknown as Parameters<typeof sortRowsByEmploymentStart>[0];
    expect(sortRowsByEmploymentStart(rows, ORG).map((r) => r.worker.name)).toEqual([
      "C",
      "A",
      "B",
      "X",
    ]);
    // 新しい順（降順）でも未登録は最後
    expect(sortRowsByEmploymentStart(rows, ORG, "desc").map((r) => r.worker.name)).toEqual([
      "A",
      "B",
      "C",
      "X",
    ]);
  });
});

describe("特定技能2号になった人の、2号の許可日より前の月", () => {
  // 9月までは特定活動（1号側）で支援、10月1日に特定技能2号の許可
  const w = worker({
    name: "THUY",
    residence_status: "特定技能2号",
    residence_permit_date: "2026-10-01",
    employment_start_on: "2025-04-01",
    support: "支援対象外",
  });

  it("2号の許可日より前の月は、支援対象外に変わっていても支援していた月として拾う", () => {
    expect(supportedBeforeSsw2(w, "2026-09")).toBe(true);
    expect(supportedBeforeSsw2(w, "2026-08")).toBe(true);
    // 許可月・それ以降は対象外（許可月は移行月の処理、以降は支援なし）
    expect(supportedBeforeSsw2(w, "2026-10")).toBe(false);
    expect(supportedBeforeSsw2(w, "2026-11")).toBe(false);
    // 2号移行準備の特定活動も2号側として同じ
    expect(supportedBeforeSsw2({ ...w, residence_status: "特定活動（特定技能2号移行準備）" }, "2026-09")).toBe(true);
    // 1号のままの人・その月より後に雇用が始まる人・その月より前に退職した人は拾わない
    expect(supportedBeforeSsw2({ ...w, residence_status: "特定技能1号" }, "2026-09")).toBe(false);
    expect(supportedBeforeSsw2({ ...w, employment_start_on: "2026-10-01" }, "2026-09")).toBe(false);
    expect(supportedBeforeSsw2({ ...w, leaving_on: "2026-08-20" }, "2026-09")).toBe(false);
  });

  it("その月の在留資格が履歴から分かる（2号以外）ときだけ、2号許可前の行として満額で載せる", () => {
    // 在留資格がまだ2号のまま（その月の在留資格が分からない）なら載せない
    expect(markBeforeSsw2(w)).toBeNull();
    const billed = markBeforeSsw2({ ...w, residence_status: "特定活動（特定技能1号移行準備）" })!;
    expect(billed.support).toBe("支援対象");
    expect(billed.residence_status).toBe("特定活動（特定技能1号移行準備）");
    expect(isBilledInMonth(billed, "2026-09")).toBe(true);
    // 載せなかった人には理由を出す
    expect(billingExclusionReason({ ...w, before_ssw2_unknown: true }, "2026-09")).toContain("在留資格が履歴に無いため");
    const billing = summarizeMonthlyBilling([billed], [org("org-1", "BASE株式会社", "15000")], "2026-09");
    expect(billing.orgs[0].rows[0].kind).toBe("満額");
    expect(billing.orgs[0].rows[0].amount).toBe(15000);
  });

  it("2号の許可日が1日の人は、その月の行は無いが支援終了の備考の対象になる", () => {
    expect(ssw2SupportEndOnFirstDay(w, "2026-10")).toBe(true);
    expect(ssw2SupportEndOnFirstDay(w, "2026-09")).toBe(false);
    expect(ssw2SupportEndOnFirstDay({ ...w, residence_permit_date: "2026-10-15" }, "2026-10")).toBe(false);
    expect(ssw2SupportEndOnFirstDay({ ...w, residence_status: "特定技能2号 更新" }, "2026-10")).toBe(false);
    const billing = summarizeMonthlyBilling([w], [org("org-1", "BASE株式会社", "15000")], "2026-10");
    expect(billing.orgs).toHaveLength(0);
  });
});
