// 参考様式の記入位置に置く「1-17号 特定技能外国人支援計画書に記載する項目」の値。
// 申請準備の「１－１７号の特定技能外国人支援計画書に記載する項目」（components/workers/PrepSupportOrgSection.tsx の
// Prep117Section）と同じ計算で、PDF に書く文字にする。
import type { Employee, Organization, WorkerWage } from "@/types/db";
import { interpreterForNationality, type SupportOrgInterpreter } from "@/lib/custody";
import {
  isActiveEmployee,
  isSupportedSsw1,
  orgSupportManagers,
  orgSupportStaff,
  requiredSupportStaffCount,
  type SupportWorker,
} from "@/lib/support-system";
import { filledCouncilSubmissions, normalizeOrganizationIntake } from "@/lib/organization-intake";
import {
  HOUSING_PATTERNS,
  effectiveHousingMain,
  housingFallbackText,
  housingPatternOf,
  normalizeHousingPlan,
} from "@/lib/prep-117-housing";
import { rosterJpDate } from "@/lib/roster";

// 置く項目（key → 値の名前）。check_A などは、その住居を選んだときだけ ✓ を書く
export const P117_FIELDS = [
  { key: "joint_name", label: "1. 連名の方の氏名", sample: "TRAN VAN B" },
  { key: "joint_birth", label: "1. 連名の方の生年月日", sample: "1996年5月1日" },
  { key: "joint_gender", label: "1. 連名の方の性別", sample: "男" },
  { key: "joint_nationality", label: "1. 連名の方の国籍", sample: "ベトナム" },
  { key: "count_all", label: "3. 支援している人数（当社全体）", sample: "196" },
  { key: "count_org", label: "3. 支援している人数（この所属機関）", sample: "3" },
  { key: "staff_required", label: "3. 必要な支援担当者の人数", sample: "4" },
  { key: "managers", label: "4. 支援責任者（全員・「、」区切り）", sample: "VUONG VAN THANH" },
  { key: "manager1", label: "4. 支援責任者（1人目）", sample: "VUONG VAN THANH" },
  { key: "staff", label: "4. 支援担当者（全員・「、」区切り）", sample: "山田 花子、NGUYEN THI C" },
  { key: "staff1", label: "4. 支援担当者（1人目）", sample: "山田 花子" },
  { key: "staff2", label: "4. 支援担当者（2人目）", sample: "NGUYEN THI C" },
  { key: "staff3", label: "4. 支援担当者（3人目）", sample: "佐藤 一郎" },
  { key: "interpreter", label: "4-2. 母国語の通訳者", sample: "NGUYEN THI D" },
  { key: "interpreter_language", label: "4-2. 通訳する言語", sample: "ベトナム語" },
  { key: "guidance", label: "5. 事前ガイダンスの実施日", sample: "2026年11月20日" },
  ...HOUSING_PATTERNS.flatMap((p) => [
    { key: `check_${p.key}`, label: `6. 住居 ${p.key}（${p.label}）を選んだら ✓`, sample: "✓" },
    { key: `housing_${p.key}`, label: `6. 住居 ${p.key} の欄の文（雇用開始日・できなかった場合）`, sample: p.key === "B" ? "2026年12月1日" : "" },
  ]),
  { key: "orientation", label: "7. 生活オリエンテーションの実施日", sample: "2026年12月2日" },
  { key: "council_office_to", label: "8. 協力確認書 事業所の所在地 提出先", sample: "農業特定技能協議会" },
  { key: "council_office_on", label: "8. 協力確認書 事業所の所在地 提出日", sample: "2026年11月1日" },
  { key: "council_residence_to", label: "8. 協力確認書 住居地 提出先", sample: "菊池市" },
  { key: "council_residence_on", label: "8. 協力確認書 住居地 提出日", sample: "2026年11月1日" },
] as const;
export type P117Key = (typeof P117_FIELDS)[number]["key"];

export interface Prep117Input {
  mainNationality: string;
  joint: { name: string; birth: string | null; gender: string; nationality: string } | null;
  org: Pick<Organization, "intake"> | null;
  orgId: string | null;
  employees: Employee[];
  supportWorkers: SupportWorker[];
  planDates: Record<string, string>;
  wage: Pick<WorkerWage, "detail"> | null;
  housingPlan: unknown; // workers.housing_plan
  interpreters: SupportOrgInterpreter[];
  today: string; // YYYY-MM-DD
}

const jp = (d: string | null | undefined) => (d ? rosterJpDate(d) : "");

export function prep117Values(input: Prep117Input): Record<string, string> {
  const { org, orgId, employees, supportWorkers, planDates, today } = input;
  const intake = normalizeOrganizationIntake(org?.intake);

  // 3. 人数
  const supported = supportWorkers.filter(isSupportedSsw1);
  const orgCount = orgId ? supported.filter((w) => w.current_organization_id === orgId).length : 0;

  // 4. 名簿（この所属機関に選任されている人。未選任なら在籍中の全員）
  const orgManagers = org ? orgSupportManagers(org.intake) : [];
  const orgStaff = org ? orgSupportStaff(org.intake) : [];
  const managers =
    orgManagers.length > 0 ? orgManagers : employees.filter((e) => isActiveEmployee(e, today) && e.is_support_manager).map((e) => e.name);
  const staff =
    orgStaff.length > 0 ? orgStaff : employees.filter((e) => isActiveEmployee(e, today) && e.is_support_staff).map((e) => e.name);

  // 4-2. 通訳者（本人の国籍の言語）
  const { language, interpreter } = interpreterForNationality(input.interpreters, input.mainNationality);

  // 6. 住居
  const housing = housingPatternOf(input.wage?.detail ?? null, intake.lodgings);
  const plan = normalizeHousingPlan(input.housingPlan);
  const main = effectiveHousingMain(plan, housing.key);
  const fallback = main && plan.fallback !== main ? plan.fallback : null;
  const employStart = planDates.es ?? "";

  // 8. 協力確認書（それぞれ1件目）
  const office = filledCouncilSubmissions(intake.council_office_submissions)[0];
  const residence = filledCouncilSubmissions(intake.council_residence_submissions)[0];

  const out: Record<string, string> = {
    joint_name: input.joint?.name ?? "",
    joint_birth: jp(input.joint?.birth),
    joint_gender: input.joint?.gender ?? "",
    joint_nationality: input.joint?.nationality ?? "",
    count_all: String(supported.length),
    count_org: orgId ? String(orgCount) : "",
    staff_required: String(requiredSupportStaffCount(supported.length)),
    managers: managers.join("、"),
    manager1: managers[0] ?? "",
    staff: staff.join("、"),
    staff1: staff[0] ?? "",
    staff2: staff[1] ?? "",
    staff3: staff[2] ?? "",
    interpreter: interpreter?.name ?? "",
    interpreter_language: language,
    guidance: jp(planDates.guid),
    orientation: jp(planDates.orient),
    council_office_to: office?.to ?? "",
    council_office_on: jp(office?.on),
    council_residence_to: residence?.to ?? "",
    council_residence_on: jp(residence?.on),
  };
  for (const p of HOUSING_PATTERNS) {
    const hit = main === p.key;
    const alt = fallback === p.key;
    out[`check_${p.key}`] = hit || alt ? "✓" : "";
    out[`housing_${p.key}`] = hit ? jp(employStart) : alt && main ? housingFallbackText(main) : "";
  }
  return out;
}
