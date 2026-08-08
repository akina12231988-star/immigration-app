import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listGrantedPermits, listPermitContentsByMonth } from "./applications";

// 申請の列名を間違えると PostgREST がエラーを返し、画面は「履歴が無い」ように
// 見えるだけで静かに壊れる（更新許可の方が過去の月の名簿から消える）。
// 実際に投げる列名と、返ってきた行の読み替えをここで押さえる。

interface FakeQuery {
  select: (cols: string) => FakeQuery;
  gte: (...args: unknown[]) => FakeQuery;
  lte: (...args: unknown[]) => FakeQuery;
  not: (...args: unknown[]) => FakeQuery;
  order: (...args: unknown[]) => Promise<{ data: unknown; error: null }>;
}

function fakeSupabase(rows: unknown[]) {
  const calls: { table: string; columns: string } = { table: "", columns: "" };
  const query: FakeQuery = {
    select: (cols) => {
      calls.columns = cols;
      return query;
    },
    gte: () => query,
    lte: () => query,
    not: () => query,
    order: () => Promise.resolve({ data: rows, error: null }),
  };
  const client = {
    from: (table: string) => {
      calls.table = table;
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("listGrantedPermits", () => {
  it("申請内容は content 列から読む（application_content は存在しない）", async () => {
    const { client, calls } = fakeSupabase([
      {
        worker_id: "w1",
        granted_permit_date: "2026-08-05",
        visa_at_grant: "特定技能1号",
        content: "在留期間の更新許可",
      },
    ]);

    const rows = await listGrantedPermits(client);

    expect(calls.table).toBe("immigration_applications");
    expect(calls.columns).toContain("content");
    expect(calls.columns).not.toContain("application_content");
    expect(rows).toEqual([
      {
        workerId: "w1",
        permitDate: "2026-08-05",
        visa: "特定技能1号",
        content: "在留期間の更新許可",
      },
    ]);
  });

  it("外国人に紐づいていない申請は捨て、未入力の列は空文字にする", async () => {
    const { client } = fakeSupabase([
      { worker_id: null, granted_permit_date: "2026-08-05", visa_at_grant: "", content: "" },
      { worker_id: "w2", granted_permit_date: "2026-07-01", visa_at_grant: null, content: null },
    ]);

    expect(await listGrantedPermits(client)).toEqual([
      { workerId: "w2", permitDate: "2026-07-01", visa: "", content: "" },
    ]);
  });
});

describe("listPermitContentsByMonth", () => {
  it("申請内容は content 列から読む", async () => {
    const { client, calls } = fakeSupabase([
      { worker_id: "w1", content: "在留期間の更新許可" },
      { worker_id: "w2", content: "在留資格の変更許可" },
    ]);

    const map = await listPermitContentsByMonth(client, "2026-08");

    expect(calls.columns).toContain("content");
    expect(calls.columns).not.toContain("application_content");
    expect(map).toEqual({ w1: "在留期間の更新許可", w2: "在留資格の変更許可" });
  });

  it("同じ人に複数あれば許可日の新しいほう（先に並ぶ行）を採る", async () => {
    const { client } = fakeSupabase([
      { worker_id: "w1", content: "在留期間の更新許可" },
      { worker_id: "w1", content: "在留資格の変更許可" },
    ]);

    expect(await listPermitContentsByMonth(client, "2026-08")).toEqual({
      w1: "在留期間の更新許可",
    });
  });
});
