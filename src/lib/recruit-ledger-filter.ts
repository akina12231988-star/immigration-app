import type { PostingLedgerEntry, SeekerLedgerEntry } from "@/lib/recruit-ledgers";

// 労働局の訪問指導（当日点検）で出す分だけに、求人管理簿・求職管理簿を絞る。
//
// 様式30（求人者リスト）を出すと、労働局から「リストNo.◯とNo.◯を当日点検します」と
// 連絡が来る。点検するのは、その求人と「就職にいたった求職者を1件につき1人」の組み合わせ
// なので、その組み合わせの行だけを出す（他の応募者・他の求人の行は出さない）。

// 点検する組み合わせ（様式30のリストNo. ＝ 求人 × 選んだ求職者）
export interface AuditTarget {
  listNo: number;
  postingId: string;
  workerName: string; // 選んだ求職者。空なら、その求人の行はすべて出す
}

// 選ばれた求人だけの求人管理簿にする。
// 求職者を選んでいれば、その求人の明細もその人の分だけにする
export function filterPostingLedger(
  entries: PostingLedgerEntry[],
  targets: AuditTarget[],
): PostingLedgerEntry[] {
  const byId = new Map(targets.map((t) => [t.postingId, t]));
  return entries
    .filter((e) => byId.has(e.id))
    .map((e) => {
      const name = byId.get(e.id)?.workerName.trim() ?? "";
      if (!name) return e;
      return { ...e, applications: e.applications.filter((a) => a.worker_name.trim() === name) };
    });
}

// 点検する「求人受理番号 × 求職者名」の組み合わせ。
// 求職管理簿を、その組み合わせの行だけにするために使う
export function auditPairs(
  entries: PostingLedgerEntry[],
  targets: AuditTarget[],
): { acceptanceNo: string; workerName: string }[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out: { acceptanceNo: string; workerName: string }[] = [];
  for (const t of targets) {
    const entry = byId.get(t.postingId);
    if (!entry) continue;
    const names = t.workerName.trim()
      ? [t.workerName.trim()]
      : [
          ...new Set(
            entry.applications
              .filter((a) => a.result === "採用" && a.worker_name)
              .map((a) => a.worker_name.trim()),
          ),
        ];
    for (const workerName of names) out.push({ acceptanceNo: entry.acceptance_no, workerName });
  }
  return out;
}

// 選ばれた求職者だけの求職管理簿にする。
// その人の明細も、点検する求人の分だけにする（他社への紹介の行は出さない）
export function filterSeekerLedger(
  entries: SeekerLedgerEntry[],
  pairs: { acceptanceNo: string; workerName: string }[],
): SeekerLedgerEntry[] {
  const nosByName = new Map<string, Set<string>>();
  for (const p of pairs) {
    const name = p.workerName.trim();
    if (!name) continue;
    const set = nosByName.get(name) ?? new Set<string>();
    if (p.acceptanceNo) set.add(p.acceptanceNo);
    nosByName.set(name, set);
  }
  return entries
    .filter((e) => nosByName.has(e.name.trim()))
    .map((e) => {
      const nos = nosByName.get(e.name.trim());
      if (!nos || nos.size === 0) return e;
      return { ...e, applications: e.applications.filter((a) => nos.has(a.acceptance_no)) };
    });
}

// ファイル名・見出しに入れるリストNo.（例: "1・3"）。番号が無いときは空
export function listNoLabel(nos: number[]): string {
  return [...nos].sort((a, b) => a - b).join("・");
}
