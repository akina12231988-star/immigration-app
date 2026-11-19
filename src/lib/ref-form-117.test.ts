import { describe, expect, it } from "vitest";
import { prep117Values } from "./ref-form-117";
import type { Employee } from "@/types/db";
import type { SupportWorker } from "@/lib/support-system";

const emp = (over: Partial<Employee>): Employee =>
  ({
    id: over.name ?? "e",
    name: "",
    kana: "",
    joined_on: "2020-01-01",
    left_on: null,
    employment_kind: "常勤",
    is_representative: false,
    is_officer: false,
    is_support_manager: false,
    is_support_staff: false,
    office: "",
    training_completed_on: null,
    note: "",
    online_user_id: "",
    online_password: "",
    created_at: "",
    ...over,
  }) as Employee;

const sw = (org: string): SupportWorker =>
  ({ current_organization_id: org, support: "支援対象", status: "在籍中", residence_status: "特定技能1号" }) as SupportWorker;

describe("1-17号 支援計画書に記載する項目の値", () => {
  const base = {
    mainNationality: "ベトナム",
    joint: null,
    org: { intake: {} },
    orgId: "org1",
    employees: [
      emp({ name: "VUONG VAN THANH", is_support_manager: true }),
      emp({ name: "山田 花子", is_support_staff: true }),
      emp({ name: "佐藤 一郎", is_support_staff: true, left_on: "2025-01-01" }),
    ],
    supportWorkers: [sw("org1"), sw("org1"), sw("org2")],
    planDates: { guid: "2026-11-20", orient: "2026-12-02", es: "2026-12-01" },
    wage: { detail: { housing_self_contract: true } },
    housingPlan: null,
    interpreters: [],
    today: "2026-11-19",
  };

  it("人数・名簿（在籍中のみ）・日付", () => {
    const v = prep117Values(base as never);
    expect(v.count_all).toBe("3");
    expect(v.count_org).toBe("2");
    expect(v.managers).toBe("VUONG VAN THANH");
    expect(v.staff).toBe("山田 花子");
    expect(v.staff2).toBe("");
    expect(v.guidance).not.toBe("");
    expect(v.joint_name).toBe("");
  });

  it("住居: 1-6号別紙で本人契約なら A に ✓ と雇用開始日", () => {
    const v = prep117Values(base as never);
    expect(v.check_A).toBe("✓");
    expect(v.check_B).toBe("");
    expect(v.housing_A).not.toBe("");
    expect(v.housing_B).toBe("");
  });

  it("住居: できなかった場合の候補には文が入る", () => {
    const v = prep117Values({ ...base, housingPlan: { main: "B", fallback: "A", v: 2 } } as never);
    expect(v.check_B).toBe("✓");
    expect(v.check_A).toBe("✓");
    expect(v.housing_A).toContain("実施予定");
  });
});
