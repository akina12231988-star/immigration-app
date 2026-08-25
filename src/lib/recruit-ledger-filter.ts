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
      return {
        ...e,
        applications: e.applications.filter((a) => nameKey(a.worker_name) === nameKey(name)),
      };
    });
}

// 氏名の突き合わせ用（全角・半角の空白の違いで別人にしない）
function nameKey(s: string): string {
  return (s ?? "").replace(/[\s　]+/g, "").trim();
}

// 点検する組み合わせ（求人 × 求職者）を、帳簿を絞るのに使う形にしたもの
export interface AuditPair {
  acceptanceNo: string; // 求人受理番号（求職管理簿の絞り込みに使う）
  organizationId: string | null; // 求人者（手数料管理簿の絞り込みに使う）
  workerName: string;
  applicationId: string | null; // 応募（台帳の行と紐づいていればこれで判定する）
}

// 点検する「求人 × 求職者」の組み合わせ。
// 求職管理簿・手数料管理簿を、その組み合わせの行だけにするために使う
export function auditPairs(entries: PostingLedgerEntry[], targets: AuditTarget[]): AuditPair[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out: AuditPair[] = [];
  for (const t of targets) {
    const entry = byId.get(t.postingId);
    if (!entry) continue;
    const hired = entry.applications.filter((a) => a.result === "採用" && a.worker_name);
    const chosen = t.workerName.trim()
      ? hired.filter((a) => nameKey(a.worker_name) === nameKey(t.workerName))
      : hired;
    // 応募が見つからないときも、選んだ氏名だけで突き合わせられるようにしておく
    const rows =
      chosen.length > 0
        ? chosen.map((a) => ({ workerName: a.worker_name.trim(), applicationId: a.id ?? null }))
        : t.workerName.trim()
          ? [{ workerName: t.workerName.trim(), applicationId: null }]
          : [];
    for (const r of rows) {
      out.push({
        acceptanceNo: entry.acceptance_no,
        organizationId: entry.organization_id,
        workerName: r.workerName,
        applicationId: r.applicationId,
      });
    }
  }
  return out;
}

// 手数料管理簿の1行（絞り込みに使う分だけ）
export interface AuditFeeRow {
  organization_id: string | null;
  worker_name: string;
  job_application_id?: string | null;
}

// 選ばれた組み合わせの手数料だけにする。
// 応募と紐づいた行はその応募で、手数料管理簿から直接入れた行は
// 「求人者 × 氏名」で突き合わせる
export function filterFeeLedger<T extends AuditFeeRow>(fees: T[], pairs: AuditPair[]): T[] {
  const appIds = new Set(pairs.map((p) => p.applicationId).filter(Boolean) as string[]);
  const orgNames = new Set(
    pairs
      .filter((p) => p.organizationId)
      .map((p) => `${p.organizationId}\u0000${nameKey(p.workerName)}`),
  );
  return fees.filter((f) =>
    f.job_application_id && appIds.size > 0
      ? appIds.has(f.job_application_id)
      : orgNames.has(`${f.organization_id}\u0000${nameKey(f.worker_name)}`),
  );
}

// 選ばれた求職者だけの求職管理簿にする。
// その人の明細も、点検する求人の分だけにする（他社への紹介の行は出さない）
export function filterSeekerLedger(
  entries: SeekerLedgerEntry[],
  pairs: { acceptanceNo: string; workerName: string }[],
): SeekerLedgerEntry[] {
  const nosByName = new Map<string, Set<string>>();
  for (const p of pairs) {
    const name = nameKey(p.workerName);
    if (!name) continue;
    const set = nosByName.get(name) ?? new Set<string>();
    if (p.acceptanceNo) set.add(p.acceptanceNo);
    nosByName.set(name, set);
  }
  return entries
    .filter((e) => nosByName.has(nameKey(e.name)))
    .map((e) => {
      const nos = nosByName.get(nameKey(e.name));
      if (!nos || nos.size === 0) return e;
      return { ...e, applications: e.applications.filter((a) => nos.has(a.acceptance_no)) };
    });
}

// ファイル名・見出しに入れるリストNo.（例: "1・3"）。番号が無いときは空
export function listNoLabel(nos: number[]): string {
  return [...nos].sort((a, b) => a - b).join("・");
}
