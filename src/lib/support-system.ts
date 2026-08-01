// 1号特定技能外国人への支援体制（令和9年4月1日施行の省令改正）の判定。
//
// 改正後の主な要件:
//  1. 支援責任者及び支援担当者（支援責任者等）を、支援業務を行う事務所ごとに
//     それぞれ常勤の役員又は職員の中から1名以上選任する（支援責任者が支援担当者を兼務することは可）。
//  2. 支援業務に従事することができる者を支援責任者等に限定する。
//  3. 支援責任者に養成講習の受講を義務付ける（※令和9年4月1日以降も当分の間は未修了でも差し支えない）。
//  4. 支援担当者の数が、
//       ・委託を受けている特定技能所属機関の数 ÷ 10
//       ・支援を行っている1号特定技能外国人の数 ÷ 50
//     の双方を「超えている」こと（支援責任者が支援担当者を兼務することは可）。
//
// 支援責任者になれる目安は弊社の運用基準（入社から2年以上経過した常勤の従業員）。

import type { Employee, Organization, OrganizationIntake, Worker } from "@/types/db";

// 施行日（令和9年4月1日）
export const REFORM_EFFECTIVE_ON = "2027-04-01";

// 支援責任者になれる目安の勤続年数（弊社の運用基準）
export const SUPPORT_MANAGER_MIN_YEARS = 2;

// 1人あたりの上限（この数を「超えている」人数が必要）。
// 支援責任者・支援担当者それぞれに、担当できる所属機関数と1号特定技能外国人数の上限がある。
export interface RoleRatio {
  orgsPerPerson: number; // 1人が担当できる特定技能所属機関の数
  workersPerPerson: number; // 1人が担当できる1号特定技能外国人の数
}

// 支援責任者の上限
export const SUPPORT_MANAGER_RATIO: RoleRatio = { orgsPerPerson: 10, workersPerPerson: 50 };
// 支援担当者の上限（省令の改正文どおり）
export const SUPPORT_STAFF_RATIO: RoleRatio = { orgsPerPerson: 10, workersPerPerson: 50 };

export const ORGS_PER_SUPPORT_STAFF = SUPPORT_STAFF_RATIO.orgsPerPerson;
export const WORKERS_PER_SUPPORT_STAFF = SUPPORT_STAFF_RATIO.workersPerPerson;

// ---- 日付 ----

// YYYY-MM-DD の差を満年数で返す（誕生日方式。不正な入力は null）
export function yearsBetween(from: string | null | undefined, to: string): number | null {
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let years = ty - fy;
  if (tm < fm || (tm === fm && td < fd)) years -= 1;
  return years;
}

// 勤続年数の表示（例: 2年7か月）。入社日が無ければ ''
export function serviceLabel(joinedOn: string | null | undefined, today: string): string {
  const years = yearsBetween(joinedOn, today);
  if (years === null || years < 0) return "";
  const [fy, fm, fd] = (joinedOn as string).split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  const rest = months - years * 12;
  return rest > 0 ? `${years}年${rest}か月` : `${years}年`;
}

// ---- 従業員 ----

// 在籍中の従業員か（退職日が未入力、または退職日が今日より後）
export function isActiveEmployee(employee: Employee, today: string): boolean {
  if (!employee.left_on) return true;
  return employee.left_on > today;
}

// 支援責任者になれるか（在籍中・常勤・勤続2年以上）
export function canBeSupportManager(employee: Employee, today: string): boolean {
  if (!isActiveEmployee(employee, today)) return false;
  if (employee.employment_kind !== "常勤") return false;
  const years = yearsBetween(employee.joined_on, today);
  return years !== null && years >= SUPPORT_MANAGER_MIN_YEARS;
}

// 支援責任者になれない理由（なれる場合は ''）。画面のヒント表示用
export function supportManagerBlockReason(employee: Employee, today: string): string {
  if (!isActiveEmployee(employee, today)) return "退職済み";
  if (employee.employment_kind !== "常勤") return "常勤ではありません";
  const years = yearsBetween(employee.joined_on, today);
  if (years === null) return "入社日が未入力です";
  if (years < SUPPORT_MANAGER_MIN_YEARS) {
    return `勤続${SUPPORT_MANAGER_MIN_YEARS}年未満（現在 ${serviceLabel(employee.joined_on, today)}）`;
  }
  return "";
}

// ---- 所属機関に選任された支援責任者・支援担当者 ----

function names(list: string[] | undefined): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const name = typeof raw === "string" ? raw.trim() : "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

// この機関の支援責任者（複数）
export function orgSupportManagers(
  intake: Partial<OrganizationIntake> | null | undefined,
): string[] {
  const list = names(intake?.support_managers);
  if (list.length > 0) return list;
  // 未移行データ: 旧「主担当」を支援責任者として扱う
  return names(intake?.staff_primary ? [intake.staff_primary] : []);
}

// この機関の支援担当者（複数）
export function orgSupportStaff(
  intake: Partial<OrganizationIntake> | null | undefined,
): string[] {
  const list = names(intake?.support_staff);
  if (list.length > 0) return list;
  // 未移行データ: 旧「副担当」を支援担当者として扱う
  return names(intake?.staff_secondary ? [intake.staff_secondary] : []);
}

// ---- 1号特定技能外国人 ----

// 在留資格が特定技能1号か（特定活動（特定技能1号移行準備）は支援対象外なので除く）
export function isSsw1Residence(residenceStatus: string | null | undefined): boolean {
  const s = (residenceStatus ?? "").trim();
  if (!s) return false;
  if (s.includes("特定活動")) return false;
  return s.includes("特定技能1号");
}

// 集計に必要な外国人の項目だけ（一覧の取得を軽くするため）
export type SupportWorker = Pick<
  Worker,
  "current_organization_id" | "support" | "status" | "residence_status"
>;

// 支援を行っている1号特定技能外国人か（支援対象・在籍中・在留資格が特定技能1号）
export function isSupportedSsw1(worker: SupportWorker): boolean {
  if (worker.support !== "支援対象") return false;
  if (worker.status !== "在籍中" && worker.status !== "支援中") return false;
  return isSsw1Residence(worker.residence_status);
}

// ---- 所属機関ごとの集計 ----

export interface OrgSupportSummary {
  organizationId: string;
  organizationName: string;
  workerCount: number; // 在籍している支援対象の1号特定技能外国人数
  managers: string[]; // 支援責任者
  staff: string[]; // 支援担当者
  dual: string[]; // 責任者と担当者を兼任している人
  requiredManagers: number; // この機関の在籍数から必要な支援責任者数
  requiredStaff: number; // この機関の在籍数から必要な支援担当者数
  managerShortage: number; // 支援責任者の不足数（0なら充足）
  staffShortage: number; // 支援担当者の不足数（0なら充足）
}

export function summarizeOrganizations(
  organizations: Pick<Organization, "id" | "name" | "intake">[],
  workers: SupportWorker[],
): OrgSupportSummary[] {
  const counts = new Map<string, number>();
  for (const w of workers) {
    if (!w.current_organization_id || !isSupportedSsw1(w)) continue;
    counts.set(w.current_organization_id, (counts.get(w.current_organization_id) ?? 0) + 1);
  }
  return organizations.map((org) => {
    const managers = orgSupportManagers(org.intake);
    const staff = orgSupportStaff(org.intake);
    const workerCount = counts.get(org.id) ?? 0;
    const requiredManagers = orgRequiredManagers(workerCount);
    const requiredStaff = orgRequiredStaff(workerCount);
    return {
      organizationId: org.id,
      organizationName: org.name,
      workerCount,
      managers,
      staff,
      dual: managers.filter((n) => staff.includes(n)),
      requiredManagers,
      requiredStaff,
      managerShortage: Math.max(0, requiredManagers - managers.length),
      staffShortage: Math.max(0, requiredStaff - staff.length),
    };
  });
}

// ---- 従業員ごとの担当機関 ----

export interface EmployeeAssignment {
  organizationId: string;
  organizationName: string;
  isManager: boolean; // この機関の支援責任者
  isStaff: boolean; // この機関の支援担当者
  isDual: boolean; // この機関で兼任
  workerCount: number; // この機関の1号特定技能外国人数
}

export interface EmployeeSupportRole {
  employee: Employee;
  assignments: EmployeeAssignment[];
  isManager: boolean; // 現在 支援責任者をしている（従業員側の設定）
  isStaff: boolean; // 現在 支援担当者をしている（従業員側の設定）
  isDual: boolean; // 支援責任者と支援担当者を兼任している
  years: number | null; // 勤続年数（満年数）
  isActive: boolean; // 在籍中か
  eligibleAsManager: boolean; // 支援責任者になれるか（在籍中・常勤・勤続2年以上）
  // 支援責任者になれるのに、まだ支援責任者にしていない（画面にアラートを出す）
  suggestManager: boolean;
  workerCount: number; // 担当している1号特定技能外国人の合計
  // 従業員側で役割にしていないのに所属機関で選任されている機関（設定の取り違え）
  mismatchedManagerOrgs: string[];
  mismatchedStaffOrgs: string[];
}

export function buildEmployeeRoles(
  employees: Employee[],
  orgSummaries: OrgSupportSummary[],
  today: string,
): EmployeeSupportRole[] {
  return employees.map((employee) => {
    const assignments: EmployeeAssignment[] = [];
    for (const org of orgSummaries) {
      const isManager = org.managers.includes(employee.name);
      const isStaff = org.staff.includes(employee.name);
      if (!isManager && !isStaff) continue;
      assignments.push({
        organizationId: org.organizationId,
        organizationName: org.organizationName,
        isManager,
        isStaff,
        isDual: isManager && isStaff,
        workerCount: org.workerCount,
      });
    }
    // 役割は従業員側の設定を正とする（所属機関ではこの役割の人だけを選べる）
    const isManager = employee.is_support_manager;
    const isStaff = employee.is_support_staff;
    const eligibleAsManager = canBeSupportManager(employee, today);
    return {
      employee,
      assignments,
      isManager,
      isStaff,
      isDual: isManager && isStaff,
      years: yearsBetween(employee.joined_on, today),
      isActive: isActiveEmployee(employee, today),
      eligibleAsManager,
      suggestManager: eligibleAsManager && !isManager,
      workerCount: assignments.reduce((sum, a) => sum + a.workerCount, 0),
      mismatchedManagerOrgs: isManager
        ? []
        : assignments.filter((a) => a.isManager).map((a) => a.organizationName),
      mismatchedStaffOrgs: isStaff
        ? []
        : assignments.filter((a) => a.isStaff).map((a) => a.organizationName),
    };
  });
}

// 所属機関の「支援責任者」に選べる従業員（現在 支援責任者をしている在籍者）
export function supportManagerOptions(employees: Employee[], today: string): string[] {
  return employees
    .filter((e) => e.is_support_manager && isActiveEmployee(e, today) && e.name.trim())
    .map((e) => e.name.trim());
}

// 所属機関の「支援担当者」に選べる従業員（現在 支援担当者をしている在籍者）
export function supportStaffOptions(employees: Employee[], today: string): string[] {
  return employees
    .filter((e) => e.is_support_staff && isActiveEmployee(e, today) && e.name.trim())
    .map((e) => e.name.trim());
}

// ---- 必要人数 ----

// 「n を超えている」ことが要件なので、n が割り切れる場合も +1 人必要
function moreThan(value: number, per: number): number {
  return Math.floor(value / per) + 1;
}

// 必要人数（機関数÷上限・外国人数÷上限 の双方を超える人数）
export function requiredCount(
  ratio: RoleRatio,
  orgCount: number,
  workerCount: number,
): number {
  return Math.max(
    moreThan(orgCount, ratio.orgsPerPerson),
    moreThan(workerCount, ratio.workersPerPerson),
  );
}

// 必要な支援責任者数
export function requiredSupportManagerCount(orgCount: number, workerCount: number): number {
  return requiredCount(SUPPORT_MANAGER_RATIO, orgCount, workerCount);
}

// 必要な支援担当者数
export function requiredSupportStaffCount(orgCount: number, workerCount: number): number {
  return requiredCount(SUPPORT_STAFF_RATIO, orgCount, workerCount);
}

// 所属機関1社あたりの必要人数（その機関に在籍している1号特定技能外国人の数から算出）
export function orgRequiredManagers(workerCount: number): number {
  return requiredSupportManagerCount(1, workerCount);
}

export function orgRequiredStaff(workerCount: number): number {
  return requiredSupportStaffCount(1, workerCount);
}

// ---- 事務所ごとの充足状況 ----

export interface OfficeSummary {
  office: string; // '' は事務所未設定
  managers: string[]; // この事務所の支援責任者
  staff: string[]; // この事務所の支援担当者
  ok: boolean; // 責任者・担当者がそれぞれ1名以上いるか
}

export interface SupportSystemSummary {
  orgCount: number; // 委託を受けている特定技能所属機関の数（支援対象者が在籍している機関）
  workerCount: number; // 支援を行っている1号特定技能外国人の数
  requiredStaff: number; // 必要な支援担当者数
  currentStaff: number; // 現在の支援担当者数（実人数）
  staffShortage: number; // 支援担当者の不足数（0なら充足）
  requiredManagers: number; // 必要な支援責任者数
  currentManagers: number; // 現在の支援責任者数（実人数）
  managerShortage: number; // 支援責任者の不足数（0なら充足）
  // 機関ごとに必要人数を満たしていない機関（機関名と不足内容）
  understaffedOrgs: OrgSupportSummary[];
  offices: OfficeSummary[]; // 事務所ごとの充足状況
  eligibleNotAssigned: string[]; // 支援責任者になれるのに未選任の従業員名
}

export function summarizeSupportSystem(
  roles: EmployeeSupportRole[],
  orgSummaries: OrgSupportSummary[],
): SupportSystemSummary {
  // 委託を受けている機関数 = 支援対象の1号特定技能外国人が在籍している機関
  const orgCount = orgSummaries.filter((o) => o.workerCount > 0).length;
  const workerCount = orgSummaries.reduce((sum, o) => sum + o.workerCount, 0);

  // 人数は従業員側で役割にしている在籍者を数える
  const activeRoles = roles.filter((r) => (r.isManager || r.isStaff) && r.isActive);
  const currentStaff = activeRoles.filter((r) => r.isStaff).length;
  const currentManagers = activeRoles.filter((r) => r.isManager).length;
  const requiredStaff = requiredSupportStaffCount(orgCount, workerCount);
  const requiredManagers = requiredSupportManagerCount(orgCount, workerCount);

  const officeNames = new Set<string>();
  for (const r of activeRoles) officeNames.add(r.employee.office.trim());
  const offices: OfficeSummary[] = [...officeNames].sort().map((office) => {
    const inOffice = activeRoles.filter((r) => r.employee.office.trim() === office);
    const managers = inOffice.filter((r) => r.isManager).map((r) => r.employee.name);
    const staff = inOffice.filter((r) => r.isStaff).map((r) => r.employee.name);
    return { office, managers, staff, ok: managers.length >= 1 && staff.length >= 1 };
  });

  return {
    orgCount,
    workerCount,
    requiredStaff,
    currentStaff,
    staffShortage: Math.max(0, requiredStaff - currentStaff),
    requiredManagers,
    currentManagers,
    managerShortage: Math.max(0, requiredManagers - currentManagers),
    understaffedOrgs: orgSummaries.filter((o) => o.managerShortage > 0 || o.staffShortage > 0),
    offices,
    eligibleNotAssigned: roles.filter((r) => r.suggestManager).map((r) => r.employee.name),
  };
}
