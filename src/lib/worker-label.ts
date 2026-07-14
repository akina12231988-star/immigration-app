// 同姓同名対策: 同じ氏名が複数いる場合は「氏名（所属機関名）」で表示する。
// 内部では常に UUID で識別し、表示のみ機関名を補う。

export interface WorkerLite {
  id: string;
  name: string;
  current_organization_id?: string | null;
}

export interface WorkerOption {
  id: string;
  label: string;
}

// 氏名の重複を検出し、重複する氏名にのみ（所属機関名）を付す
export function buildWorkerOptions(
  workers: WorkerLite[],
  orgs: { id: string; name: string }[],
): WorkerOption[] {
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const counts = new Map<string, number>();
  for (const w of workers) counts.set(w.name, (counts.get(w.name) ?? 0) + 1);

  return workers.map((w) => ({ id: w.id, label: workerLabel(w, counts, orgName) }));
}

// 単体のラベル（一覧カード等でも使えるよう関数化）
export function workerLabel(
  w: WorkerLite,
  counts: Map<string, number>,
  orgName: Map<string, string>,
): string {
  const dup = (counts.get(w.name) ?? 0) > 1;
  if (!dup) return w.name;
  const org = w.current_organization_id ? orgName.get(w.current_organization_id) : undefined;
  return `${w.name}（${org ?? "所属未設定"}）`;
}

// 氏名の出現回数マップを作る補助
export function nameCounts(names: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return counts;
}
