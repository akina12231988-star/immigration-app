// 報酬支払証明書（参考様式第５－７号）。
//
// 給与を通貨払い（現金手渡し）でしている会社は、月ごとに報酬支払証明書を作って
// 本人の署名をもらう必要がある。空欄の用紙をまとめて印刷しておき、
// 毎月1枚ずつ書いてもらう運用のため、在留期間のぶんだけ枚数を出す。

export const PAY_METHOD_CASH = "通貨払い";
export const PAY_METHOD_TRANSFER = "口座振込";

// 所属機関の給与支払い方法が通貨払いか（organizations.intake.pay_method）
export function isCashPay(payMethod: string | null | undefined): boolean {
  return (payMethod ?? "").trim() === PAY_METHOD_CASH;
}

// 所属機関の給与支払い方法が口座振込か。
// 口座振込の会社は、入社書類に通帳の見開き（振込先）が要る
export function isBankTransferPay(payMethod: string | null | undefined): boolean {
  return (payMethod ?? "").trim() === PAY_METHOD_TRANSFER;
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

// ---- 在留期限日までの月数から枚数を出す ----
// 例: 2026/9/1〜2028/1/27 → 2026年9月分〜2028年1月分 = 17枚（両端の月も1枚ずつ数える）

export const PAY_PROOF_MAX_SHEETS = 60;

// "YYYY-MM-DD" または "YYYY-MM" から年・月を取り出す
function ym(value: string | null | undefined): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec((value ?? "").trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { y: Number(m[1]), m: month };
}

// 何月分から印刷するか（YYYY-MM）。雇用開始日がこれからなら雇用開始の月、
// すでに働いているなら今月から
export function payProofStartMonth(today: string, employmentStart?: string | null): string {
  const t = ym(today);
  const e = ym(employmentStart);
  const pick = e && t && (e.y > t.y || (e.y === t.y && e.m > t.m)) ? e : t;
  return pick ? `${pick.y}-${String(pick.m).padStart(2, "0")}` : "";
}

// 開始月〜在留期限日の月までの枚数と表示（読み取れない・期限が前のときは null）
export function payProofRange(
  from: string | null | undefined,
  to: string | null | undefined,
): { count: number; label: string } | null {
  const a = ym(from);
  const b = ym(to);
  if (!a || !b) return null;
  const count = (b.y - a.y) * 12 + (b.m - a.m) + 1;
  if (count < 1) return null;
  return { count, label: `${a.y}年${a.m}月分〜${b.y}年${b.m}月分` };
}

// 印刷（PDF保存）のときの既定のファイル名
export function payProofFileName(workerName: string): string {
  const safe = (workerName ?? "").replace(/[\\/:*?"<>|]/g, "-").trim();
  return ["報酬支払証明書", safe].filter(Boolean).join("_");
}
