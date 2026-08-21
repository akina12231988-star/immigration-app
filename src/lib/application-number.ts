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

// 数字だけを取り出す（「福熊C10685号」→「10685」）。
// 通知書の受付番号は数字の部分だけを読み取って入力することが多い
export function applicationNumberDigits(no: string): string {
  return normalizeApplicationNumber(no).replace(/\D/g, "");
}

// 入力した文字がその申請番号に当てはまるか。
// 「福熊C10685号」は「福熊C10685」「10685」「c10685」のどれでも見つかる
export function matchesApplicationNumber(applicationNumber: string, query: string): boolean {
  const q = normalizeApplicationNumber(query);
  if (!q) return false;
  const target = normalizeApplicationNumber(applicationNumber);
  if (!target) return false;
  if (target === q) return true;
  if (target.includes(q)) return true;
  // 数字だけを入れたときは、番号の数字の部分と見比べる
  const qDigits = q.replace(/\D/g, "");
  if (!qDigits || qDigits !== q) return false;
  return applicationNumberDigits(applicationNumber) === qDigits;
}

// 入力した番号で申請を探す。
// ぴったり一致 → 数字が一致 → 一部が一致 の順に並べて返す（1件とは限らない）
export function findApplicationsByNumber<
  T extends Pick<Application, "applicationNumber">,
>(applications: T[], query: string): T[] {
  const q = normalizeApplicationNumber(query);
  if (!q) return [];
  const qDigits = q.replace(/\D/g, "");
  const rank = (a: T) => {
    const target = normalizeApplicationNumber(a.applicationNumber);
    if (target === q) return 0;
    if (qDigits && qDigits === q && applicationNumberDigits(a.applicationNumber) === qDigits) {
      return 1;
    }
    return 2;
  };
  return applications
    .filter((a) => matchesApplicationNumber(a.applicationNumber, query))
    .sort((a, b) => rank(a) - rank(b));
}
