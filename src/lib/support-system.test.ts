import { describe, expect, it } from "vitest";
import {
  buildEmployeeRoles,
  canBeSupportManager,
  isSsw1Residence,
  isSupportedSsw1,
  orgSupportManagers,
  orgSupportStaff,
  maxOrgCountFor,
  maxWorkerCountFor,
  orgRequiredPersons,
  requiredSupportPersonCount,
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

describe("requiredSupportPersonCount", () => {
  it("支援責任者等は1人当たり10機関未満・50人未満（資料の例と一致する）", () => {
    // 例: 特定技能所属機関25機関から委託を受ける場合は3人の支援責任者等が必要
    expect(requiredSupportPersonCount(25, 0)).toBe(3);
    // 例: 1号特定技能外国人120人を支援する場合は3人の支援責任者等が必要
    expect(requiredSupportPersonCount(0, 120)).toBe(3);
  });

  it("最低1名。上限ちょうどは「未満」を満たさないので1名多く必要", () => {
    expect(requiredSupportPersonCount(0, 0)).toBe(1);
    expect(requiredSupportPersonCount(9, 49)).toBe(1);
    expect(requiredSupportPersonCount(10, 0)).toBe(2); // 10機関を1人（10機関）は不可
    expect(requiredSupportPersonCount(0, 50)).toBe(2); // 50人を1人（50人）は不可
    expect(requiredSupportPersonCount(20, 100)).toBe(3);
  });

  it("機関数と外国人数の厳しいほうを採る", () => {
    expect(requiredSupportPersonCount(25, 20)).toBe(3); // 機関数で3名
    expect(requiredSupportPersonCount(5, 120)).toBe(3); // 外国人数で3名
  });
});

describe("maxOrgCountFor / maxWorkerCountFor", () => {
  it("支援責任者等の人数から受け入れられる上限を出す", () => {
    // 資料: 支援責任者等が1人なら50人未満、2人なら100人未満、3人なら150人未満
    expect(maxWorkerCountFor(1)).toBe(49);
    expect(maxWorkerCountFor(2)).toBe(99);
    expect(maxWorkerCountFor(3)).toBe(149);
    // 1人当たり10機関未満
    expect(maxOrgCountFor(1)).toBe(9);
    expect(maxOrgCountFor(3)).toBe(29);
    expect(maxOrgCountFor(0)).toBe(0);
  });
});

describe("orgRequiredPersons", () => {
  it("所属機関1社ごとの必要人数を在籍数から出す", () => {
    expect(orgRequiredPersons(0)).toBe(1);
    expect(orgRequiredPersons(49)).toBe(1);
    expect(orgRequiredPersons(50)).toBe(2); // 50名ちょうどは「50人未満」を満たさない
    expect(orgRequiredPersons(120)).toBe(3);
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
      persons: ["市原　彩奈", "田上　夏季"], // 兼任は1人として数える
      requiredPersons: 1,
      personShortage: 0,
      managerMissing: false,
      staffMissing: false,
    });
    expect(result[1]).toMatchObject({ organizationName: "B社", workerCount: 0, dual: [] });
    // B社は支援担当者が1人も選任されていない
    expect(result[1].staffMissing).toBe(true);
    expect(result[1].managerMissing).toBe(false);
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
    expect(summary.requiredPersons).toBe(1);
    expect(summary.currentPersons).toBe(3); // 市原・田上・大元（市原の兼任は1人）
    expect(summary.personShortage).toBe(0);
    expect(summary.currentStaff).toBe(3);
    expect(summary.currentManagers).toBe(1); // 市原のみ
    expect(summary.maxOrgs).toBe(29); // 3名なので30機関未満
    expect(summary.maxWorkers).toBe(149); // 3名なので150人未満
    expect(summary.eligibleNotAssigned).toEqual(["田上　夏季", "秋吉　伽恋"]);
  });

  it("支援責任者・支援担当者が欠けている機関を拾う", () => {
    const summary = summarizeSupportSystem(roles, summaries);
    // A社・B社とも責任者・担当者が選任済み
    expect(summary.understaffedOrgs.map((o) => o.organizationName)).toEqual([]);

    // C社は支援担当者が未選任
    const noStaff = summarizeOrganizations(
      [organization("org-3", "C社", { support_managers: ["市原　彩奈"], support_staff: [] })],
      [worker({ current_organization_id: "org-3" })],
    );
    const s2 = summarizeSupportSystem(buildEmployeeRoles(employees, noStaff, TODAY), noStaff);
    expect(s2.understaffedOrgs.map((o) => o.organizationName)).toEqual(["C社"]);
  });

  it("在籍数が多い機関は支援責任者等の人数が足りないと不足として拾う", () => {
    // 60名在籍 → 支援責任者等2名必要だが、選任は1名（兼任）
    const big = summarizeOrganizations(
      [organization("org-4", "D社", { support_managers: ["市原　彩奈"], support_staff: ["市原　彩奈"] })],
      Array.from({ length: 60 }, () => worker({ current_organization_id: "org-4" })),
    );
    expect(big[0].workerCount).toBe(60);
    expect(big[0].requiredPersons).toBe(2);
    expect(big[0].persons).toEqual(["市原　彩奈"]);
    expect(big[0].personShortage).toBe(1);
    const s3 = summarizeSupportSystem(buildEmployeeRoles(employees, big, TODAY), big);
    expect(s3.understaffedOrgs.map((o) => o.organizationName)).toEqual(["D社"]);
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
