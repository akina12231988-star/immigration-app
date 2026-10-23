import { describe, expect, it } from "vitest";
import {
  BANK_ACCOUNT_GUIDES,
  DEFAULT_BANK_ACCOUNT_GUIDE,
  EXAM_FEE_ACCOUNT,
  bankAccountGuideFor,
  bankAccountGuideForNationality,
  examFeeAccountText,
} from "@/lib/exam-fee-account";

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

describe("bankAccountGuideForNationality（国籍別の口座案内の画像）", () => {
  it("国籍の欄の値から母国語の画像を選ぶ", () => {
    expect(bankAccountGuideForNationality("ベトナム")?.key).toBe("vn");
    expect(bankAccountGuideForNationality("カンボジア王国")?.key).toBe("kh");
    expect(bankAccountGuideForNationality("フィリピン")?.key).toBe("ph");
    expect(bankAccountGuideForNationality("Indonesia")?.key).toBe("id");
    expect(bankAccountGuideForNationality("Việt Nam")?.key).toBe("vn");
  });
  it("合う国籍が無い・未登録のときは null（送る画像は日本語の画像）", () => {
    expect(bankAccountGuideForNationality("ネパール")).toBeNull();
    expect(bankAccountGuideForNationality("")).toBeNull();
    expect(bankAccountGuideForNationality(null)).toBeNull();
    expect(bankAccountGuideFor("ネパール")).toBe(DEFAULT_BANK_ACCOUNT_GUIDE);
    expect(bankAccountGuideFor("ベトナム").key).toBe("vn");
  });
  it("画像は全部 public の下にある", () => {
    for (const g of BANK_ACCOUNT_GUIDES) expect(g.imagePath.startsWith("/")).toBe(true);
    expect(new Set(BANK_ACCOUNT_GUIDES.map((g) => g.key)).size).toBe(BANK_ACCOUNT_GUIDES.length);
  });
});
