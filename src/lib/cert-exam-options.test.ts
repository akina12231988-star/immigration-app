import { describe, expect, it } from "vitest";
import {
  EXAM_LOCATION_JAPAN,
  NIHONGO_EXAM_NAME_OPTIONS,
  SENMONGAI_EXAM_NAME_OPTIONS,
  nihongoExamNameOf,
  skillExamNameOf,
} from "./cert-exam-options";

describe("cert-exam-options", () => {
  it("候補に重複が無い", () => {
    expect(new Set(NIHONGO_EXAM_NAME_OPTIONS).size).toBe(NIHONGO_EXAM_NAME_OPTIONS.length);
    expect(new Set(SENMONGAI_EXAM_NAME_OPTIONS).size).toBe(SENMONGAI_EXAM_NAME_OPTIONS.length);
  });

  it("受験地の「日本国内」は空でない", () => {
    expect(EXAM_LOCATION_JAPAN).toBe("日本国内");
  });

  it("以前の書き方の日本語の試験名を 19.2 のプルダウンの書き方に読み替える", () => {
    expect(nihongoExamNameOf("日本語能力試験　JLPT")).toBe("日本語能力試験 Japanese language proficiency test");
    expect(nihongoExamNameOf("日本語能力試験　JEES")).toBe("日本語能力試験 Japanese language proficiency test");
    expect(nihongoExamNameOf("公益財団法人　日本国際教育支援協会")).toBe("日本語能力試験 Japanese language proficiency test");
    expect(nihongoExamNameOf("国際交流基金日本語基礎テスト")).toBe("国際交流基金日本語基礎テスト The japan foundation japanese basic test");
    expect(nihongoExamNameOf("Nursing care Japanese language evaluation test (Vietnamese)")).toBe(
      "介護日本語評価試験 Nursing care japanese language evaluation test",
    );
    expect(nihongoExamNameOf("受験してない")).toBe("試験免除 Test exemption");
    expect(nihongoExamNameOf("技能実習の専門級の合格なので省略")).toBe("試験免除 Test exemption");
    expect(nihongoExamNameOf("試験免除 Test exemption")).toBe("試験免除 Test exemption");
    expect(nihongoExamNameOf("General crop farming (Vietnamese)")).toBe("General crop farming (Vietnamese)");
    expect(nihongoExamNameOf("")).toBe("");
  });

  it("以前の書き方の農業の試験名を 18.2 のプルダウンの書き方に読み替える", () => {
    expect(skillExamNameOf("General crop farming (Indonesian)")).toBe(
      "1号農業技能測定試験（耕種農業全般）Agriculture specified skills(i) proficiency test (cultivation agriculture)",
    );
    expect(skillExamNameOf("General livestock farming (Khumer)")).toBe(
      "1号農業技能測定試験（畜産農業全般）Agriculture specified skills(i) proficiency test (livestock agriculture)",
    );
    expect(skillExamNameOf("2号 耕種農業")).toBe(
      "2号農業技能測定試験（耕種農業全般）Agriculture specified skills(ii) proficiency test (cultivation agriculture)",
    );
    expect(skillExamNameOf("外国人食品産業技能評価機構")).toBe("外国人食品産業技能評価機構");
    expect(skillExamNameOf("")).toBe("");
  });
});
