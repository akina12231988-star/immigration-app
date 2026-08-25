import { describe, expect, it } from "vitest";
import {
  jobseekerAge,
  jobseekerCerts,
  jobseekerReferrals,
  normalizeJobseekerCard,
  type JobseekerReferral,
} from "./jobseeker-card";

describe("jobseekerAge", () => {
  it("誕生日を過ぎていれば満年齢そのまま", () => {
    expect(jobseekerAge("1998-03-10", "2026-08-25")).toBe("28");
  });

  it("誕生日がまだなら1歳引く", () => {
    expect(jobseekerAge("1998-12-10", "2026-08-25")).toBe("27");
  });

  it("生年月日が未入力なら空", () => {
    expect(jobseekerAge(null, "2026-08-25")).toBe("");
    expect(jobseekerAge("", "2026-08-25")).toBe("");
  });
});

describe("jobseekerCerts", () => {
  it("入力のあるものだけを並べる", () => {
    expect(
      jobseekerCerts({
        field: "農業",
        specialty_grade: "",
        jisshu2_shokushu: "耕種農業",
        jisshu2_sagyo: "施設園芸",
        ssw2_exam: "",
        other_qualifications: "",
        cert_nihongo_name: "日本語能力試験　JLPT",
        cert_nihongo_level: "N4",
      }),
    ).toEqual([
      { label: "特定技能の分野", value: "農業" },
      { label: "技能実習2号（良好に修了）", value: "耕種農業／施設園芸" },
      { label: "日本語の試験", value: "日本語能力試験　JLPT N4" },
    ]);
  });

  it("何も入力がなければ空", () => {
    expect(
      jobseekerCerts({
        field: "",
        specialty_grade: "",
        ssw2_exam: "",
        other_qualifications: "",
      }),
    ).toEqual([]);
  });
});

describe("normalizeJobseekerCard", () => {
  it("入っていない項目は空にして全部そろえる", () => {
    expect(normalizeJobseekerCard({ phone: "090-1234-5678" })).toEqual({
      phone: "090-1234-5678",
      desired_location: "",
      desired_wage: "",
      available_from: "",
      other_wish: "",
    });
  });

  it("未登録（列がまだ無いDB）でも全部空でそろえる", () => {
    expect(normalizeJobseekerCard(null)).toEqual({
      phone: "",
      desired_location: "",
      desired_wage: "",
      available_from: "",
      other_wish: "",
    });
  });

  it("文字でない値は空として扱う", () => {
    expect(normalizeJobseekerCard({ phone: 123, other_wish: ["x"] }).phone).toBe("");
  });
});

describe("jobseekerReferrals", () => {
  const ref = (appliedOn: string, employerName: string): JobseekerReferral => ({
    appliedOn,
    acceptanceNo: "",
    employerName,
    result: "採用",
    resultOn: "",
  });

  it("受付年月日より前の紹介は載せない（前回の求職受付のときの分）", () => {
    const rows = [ref("2025-09-01", "大家聖矢"), ref("2026-04-03", "髙濱伸吉")];
    expect(jobseekerReferrals(rows, "2026-04-01").map((r) => r.employerName)).toEqual([
      "髙濱伸吉",
    ]);
  });

  it("受付年月日と同じ日の紹介は載せる", () => {
    const rows = [ref("2026-04-01", "髙濱伸吉")];
    expect(jobseekerReferrals(rows, "2026-04-01")).toHaveLength(1);
  });

  it("受付年月日が未入力なら全部載せる", () => {
    const rows = [ref("2025-09-01", "大家聖矢"), ref("2026-04-03", "髙濱伸吉")];
    expect(jobseekerReferrals(rows, "")).toHaveLength(2);
  });

  it("紹介年月日が入っていない記録はそのまま載せる", () => {
    expect(jobseekerReferrals([ref("", "未入力")], "2026-04-01")).toHaveLength(1);
  });
});
