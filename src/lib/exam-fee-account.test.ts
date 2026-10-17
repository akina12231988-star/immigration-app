import { describe, expect, it } from "vitest";
import { EXAM_FEE_ACCOUNT, examFeeAccountText } from "@/lib/exam-fee-account";

describe("examFeeAccountText", () => {
  it("口座の内容と代金を入れた文章を作る", () => {
    const text = examFeeAccountText("15,000円", "２号農業試験");
    expect(text).toContain("２号農業試験の代金（15,000円）");
    expect(text).toContain(`記号 ${EXAM_FEE_ACCOUNT.symbol}　番号 ${EXAM_FEE_ACCOUNT.number}`);
    expect(text).toContain(`店名 ${EXAM_FEE_ACCOUNT.branchName}（${EXAM_FEE_ACCOUNT.branchKana}）　店番 ${EXAM_FEE_ACCOUNT.branchNo}`);
    expect(text).toContain(`${EXAM_FEE_ACCOUNT.accountType} ${EXAM_FEE_ACCOUNT.accountNo}`);
    expect(text).toContain(`名義 ${EXAM_FEE_ACCOUNT.holder}`);
  });
  it("代金が未入力なら金額を出さない", () => {
    expect(examFeeAccountText("")).toMatch(/^試験の代金は、下の口座へ/);
  });
});
