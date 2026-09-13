import type { Employee, OrganizationIntake } from "@/types/db";
import { isActiveEmployee, orgSupportManagers, orgSupportStaff } from "@/lib/support-system";

// 「支援業務を行う体制についての説明」（A4印刷）に載せる支援責任者・支援担当者。
// 在籍中で役割が付いている従業員を全員出し、印刷する人は画面のチェックで選べる。
// 所属機関を指定して開いたときは、その機関の支援責任者・支援担当者だけを最初から選んだ状態にする
export interface PrintPerson {
  id: string;
  name: string;
  office: string;
  selected: boolean;
}

export interface SupportSystemPrintPeople {
  managers: PrintPerson[];
  staff: PrintPerson[];
}

export function supportSystemPrintPeople(
  employees: Employee[],
  today: string,
  orgIntake?: Partial<OrganizationIntake> | null,
): SupportSystemPrintPeople {
  const active = employees.filter((e) => isActiveEmployee(e, today));
  const orgManagers = orgIntake ? new Set(orgSupportManagers(orgIntake)) : null;
  const orgStaff = orgIntake ? new Set(orgSupportStaff(orgIntake)) : null;
  const person = (e: Employee, assigned: Set<string> | null): PrintPerson => ({
    id: e.id,
    name: e.name,
    office: e.office,
    // 機関の指定が無ければ全員、あればその機関に選任されている人だけを選んだ状態にする
    selected: assigned ? assigned.has(e.name) : true,
  });
  return {
    managers: active.filter((e) => e.is_support_manager).map((e) => person(e, orgManagers)),
    staff: active.filter((e) => e.is_support_staff).map((e) => person(e, orgStaff)),
  };
}

// 印刷（PDF保存）のファイル名
export function supportSystemPrintFileName(orgName: string): string {
  return orgName ? `${orgName}_支援業務を行う体制についての説明` : "支援業務を行う体制についての説明";
}
