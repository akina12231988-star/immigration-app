import { describe, expect, it } from "vitest";
import {
  passwordErrorMessage,
  resetPasswordRedirectUrl,
  validateNewPassword,
} from "@/lib/password";

describe("新しいパスワードの確認", () => {
  it("8文字以上・英数字まじり・一致していれば通る", () => {
    expect(validateNewPassword("abcd1234", "abcd1234")).toBeNull();
  });

  it("短い・数字だけ・英字だけ・空白・不一致は理由を返す", () => {
    expect(validateNewPassword("abc123", "abc123")).toMatch(/8文字以上/);
    expect(validateNewPassword("12345678", "12345678")).toMatch(/数字だけ/);
    expect(validateNewPassword("abcdefgh", "abcdefgh")).toMatch(/英字だけ/);
    expect(validateNewPassword("abcd 1234", "abcd 1234")).toMatch(/空白/);
    expect(validateNewPassword("abcd1234", "abcd1235")).toMatch(/一致しません/);
  });
});

describe("再設定のエラーの言い換え", () => {
  it("別の端末で開いたとき（PKCE の code verifier が無い）", () => {
    expect(passwordErrorMessage("invalid request: both auth code and code verifier should be non-empty", "失敗")).toMatch(/同じ端末/);
  });

  it("期限切れ・同じパスワード・弱いパスワード", () => {
    expect(passwordErrorMessage("Email link is invalid or has expired", "失敗")).toMatch(/期限が切れている/);
    expect(passwordErrorMessage("New password should be different from the old password.", "失敗")).toMatch(/同じパスワード/);
    expect(passwordErrorMessage("Password should be at least 6 characters.", "失敗")).toMatch(/短いか簡単/);
  });

  it("それ以外は元の文を添える", () => {
    expect(passwordErrorMessage("network", "失敗しました")).toBe("失敗しました: network");
    expect(passwordErrorMessage(undefined, "失敗しました")).toBe("失敗しました");
  });
});

describe("再設定メールのリンク先", () => {
  it("末尾のスラッシュがあっても1つにする", () => {
    expect(resetPasswordRedirectUrl("https://example.com")).toBe("https://example.com/reset-password");
    expect(resetPasswordRedirectUrl("https://example.com/")).toBe("https://example.com/reset-password");
  });
});
