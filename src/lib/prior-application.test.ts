import { describe, expect, it } from "vitest";
import {
  isPriorAppDoc,
  latestApplicationWithinYear,
  oneYearBefore,
  priorApplication,
  priorApplicationText,
} from "./prior-application";

describe("oneYearBefore", () => {
  it("同じ月日の1年前を返す（うるう日は2/28に寄せる）", () => {
    expect(oneYearBefore("2026-09-15")).toBe("2025-09-15");
    expect(oneYearBefore("2028-02-29")).toBe("2027-02-28");
  });
});

describe("latestApplicationWithinYear", () => {
  const apps = [
    { applicationDate: "2025-08-01", applicationNumber: "OLD-1" }, // 1年より前
    { applicationDate: "2026-03-10", applicationNumber: "A-100" },
    { applicationDate: "2026-06-01", applicationNumber: "" }, // 受付前
    { applicationDate: "2026-07-01", applicationNumber: "W-1", withdrawnOn: "2026-07-05" }, // 取下げ
    { applicationDate: "2026-12-01", applicationNumber: "FUT" }, // 未来（予定）
  ];
  it("1年以内で申請番号があり取下げていない、いちばん新しい申請を返す", () => {
    expect(latestApplicationWithinYear(apps, "2026-09-15")).toEqual({
      applicationOn: "2026-03-10",
      applicationNo: "A-100",
      source: "auto",
    });
  });
  it("1年以内の申請が無ければ null", () => {
    expect(latestApplicationWithinYear(apps, "2028-01-01")).toBeNull();
    expect(latestApplicationWithinYear([], "2026-09-15")).toBeNull();
  });
  it("ちょうど1年前の申請も含める", () => {
    expect(
      latestApplicationWithinYear(
        [{ applicationDate: "2025-09-15", applicationNumber: "E" }],
        "2026-09-15",
      )?.applicationNo,
    ).toBe("E");
  });
});

describe("priorApplication", () => {
  it("申請一覧から拾えればそれを優先する", () => {
    const p = priorApplication(
      [{ applicationDate: "2026-03-10", applicationNumber: "A-100" }],
      { on: "2026-01-01", no: "M-1" },
      "2026-09-15",
    );
    expect(p?.source).toBe("auto");
    expect(p?.applicationNo).toBe("A-100");
  });
  it("無ければ手入力の値を使う。どちらも空なら null", () => {
    expect(priorApplication([], { on: "2026-01-01", no: "M-1" }, "2026-09-15")).toEqual({
      applicationOn: "2026-01-01",
      applicationNo: "M-1",
      source: "manual",
    });
    expect(priorApplication([], { on: null, no: "" }, "2026-09-15")).toBeNull();
  });
});

describe("priorApplicationText / isPriorAppDoc", () => {
  it("案内文を組み立てる（手入力は明記）", () => {
    expect(
      priorApplicationText({ applicationOn: "2026-03-10", applicationNo: "A-100", source: "auto" }),
    ).toBe("前回提出: 申請日 2026-03-10／申請番号 A-100");
    expect(
      priorApplicationText({ applicationOn: "2026-01-01", applicationNo: "", source: "manual" }),
    ).toBe("前回提出: 申請日 2026-01-01（手入力）");
    expect(priorApplicationText(null)).toBe("");
  });
  it("対象の6書類だけ true", () => {
    for (const id of ["kazei", "nozei_shiken", "nozei_kokuho", "gensen", "hokensho", "nenkin"]) {
      expect(isPriorAppDoc(id)).toBe(true);
    }
    expect(isPriorAppDoc("photo")).toBe(false);
    expect(isPriorAppDoc("kenshin")).toBe(false);
  });
});
