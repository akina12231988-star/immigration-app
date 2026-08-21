import { describe, expect, it } from "vitest";
import { approvalPatch, canMarkApproved } from "./application-approval";

describe("approvalPatch", () => {
  it("許可済みにして、許可日と在留許可日を入れる", () => {
    expect(approvalPatch("2026-08-21")).toEqual({
      approved: true,
      approvalDate: "2026-08-21",
      status: "許可済",
      grantedPermitDate: "2026-08-21",
    });
  });

  it("通知書の日付が分かればその日を在留許可日にする", () => {
    expect(approvalPatch("2026-08-21", "2026-08-17").grantedPermitDate).toBe("2026-08-17");
  });

  it("空欄の日付は今日で埋める", () => {
    expect(approvalPatch("2026-08-21", "").grantedPermitDate).toBe("2026-08-21");
    expect(approvalPatch("2026-08-21", null).grantedPermitDate).toBe("2026-08-21");
    expect(approvalPatch("2026-08-21", "   ").grantedPermitDate).toBe("2026-08-21");
  });
});

describe("canMarkApproved", () => {
  it("審査中（申請済・LINE報告済・通知書到着）はボタンを出す", () => {
    expect(canMarkApproved({ approved: false, status: "申請済" })).toBe(true);
    expect(canMarkApproved({ approved: false, status: "LINE報告済" })).toBe(true);
    expect(canMarkApproved({ approved: false, status: "通知書到着" })).toBe(true);
  });

  it("すでに許可済みなら出さない", () => {
    expect(canMarkApproved({ approved: true, status: "許可済" })).toBe(false);
  });

  it("取下げ・まだ申請していないものは出さない", () => {
    expect(canMarkApproved({ approved: false, status: "取下げ" })).toBe(false);
    expect(canMarkApproved({ approved: false, status: "申請前" })).toBe(false);
  });
});
