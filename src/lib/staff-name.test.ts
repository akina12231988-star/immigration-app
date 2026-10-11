import { describe, expect, it } from "vitest";
import { buildStaffNameMap, isEmailLike, normalizeStaffName, staffLabel, staffNameOf } from "./staff-name";

describe("normalizeStaffName", () => {
  it("前後の空白（全角も）を取り除き、連続する空白は1つにする", () => {
    expect(normalizeStaffName("　村田　敬一 ")).toBe("村田 敬一");
    expect(normalizeStaffName("  ")).toBe("");
    expect(normalizeStaffName(null)).toBe("");
  });
});

describe("staffLabel", () => {
  it("名前があれば名前、無ければメールアドレス", () => {
    expect(staffLabel({ display_name: "村田 敬一", email: "a@example.com" })).toBe("村田 敬一");
    expect(staffLabel({ display_name: "　", email: "a@example.com" })).toBe("a@example.com");
  });
});

describe("staffNameOf", () => {
  const map = buildStaffNameMap([
    { display_name: "村田 敬一", email: "Murata@Example.com" },
    { display_name: "", email: "noname@example.com" },
  ]);

  it("メールアドレスで保存された記入者は、名前が付いていれば名前にする（大文字小文字は区別しない）", () => {
    expect(staffNameOf("murata@example.com", map)).toBe("村田 敬一");
    expect(staffNameOf(" MURATA@EXAMPLE.COM ", map)).toBe("村田 敬一");
  });

  it("名前が付いていない職員のメールアドレスはそのまま", () => {
    expect(staffNameOf("noname@example.com", map)).toBe("noname@example.com");
    expect(staffNameOf("other@example.com", map)).toBe("other@example.com");
  });

  it("名前で保存された記入者と空はそのまま", () => {
    expect(staffNameOf("田中", map)).toBe("田中");
    expect(staffNameOf("", map)).toBe("");
    expect(staffNameOf(null, map)).toBe("");
  });

  it("isEmailLike", () => {
    expect(isEmailLike("a@b.co")).toBe(true);
    expect(isEmailLike("村田")).toBe(false);
  });
});
