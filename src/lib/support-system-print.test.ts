import { describe, expect, it } from "vitest";
import { supportSystemPrintFileName, supportSystemPrintPeople } from "./support-system-print";
import { emptyOrganizationIntake } from "./organization-intake";
import type { Employee } from "@/types/db";

const emp = (name: string, patch: Partial<Employee> = {}): Employee => ({
  id: name,
  name,
  kana: "",
  joined_on: "2020-04-01",
  left_on: null,
  employment_kind: "常勤",
  is_representative: false,
  is_officer: false,
  is_support_manager: false,
  is_support_staff: false,
  office: "",
  training_completed_on: null,
  note: "",
  created_at: "",
  updated_at: "",
  ...patch,
});

describe("supportSystemPrintPeople", () => {
  const employees = [
    emp("VUONG VAN THANH", { is_support_manager: true, is_support_staff: true }),
    emp("市原　彩奈", { is_support_staff: true }),
    emp("秋吉　伽恋", { is_support_staff: true }),
    emp("退職者", { is_support_staff: true, left_on: "2025-01-31" }),
    emp("事務", {}),
  ];

  it("在籍中で役割のある人を出し、機関の指定が無ければ全員選んだ状態", () => {
    const p = supportSystemPrintPeople(employees, "2026-09-13");
    expect(p.managers.map((x) => x.name)).toEqual(["VUONG VAN THANH"]);
    expect(p.staff.map((x) => x.name)).toEqual(["VUONG VAN THANH", "市原　彩奈", "秋吉　伽恋"]);
    expect(p.staff.every((x) => x.selected)).toBe(true);
  });

  it("所属機関を指定すると、その機関に選任されている人だけを選んだ状態にする", () => {
    const intake = { ...emptyOrganizationIntake(), support_managers: ["VUONG VAN THANH"], support_staff: ["秋吉　伽恋"] };
    const p = supportSystemPrintPeople(employees, "2026-09-13", intake);
    expect(p.managers.find((x) => x.name === "VUONG VAN THANH")?.selected).toBe(true);
    expect(p.staff.filter((x) => x.selected).map((x) => x.name)).toEqual(["秋吉　伽恋"]);
  });

  it("ファイル名は機関名付き", () => {
    expect(supportSystemPrintFileName("坂口農園")).toBe("坂口農園_支援業務を行う体制についての説明");
    expect(supportSystemPrintFileName("")).toBe("支援業務を行う体制についての説明");
  });
});
