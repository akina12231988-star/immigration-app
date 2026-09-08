import { describe, expect, it } from "vitest";
import { isSameOrigin, isTranslateOriginAllowed, pickTranslateTexts, translateAllowedOrigins } from "./translate-api";

describe("翻訳の受け口の判定", () => {
  it("履歴書ツールの公開URLだけを許す。環境変数で増やせる", () => {
    expect(isTranslateOriginAllowed("https://akina12231988-star.github.io", undefined)).toBe(true);
    expect(isTranslateOriginAllowed("https://example.com", undefined)).toBe(false);
    expect(isTranslateOriginAllowed(null, undefined)).toBe(false);
    expect(isTranslateOriginAllowed("http://localhost:8080", "http://localhost:8080/, https://a.example")).toBe(true);
    expect(translateAllowedOrigins(" https://a.example ")).toEqual([
      "https://akina12231988-star.github.io",
      "https://a.example",
    ]);
  });

  it("このシステム自身（/resume の履歴書ツール）からの呼び出しは Host が同じなら許す", () => {
    expect(isSameOrigin("https://app.vercel.app", "app.vercel.app")).toBe(true);
    expect(isSameOrigin("https://App.vercel.app", "app.vercel.app")).toBe(true);
    expect(isSameOrigin("http://localhost:3000", "localhost:3000")).toBe(true);
    expect(isSameOrigin("https://evil.example", "app.vercel.app")).toBe(false);
    expect(isSameOrigin("not a url", "app.vercel.app")).toBe(false);
    expect(isSameOrigin(null, "app.vercel.app")).toBe(false);
    expect(isTranslateOriginAllowed("https://app.vercel.app", undefined, "app.vercel.app")).toBe(true);
    expect(isTranslateOriginAllowed("https://evil.example", undefined, "app.vercel.app")).toBe(false);
  });

  it("翻訳する項目は文字だけ・空でないものに絞り、件数と長さに上限を付ける", () => {
    const many: Record<string, unknown> = {};
    for (let i = 0; i < 70; i++) many[`t${i}`] = `text${i}`;
    many.empty = "   ";
    many.num = 1;
    const picked = pickTranslateTexts(many);
    expect(picked).toHaveLength(60);
    expect(picked.every(([, v]) => v.startsWith("text"))).toBe(true);
    expect(pickTranslateTexts({ a: "x".repeat(500) })[0][1]).toHaveLength(300);
    expect(pickTranslateTexts(null)).toEqual([]);
  });
});
