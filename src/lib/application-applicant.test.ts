import { describe, expect, it } from "vitest";
import { applicantLabel, isSelfApplication, nationalityLabel } from "./application-applicant";

describe("isSelfApplication", () => {
  it("チェックが入っていれば本人申請", () => {
    expect(isSelfApplication({ isSelfApply: true, assignee: "" })).toBe(true);
  });

  it("古い記録で申請取次士の欄に「本人申請」と入っている場合も本人申請", () => {
    expect(isSelfApplication({ isSelfApply: false, assignee: "本人申請" })).toBe(true);
  });

  it("取次士の氏名が入っていれば本人申請ではない", () => {
    expect(isSelfApplication({ isSelfApply: false, assignee: "野口明菜" })).toBe(false);
  });
});

describe("applicantLabel", () => {
  it("本人申請", () => {
    expect(applicantLabel({ isSelfApply: true, assignee: "本人申請" })).toBe("本人申請");
  });

  it("申請取次士は氏名を出す", () => {
    expect(applicantLabel({ isSelfApply: false, assignee: " 野口明菜 " })).toBe("取次 野口明菜");
  });

  it("どちらも未登録のときは未登録と出す", () => {
    expect(applicantLabel({ isSelfApply: false, assignee: "" })).toBe("取次士 未登録");
  });
});

describe("nationalityLabel", () => {
  it("未登録・空欄でも欄が消えない", () => {
    expect(nationalityLabel(null)).toBe("国籍未登録");
    expect(nationalityLabel("  ")).toBe("国籍未登録");
  });

  it("登録があればそのまま出す", () => {
    expect(nationalityLabel("インドネシア")).toBe("インドネシア");
  });
});
