import { describe, expect, it } from "vitest";
import { prepBundleFileName, prepBundlePlan } from "./prep-docs-bundle";

const item = (p: Partial<Parameters<typeof prepBundlePlan<string>>[0][number]>) => ({
  id: "x", label: "書類", kind: "doc", satisfied: false, mailAfterApply: false, issueNoMail: false, files: [] as string[], ...p,
});

describe("prepBundlePlan", () => {
  it("在留カード・顔写真・パスポートを除き、添付のある書類をまとめ、添付の無い書類をアラートに出す", () => {
    const plan = prepBundlePlan([
      item({ id: "card", kind: "residenceCardDoc", files: ["c"] }),
      item({ id: "photo", kind: "photo" }),
      item({ id: "pass", kind: "passportFile" }),
      item({ id: "gensen", label: "源泉徴収票", files: ["g1", "g2"], satisfied: true }),
      item({ id: "kazei", label: "課税証明書" }),
      item({ id: "nozei", label: "納税証明書", mailAfterApply: true }),
      item({ id: "suisen", label: "推薦状", satisfied: true }), // 対象外などで揃ったことになっている
    ]);
    expect(plan.targets).toEqual([{ id: "gensen", label: "源泉徴収票", files: ["g1", "g2"] }]);
    expect(plan.missing).toEqual([
      { id: "kazei", label: "課税証明書", reason: "未添付" },
      { id: "nozei", label: "納税証明書", reason: "申請後に郵送" },
    ]);
  });
  it("ファイル名", () => {
    expect(prepBundleFileName("NGUYEN VAN A", "TODO-12")).toBe("NGUYEN_VAN_A_TODO-12_申請書類一式.pdf");
  });
});
