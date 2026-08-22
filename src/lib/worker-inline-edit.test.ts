import { describe, expect, test } from "vitest";
import {
  buildUpdatePayload,
  changedFieldCount,
  isFieldChanged,
  workerFieldString,
} from "@/lib/worker-inline-edit";

const worker = {
  name: "NGUYEN VAN A",
  nationality: "ベトナム",
  birth: "1996-03-02",
  residence_expiry_date: null,
  passport_no: "",
  home_address: "Tỉnh Nghệ An, Việt Nam",
  current_organization_id: "org-1",
};

describe("workerFieldString", () => {
  test("null・undefined は空文字にする", () => {
    expect(workerFieldString(worker, "residence_expiry_date")).toBe("");
    expect(workerFieldString(worker, "unknown_key")).toBe("");
    expect(workerFieldString(worker, "name")).toBe("NGUYEN VAN A");
  });
});

describe("isFieldChanged", () => {
  test("同じ値・空白だけの違いは変わっていない扱い", () => {
    expect(isFieldChanged(worker, "name", "NGUYEN VAN A")).toBe(false);
    expect(isFieldChanged(worker, "name", "  NGUYEN VAN A  ")).toBe(false);
    expect(isFieldChanged(worker, "residence_expiry_date", "")).toBe(false);
  });
  test("値が変わったら true", () => {
    expect(isFieldChanged(worker, "name", "NGUYEN VAN B")).toBe(true);
    expect(isFieldChanged(worker, "residence_expiry_date", "2027-05-08")).toBe(true);
    expect(isFieldChanged(worker, "name", "")).toBe(true); // 消すのも変更
  });
});

describe("buildUpdatePayload", () => {
  test("変わった項目だけを trim して返す", () => {
    const payload = buildUpdatePayload(
      { name: "  NGUYEN VAN B ", nationality: "ベトナム" },
      worker,
    );
    expect(payload).toEqual({ name: "NGUYEN VAN B" });
  });

  test("日付・所属機関の空文字は null で保存する", () => {
    const payload = buildUpdatePayload(
      { birth: "", current_organization_id: "" },
      worker,
    );
    expect(payload).toEqual({ birth: null, current_organization_id: null });
  });

  test("日付の入力はそのまま、文字列の項目を消すと空文字で保存する", () => {
    const payload = buildUpdatePayload(
      { residence_expiry_date: "2027-05-08", home_address: "" },
      worker,
    );
    expect(payload).toEqual({ residence_expiry_date: "2027-05-08", home_address: "" });
  });

  test("何も変わっていなければ空になる", () => {
    expect(
      buildUpdatePayload({ name: "NGUYEN VAN A", passport_no: "" }, worker),
    ).toEqual({});
  });
});

describe("changedFieldCount", () => {
  test("変わった項目の数を返す", () => {
    expect(changedFieldCount({}, worker)).toBe(0);
    expect(changedFieldCount({ name: "NGUYEN VAN A" }, worker)).toBe(0);
    expect(changedFieldCount({ name: "X", passport_no: "C1234567" }, worker)).toBe(2);
  });
});
