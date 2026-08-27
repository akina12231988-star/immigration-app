import { describe, expect, it } from "vitest";
import {
  answeredAlready,
  DUTY_QUESTIONS,
  INSTRUCTEE_QUESTIONS,
  INTERVIEW_SECTIONS,
  unansweredQuestions,
} from "@/lib/ssw2-interview";
import { EMPTY_SSW2_DUTIES } from "@/lib/org-ssw2-duties";

describe("質問票の中身", () => {
  it("業務内容の①〜④がそろっている", () => {
    expect(DUTY_QUESTIONS.map((q) => q.no)).toEqual(["①", "②", "③", "④"]);
  });

  it("業務内容の質問は、どの記入欄に入るかが決まっている", () => {
    expect(DUTY_QUESTIONS.every((q) => q.key)).toBe(true);
  });

  it("むずかしい言い回しを質問文に使っていない", () => {
    const hard = ["当該", "特定産業分野", "分野別方針", "要領別冊", "欠格事由", "在留諸申請"];
    const asks = [...DUTY_QUESTIONS, ...INSTRUCTEE_QUESTIONS].map((q) => q.ask).join("\n");
    for (const w of hard) expect(asks).not.toContain(w);
  });

  it("聞き取りは2つの区切りに分かれている", () => {
    expect(INTERVIEW_SECTIONS).toHaveLength(2);
    expect(INTERVIEW_SECTIONS[0].questions).toHaveLength(4);
  });

  it("重なりを防ぐ質問（ほかの2号から教わっていないか）が入っている", () => {
    const asks = INSTRUCTEE_QUESTIONS.map((q) => q.ask).join("\n");
    expect(asks).toContain("ほかの特定技能２号の方から教わっている");
  });
});

describe("answeredAlready / unansweredQuestions", () => {
  it("何も登録していなければ4件すべて聞く", () => {
    expect(unansweredQuestions(EMPTY_SSW2_DUTIES)).toHaveLength(4);
    expect(answeredAlready(EMPTY_SSW2_DUTIES)).toEqual({});
  });

  it("登録済みの欄は聞かなくてよい", () => {
    const duties = { ...EMPTY_SSW2_DUTIES, department: "製造部", position: "一般社員" };
    expect(unansweredQuestions(duties).map((q) => q.key)).toEqual(["duties", "difference"]);
    expect(answeredAlready(duties)).toEqual({ department: "製造部", position: "一般社員" });
  });

  it("空白だけの入力は未記入として扱う", () => {
    const duties = { ...EMPTY_SSW2_DUTIES, department: "  " };
    expect(unansweredQuestions(duties)).toHaveLength(4);
  });
});
