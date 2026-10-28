import { describe, expect, it } from "vitest";
import { contactInputError, sortContactsNewestFirst } from "./organization-contacts";

describe("sortContactsNewestFirst（連絡の記録の並び）", () => {
  it("連絡があった日の新しい順。同じ日なら登録の新しい順", () => {
    const rows = [
      { id: "a", contacted_on: "2026-10-01", created_at: "2026-10-01T01:00:00Z" },
      { id: "b", contacted_on: "2026-10-20", created_at: "2026-10-20T01:00:00Z" },
      { id: "c", contacted_on: "2026-10-20", created_at: "2026-10-20T09:00:00Z" },
    ];
    expect(sortContactsNewestFirst(rows).map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(rows[0].id).toBe("a"); // 元の配列は変えない
  });
});

describe("contactInputError（保存前のチェック）", () => {
  it("日付と内容が必須", () => {
    expect(contactInputError({ contacted_on: "", content: "x" })).toBe("連絡があった日を入れてください");
    expect(contactInputError({ contacted_on: "2026-10-28", content: "  " })).toBe("連絡の内容を入れてください");
    expect(contactInputError({ contacted_on: "2026-10-28", content: "更新の書類を依頼" })).toBeNull();
  });
});
