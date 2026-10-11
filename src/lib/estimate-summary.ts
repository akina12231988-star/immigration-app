// 申請詳細・請求書作成で「申請準備の見積書」の内容を出すための選び方。
//
// 見積書は申請準備のリスト（TODO番号ごと）の申請種別と収入印紙代の負担から作る。
// 申請にはTODO番号が無いので、その外国人の準備リストのうち、負担（本人負担／会社負担）が
// 決まっているいちばん新しいものを使う。負担が決まっていなければ出さない。

import { prepDetailHref, type PrepAppType } from "@/lib/application-prep";
import { effectiveStampFeePayer, type StampFeePayer } from "@/lib/stamp-fee";

export interface EstimateChecklistLike {
  todo_no: string;
  app_content: string;
  app_type: "" | PrepAppType;
  stamp_fee_payer: string;
  updated_at: string;
}

// 見積書に使う準備リスト（負担が決まっているいちばん新しいもの）。無ければ null
export function pickEstimateChecklist<T extends EstimateChecklistLike>(
  lists: readonly T[],
  orgName: string | null | undefined,
): { checklist: T; payer: StampFeePayer } | null {
  const sorted = [...lists].sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  for (const l of sorted) {
    const payer = effectiveStampFeePayer(l.stamp_fee_payer, orgName);
    if (payer) return { checklist: l, payer };
  }
  return null;
}

// 見積書の印刷ページ（申請準備の詳細の「🧾 見積書」と同じ場所）
export function estimateHref(workerId: string, todoNo: string): string {
  return `${prepDetailHref(workerId)}/estimate?todo=${encodeURIComponent(todoNo)}`;
}

// 個人票（社内用・QRあり）の印刷ページ。1人だけを現在の所属機関で印刷する
export function workerSheetPrintHref(workerId: string): string {
  return `/workers/print?worker=${encodeURIComponent(workerId)}`;
}
