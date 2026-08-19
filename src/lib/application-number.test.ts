import { describe, expect, it } from "vitest";
import { findDuplicateApplication, normalizeApplicationNumber } from "./application-number";

describe("normalizeApplicationNumber", () => {
  it("最後の「号」を無視する", () => {
    expect(normalizeApplicationNumber("福熊E91138号")).toBe("福熊E91138");
    expect(normalizeApplicationNumber("福熊E91138")).toBe("福熊E91138");
  });

  it("前後・間の空白と全角英数をそろえる", () => {
    expect(normalizeApplicationNumber(" 福熊 Ｅ９１１３８ 号 ")).toBe("福熊E91138");
  });

  it("大文字小文字をそろえる", () => {
    expect(normalizeApplicationNumber("福熊e91138")).toBe("福熊E91138");
  });

  it("空欄は空のまま", () => {
    expect(normalizeApplicationNumber("")).toBe("");
  });
});

describe("findDuplicateApplication", () => {
  const apps = [
    { id: "1", applicationNumber: "福熊E91138号" },
    { id: "2", applicationNumber: "福熊E90001" },
  ];

  it("「号」の有無が違っても同じ番号として見つける", () => {
    expect(findDuplicateApplication(apps, "福熊E91138")?.id).toBe("1");
    expect(findDuplicateApplication(apps, "福熊 E91138 号")?.id).toBe("1");
  });

  it("別の番号なら見つからない", () => {
    expect(findDuplicateApplication(apps, "福熊E99999")).toBeUndefined();
  });

  it("自分自身は除く", () => {
    expect(findDuplicateApplication(apps, "福熊E91138号", "1")).toBeUndefined();
  });

  it("空欄では判定しない", () => {
    expect(findDuplicateApplication(apps, "   ")).toBeUndefined();
  });
});
