import { describe, expect, it } from "vitest";
import { feeDraftOf, patchFeeDraft, type ReferralFeeDrafts } from "./referral-fee-draft";

describe("feeDraftOf", () => {
  it("まだ触っていない応募は、所属機関マスタの手数料が初期値になる", () => {
    expect(feeDraftOf({}, "a1", "30000")).toEqual({ fee: "30000", salesNo: "" });
  });

  it("入力済みの下書きがあればそれを返す", () => {
    const drafts: ReferralFeeDrafts = { a1: { fee: "25000", salesNo: "S-1" } };
    expect(feeDraftOf(drafts, "a1", "30000")).toEqual({ fee: "25000", salesNo: "S-1" });
  });
});

describe("patchFeeDraft", () => {
  it("紹介売上No.だけ入れても、初期値の手数料が消えない", () => {
    const next = patchFeeDraft({}, "a1", "30000", { salesNo: "S-0000003720" });
    expect(next.a1).toEqual({ fee: "30000", salesNo: "S-0000003720" });
  });

  it("手数料だけ入れても、入力済みの売上No.が消えない", () => {
    const drafts: ReferralFeeDrafts = { a1: { fee: "30000", salesNo: "S-1" } };
    const next = patchFeeDraft(drafts, "a1", "30000", { fee: "25000" });
    expect(next.a1).toEqual({ fee: "25000", salesNo: "S-1" });
  });

  it("手数料をわざと空にしたときは空のままにする", () => {
    const cleared = patchFeeDraft({}, "a1", "30000", { fee: "" });
    expect(cleared.a1.fee).toBe("");
    // そのあと売上No.を入れても、空にした手数料は戻らない
    const next = patchFeeDraft(cleared, "a1", "30000", { salesNo: "S-1" });
    expect(next.a1).toEqual({ fee: "", salesNo: "S-1" });
  });

  it("ほかの応募の下書きは変えない", () => {
    const drafts: ReferralFeeDrafts = { a1: { fee: "10000", salesNo: "" } };
    const next = patchFeeDraft(drafts, "a2", "30000", { salesNo: "S-2" });
    expect(next.a1).toEqual({ fee: "10000", salesNo: "" });
    expect(next.a2).toEqual({ fee: "30000", salesNo: "S-2" });
  });
});
