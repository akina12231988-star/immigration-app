import { describe, expect, it } from "vitest";
import { messengerWebUrl } from "./messenger-link";

describe("messengerWebUrl", () => {
  it("m.me のリンクを messenger.com に変換する（アプリではなくブラウザで開く）", () => {
    expect(messengerWebUrl("https://m.me/abc123")).toBe("https://www.messenger.com/t/abc123");
    expect(messengerWebUrl("https://m.me/abc.123/")).toBe("https://www.messenger.com/t/abc.123");
    expect(messengerWebUrl("https://m.me/abc?ref=xyz")).toBe(
      "https://www.messenger.com/t/abc?ref=xyz",
    );
  });

  it("グループ招待（/j/）はそのままの形で messenger.com に変換する", () => {
    expect(messengerWebUrl("https://m.me/j/AbCdEf")).toBe("https://www.messenger.com/j/AbCdEf");
  });

  it("facebook.com のメッセージリンクも messenger.com に変換する", () => {
    expect(messengerWebUrl("https://www.facebook.com/messages/t/100012345")).toBe(
      "https://www.messenger.com/t/100012345",
    );
  });

  it("すでに messenger.com のリンクやその他の値はそのまま返す", () => {
    expect(messengerWebUrl("https://www.messenger.com/t/abc")).toBe(
      "https://www.messenger.com/t/abc",
    );
    expect(messengerWebUrl("")).toBe("");
    expect(messengerWebUrl("メモ書き")).toBe("メモ書き");
  });
});
