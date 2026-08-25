import { describe, expect, it } from "vitest";
import {
  jobseekerAge,
  jobseekerCardFileName,
  jobseekerCerts,
  jobseekerJobs,
} from "./jobseeker-card";
import type { WorkHistoryRow } from "@/types/db";

const history = (
  start: string,
  end: string | null,
  orgName: string,
  role = "",
  prefecture = "",
): WorkHistoryRow =>
  ({
    id: `${start}-${orgName}`,
    worker_id: "w1",
    visa: "特定技能1号",
    start_date: start,
    end_date: end,
    org_name: orgName,
    prefecture,
    role,
    note: "",
    kept_residence_status: false,
    legacy_id: null,
    created_at: "",
    updated_at: "",
  }) as WorkHistoryRow;

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

describe("jobseekerJobs", () => {
  it("古い順に並べ、続いている勤務先は「現在」と出す", () => {
    const jobs = jobseekerJobs([
      history("2024-04-01", null, "有限会社國崎青果", "耕種農業", "熊本県"),
      history("2021-04-01", "2024-03-31", "株式会社みらい", "惣菜製造"),
    ]);
    expect(jobs).toEqual([
      { period: "2021-04 〜 2024-03", orgName: "株式会社みらい", role: "惣菜製造" },
      { period: "2024-04 〜 現在", orgName: "有限会社國崎青果", role: "耕種農業／熊本県" },
    ]);
  });

  it("開始日のない行は出さない", () => {
    expect(jobseekerJobs([history("", null, "不明")])).toEqual([]);
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

describe("jobseekerCardFileName", () => {
  it("氏名と日付を入れる", () => {
    expect(jobseekerCardFileName("LE THI DIU", "2026-08-25")).toBe("求職票_LE THI DIU_2026-08-25");
  });

  it("ファイル名に使えない字は落とす", () => {
    expect(jobseekerCardFileName("A/B:C", "2026-08-25")).toBe("求職票_ABC_2026-08-25");
  });
});
