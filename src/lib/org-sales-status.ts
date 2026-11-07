// 所属機関ごとの「申請種別ごとの売上明細」と収入印紙代の負担の登録状況。
// 所属機関の情報で明細を登録していない（全所属機関共通の既定のまま・明細なし）機関や、
// 収入印紙代（6,000円超）の負担を選んでいない機関を一覧で見つけるために使う。

import { normalizeOrganizationIntake, parseAmount } from "@/lib/organization-intake";
import { REFERRAL_SALES_KEY, SALES_APP_KINDS, hasCustomSalesItems, salesItemsForKind } from "@/lib/sales";
import { isStampFeePayer, type StampFeePayer } from "@/lib/stamp-fee";

export const ORG_SALES_STATUS_KINDS: string[] = [...SALES_APP_KINDS, REFERRAL_SALES_KEY];

// custom = この機関だけの明細を登録済み / default = 未登録（既定の明細を使っている）/ empty = 明細なし
export type OrgSalesKindState = "custom" | "default" | "empty";

export interface OrgSalesKindStatus {
  kind: string;
  state: OrgSalesKindState;
  total: number; // 明細の合計（税抜）
}

export interface OrgSalesStatus {
  orgId: string;
  orgName: string;
  supportEnded: boolean; // 支援委託終了の機関
  kinds: OrgSalesKindStatus[];
  stampFeePayer: StampFeePayer | ""; // 収入印紙代（6,000円超）の負担の既定（'' = 未設定）
  unregisteredCount: number; // 未登録（既定のまま・明細なし）の申請種別の数＋印紙代の負担が未設定なら1
}

export function orgSalesStatus(org: { id: string; name: string; intake: unknown }): OrgSalesStatus {
  const intake = normalizeOrganizationIntake(org.intake as never);
  const kinds = ORG_SALES_STATUS_KINDS.map((kind): OrgSalesKindStatus => {
    const items = salesItemsForKind(intake, kind, org.name).filter((r) => r.name.trim() || r.amount.trim());
    const total = items.reduce((n, r) => n + (parseAmount(r.amount) ?? 0), 0);
    const state: OrgSalesKindState = items.length === 0 ? "empty" : hasCustomSalesItems(intake, kind) ? "custom" : "default";
    return { kind, state, total };
  });
  const payer = isStampFeePayer(intake.stamp_fee_payer) ? (intake.stamp_fee_payer.trim() as StampFeePayer) : "";
  return {
    orgId: org.id,
    orgName: org.name,
    supportEnded: intake.support_contract_status === "支援委託終了",
    kinds,
    stampFeePayer: payer,
    unregisteredCount: kinds.filter((k) => k.state !== "custom").length + (payer ? 0 : 1),
  };
}
