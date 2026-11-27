import { describe, expect, it } from "vitest";
import { SENMONGAI_EXAM_NAME_OPTIONS } from "@/lib/cert-exam-options";

describe("SENMONGAI_EXAM_NAME_OPTIONS（オンライン申請のプルダウンと同じ内容）", () => {
  it("先頭は試験免除・末尾は外食業2号で、重複がない", () => {
    expect(SENMONGAI_EXAM_NAME_OPTIONS[0]).toBe("試験免除 Test exemption");
    expect(SENMONGAI_EXAM_NAME_OPTIONS[SENMONGAI_EXAM_NAME_OPTIONS.length - 1]).toBe(
      "外食業特定技能２号技能測定試験 Restaurant industry specified skills (ii) proficiency test",
    );
    expect(new Set(SENMONGAI_EXAM_NAME_OPTIONS).size).toBe(SENMONGAI_EXAM_NAME_OPTIONS.length);
    expect(SENMONGAI_EXAM_NAME_OPTIONS.length).toBe(48);
  });
  it("農業の試験（1号・耕種）がオンラインの表記で入っている", () => {
    expect(SENMONGAI_EXAM_NAME_OPTIONS).toContain(
      "１号農業技能測定試験（耕種農業全般） Agriculture specified skills(i) proficiency test (cultivation agriculture)",
    );
  });
});
