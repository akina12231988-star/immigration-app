import { describe, expect, it } from "vitest";
import { daysSince, hireConditionMessage, housingQuestionText, normalizeHireCheck, thanhAskState } from "./hire-check";

describe("hireConditionMessage（所属機関への文章）", () => {
  it("給与の形態と住居がそろわないと作らない", () => {
    expect(hireConditionMessage("NGUYEN VAN A", "", "社宅")).toBeNull();
    expect(hireConditionMessage("NGUYEN VAN A", "時給制", "")).toBeNull();
  });
  it("時給制・社宅", () => {
    const t = hireConditionMessage("NGUYEN VAN A", "時給制", "社宅")!;
    expect(t).toContain("お世話になっております。");
    expect(t).toContain("NGUYEN VAN Aさんの採用を聞きました。");
    expect(t).toContain("この方の時給の金額と、社宅の家賃・光熱費などの費用を教えていただけますか？");
  });
  it("月給制・自分で契約", () => {
    const t = hireConditionMessage("NGUYEN VAN A", "月給制", "自分で契約")!;
    expect(t).toContain("この方の月給の金額を教えていただけますか？");
    expect(t).toContain("もし住宅手当をご検討されている場合は、教えていただけると助かります。");
    expect(t).not.toContain("ご負担の有無");
  });
});

describe("normalizeHireCheck・housingQuestionText", () => {
  it("知らない値は捨てる", () => {
    expect(normalizeHireCheck({ housing: "x", resume_path: "p" })).toMatchObject({ housing: "", resume_path: "p" });
    expect(normalizeHireCheck(null).housing).toBe("");
  });
  it("THANHへの質問（印紙代が未設定なら一緒に聞く）", () => {
    expect(housingQuestionText({ askStampFee: true })).toBe(
      "@Vương Văn Thanh\n印紙代は\n本人負担？会社負担？\n\n居住場所は\n本人契約のアパート？社宅に住む？",
    );
    expect(housingQuestionText({ askStampFee: false })).toBe("@Vương Văn Thanh\n居住場所は\n本人契約のアパート？社宅に住む？");
  });
});

describe("thanhAskState（THANHに聞いた状況）", () => {
  it("まだ聞いていない・返答待ち・返答あり", () => {
    expect(thanhAskState({ thanh_asked_on: null, housing: "" }, false)).toBe("notAsked");
    expect(thanhAskState({ thanh_asked_on: "2026-11-08", housing: "" }, true)).toBe("waiting");
    // 居住場所の答えがあっても、聞いた印紙代の答えがまだなら返答待ち
    expect(thanhAskState({ thanh_asked_on: "2026-11-08", housing: "社宅" }, false)).toBe("waiting");
    expect(thanhAskState({ thanh_asked_on: "2026-11-08", housing: "社宅" }, true)).toBe("answered");
  });
  it("daysSince", () => {
    expect(daysSince("2026-11-05", "2026-11-08")).toBe(3);
    expect(daysSince(null, "2026-11-08")).toBeNull();
  });
});
