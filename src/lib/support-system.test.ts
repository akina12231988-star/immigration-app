import { describe, expect, it } from "vitest";
import {
  buildEmployeeRoles,
  canBeSupportManager,
  isSsw1Residence,
  isSupportedSsw1,
  orgSupportManagers,
  orgSupportStaff,
  orgRequiredManagers,
  orgRequiredStaff,
  requiredSupportManagerCount,
  requiredSupportStaffCount,
  serviceLabel,
  summarizeOrganizations,
  summarizeSupportSystem,
  supportManagerBlockReason,
  supportManagerOptions,
  supportStaffOptions,
  yearsBetween,
} from "./support-system";
import type { Employee, Organization, Worker } from "@/types/db";

const TODAY = "2026-08-01";

function employee(over: Partial<Employee> & { name: string }): Employee {
  return {
    id: over.name,
    kana: "",
    joined_on: null,
    left_on: null,
    employment_kind: "常勤",
    is_representative: false,
    is_officer: false,
    is_support_manager: false,
    is_support_staff: false,
    office: "本社",
    training_completed_on: null,
    note: "",
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function organization(id: string, name: string, intake: Record<string, unknown>): Organization {
  return {
    id,
    name,
    industry: "",
    business_category: "",
    address: "",
    contact: "",
    corporate_no: "",
    note: "",
    intake,
    created_at: "",
    updated_at: "",
  } as unknown as Organization;
}

function worker(over: Partial<Worker>): Worker {
  return {
    support: "支援対象",
    status: "在籍中",
    residence_status: "特定技能1号",
    current_organization_id: "org-1",
    ...over,
  } as Worker;
}

describe("yearsBetween / serviceLabel", () => {
  it("誕生日方式で満年数を返す", () => {
    expect(yearsBetween("2024-08-01", TODAY)).toBe(2);
    expect(yearsBetween("2024-08-02", TODAY)).toBe(1); // 前日なのでまだ2年経っていない
    expect(yearsBetween("2020-01-15", TODAY)).toBe(6);
  });

  it("入社日が無い・不正なら null", () => {
    expect(yearsBetween(null, TODAY)).toBeNull();
    expect(yearsBetween("", TODAY)).toBeNull();
    expect(yearsBetween("2024/08/01", TODAY)).toBeNull();
  });

  it("勤続年数を年と月で表示する", () => {
    expect(serviceLabel("2024-01-01", TODAY)).toBe("2年7か月");
    expect(serviceLabel("2024-08-01", TODAY)).toBe("2年");
    expect(serviceLabel(null, TODAY)).toBe("");
  });
});

describe("canBeSupportManager", () => {
  it("入社から2年以上経った常勤の在籍者は支援責任者になれる", () => {
    expect(canBeSupportManager(employee({ name: "A", joined_on: "2024-08-01" }), TODAY)).toBe(true);
    expect(canBeSupportManager(employee({ name: "B", joined_on: "2020-04-01" }), TODAY)).toBe(true);
  });

  it("勤続2年未満・非常勤・退職済みはなれない", () => {
    expect(canBeSupportManager(employee({ name: "C", joined_on: "2025-04-01" }), TODAY)).toBe(false);
    expect(
      canBeSupportManager(
        employee({ name: "D", joined_on: "2020-04-01", employment_kind: "非常勤" }),
        TODAY,
      ),
    ).toBe(false);
    expect(
      canBeSupportManager(
        employee({ name: "E", joined_on: "2020-04-01", left_on: "2026-03-31" }),
        TODAY,
      ),
    ).toBe(false);
  });

  it("なれない理由を返す", () => {
    expect(supportManagerBlockReason(employee({ name: "A", joined_on: "2024-08-01" }), TODAY)).toBe("");
    expect(supportManagerBlockReason(employee({ name: "B" }), TODAY)).toBe("入社日が未入力です");
    expect(
      supportManagerBlockReason(employee({ name: "C", joined_on: "2025-04-01" }), TODAY),
    ).toBe("勤続2年未満（現在 1年4か月）");
    expect(
      supportManagerBlockReason(
        employee({ name: "D", joined_on: "2020-04-01", employment_kind: "非常勤" }),
        TODAY,
      ),
    ).toBe("常勤ではありません");
  });
});

describe("orgSupportManagers / orgSupportStaff", () => {
  it("新項目があればそれを使い、重複・空白を除く", () => {
    const intake = {
      support_managers: ["市原　彩奈", "", "市原　彩奈", " 田上　夏季 "],
      support_staff: ["大元　麗奈"],
    };
    expect(orgSupportManagers(intake)).toEqual(["市原　彩奈", "田上　夏季"]);
    expect(orgSupportStaff(intake)).toEqual(["大元　麗奈"]);
  });

  it("未移行データは主担当→支援責任者・副担当→支援担当者として扱う", () => {
    const intake = { staff_primary: "市原　彩奈", staff_secondary: "田上　夏季" };
    expect(orgSupportManagers(intake)).toEqual(["市原　彩奈"]);
    expect(orgSupportStaff(intake)).toEqual(["田上　夏季"]);
  });

  it("未設定なら空配列", () => {
    expect(orgSupportManagers({})).toEqual([]);
    expect(orgSupportStaff(undefined)).toEqual([]);
  });
});

describe("1号特定技能外国人の判定", () => {
  it("特定技能1号だけを対象にする（特定活動は除く）", () => {
    expect(isSsw1Residence("特定技能1号")).toBe(true);
    expect(isSsw1Residence("特定技能1号更新")).toBe(true);
    expect(isSsw1Residence("特定活動（特定技能1号移行準備）")).toBe(false);
    expect(isSsw1Residence("特定技能2号")).toBe(false);
    expect(isSsw1Residence("")).toBe(false);
  });

  it("支援対象・在籍中のみ数える", () => {
    expect(isSupportedSsw1(worker({}))).toBe(true);
    expect(isSupportedSsw1(worker({ status: "支援中" }))).toBe(true);
    expect(isSupportedSsw1(worker({ support: "支援対象外" }))).toBe(false);
    expect(isSupportedSsw1(worker({ status: "退職" }))).toBe(false);
    expect(isSupportedSsw1(worker({ residence_status: "技能実習" }))).toBe(false);
  });
});

describe("requiredSupportStaffCount", () => {
  it("機関数÷10・外国人数÷50 の双方を「超える」人数を返す", () => {
    expect(requiredSupportStaffCount(0, 0)).toBe(1); // 最低1名
    expect(requiredSupportStaffCount(5, 20)).toBe(1);
    expect(requiredSupportStaffCount(11, 20)).toBe(2); // 11/10 = 1.1 → 2名
    expect(requiredSupportStaffCount(5, 60)).toBe(2); // 60/50 = 1.2 → 2名
    expect(requiredSupportStaffCount(25, 120)).toBe(3); // 25/10 = 2.5 → 3名
  });

  it("割り切れる場合も「超えている」必要があるので1名多い", () => {
    expect(requiredSupportStaffCount(10, 0)).toBe(2); // 10/10 = 1 → 1では足りず2名
    expect(requiredSupportStaffCount(0, 50)).toBe(2); // 50/50 = 1 → 2名
    expect(requiredSupportStaffCount(20, 100)).toBe(3);
  });
});

describe("requiredSupportManagerCount", () => {
  it("支援責任者にも機関数・外国人数の上限がある", () => {
    expect(requiredSupportManagerCount(0, 0)).toBe(1); // 最低1名
    expect(requiredSupportManagerCount(5, 20)).toBe(1);
    expect(requiredSupportManagerCount(11, 20)).toBe(2); // 11社 → 2名
    expect(requiredSupportManagerCount(5, 60)).toBe(2); // 60名 → 2名
    expect(requiredSupportManagerCount(10, 0)).toBe(2); // 割り切れる場合も1名多い
  });
});

describe("orgRequiredManagers / orgRequiredStaff", () => {
  it("所属機関1社ごとの必要人数を在籍数から出す", () => {
    expect(orgRequiredManagers(0)).toBe(1);
    expect(orgRequiredStaff(0)).toBe(1);
    expect(orgRequiredManagers(49)).toBe(1);
    expect(orgRequiredStaff(50)).toBe(2); // 50名ちょうどでも「超えている」必要があるので2名
    expect(orgRequiredManagers(120)).toBe(3);
    expect(orgRequiredStaff(120)).toBe(3);
  });
});

describe("summarizeOrganizations", () => {
  const orgs = [
    organization("org-1", "A社", { support_managers: ["市原　彩奈"], support_staff: ["市原　彩奈", "田上　夏季"] }),
    organization("org-2", "B社", { support_managers: ["大元　麗奈"], support_staff: [] }),
  ];
  const workers = [
    worker({ current_organization_id: "org-1" }),
    worker({ current_organization_id: "org-1" }),
    worker({ current_organization_id: "org-2", status: "退職" }),
    worker({ current_organization_id: null }),
  ];

  it("機関ごとに1号特定技能外国人を数え、兼任者を拾う", () => {
    const result = summarizeOrganizations(orgs, workers);
    expect(result[0]).toMatchObject({
      organizationName: "A社",
      workerCount: 2,
      managers: ["市原　彩奈"],
      staff: ["市原　彩奈", "田上　夏季"],
      dual: ["市原　彩奈"],
      requiredManagers: 1,
      requiredStaff: 1,
      managerShortage: 0,
      staffShortage: 0,
    });
    expect(result[1]).toMatchObject({ organizationName: "B社", workerCount: 0, dual: [] });
    // B社は支援担当者が未選任なので1名不足
    expect(result[1].staffShortage).toBe(1);
    expect(result[1].managerShortage).toBe(0);
  });
});

describe("buildEmployeeRoles / summarizeSupportSystem", () => {
  const orgs = [
    organization("org-1", "A社", {
      support_managers: ["市原　彩奈"],
      support_staff: ["市原　彩奈", "田上　夏季"],
    }),
    organization("org-2", "B社", { support_managers: ["市原　彩奈"], support_staff: ["大元　麗奈"] }),
  ];
  const workers = [
    worker({ current_organization_id: "org-1" }),
    worker({ current_organization_id: "org-2" }),
  ];
  // 役割（支援責任者・支援担当者）は従業員側の設定を正とする
  const employees = [
    employee({
      name: "市原　彩奈",
      joined_on: "2019-04-01",
      is_support_manager: true,
      is_support_staff: true,
    }),
    employee({ name: "田上　夏季", joined_on: "2023-04-01", is_support_staff: true }),
    employee({ name: "大元　麗奈", joined_on: "2025-10-01", is_support_staff: true }),
    employee({ name: "秋吉　伽恋", joined_on: "2021-04-01" }), // 2年以上だが役割なし
  ];

  const summaries = summarizeOrganizations(orgs, workers);
  const roles = buildEmployeeRoles(employees, summaries, TODAY);

  it("誰がどの機関の責任者・担当者かを組み立てる", () => {
    const ichihara = roles.find((r) => r.employee.name === "市原　彩奈")!;
    expect(ichihara.assignments.map((a) => a.organizationName)).toEqual(["A社", "B社"]);
    expect(ichihara.isManager).toBe(true);
    expect(ichihara.isStaff).toBe(true);
    expect(ichihara.isDual).toBe(true);
    expect(ichihara.workerCount).toBe(2);

    const oomoto = roles.find((r) => r.employee.name === "大元　麗奈")!;
    expect(oomoto.isManager).toBe(false);
    expect(oomoto.isStaff).toBe(true);
    expect(oomoto.isDual).toBe(false);
  });

  it("役割にしていないのに所属機関で選任されている場合を検出する", () => {
    // 従業員側で支援責任者にしていない大元が、B社の支援責任者に選ばれていた場合
    const wrong = [employee({ name: "大元　麗奈", joined_on: "2019-04-01", is_support_staff: true })];
    const wrongOrgs = summarizeOrganizations(
      [organization("org-2", "B社", { support_managers: ["大元　麗奈"], support_staff: ["大元　麗奈"] })],
      workers,
    );
    const role = buildEmployeeRoles(wrong, wrongOrgs, TODAY)[0];
    expect(role.mismatchedManagerOrgs).toEqual(["B社"]);
    expect(role.mismatchedStaffOrgs).toEqual([]);
  });

  it("入社2年以上でまだ支援責任者にしていない人にアラートを出す", () => {
    const suggested = roles.filter((r) => r.suggestManager).map((r) => r.employee.name);
    expect(suggested).toEqual(["田上　夏季", "秋吉　伽恋"]);
    // 大元は勤続2年未満なのでアラートを出さない
    expect(suggested).not.toContain("大元　麗奈");
    // 市原は既に支援責任者なのでアラートを出さない
    expect(suggested).not.toContain("市原　彩奈");
  });

  it("体制のサマリーを組み立てる", () => {
    const summary = summarizeSupportSystem(roles, summaries);
    expect(summary.orgCount).toBe(2);
    expect(summary.workerCount).toBe(2);
    expect(summary.requiredStaff).toBe(1);
    expect(summary.currentStaff).toBe(3); // 市原・田上・大元
    expect(summary.staffShortage).toBe(0);
    expect(summary.requiredManagers).toBe(1);
    expect(summary.currentManagers).toBe(1); // 市原のみ
    expect(summary.managerShortage).toBe(0);
    expect(summary.eligibleNotAssigned).toEqual(["田上　夏季", "秋吉　伽恋"]);
  });

  it("機関ごとに必要人数を満たしていない機関を拾う", () => {
    const summary = summarizeSupportSystem(roles, summaries);
    // A社は責任者・担当者とも選任済み、B社は担当者1名・責任者1名で充足
    expect(summary.understaffedOrgs.map((o) => o.organizationName)).toEqual([]);

    const noStaff = summarizeOrganizations(
      [organization("org-3", "C社", { support_managers: ["市原　彩奈"], support_staff: [] })],
      [worker({ current_organization_id: "org-3" })],
    );
    const s2 = summarizeSupportSystem(buildEmployeeRoles(employees, noStaff, TODAY), noStaff);
    expect(s2.understaffedOrgs.map((o) => o.organizationName)).toEqual(["C社"]);
  });

  it("退職済みの従業員は人数に数えない", () => {
    const withLeaver = [
      ...employees,
      employee({
        name: "退職　太郎",
        joined_on: "2019-04-01",
        left_on: "2026-03-31",
        is_support_staff: true,
      }),
    ];
    const summary = summarizeSupportSystem(
      buildEmployeeRoles(withLeaver, summaries, TODAY),
      summaries,
    );
    expect(summary.currentStaff).toBe(3);
  });

  it("事務所ごとに責任者・担当者が1名以上いるかを判定する", () => {
    const split = [
      employee({
        name: "市原　彩奈",
        joined_on: "2019-04-01",
        office: "本社",
        is_support_manager: true,
      }),
      employee({
        name: "田上　夏季",
        joined_on: "2023-04-01",
        office: "本社",
        is_support_staff: true,
      }),
      employee({
        name: "大元　麗奈",
        joined_on: "2025-10-01",
        office: "福岡支店",
        is_support_staff: true,
      }),
    ];
    const summary = summarizeSupportSystem(buildEmployeeRoles(split, summaries, TODAY), summaries);
    const honsha = summary.offices.find((o) => o.office === "本社")!;
    expect(honsha.ok).toBe(true);
    // 福岡支店には支援担当者（大元）しかいないので責任者が不足
    const fukuoka = summary.offices.find((o) => o.office === "福岡支店")!;
    expect(fukuoka.managers).toEqual([]);
    expect(fukuoka.ok).toBe(false);
  });
});

describe("supportManagerOptions / supportStaffOptions", () => {
  const employees = [
    employee({ name: "市原　彩奈", is_support_manager: true, is_support_staff: true }),
    employee({ name: "田上　夏季", is_support_staff: true }),
    employee({ name: "大元　麗奈" }), // 役割なし
    employee({ name: "退職　太郎", is_support_manager: true, left_on: "2026-03-31" }),
  ];

  it("所属機関で選べるのは、その役割にしている在籍者だけ", () => {
    expect(supportManagerOptions(employees, TODAY)).toEqual(["市原　彩奈"]);
    expect(supportStaffOptions(employees, TODAY)).toEqual(["市原　彩奈", "田上　夏季"]);
  });
});
