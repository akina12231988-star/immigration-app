import { describe, expect, it } from "vitest";
import { extractNotionPageId, notionAppUrl } from "./notion-link";

describe("extractNotionPageId", () => {
  it("app.notion.com/p/ 形式の32桁IDをUUIDにする", () => {
    expect(extractNotionPageId("https://app.notion.com/p/3a629d7ae649802d9aede82605d6e06c")).toBe(
      "3a629d7a-e649-802d-9aed-e82605d6e06c",
    );
  });

  it("タイトルスラッグ付きURLでも末尾のIDを取り出す", () => {
    expect(
      extractNotionPageId("https://www.notion.so/workspace/Foreigner-Name-3a629d7ae649802d9aede82605d6e06c?pvs=4"),
    ).toBe("3a629d7a-e649-802d-9aed-e82605d6e06c");
  });

  it("ダッシュ付きUUIDはそのまま使う", () => {
    expect(
      extractNotionPageId("https://notion.so/3a629d7a-e649-802d-9aed-e82605d6e06c"),
    ).toBe("3a629d7a-e649-802d-9aed-e82605d6e06c");
  });

  it("IDが無ければ null", () => {
    expect(extractNotionPageId("https://example.com/no-id-here")).toBeNull();
  });
});

describe("notionAppUrl", () => {
  it("https を notion:// に変換する", () => {
    expect(notionAppUrl("https://app.notion.com/p/abc")).toBe("notion://app.notion.com/p/abc");
  });
});
