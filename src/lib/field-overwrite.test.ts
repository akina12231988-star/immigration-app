import { describe, expect, it } from "vitest";
import { filledFieldCount, overwrittenFields } from "./field-overwrite";

const LABELS = { name: "氏名", birth: "生年月日", gender: "性別" };

describe("overwrittenFields", () => {
  it("空いている項目は確認の対象にしない", () => {
    const current = { name: "", birth: null };
    const patch = { name: "NGUYEN VAN A", birth: "2000-01-01" };
    expect(overwrittenFields(current, patch, LABELS)).toEqual([]);
  });

  it("入力済みで値が変わる項目だけを返す", () => {
    const current = { name: "NGUYEN VAN A", birth: "2000-01-01" };
    const patch = { name: "NGUYEN VAN B", birth: "2000-01-01" };
    expect(overwrittenFields(current, patch, LABELS)).toEqual([
      { key: "name", label: "氏名", before: "NGUYEN VAN A", after: "NGUYEN VAN B" },
    ]);
  });

  it("前後の空白だけの違いは書き換えとみなさない", () => {
    const current = { name: "  NGUYEN VAN A  " };
    expect(overwrittenFields(current, { name: "NGUYEN VAN A" }, LABELS)).toEqual([]);
  });

  it("項目名が表に無ければキーをそのまま出す", () => {
    const changes = overwrittenFields({ note: "あ" }, { note: "い" }, LABELS);
    expect(changes[0].label).toBe("note");
  });
});

describe("filledFieldCount", () => {
  it("実際に変わる項目だけ数える", () => {
    const current = { name: "NGUYEN VAN A", birth: "", gender: "男" };
    const patch = { name: "NGUYEN VAN A", birth: "2000-01-01", gender: "女" };
    expect(filledFieldCount(current, patch)).toBe(2);
  });

  it("変わるものが無ければ0", () => {
    expect(filledFieldCount({ name: "A" }, { name: "A" })).toBe(0);
  });
});
