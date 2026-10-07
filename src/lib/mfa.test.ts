import { describe, expect, it } from "vitest";
import {
  isMfaPath,
  mfaErrorMessage,
  mfaStep,
  mfaStepPath,
  normalizeTotpCode,
  safeNextPath,
  totpFriendlyName,
  verifiedTotpFactors,
} from "@/lib/mfa";

const verified = { factor_type: "totp", status: "verified" };
const unverified = { factor_type: "totp", status: "unverified" };

describe("mfaStep", () => {
  it("認証アプリを登録していなければ登録画面へ", () => {
    expect(mfaStep("aal1", [])).toBe("setup");
    expect(mfaStep("aal1", null)).toBe("setup");
    expect(mfaStep("aal1", undefined)).toBe("setup");
  });

  it("登録の途中（未確認）の要素しか無ければ登録画面へ", () => {
    expect(mfaStep("aal1", [unverified])).toBe("setup");
  });

  it("登録済みでパスワードだけの状態ならコード入力へ", () => {
    expect(mfaStep("aal1", [verified])).toBe("verify");
    expect(mfaStep(null, [verified])).toBe("verify");
  });

  it("コードが通っていれば業務画面へ", () => {
    expect(mfaStep("aal2", [verified])).toBe("done");
    expect(mfaStep("aal2", [unverified, verified])).toBe("done");
  });

  it("電話番号の要素は数えない（認証アプリだけ）", () => {
    expect(mfaStep("aal2", [{ factor_type: "phone", status: "verified" }])).toBe("setup");
  });
});

describe("verifiedTotpFactors", () => {
  it("確認済みの認証アプリだけを返す", () => {
    const phone = { factor_type: "phone", status: "verified" };
    expect(verifiedTotpFactors([verified, unverified, phone])).toEqual([verified]);
  });
});

describe("safeNextPath / mfaStepPath", () => {
  it("アプリ内パスだけを戻り先に使う", () => {
    expect(safeNextPath("/workers/1")).toBe("/workers/1");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });

  it("戻り先が先頭ページなら next を付けない", () => {
    expect(mfaStepPath("setup")).toBe("/mfa/setup");
    expect(mfaStepPath("verify", "/")).toBe("/mfa/verify");
  });

  it("戻り先をエンコードして付ける", () => {
    expect(mfaStepPath("verify", "/custody?no=7")).toBe("/mfa/verify?next=%2Fcustody%3Fno%3D7");
  });

  it("isMfaPath は登録・コード入力の2画面だけ", () => {
    expect(isMfaPath("/mfa/setup")).toBe(true);
    expect(isMfaPath("/mfa/verify")).toBe(true);
    expect(isMfaPath("/mfa")).toBe(false);
    expect(isMfaPath("/login")).toBe(false);
  });
});

describe("normalizeTotpCode", () => {
  it("6桁の数字にそろえる（空白・ハイフン・全角を許す）", () => {
    expect(normalizeTotpCode("123456")).toBe("123456");
    expect(normalizeTotpCode(" 123 456 ")).toBe("123456");
    expect(normalizeTotpCode("123-456")).toBe("123456");
    expect(normalizeTotpCode("１２３４５６")).toBe("123456");
  });

  it("6桁でなければ null", () => {
    expect(normalizeTotpCode("12345")).toBeNull();
    expect(normalizeTotpCode("1234567")).toBeNull();
    expect(normalizeTotpCode("abcdef")).toBeNull();
    expect(normalizeTotpCode("")).toBeNull();
  });
});

describe("mfaErrorMessage", () => {
  it("コードちがいは分かる言葉にする", () => {
    expect(mfaErrorMessage("Invalid TOTP code entered", "失敗")).toMatch(/コードが正しくありません/);
  });

  it("Supabase 側で無効のときは設定場所を案内する", () => {
    expect(mfaErrorMessage("MFA is disabled for this project", "失敗")).toMatch(/Multi-Factor/);
    expect(mfaErrorMessage("TOTP factors are not enabled", "失敗")).toMatch(/Multi-Factor/);
  });

  it("それ以外は元の文を添える。空なら既定の文だけ", () => {
    expect(mfaErrorMessage("network", "失敗しました")).toBe("失敗しました: network");
    expect(mfaErrorMessage(undefined, "失敗しました")).toBe("失敗しました");
  });
});

describe("totpFriendlyName", () => {
  it("日時を付けて同じ名前にならないようにする", () => {
    expect(totpFriendlyName(new Date(2026, 9, 7, 9, 5, 3))).toBe("入管申請管理 2026-10-07 09:05:03");
  });
});
