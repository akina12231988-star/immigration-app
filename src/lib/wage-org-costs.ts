// 所属機関の「1-6号別紙に記載する内容（求人票に記載するその他の内容）」の水道光熱費・通信費を、
// 外国人の賃金の1-6号別紙（WageDetail）に連動させる。
// 水道光熱費 → (f) 水道光熱費（徴収の仕方・金額）、通信費 → その他控除の「通信費」の行。

import type { OrganizationIntake, WageDetail, WageUtilityKind } from "@/types/db";

export const COMM_DEDUCTION_NAME = "通信費";

// 「3,000」「約3000円」→ 3000。「無し」「なし」・空は 0
function yen(v: string | null | undefined): number {
  const digits = (v ?? "").normalize("NFKC").replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
}

export interface OrgCosts {
  utilityKind: WageUtilityKind | null; // 所属機関の徴収の仕方（未登録は null）
  utility: number; // 水道光熱費（円・未登録は 0）
  comm: number; // 通信費（円・「無し」や未登録は 0）
  registered: boolean; // どちらか登録されているか
}

export function orgCosts(
  intake: Partial<Pick<OrganizationIntake, "posting_utility_cost" | "posting_utility_kind" | "posting_comm_cost">> | null | undefined,
): OrgCosts {
  const kindRaw = (intake?.posting_utility_kind ?? "").trim();
  const utilityKind: WageUtilityKind | null = kindRaw === "実費" ? "実費" : kindRaw.startsWith("固定") ? "固定額" : null;
  const utilityText = (intake?.posting_utility_cost ?? "").trim();
  const commText = (intake?.posting_comm_cost ?? "").trim();
  return {
    utilityKind,
    utility: yen(utilityText),
    comm: yen(commText),
    registered: !!(utilityText || commText || utilityKind),
  };
}

// 別紙の内容に所属機関の水道光熱費・通信費を入れる（通信費が0ならその他控除の「通信費」の行を外す）
export function applyOrgCosts(detail: WageDetail, costs: OrgCosts): WageDetail {
  const others = detail.others.filter((o) => o.name.trim() !== COMM_DEDUCTION_NAME);
  return {
    ...detail,
    utility_kind: costs.utilityKind ?? detail.utility_kind,
    utility_amount: costs.utility,
    others: costs.comm > 0 ? [...others, { name: COMM_DEDUCTION_NAME, amount: costs.comm }] : others,
  };
}

// 別紙の内容が所属機関の登録と同じか（違えば「所属機関の登録を入れる」を出す）
export function matchesOrgCosts(detail: WageDetail, costs: OrgCosts): boolean {
  if (!costs.registered) return true;
  const comm = detail.others.find((o) => o.name.trim() === COMM_DEDUCTION_NAME)?.amount ?? 0;
  return (
    detail.utility_amount === costs.utility &&
    (costs.utilityKind == null || detail.utility_kind === costs.utilityKind) &&
    comm === costs.comm
  );
}
