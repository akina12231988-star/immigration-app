import { describe, expect, it } from "vitest";
import {
  isChangeApplication,
  missingRequestDocKeys,
  onboardingRequestMessage,
  onboardingRequestText,
} from "./onboarding-request-text";

describe("本人へ送ってもらう入社書類の依頼文", () => {
  it("添付が無い書類だけを一覧の並びで返す", () => {
    expect(missingRequestDocKeys((k) => k === "rirekisho" || k === "furigana")).toEqual(["mynumber", "tsuchou", "fuyo"]);
    expect(missingRequestDocKeys(() => true)).toEqual([]);
  });

  it("日本語の文面は名前・番号付きの書類・結びで組み立てる", () => {
    const t = onboardingRequestText("ja", ["mynumber", "tsuchou"], "NGUYEN THI HONG");
    expect(t).toBe(
      "NGUYEN THI HONGさん\n在留資格変更の申請をしました。入社の手続きのため、次の書類の写真（または PDF）を送ってください。\n\n1. マイナンバー（個人番号カード、または通知カードの写真）\n2. 通帳の見開き（銀行名・支店名・口座番号・名義がわかるページ）\n\nよろしくお願いします。",
    );
    expect(onboardingRequestText("ja", ["rirekisho"])).not.toContain("さん");
  });

  it("日本語＋母国語（ベトナム語など）。日本語の人は日本語だけ", () => {
    const m = onboardingRequestMessage("vi", ["fuyo"], "A");
    expect(m).toContain("在留資格変更の申請をしました");
    expect(m).toContain("----------");
    expect(m).toContain("Chào A,");
    expect(m).toContain("1. Giấy chứng nhận người phụ thuộc");
    expect(onboardingRequestMessage("ja", ["fuyo"], "A")).not.toContain("----------");
    for (const lang of ["en", "id", "km", "tl"] as const) {
      expect(onboardingRequestMessage(lang, ["furigana"], "B")).toContain("1. ");
    }
  });

  it("いちばん新しい申請が在留資格の変更なら依頼を出す", () => {
    expect(isChangeApplication([{ applicationContent: "在留資格の変更許可", status: "申請済" as const, withdrawnOn: undefined }])).toBe(true);
    expect(isChangeApplication([{ applicationContent: "在留期間の更新許可", status: "申請済" as const, withdrawnOn: undefined }])).toBe(false);
    expect(
      isChangeApplication([
        { applicationContent: "在留資格の変更許可", status: "取下げ" as const, withdrawnOn: "2026-01-01" },
        { applicationContent: "在留期間の更新許可", status: "許可済" as const, withdrawnOn: undefined },
      ]),
    ).toBe(false);
    expect(isChangeApplication([])).toBe(false);
  });
});
