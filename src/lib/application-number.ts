import type { Application } from "@/types/application";

// 申請番号（入管の受付番号。例「福熊E91138号」）の突き合わせ。
//
// 受付票の番号は最後に「号」が付いているが、入力するときは省くことが多い。
// 全角・半角、間の空白の有無もばらつくため、比べるときはそろえてから比べる。
// （保存するのは入力したままの文字。比較のときだけそろえる）
export function normalizeApplicationNumber(no: string): string {
  const half = (no ?? "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
  return half
    .replace(/[\s　]/g, "")
    .replace(/号+$/, "")
    .toUpperCase();
}

// 同じ申請番号で登録済みの申請を探す（自分自身は除く）。
// 見つからなければ undefined
export function findDuplicateApplication<
  T extends Pick<Application, "id" | "applicationNumber">,
>(applications: T[], applicationNumber: string, excludeId?: string | null): T | undefined {
  const key = normalizeApplicationNumber(applicationNumber);
  if (!key) return undefined;
  return applications.find(
    (a) => a.id !== excludeId && normalizeApplicationNumber(a.applicationNumber) === key,
  );
}
