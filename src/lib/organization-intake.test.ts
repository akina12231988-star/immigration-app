import { describe, expect, it } from "vitest";
import {
  FINANCIAL_DEFAULT_ROWS,
  emptyLodging,
  emptyOrganizationIntake,
  formatYen,
  isOrgStaff,
  lodgingContractKind,
  normalizeOrganizationIntake,
  orgStaffLabel,
  ownedMonthlyRent,
  parseAmount,
  perResidentCost,
} from "./organization-intake";

describe("normalizeOrganizationIntake", () => {
  it("空のjsonb（{}）から全キーを補完する", () => {
    const intake = normalizeOrganizationIntake({});
    expect(intake).toEqual(emptyOrganizationIntake());
    expect(intake.financials).toHaveLength(FINANCIAL_DEFAULT_ROWS);
    expect(intake.japanese_staff).toHaveLength(1);
    expect(intake.officers).toHaveLength(1);
  });

  it("null や不正値でも初期値になる", () => {
    expect(normalizeOrganizationIntake(null)).toEqual(emptyOrganizationIntake());
    expect(normalizeOrganizationIntake("x")).toEqual(emptyOrganizationIntake());
  });

  it("保存済みの値は保持し、欠けたキーだけ補完する", () => {
    const intake = normalizeOrganizationIntake({
      phone: "096-000-0000",
      financials: [{ year: "6", sales: "1000万円" }],
      officers: [{ name: "山田 太郎", not_involved: true }],
    });
    expect(intake.phone).toBe("096-000-0000");
    expect(intake.kana).toBe("");
    // 決算情報は保存済みの行数を維持し（行の追加に対応）、欠けたキーは補完される
    expect(intake.financials).toHaveLength(1);
    expect(intake.financials[0]).toEqual({
      year: "6",
      term: "",
      period_from: "",
      period_to: "",
      sales: "1000万円",
      ordinary: "",
      net: "",
      assets: "",
    });
    // 役員行は欠けたキーが補完される
    expect(intake.officers).toEqual([
      { kana: "", name: "山田 太郎", title: "", not_involved: true },
    ]);
  });

  it("旧形式のフラットな lodging_* 項目は寮1件目として移行され、フラット項目は残らない", () => {
    const intake = normalizeOrganizationIntake({
      lodging_address: "熊本県八代市1-2-3",
      lodging_kind: "賃貸物件",
      lodging_rent: "50,000",
      lodging_max_residents: "3",
    });
    expect(intake.lodgings).toEqual([
      {
        ...emptyLodging("lodging-1"),
        address: "熊本県八代市1-2-3",
        kind: "賃貸物件",
        rent: "50,000",
        max_residents: "3",
      },
    ]);
    expect("lodging_address" in intake).toBe(false);
    expect("lodging_rent" in intake).toBe(false);
  });

  it("lodgings 配列は行数を維持し、欠けたキーと id を補完する", () => {
    const intake = normalizeOrganizationIntake({
      lodgings: [
        { name: "女子寮", kind: "賃貸物件", rent: "50,000" },
        { id: "abc-123", name: "男子寮" },
      ],
    });
    expect(intake.lodgings).toHaveLength(2);
    expect(intake.lodgings[0]).toEqual({
      ...emptyLodging("lodging-1"),
      name: "女子寮",
      kind: "賃貸物件",
      rent: "50,000",
    });
    // 保存済みの id は維持される
    expect(intake.lodgings[1].id).toBe("abc-123");
    expect(intake.lodgings[1].name).toBe("男子寮");
    expect(intake.lodgings[1].address).toBe("");
  });

  it("寮が未登録なら空の1件が用意される", () => {
    expect(normalizeOrganizationIntake({}).lodgings).toEqual([emptyLodging("lodging-1")]);
  });
});

describe("lodgingContractKind", () => {
  it("1件目の寮は旧データ互換のため従来の「賃貸契約書」を使う", () => {
    expect(lodgingContractKind(emptyLodging("lodging-1"))).toBe("賃貸契約書");
  });
  it("2件目以降は id 付きの種別で区別する", () => {
    expect(lodgingContractKind(emptyLodging("abc-123"))).toBe("賃貸契約書:abc-123");
  });
});

describe("宿泊物件の費用計算", () => {
  it("金額文字列からカンマ・円・全角数字を除いて数値化する", () => {
    expect(parseAmount("15,000,000円")).toBe(15000000);
    expect(parseAmount("６０，０００")).toBe(60000);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("なし")).toBeNull();
  });
  it("自己所有物件の1ヶ月分の家賃代 = （総費用＋備品代）÷（耐用年数×12）", () => {
    // (15,000,000 + 500,000) ÷ (22年×12) = 58,712円
    expect(ownedMonthlyRent("15,000,000", "500,000", "22")).toBe(58712);
    // 備品代なしでも計算できる
    expect(ownedMonthlyRent("13,200,000", "", "22")).toBe(50000);
    // 総費用か耐用年数が無ければ null
    expect(ownedMonthlyRent("", "500,000", "22")).toBeNull();
    expect(ownedMonthlyRent("15,000,000", "", "")).toBeNull();
  });
  it("1人あたりの居住費用 = 家賃 ÷ 最大入居人数", () => {
    expect(perResidentCost("60,000", "3")).toBe(20000);
    expect(perResidentCost("50,000", "3")).toBe(16667);
    expect(perResidentCost("", "3")).toBeNull();
    expect(perResidentCost("60,000", "")).toBeNull();
  });
  it("金額表示はカンマ区切り＋円", () => {
    expect(formatYen(58712)).toBe("58,712円");
  });
});

describe("orgStaffLabel / isOrgStaff", () => {
  it("支援責任者・支援担当者をまとめて表示する", () => {
    expect(
      orgStaffLabel({ support_managers: ["市原　彩奈"], support_staff: ["田上　夏季"] }),
    ).toBe("市原　彩奈（責）・田上　夏季（担）");
  });

  it("兼任している人は（責・担）で1回だけ表示する", () => {
    expect(
      orgStaffLabel({
        support_managers: ["市原　彩奈"],
        support_staff: ["市原　彩奈", "田上　夏季"],
      }),
    ).toBe("市原　彩奈（責・担）・田上　夏季（担）");
  });

  it("未移行データ（主担当・副担当）も表示できる", () => {
    expect(orgStaffLabel({ staff_primary: "市原　彩奈", staff_secondary: "田上　夏季" })).toBe(
      "市原　彩奈（責）・田上　夏季（担）",
    );
    expect(orgStaffLabel({ staff_primary: "市原　彩奈" })).toBe("市原　彩奈（責）");
    expect(orgStaffLabel({ staff_secondary: "田上　夏季" })).toBe("田上　夏季（担）");
  });

  it("未設定・intakeなしは空文字", () => {
    expect(orgStaffLabel({})).toBe("");
    expect(orgStaffLabel(undefined)).toBe("");
    expect(orgStaffLabel(null)).toBe("");
  });

  it("支援責任者・支援担当者のどちらかに一致すれば担当者", () => {
    const intake = { support_managers: ["市原　彩奈"], support_staff: ["田上　夏季"] };
    expect(isOrgStaff(intake, "市原　彩奈")).toBe(true);
    expect(isOrgStaff(intake, "田上　夏季")).toBe(true);
    expect(isOrgStaff(intake, "大元　麗奈")).toBe(false);
    expect(isOrgStaff(intake, "")).toBe(false);
    expect(isOrgStaff(undefined, "市原　彩奈")).toBe(false);
  });
});
