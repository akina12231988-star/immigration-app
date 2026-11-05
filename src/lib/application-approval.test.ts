import { describe, expect, it } from "vitest";
import { approvalPatch, canMarkApproved } from "./application-approval";

describe("approvalPatch", () => {
  it("許可済みにするが、在留許可日はボタンを押した日で埋めない（在留カードを受け取った日を後で入れる）", () => {
    expect(approvalPatch("2026-08-21")).toEqual({
      approved: true,
      approvalDate: "2026-08-21",
      status: "許可済",
    });
    expect(approvalPatch("2026-08-21")).not.toHaveProperty("grantedPermitDate");
  });

  it("日付が分かって渡されたときだけ在留許可日にする", () => {
    expect(approvalPatch("2026-08-21", "2026-08-17").grantedPermitDate).toBe("2026-08-17");
  });

  it("空欄の日付では在留許可日を入れない（登録済みの許可日も消さない）", () => {
    expect(approvalPatch("2026-08-21", "")).not.toHaveProperty("grantedPermitDate");
    expect(approvalPatch("2026-08-21", null)).not.toHaveProperty("grantedPermitDate");
    expect(approvalPatch("2026-08-21", "   ")).not.toHaveProperty("grantedPermitDate");
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
