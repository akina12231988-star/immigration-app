import { describe, expect, it } from "vitest";
import { normalizeEmployeeOnlineLogin, normalizeLoginField } from "@/lib/employee-online-login";

describe("在留申請オンラインシステムのログイン情報の整え方", () => {
  it("前後の空白（半角・全角・改行・タブ）を取り除く", () => {
    expect(normalizeLoginField("  abc123 ")).toBe("abc123");
    expect(normalizeLoginField("　abc123　")).toBe("abc123");
    expect(normalizeLoginField("\tabc123\n")).toBe("abc123");
    expect(normalizeLoginField(null)).toBe("");
  });

  it("中の文字は変えない（途中の空白・大文字小文字はそのまま）", () => {
    expect(normalizeLoginField(" Pa ss Word1 ")).toBe("Pa ss Word1");
    expect(normalizeLoginField("ABC")).toBe("ABC");
  });

  it("保存する形にそろえる（ほかの項目はそのまま）", () => {
    const input = { name: "山田", online_user_id: " U123 ", online_password: "　pw ", note: "x" };
    expect(normalizeEmployeeOnlineLogin(input)).toEqual({
      name: "山田",
      online_user_id: "U123",
      online_password: "pw",
      note: "x",
    });
  });
});
