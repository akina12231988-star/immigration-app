import { describe, expect, it } from "vitest";
import { normalizePastRecurringSales } from "./recurring-sales";

describe("normalizePastRecurringSales", () => {
  it("配列以外は空配列になる", () => {
    expect(normalizePastRecurringSales(null)).toEqual([]);
    expect(normalizePastRecurringSales(undefined)).toEqual([]);
    expect(normalizePastRecurringSales("SP-0000000225")).toEqual([]);
  });

  it("欠けたキーを空文字で補完する", () => {
    expect(
      normalizePastRecurringSales([
        { organization_id: "org-1", sales_no: "SP-0000000225" },
        { organization_id: "org-2" },
        {},
        null,
      ]),
    ).toEqual([
      { organization_id: "org-1", sales_no: "SP-0000000225" },
      { organization_id: "org-2", sales_no: "" },
      { organization_id: "", sales_no: "" },
      { organization_id: "", sales_no: "" },
    ]);
  });
});
