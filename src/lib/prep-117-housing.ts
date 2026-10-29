// １－１７号（特定技能外国人支援計画書）の住居の欄。
// 賃金（1-6号別紙）の居住費の内容から、どこに住むかを A・B・C に振り分け、該当する欄に雇用開始日を書く。
//   A … 外国人が自分で契約する住居（1-6号別紙で「外国人本人が契約」）
//   B … 社宅（会社の自己所有物件）
//   C … 社宅（会社が借りている賃貸物件。区分が未設定の古い登録も賃貸として扱う）

import type { OrgLodging, WorkerWage } from "@/types/db";

export type HousingPatternKey = "A" | "B" | "C";

export const HOUSING_PATTERNS: { key: HousingPatternKey; label: string }[] = [
  { key: "A", label: "外国人が自分で契約する住居" },
  { key: "B", label: "社宅（自己所有物件）" },
  { key: "C", label: "社宅（賃貸物件）" },
];

export interface HousingPattern {
  key: HousingPatternKey | null; // null = 1-6号別紙の居住費が未入力
  lodging: OrgLodging | null; // 社宅のとき、選んだ寮・宿泊物件
  amount: number; // 1-6号別紙の居住費（月額）
  note: string; // 1-6号別紙の居住費の算定方法など
}

// 申請準備で見る賃金の記録（1-6号別紙）。
// この所属機関の記録を優先し、1-6号別紙を入れてあるものを選ぶ（並びは新しい順で渡される）
export function pickPrepWage(wages: WorkerWage[], orgId: string | null): WorkerWage | null {
  const hasDetail = (w: WorkerWage) => !!w.detail && Object.keys(w.detail).length > 0;
  const forOrg = orgId ? wages.filter((w) => w.organization_id === orgId) : [];
  const pool = forOrg.length > 0 ? forOrg : wages;
  return pool.find(hasDetail) ?? pool[0] ?? null;
}

// 申請準備の詳細画面で選んで保存する住居の選択（workers.housing_plan。0209）。
//   main     … どの住居にするか（A・B・C）。未選択は null（1-6号別紙の居住費からの候補を出す）
//   fallback … main ができなかったときに対応予定の候補（main 以外の A・B・C）。未選択は null
export interface HousingPlan {
  main: HousingPatternKey | null;
  fallback: HousingPatternKey | null;
}

function housingKeyOf(v: unknown): HousingPatternKey | null {
  return v === "A" || v === "B" || v === "C" ? v : null;
}

// 保存済みの値（jsonb）を読む。壊れた値・古い形は未選択として扱う
export function normalizeHousingPlan(raw: unknown): HousingPlan {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const main = housingKeyOf(r.main);
  const fallback = housingKeyOf(r.fallback);
  // できなかったときの候補は main と別のものだけ（同じなら無効）
  return { main, fallback: main && fallback && fallback !== main ? fallback : null };
}

// 保存する形（未選択は空文字）
export function housingPlanToJson(plan: HousingPlan): { main: string; fallback: string } {
  return { main: plan.main ?? "", fallback: plan.fallback && plan.fallback !== plan.main ? plan.fallback : "" };
}

// 画面に出す住居（保存した選択があればそれ、無ければ 1-6号別紙の居住費からの候補）
export function effectiveHousingMain(plan: HousingPlan, auto: HousingPatternKey | null): HousingPatternKey | null {
  return plan.main ?? auto;
}

// 「できなかったら」の候補に書く文章。
//   A（本人契約）ができなかった → 「Aの外国人本人による住居の契約ができなかった場合、実施予定」
//   B・C（社宅）ができなかった → 「Bの社宅入居に合意しなかった場合、実施予定」
export function housingFallbackText(main: HousingPatternKey): string {
  return main === "A"
    ? "Aの外国人本人による住居の契約ができなかった場合、実施予定"
    : `${main}の社宅入居に合意しなかった場合、実施予定`;
}

// 1-6号別紙の居住費から A・B・C を決める
export function housingPatternOf(
  detail: WorkerWage["detail"],
  lodgings: OrgLodging[],
): HousingPattern {
  const d = detail ?? {};
  const amount = Number(d.housing_amount) || 0;
  const note = typeof d.housing_note === "string" ? d.housing_note : "";
  if (d.housing_self_contract) return { key: "A", lodging: null, amount, note };
  const lodging = d.housing_lodging_id ? lodgings.find((l) => l.id === d.housing_lodging_id) ?? null : null;
  if (!lodging) return { key: null, lodging: null, amount, note };
  return { key: lodging.kind === "自己所有物件" ? "B" : "C", lodging, amount, note };
}
