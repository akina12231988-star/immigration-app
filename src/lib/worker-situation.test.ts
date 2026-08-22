import { describe, expect, test } from "vitest";
import { WORKER_SITUATIONS, situationDescription } from "@/lib/worker-situation";

describe("situationDescription", () => {
  test("選択肢の意味を返す（前後の空白は無視）", () => {
    expect(situationDescription("更新＜５年目＞")).toContain("１年未満");
    expect(situationDescription("  １号満了終了 ")).toContain("５年");
  });

  test("選択肢に無い自由入力・説明未登録の選択肢は空を返す", () => {
    expect(situationDescription("独自のメモ")).toBe("");
    expect(situationDescription("退職")).toBe("");
  });

  test("「技人国申請　更新準備中」は今後使わないため選択肢に無い", () => {
    expect(WORKER_SITUATIONS.some((s) => s.value.includes("技人国"))).toBe(false);
  });
});
