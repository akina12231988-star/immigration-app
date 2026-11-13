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

describe("applyBundleChoices（課税・納税証明書の選択）", () => {
  it("候補が2つ以上あれば選んだものだけを入れ、選ぶまでは入れない", async () => {
    const { applyBundleChoices } = await import("./prep-docs-bundle");
    const f = (key: string) => ({ key });
    const items = [
      { id: "kazei", label: "課税証明書", kind: "docYear", satisfied: true, mailAfterApply: false, issueNoMail: false, files: [f("prep:1"), f("mail:2")] },
      { id: "nozei_shiken", label: "納税証明書", kind: "docYear", satisfied: false, mailAfterApply: false, issueNoMail: false, files: [f("mail:3"), f("mail:4")] },
      { id: "gensen", label: "源泉徴収票", kind: "docYear", satisfied: true, mailAfterApply: false, issueNoMail: false, files: [f("prep:5"), f("prep:6")] },
    ];
    const r = applyBundleChoices(items, { kazei: ["mail:2"] });
    expect(r.items[0].files).toEqual([f("mail:2")]);
    expect(r.items[1].files).toEqual([]);
    expect(r.items[2].files).toHaveLength(2); // 源泉徴収票は選ばずに全部
    expect(r.choosable.map((c) => c.id)).toEqual(["kazei", "nozei_shiken"]);
    expect(r.unchosen.map((c) => c.id)).toEqual(["nozei_shiken"]);
  });
});
