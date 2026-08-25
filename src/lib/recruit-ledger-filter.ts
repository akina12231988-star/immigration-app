import type { PostingLedgerEntry, SeekerLedgerEntry } from "@/lib/recruit-ledgers";

// 労働局の訪問指導（当日点検）で出す分だけに、求人管理簿・求職管理簿を絞る。
//
// 様式30（求人者リスト）を出すと、労働局から「リストNo.◯とNo.◯を当日点検します」と
// 連絡が来る。そのとき出すのは選ばれた求人と、その求人で就職にいたった求職者
// （1件につき1人）の分だけでよいため、全件をそのまま出さずにここで絞り込む。

// 選ばれた求人（様式30のリストNo.に当たる求人）だけの求人管理簿にする
export function filterPostingLedger(
  entries: PostingLedgerEntry[],
  postingIds: string[],
): PostingLedgerEntry[] {
  const ids = new Set(postingIds);
  return entries.filter((e) => ids.has(e.id));
}

// 選ばれた求職者だけの求職管理簿にする（氏名で選ぶ）。
// その人の応募の履歴はその人の記録なので、行は減らさずそのまま残す
export function filterSeekerLedger(
  entries: SeekerLedgerEntry[],
  workerNames: string[],
): SeekerLedgerEntry[] {
  const names = new Set(workerNames.map((n) => n.trim()).filter(Boolean));
  return entries.filter((e) => names.has(e.name.trim()));
}

// ファイル名に入れるリストNo.（例: "1・3"）。番号が無いときは空
export function listNoLabel(nos: number[]): string {
  return [...nos].sort((a, b) => a - b).join("・");
}
