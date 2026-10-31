import { describe, expect, it } from "vitest";
import { gmailLinkForAccount } from "./mail-format";

describe("gmailLinkForAccount（入管メールを受け取る Gmail で開く）", () => {
  const link = "https://mail.google.com/mail/u/0/#all/18f2a3b4c5d6e7f8";
  it("u/0 をアカウントのメールアドレスに置き換える", () => {
    expect(gmailLinkForAccount(link, "immi@example.com")).toBe("https://mail.google.com/mail/u/immi@example.com/#all/18f2a3b4c5d6e7f8");
    expect(gmailLinkForAccount("https://mail.google.com/mail/u/2/#inbox/abc", " immi@example.com ")).toBe(
      "https://mail.google.com/mail/u/immi@example.com/#inbox/abc",
    );
  });
  it("アカウントが未設定、または Gmail 以外のリンクはそのまま", () => {
    expect(gmailLinkForAccount(link, "")).toBe(link);
    expect(gmailLinkForAccount(link, null)).toBe(link);
    expect(gmailLinkForAccount("https://example.com/x", "immi@example.com")).toBe("https://example.com/x");
    expect(gmailLinkForAccount("", "immi@example.com")).toBe("");
  });
});
