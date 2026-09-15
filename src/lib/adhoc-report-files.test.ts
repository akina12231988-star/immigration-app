import { describe, expect, it } from "vitest";
import { adhocReportFileName } from "./adhoc-report-files";

describe("adhocReportFileName", () => {
  it("TODO番号_所属機関名_氏名_退職随時報告 の形にする（空の部分は飛ばす）", () => {
    expect(adhocReportFileName("resignation", { todoNo: "TODO-2011", orgName: "有限会社國崎青果", workerName: "DAU THI NGA" })).toBe(
      "TODO-2011_有限会社國崎青果_DAU THI NGA_退職随時報告",
    );
    expect(adhocReportFileName("contract-change", { todoNo: "", orgName: "西田祐一", workerName: "A" })).toBe("西田祐一_A_契約変更随時報告");
    // ファイル名に使えない文字は置き換える
    expect(adhocReportFileName("support-end", { todoNo: "TODO-1", orgName: "A/B", workerName: "C" })).toBe("TODO-1_A・B_C_支援委託終了随時報告");
  });
});
