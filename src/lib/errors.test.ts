import { describe, expect, it } from "vitest";
import {
  dbErrorMessage,
  errorMessage,
  isMissingColumnError,
  isMissingTableError,
} from "./errors";

describe("errorMessage", () => {
  it("Error はそのメッセージを使う", () => {
    expect(errorMessage(new Error("保存できません"))).toBe("保存できません");
  });

  it("Supabase（PostgREST）のエラーオブジェクトから内容を取り出す", () => {
    expect(
      errorMessage({
        message: "Could not find the table 'public.sales_entries' in the schema cache",
        details: null,
        hint: null,
        code: "PGRST205",
      }),
    ).toBe(
      "Could not find the table 'public.sales_entries' in the schema cache（PGRST205）",
    );
  });

  it("details・hint も添える", () => {
    expect(
      errorMessage({ message: "失敗", details: "詳細", hint: "ヒント", code: "42P01" }),
    ).toBe("失敗 / 詳細 / ヒント（42P01）");
  });

  it("文字列・不明な値はそのまま/既定文言", () => {
    expect(errorMessage("そのままの文字列")).toBe("そのままの文字列");
    expect(errorMessage(null, "保存に失敗しました")).toBe("保存に失敗しました");
    expect(errorMessage({}, "保存に失敗しました")).toBe("保存に失敗しました");
  });
});

describe("テーブル・列の未作成の判定", () => {
  it("テーブル未作成を見分ける", () => {
    expect(
      isMissingTableError({ code: "PGRST205", message: "Could not find the table" }),
    ).toBe(true);
    expect(isMissingTableError({ code: "42P01", message: 'relation "x" does not exist' })).toBe(
      true,
    );
    expect(isMissingTableError({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingTableError(new Error("network"))).toBe(false);
  });

  it("列の未作成を見分ける", () => {
    expect(
      isMissingColumnError({
        code: "PGRST204",
        message: "Could not find the 'ssw2_exam' column of 'workers'",
      }),
    ).toBe(true);
    expect(isMissingColumnError({ code: "23505", message: "duplicate key" })).toBe(false);
  });
});

describe("dbErrorMessage", () => {
  it("未適用のマイグレーションを案内する", () => {
    const msg = dbErrorMessage(
      { code: "PGRST205", message: "Could not find the table 'public.sales_entries'" },
      "0061_sales_entries.sql",
    );
    expect(msg).toContain("Could not find the table");
    expect(msg).toContain("0061_sales_entries.sql");
    expect(msg).toContain("未適用");
  });

  it("それ以外はメッセージのみ", () => {
    expect(dbErrorMessage(new Error("権限がありません"), "0061")).toBe("権限がありません");
  });
});
