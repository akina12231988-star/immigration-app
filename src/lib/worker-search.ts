// 一覧を「外国人の氏名」で探すための小さな検索ヘルパー。
// 氏名（ローマ字・漢字）とふりがなの両方で部分一致する。
// 申請準備と求職一覧の氏名検索で使う。

export interface SearchableWorker {
  name: string;
  kana?: string | null;
}

// 検索用の正規化: 空白（半角・全角）を除き、小文字にそろえる。
// 「NGUYEN VAN A」を「nguyenvana」でも探せるようにするため。
export function normalizeSearchText(text: string): string {
  return text.replace(/[\s　]/g, "").toLowerCase();
}

// 氏名またはふりがなに、入力した文字が含まれるか
export function matchesWorkerName(worker: SearchableWorker, query: string): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  return [worker.name, worker.kana ?? ""].some((t) => normalizeSearchText(t).includes(q));
}

// 入力に応じた候補。前方一致を先に、そのあと五十音順で最大 limit 件。
export function workerNameSuggestions<T extends SearchableWorker>(
  workers: T[],
  query: string,
  limit = 8,
): T[] {
  const q = normalizeSearchText(query);
  if (!q) return [];
  const rank = (w: T) => (normalizeSearchText(w.name).startsWith(q) ? 0 : 1);
  return workers
    .filter((w) => matchesWorkerName(w, query))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "ja"))
    .slice(0, limit);
}

