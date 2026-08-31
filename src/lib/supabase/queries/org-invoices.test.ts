import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listUnpaidInvoiceOrgIds } from "./org-invoices";

// 「未入金あり」の判定（請求書作成の機関名の横のアラート）。
// 対象の年月より前の請求だけを見て、残額（請求額−入金済み額）が残っている機関を拾う

function fakeSupabase(rows: unknown[]) {
  const calls: { table: string; ltArgs: unknown[] } = { table: "", ltArgs: [] };
  interface Q {
    select: (cols: string) => Q;
    lt: (...args: unknown[]) => Q;
    then: (resolve: (v: { data: unknown; error: null }) => void) => void;
  }
  const query: Q = {
    select: () => query,
    lt: (...args) => {
      calls.ltArgs = args;
      return query;
    },
    then: (resolve) => resolve({ data: rows, error: null }),
  };
  const client = {
    from: (table: string) => {
      calls.table = table;
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("listUnpaidInvoiceOrgIds", () => {
  it("残額が残っている機関だけを返し、入金済み・0円の記録は数えない", async () => {
    const { client, calls } = fakeSupabase([
      { organization_id: "o1", amount: 30000, paid: 0 }, // 未入金
      { organization_id: "o2", amount: 30000, paid: 30000 }, // 入金済み
      { organization_id: "o3", amount: 30000, paid: 10000 }, // 一部入金（残額あり）
      { organization_id: "o4", amount: 0, paid: 0 }, // 作成済みの印だけの記録
      { organization_id: "o5", amount: null, paid: null }, // 金額未入力
    ]);

    const ids = await listUnpaidInvoiceOrgIds(client, "2026-08");

    expect(calls.table).toBe("org_invoices");
    // 当月分はまだ支払期限が来ていないので、対象の年月より前だけを見る
    expect(calls.ltArgs).toEqual(["month", "2026-08"]);
    expect(ids).toEqual(new Set(["o1", "o3"]));
  });

  it("同じ機関に複数の未入金があっても1件にまとまる", async () => {
    const { client } = fakeSupabase([
      { organization_id: "o1", amount: 30000, paid: 0 },
      { organization_id: "o1", amount: 20000, paid: 5000 },
    ]);

    expect(await listUnpaidInvoiceOrgIds(client, "2026-08")).toEqual(new Set(["o1"]));
  });
});
