// 報酬支払証明書（参考様式第５－７号）。
//
// 給与を通貨払い（現金手渡し）でしている会社は、月ごとに報酬支払証明書を作って
// 本人の署名をもらう必要がある。空欄の用紙をまとめて印刷しておき、
// 毎月1枚ずつ書いてもらう運用のため、在留期間のぶんだけ枚数を出す。

export const PAY_METHOD_CASH = "通貨払い";

// 所属機関の給与支払い方法が通貨払いか（organizations.intake.pay_method）
export function isCashPay(payMethod: string | null | undefined): boolean {
  return (payMethod ?? "").trim() === PAY_METHOD_CASH;
}

export const PAY_PROOF_SHEET_COUNTS = [6, 12] as const;
export type PayProofSheetCount = (typeof PAY_PROOF_SHEET_COUNTS)[number];

// 在留期間から印刷枚数を決める（1か月に1枚）。
// 1年以上なら12枚、1年に満たない（6月など）なら6枚。
// 在留期間が未登録・読み取れないときは足りなくならないよう12枚にする
export function payProofSheetCount(
  residencePeriod: string | null | undefined,
): PayProofSheetCount {
  // 「１年」のような全角数字も読めるようにそろえる
  const p = (residencePeriod ?? "").normalize("NFKC").trim();
  const years = /(\d+)\s*年/.exec(p);
  if (years && Number(years[1]) >= 1) return 12;
  const months = /(\d+)\s*(?:か月|ヶ月|カ月|ケ月|月)/.exec(p);
  if (months) return Number(months[1]) >= 12 ? 12 : 6;
  return 12;
}

// 印刷（PDF保存）のときの既定のファイル名
export function payProofFileName(workerName: string): string {
  const safe = (workerName ?? "").replace(/[\\/:*?"<>|]/g, "-").trim();
  return ["報酬支払証明書", safe].filter(Boolean).join("_");
}
