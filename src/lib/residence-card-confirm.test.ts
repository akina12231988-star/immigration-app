import { describe, expect, it } from "vitest";
import { cardDate, cardGender, missingCardItems, permissionKind, toFullWidth } from "./residence-card-confirm";

describe("在留カード情報の最終確認の表示", () => {
  it("番号・日付・性別・許可の種類の書き方", () => {
    expect(toFullWidth("LJ38433803RG")).toBe("ＬＪ３８４３３８０３ＲＧ");
    expect(toFullWidth("2027年11月02日")).toBe("２０２７年１１月０２日");
    expect(cardDate("1987-07-10")).toBe("1987年07月10日");
    expect(cardDate("")).toBe("");
    expect(cardGender("女")).toBe("女 F.");
    expect(cardGender("男")).toBe("男 M.");
    expect(permissionKind("在留資格の変更許可")).toBe("在留資格変更許可");
    expect(permissionKind("在留期間の更新許可")).toBe("在留期間更新許可");
    expect(permissionKind("在留認定許可申請")).toBe("在留資格認定");
  });
  it("入っていない項目を出す", () => {
    const base = {
      name: "A", birth: null, gender: "", nationality: "", address: "", residenceStatus: "特定技能2号",
      expiryDate: "2027-11-02", cardNo: "LJ1", period: "1年", permitDate: "2026-11-02", applicationContent: "", periodNote: "",
    };
    expect(missingCardItems(base)).toEqual([]);
    expect(missingCardItems({ ...base, cardNo: " ", period: "" })).toEqual(["在留カード番号", "在留期間"]);
  });
});
