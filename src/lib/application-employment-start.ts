// 申請一覧（審査中）に出す「雇用開始日」。
//
// 申請準備の画面で雇用開始日として使っているものを、申請一覧を開いたまま確認できるようにする。
// 出どころは次の順で見る（先に見つかったものを出す）:
//   1. 申請の記録の雇用開始日（許可の登録で入れたもの）
//   2. 申請準備の「支援計画書の日付」の雇用開始日（その申請のTODO番号の保存分。無ければいちばん新しい保存分）
//   3. 外国人の基本情報の雇用開始日
// どれも無ければ null（画面では「未定」）

import { findPlanDatesForTodo, type PlanDatesSummary } from "@/lib/supabase/queries/plan-dates";

export interface EmploymentStartInfo {
  date: string; // YYYY-MM-DD
  source: "申請の記録" | "支援計画書の日付" | "外国人の基本情報";
}

export function employmentStartForApplication(args: {
  app: { employmentStartOn?: string | null };
  worker?: { employment_start_on?: string | null; residence_renewal_todo?: string | null } | null;
  planDates: PlanDatesSummary[]; // その外国人の保存分（新しい順）
}): EmploymentStartInfo | null {
  if (args.app.employmentStartOn) return { date: args.app.employmentStartOn, source: "申請の記録" };
  const plan = findPlanDatesForTodo(
    args.planDates.map((r) => ({ ...r, id: "", name: "", org: "", is_legal: false, inputs: {} })),
    args.worker?.residence_renewal_todo ?? "",
  );
  const es = plan?.dates?.es;
  if (es) return { date: es, source: "支援計画書の日付" };
  if (args.worker?.employment_start_on) {
    return { date: args.worker.employment_start_on, source: "外国人の基本情報" };
  }
  return null;
}

// 外国人IDごとに保存分をまとめる（新しい順のまま）
export function planDatesByWorker(rows: PlanDatesSummary[]): Map<string, PlanDatesSummary[]> {
  const map = new Map<string, PlanDatesSummary[]>();
  for (const r of rows) {
    if (!r.worker_id) continue;
    const list = map.get(r.worker_id) ?? [];
    list.push(r);
    map.set(r.worker_id, list);
  }
  return map;
}
