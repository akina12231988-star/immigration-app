// 前回の申請準備リストで、どの年度の課税証明書・納税証明書・何年分の源泉徴収票を
// 添付したかを、今回の必要書類の行に出すための判定。
//
// 前回の申請（1年以内）の申請日・申請番号（prior-application.ts）と組み合わせて
// 「前回提出（申請日 ○／申請番号 ○）: 令和7年度を添付 → 今回も同じ年度なので再提出を省けます」
// のように出し、その書類を使い回すかどうかをその場で判断できるようにする。
import { prepDocYear, prepYearDocKey, type PrepDocDef } from "@/lib/application-prep";
import { gensenDocKey, reiwaYear } from "@/lib/onboarding";

export interface PriorChecklistSource {
  id: string;
  todo_no: string;
  target_reiwa: number | null;
  planned_app_on: string | null;
  updated_at: string; // ISO 日時
}

// 前回の準備リスト。表示中のリスト以外から、前回の申請日にいちばん近い（申請日の少し後まで含む）
// リストを選ぶ。申請日が分からなければ、いちばん最近更新したリスト
export function previousChecklist<T extends PriorChecklistSource>(
  lists: T[],
  currentTodoNo: string | null,
  priorApplicationOn: string | null,
): T | null {
  const others = lists.filter((l) => l.todo_no !== (currentTodoNo ?? ""));
  if (others.length === 0) return null;
  const base = (l: T) => l.planned_app_on ?? l.updated_at.slice(0, 10);
  const sorted = [...others].sort((a, b) => base(b).localeCompare(base(a)));
  if (!priorApplicationOn) return sorted[0];
  const limit = addDays(priorApplicationOn, 60);
  return sorted.find((l) => base(l) <= limit) ?? sorted[sorted.length - 1];
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// 前回のリストでその書類に使った年度（源泉徴収票は年分、国保税は当時の最新年度）
export function priorDocYear(def: PrepDocDef, prev: PriorChecklistSource): number | null {
  if (!def.yearKind) return null;
  const baseDate = prev.planned_app_on ?? prev.updated_at.slice(0, 10);
  return prepDocYear(def, prev.target_reiwa, reiwaYear(baseDate));
}

// 前回の年度の書類が添付されているか（年度付きで蓄積される書類だけ判定できる）
export function priorDocAttached(
  def: PrepDocDef,
  year: number,
  docs: { doc_key: string; storage_path: string }[],
): boolean | null {
  let key: string | null = null;
  if (def.source.kind === "docYear") key = prepYearDocKey(def.source.baseKey, year);
  else if (def.source.kind === "gensenYear") key = gensenDocKey(year);
  if (!key) return null;
  return docs.some((d) => d.storage_path && (d.doc_key === key || d.doc_key.startsWith(`${key}_p`)));
}

// 行に出す年度の案内。例:
//   「令和7年度を添付済み → 今回も令和7年度なので再提出を省けます」
//   「令和6年度を添付済み（今回は令和7年度が必要）」
//   「令和7年度（添付なし）」
// 年度の付かない書類（保険証・年金記録）や前回の年度が分からないときは空
export function priorDocYearNote(
  def: PrepDocDef,
  prev: PriorChecklistSource,
  thisYear: number | null,
  docs: { doc_key: string; storage_path: string }[],
): string {
  const year = priorDocYear(def, prev);
  if (year == null || !def.yearKind) return "";
  const label = `令和${year}${def.yearKind}`;
  const attached = priorDocAttached(def, year, docs);
  const head = attached === false ? `${label}（添付なし）` : `${label}を添付済み`;
  if (thisYear == null) return head;
  if (thisYear === year) return `${head} → 今回も${label}なので再提出を省けます`;
  return `${head}（今回は令和${thisYear}${def.yearKind}が必要）`;
}
