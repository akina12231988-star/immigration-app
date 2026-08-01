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

// 「支援責任者等」1人あたりの上限。
// 支援責任者と支援担当者は別々に数えるのではなく、合わせて「支援責任者等」として数える
// （兼務している人は1人）。上限は「未満」なので、ちょうどの数は超過扱いになる。
//   ④ 委託を受けることができる特定技能所属機関の数 … 支援責任者等1人当たり10機関未満
//      例: 25機関の委託を受ける場合は3人の支援責任者等が必要
//   ⑤ 支援を行うことができる1号特定技能外国人の数 … 支援責任者等1人当たり50人未満
//      例: 1号特定技能外国人120人を支援する場合は3人の支援責任者等が必要
export const ORGS_PER_SUPPORT_PERSON = 10;
export const WORKERS_PER_SUPPORT_PERSON = 50;

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
  persons: string[]; // この機関の支援責任者等（責任者＋担当者の実人数。兼任は1人）
  requiredPersons: number; // この機関の在籍数から必要な支援責任者等の人数
  personShortage: number; // 支援責任者等の不足数（0なら充足）
  managerMissing: boolean; // 支援責任者が1人も選任されていない
  staffMissing: boolean; // 支援担当者が1人も選任されていない
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
    const persons = [...new Set([...managers, ...staff])];
    const requiredPersons = orgRequiredPersons(workerCount);
    return {
      organizationId: org.id,
      organizationName: org.name,
      workerCount,
      managers,
      staff,
      dual: managers.filter((n) => staff.includes(n)),
      persons,
      requiredPersons,
      personShortage: Math.max(0, requiredPersons - persons.length),
      managerMissing: managers.length === 0,
      staffMissing: staff.length === 0,
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

// 「1人当たり n 未満」が要件なので、n人でちょうど割り切れる場合も1人多く必要。
// 例: 20機関を2人（1人10機関）は「10機関未満」を満たさないので3人必要
function requiredFor(value: number, per: number): number {
  return Math.floor(value / per) + 1;
}

// 必要な支援責任者等の人数（機関数・1号特定技能外国人数の両方の上限を満たす人数）
export function requiredSupportPersonCount(orgCount: number, workerCount: number): number {
  return Math.max(
    requiredFor(orgCount, ORGS_PER_SUPPORT_PERSON),
    requiredFor(workerCount, WORKERS_PER_SUPPORT_PERSON),
  );
}

// 支援責任者等が n 人いるときに委託を受けられる機関数の上限（10n 未満なので 10n-1）
export function maxOrgCountFor(personCount: number): number {
  return Math.max(0, personCount * ORGS_PER_SUPPORT_PERSON - 1);
}

// 支援責任者等が n 人いるときに支援できる1号特定技能外国人数の上限（50n 未満なので 50n-1）
export function maxWorkerCountFor(personCount: number): number {
  return Math.max(0, personCount * WORKERS_PER_SUPPORT_PERSON - 1);
}

// 所属機関1社あたりの必要人数（その機関に在籍している1号特定技能外国人の数から算出）
export function orgRequiredPersons(workerCount: number): number {
  return requiredSupportPersonCount(1, workerCount);
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
  requiredPersons: number; // 必要な支援責任者等の人数（機関数・外国人数の上限から）
  currentPersons: number; // 現在の支援責任者等の人数（責任者＋担当者の実人数。兼任は1人）
  personShortage: number; // 支援責任者等の不足数（0なら充足）
  maxOrgs: number; // 現在の人数で委託を受けられる機関数の上限
  maxWorkers: number; // 現在の人数で支援できる1号特定技能外国人数の上限
  currentStaff: number; // 現在の支援担当者数（内訳）
  currentManagers: number; // 現在の支援責任者数（内訳）
  // 機関ごとに必要人数を満たしていない機関
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
  // 支援責任者等 = 支援責任者と支援担当者の実人数（兼務している人は1人として数える）
  const currentPersons = activeRoles.length;
  const requiredPersons = requiredSupportPersonCount(orgCount, workerCount);

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
    requiredPersons,
    currentPersons,
    personShortage: Math.max(0, requiredPersons - currentPersons),
    maxOrgs: maxOrgCountFor(currentPersons),
    maxWorkers: maxWorkerCountFor(currentPersons),
    currentStaff,
    currentManagers,
    understaffedOrgs: orgSummaries.filter(
      (o) => o.personShortage > 0 || o.managerMissing || o.staffMissing,
    ),
    offices,
    eligibleNotAssigned: roles.filter((r) => r.suggestManager).map((r) => r.employee.name),
  };
}
