import { describe, expect, it } from "vitest";
import { resumeInviteMessage, resumeLangForNationality, resumeToolUrl } from "./share";

describe("履歴書ツールの案内", () => {
  it("URLは origin + /resume", () => {
    expect(resumeToolUrl("https://app.example")).toBe("https://app.example/resume");
    expect(resumeToolUrl("https://app.example/")).toBe("https://app.example/resume");
  });

  it("国籍から案内文の言語を決める（分からなければ英語）", () => {
    expect(resumeLangForNationality("ベトナム")).toBe("vi");
    expect(resumeLangForNationality("Viet Nam")).toBe("vi");
    expect(resumeLangForNationality("インドネシア")).toBe("id");
    expect(resumeLangForNationality("カンボジア")).toBe("km");
    expect(resumeLangForNationality("フィリピン")).toBe("tl");
    expect(resumeLangForNationality("ミャンマー")).toBe("en");
    expect(resumeLangForNationality("")).toBe("en");
    expect(resumeLangForNationality(null)).toBe("en");
  });

  it("案内文はその言語で、ツールのボタン名とURLを含む", () => {
    const vi = resumeInviteMessage("vi", "https://app.example/resume");
    expect(vi).toContain("Dịch sang tiếng Nhật & Lưu PDF");
    expect(vi).not.toContain("🌐");
    expect(vi.endsWith("https://app.example/resume")).toBe(true);
    expect(resumeInviteMessage("ja", "u")).toContain("「日本語に翻訳してPDF保存」");
  });
});
