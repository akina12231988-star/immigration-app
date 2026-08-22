import { describe, expect, test } from "vitest";
import { toNotionProperty } from "@/lib/notion-property";

describe("toNotionProperty", () => {
  test("文字列・日付・数値はこれまでどおり書ける", () => {
    expect(toNotionProperty({ type: "rich_text" }, "審査中")).toEqual({
      rich_text: [{ text: { content: "審査中" } }],
    });
    expect(toNotionProperty({ type: "date" }, "2026-08-22")).toEqual({
      date: { start: "2026-08-22" },
    });
    expect(toNotionProperty({ type: "date" }, "8月22日")).toBeNull();
    expect(toNotionProperty({ type: "number" }, "182000")).toEqual({ number: 182000 });
  });

  test("select は名前で書く（無い選択肢はNotion側で自動作成される）", () => {
    expect(toNotionProperty({ type: "select" }, "特定技能の審査中")).toEqual({
      select: { name: "特定技能の審査中" },
    });
    // Notionのselectはカンマ入りの名前を作れないため書かない
    expect(toNotionProperty({ type: "select" }, "審査中, 待ち")).toBeNull();
  });

  test("status は同じ名前の選択肢があるときだけ書く（無いとページ更新全体が失敗するため）", () => {
    const def = { type: "status", status: { options: [{ name: "審査中" }] } };
    expect(toNotionProperty(def, "審査中")).toEqual({ status: { name: "審査中" } });
    expect(toNotionProperty(def, "許可済")).toBeNull();
    expect(toNotionProperty({ type: "status" }, "審査中")).toBeNull();
  });

  test("relation などの対応外の型は書かない", () => {
    expect(toNotionProperty({ type: "relation" }, "x")).toBeNull();
    expect(toNotionProperty({ type: "formula" }, "x")).toBeNull();
  });
});
