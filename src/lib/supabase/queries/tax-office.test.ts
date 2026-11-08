import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DuplicateTaxOfficeError, insertTaxOffice, taxOfficeNameKey } from "./tax-office";

// 税務署マスタの一覧を返し、insert は呼ばれたら記録するだけの簡単な偽物
function fakeSupabase(rows: { id: string; name: string }[], onInsert: (v: unknown) => void) {
  const listQuery = {
    select: () => listQuery,
    order: () => listQuery,
    then: (res: (v: { data: unknown; error: null }) => unknown) => res({ data: rows, error: null }),
  };
  return {
    from: () => ({
      ...listQuery,
      insert: (v: unknown) => {
        onInsert(v);
        return { select: () => ({ single: async () => ({ data: { id: "new", ...(v as object) }, error: null }) }) };
      },
    }),
  } as unknown as SupabaseClient;
}

describe("税務署の追加で同じ名前があるとき", () => {
  it("名前の比べ方は空白・全角半角を区別しない", () => {
    expect(taxOfficeNameKey(" 熊本東 税務署 ")).toBe(taxOfficeNameKey("熊本東税務署"));
    expect(taxOfficeNameKey("ＡＢＣ税務署")).toBe(taxOfficeNameKey("ABC税務署"));
  });
  it("同じ名前があれば追加せず、すでにある税務署を付けてエラーにする", async () => {
    let inserted = false;
    const supabase = fakeSupabase([{ id: "o1", name: "熊本東税務署" }], () => (inserted = true));
    const err = await insertTaxOffice(supabase, { name: "熊本東税務署 " } as never).catch((e) => e);
    expect(err).toBeInstanceOf(DuplicateTaxOfficeError);
    expect((err as DuplicateTaxOfficeError).existing?.id).toBe("o1");
    expect(inserted).toBe(false);
  });
  it("無ければ前後の空白を取って追加する", async () => {
    let value: unknown = null;
    const supabase = fakeSupabase([], (v) => (value = v));
    const r = await insertTaxOffice(supabase, { name: " 八代税務署 " } as never);
    expect(r.name).toBe("八代税務署");
    expect(value).toMatchObject({ name: "八代税務署" });
  });
});
