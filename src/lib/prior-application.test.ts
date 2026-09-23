import { describe, expect, it } from "vitest";
import {
  applicationContentLabel,
  isNonTransferable,
  isPriorAppDoc,
  manualDocYearNote,
  sswChangeApplicationFor,
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
      content: "",
      organizationId: null,
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
      content: "",
      organizationId: null,
    });
    expect(priorApplication([], { on: null, no: "" }, "2026-09-15")).toBeNull();
  });
});

describe("priorApplicationText / isPriorAppDoc", () => {
  it("案内文を組み立てる（手入力は明記）", () => {
    expect(
      priorApplicationText({ applicationOn: "2026-03-10", applicationNo: "A-100", source: "auto", content: "", organizationId: null }),
    ).toBe("前回提出: 申請日 2026-03-10／申請番号 A-100");
    expect(
      priorApplicationText({ applicationOn: "2026-01-01", applicationNo: "", source: "manual", content: "", organizationId: null }),
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

describe("申請内容・特定活動・1-25号", () => {
  it("申請内容は許可時の在留資格を括弧で添える", () => {
    expect(applicationContentLabel({ applicationContent: "在留資格の変更許可", visaAtGrant: "特定技能1号" })).toBe(
      "在留資格の変更許可（特定技能1号）",
    );
    const p = latestApplicationWithinYear(
      [{ applicationDate: "2026-03-10", applicationNumber: "A", applicationContent: "在留期間の更新許可" }],
      "2026-09-15",
    );
    expect(p?.content).toBe("在留期間の更新許可");
  });
  it("特定活動の申請は転用できない", () => {
    const p = priorApplication([], { on: "2026-01-01", no: "M-1", content: "在留資格の変更許可（特定活動）" }, "2026-09-15");
    expect(isNonTransferable(p)).toBe(true);
    expect(priorApplicationText(p)).toContain("転用できません");
    expect(isNonTransferable({ content: "在留資格の変更許可（特定技能）" })).toBe(false);
  });
  it("1-25号は同じ所属機関の在留資格の変更許可（特定技能）", () => {
    const apps = [
      { applicationDate: "2026-05-01", applicationNumber: "U-1", applicationContent: "在留期間の更新許可", organizationId: "o1" },
      { applicationDate: "2025-04-01", applicationNumber: "C-1", applicationContent: "在留資格の変更許可", visaAtGrant: "特定技能1号", organizationId: "o1" },
      { applicationDate: "2026-02-01", applicationNumber: "C-2", applicationContent: "在留資格の変更許可", visaAtGrant: "特定技能1号", organizationId: "o2" },
      { applicationDate: "2026-03-01", applicationNumber: "K-1", applicationContent: "在留資格の変更許可", visaAtGrant: "特定活動", organizationId: "o1" },
    ];
    const none = { on: null, no: null };
    expect(sswChangeApplicationFor(apps, "o1", none)?.applicationNo).toBe("C-1");
    expect(sswChangeApplicationFor(apps, "o3", none)).toBeNull();
    expect(sswChangeApplicationFor(apps, null, none)).toBeNull();
    // 申請一覧に無ければ、同じ所属機関の手入力（変更・特定技能）だけ使う
    const manual = { on: "2024-10-01", no: "M-9", content: "在留資格の変更許可（特定技能）", orgId: "o3" };
    expect(sswChangeApplicationFor(apps, "o3", manual)?.applicationNo).toBe("M-9");
    expect(sswChangeApplicationFor(apps, "o3", { ...manual, orgId: "o4" })).toBeNull();
  });
});

describe("manualDocYearNote", () => {
  it("手入力の前回の年度と今回の年度を比べる", () => {
    expect(manualDocYearNote("年度", 7, 7)).toBe("前回は令和7年度を使用 → 今回も令和7年度なので再提出を省けます");
    expect(manualDocYearNote("年度", 6, 7)).toBe("前回は令和6年度を使用（今回は令和7年度が必要）");
    expect(manualDocYearNote("年分", 6, null)).toBe("前回は令和6年分を使用");
    expect(manualDocYearNote("年度", null, 7)).toBe("");
    expect(manualDocYearNote(undefined, 7, 7)).toBe("");
  });
});
