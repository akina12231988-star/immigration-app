import { describe, expect, it } from "vitest";
import {
  jobseekerAge,
  jobseekerCardFields,
  jobseekerCardFieldsOf,
  jobseekerCardJobs,
  jobseekerCerts,
  jobseekerReferrals,
  normalizeJobseekerCard,
  sortJobseekerJobs,
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
      fields: {},
      jobs: [],
    });
  });

  it("未登録（列がまだ無いDB）でも全部空でそろえる", () => {
    expect(normalizeJobseekerCard(null)).toEqual({
      phone: "",
      desired_location: "",
      desired_wage: "",
      available_from: "",
      other_wish: "",
      fields: {},
      jobs: [],
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

describe("求職票の職歴", () => {
  const job = (start: string, end: string, org: string) => ({ start, end, org, role: "" });

  it("まだ求職票で直していなければ、外国人の職歴をそのまま出す", () => {
    const histories = [job("2016-08-01", "2019-08-01", "楢崎茂行"), job("2025-10-28", "", "大家聖矢")];
    expect(jobseekerCardJobs([], histories).map((j) => j.org)).toEqual(["楢崎茂行", "大家聖矢"]);
  });

  it("求職票で直したあとは、求職票に残したぶんだけを出す", () => {
    const histories = [job("2016-08-01", "2019-08-01", "楢崎茂行")];
    const saved = [job("2025-10-28", "", "大家聖矢")];
    expect(jobseekerCardJobs(saved, histories).map((j) => j.org)).toEqual(["大家聖矢"]);
  });

  it("期間の古い順に並べ直す（日付が未入力の行は最後）", () => {
    const rows = [job("2025-10-28", "", "後"), job("", "", "未入力"), job("2016-08-01", "", "前")];
    expect(sortJobseekerJobs(rows).map((j) => j.org)).toEqual(["前", "後", "未入力"]);
  });
});

describe("求職票の記載内容（受付のときの控え）", () => {
  const fromWorker = {
    name: "NGUYEN QUANG LAN",
    kana: "グエン クアン ラン",
    gender: "男",
    birth: "1995-09-13",
    nationality: "ベトナム",
    address: "熊本県玉名市横島町共栄60番地",
    homeAddress: "",
    residenceStatus: "特定技能1号",
    residencePeriod: "1年",
    residenceExpiry: "2026-10-28",
    residenceCardNo: "UH49798823RG",
    passportNo: "E03436288",
    passportExpiry: "2035-04-28",
    field: "農業分野・耕種農業",
  };

  it("まだ求職票で直していなければ、外国人の登録内容を出す", () => {
    expect(jobseekerCardFields(fromWorker, {})).toEqual(fromWorker);
  });

  it("求職票で直したぶんは、外国人の登録が変わってもそのまま残る", () => {
    const shown = jobseekerCardFields(fromWorker, { address: "熊本県八代市鏡町内田1515番地1" });
    expect(shown.address).toBe("熊本県八代市鏡町内田1515番地1");
    // 直していない項目は外国人の登録内容のまま
    expect(shown.name).toBe("NGUYEN QUANG LAN");
  });

  it("空にしたぶんも控えとして残す（登録内容に戻らない）", () => {
    expect(jobseekerCardFields(fromWorker, { residencePeriod: "" }).residencePeriod).toBe("");
  });

  it("画面に出ている内容をそのまま控えにする", () => {
    const saved = jobseekerCardFieldsOf({ ...fromWorker, address: "新しい住所" });
    expect(saved.address).toBe("新しい住所");
    expect(Object.keys(saved)).toHaveLength(14);
  });
});
