import { describe, expect, it } from "vitest";
import { prepBundleFileName, prepBundlePlan, sortPrepBundleItems } from "./prep-docs-bundle";

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
    expect(prepBundleFileName("NGUYEN VAN A", "TODO-12")).toBe("NGUYEN VAN A_TODO-12_証明書一式.pdf");
    expect(prepBundleFileName("", "")).toBe("証明書一式.pdf");
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

describe("まとめる順番（提出書類一覧表の番号の順）", () => {
  const item = (id: string, files: string[] = ["f"]) => ({
    id,
    label: id,
    kind: "doc",
    satisfied: false,
    mailAfterApply: false,
    issueNoMail: false,
    files,
  });

  it("健康診断 → 納税 → 課税 → 源泉 → 資格情報 → 国保の納付 → 年金 → そのほか（元の並び）", () => {
    // アプリの書類の並び（源泉・課税・納税・国保・保険証・年金・健診・推薦状・専門級）
    const items = ["gensen", "kazei", "nozei_shiken", "nozei_kokuho", "hokensho", "nenkin", "kenshin", "suisenjo", "cert_senmonkyu"].map((id) =>
      item(id),
    );
    expect(prepBundlePlan(items).targets.map((t) => t.id)).toEqual([
      "kenshin",
      "nozei_shiken",
      "kazei",
      "gensen",
      "hokensho",
      "nozei_kokuho",
      "nenkin",
      "suisenjo",
      "cert_senmonkyu",
    ]);
  });

  it("添付の無い書類のアラートも同じ順", () => {
    const items = [item("gensen", []), item("kenshin", []), item("kazei", [])];
    expect(prepBundlePlan(items).missing.map((m) => m.id)).toEqual(["kenshin", "kazei", "gensen"]);
  });

  it("sortPrepBundleItems は一覧に無い書類の並びを変えない", () => {
    expect(sortPrepBundleItems([{ id: "b" }, { id: "nenkin" }, { id: "a" }]).map((x) => x.id)).toEqual(["nenkin", "b", "a"]);
  });
});
