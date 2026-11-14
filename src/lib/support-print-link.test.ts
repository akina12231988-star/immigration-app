import { describe, expect, it } from "vitest";
import { safeBackPath, supportPrintHref } from "./support-print-link";

describe("supportPrintHref", () => {
  it("所属機関と戻る先を付ける", () => {
    expect(supportPrintHref("o1", "/workers/w1/application-prep?todo=1")).toBe(
      "/support-org/print?org=o1&back=%2Fworkers%2Fw1%2Fapplication-prep%3Ftodo%3D1",
    );
    expect(supportPrintHref("o1")).toBe("/support-org/print?org=o1");
    expect(supportPrintHref(null)).toBe("/support-org/print");
  });
  it("サイトの外へは戻さない", () => {
    expect(safeBackPath("https://example.com")).toBeNull();
    expect(safeBackPath("//example.com")).toBeNull();
    expect(safeBackPath("/workers")).toBe("/workers");
  });
});
