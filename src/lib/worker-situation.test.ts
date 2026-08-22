import { describe, expect, test } from "vitest";
import {
  APPLICATION_CONTENT_CHOICES,
  PREP_SITUATIONS,
  WORKER_SITUATIONS,
  situationDescription,
} from "@/lib/worker-situation";
import { APPLICATION_CONTENT_OPTIONS } from "@/types/application";

const values = new Set(WORKER_SITUATIONS.map((s) => s.value));

describe("situationDescription", () => {
  test("選択肢の意味を返す（前後の空白は無視）", () => {
    expect(situationDescription("更新＜５年目＞")).toContain("１年未満");
    expect(situationDescription("  １号満了終了 ")).toContain("５年");
  });

  test("選択肢に無い自由入力・説明未登録の選択肢は空を返す", () => {
    expect(situationDescription("独自のメモ")).toBe("");
    expect(situationDescription("特定技能の審査中")).toBe("");
  });

  test("使わない選択肢（技人国・移行しない・技能習2号ロ）は外している", () => {
    expect(WORKER_SITUATIONS.some((s) => s.value.includes("技人国"))).toBe(false);
    expect(WORKER_SITUATIONS.some((s) => s.value.includes("移行しない"))).toBe(false);
    expect(WORKER_SITUATIONS.some((s) => s.value.includes("技能習"))).toBe(false);
  });
});

describe("PREP_SITUATIONS", () => {
  test("準備中の内容は7つで、すべて只今の状況の選択肢にある", () => {
    expect(PREP_SITUATIONS).toHaveLength(7);
    for (const s of PREP_SITUATIONS) expect(values.has(s)).toBe(true);
  });
});

describe("APPLICATION_CONTENT_CHOICES", () => {
  test("申請内容の候補は7つで、申請内容は従来の3種類のどれかになる", () => {
    expect(APPLICATION_CONTENT_CHOICES).toHaveLength(7);
    for (const c of APPLICATION_CONTENT_CHOICES) {
      expect(APPLICATION_CONTENT_OPTIONS).toContain(c.content);
      expect(c.label.startsWith(c.content)).toBe(true); // 候補名は保存される申請内容から始まる
    }
  });

  test("候補ごとの只今の状況は、すべて審査中の選択肢にある", () => {
    for (const c of APPLICATION_CONTENT_CHOICES) {
      expect(values.has(c.situation)).toBe(true);
      expect(c.situation).toContain("審査中");
    }
  });

  test("本人申請の候補は2つ（特定活動２号以降準備・特定技能２号）", () => {
    const self = APPLICATION_CONTENT_CHOICES.filter((c) => c.selfApply);
    expect(self.map((c) => c.situation).sort()).toEqual(
      ["２号特定技能の審査中", "特定活動（２号以降準備）の審査中"].sort(),
    );
  });
});
