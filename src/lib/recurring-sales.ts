import type { WorkerPastRecurringSale } from "@/types/db";

// ---- 過去の定期売上No.（workers.past_recurring_sales jsonb） ----
// 定期売上No.は所属機関ごとに発行するため、転職すると新しい番号になる。
// 旧番号は旧所属機関と紐付けて残し、現在の番号（workers.recurring_sales_no）と区別する。

// 保存済みの値（欠けたキーがあり得る）を完全な形に補完する
export function normalizePastRecurringSales(raw: unknown): WorkerPastRecurringSale[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => {
    const src = (e && typeof e === "object" ? e : {}) as Partial<WorkerPastRecurringSale>;
    return {
      organization_id: typeof src.organization_id === "string" ? src.organization_id : "",
      sales_no: typeof src.sales_no === "string" ? src.sales_no : "",
    };
  });
}
