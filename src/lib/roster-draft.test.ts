import { describe, expect, it } from "vitest";
import { buildRosterDraft, rosterPreviousJobs, type RosterDraftSource } from "./roster-draft";
import type { WorkerRoster } from "@/types/db";

const SRC: RosterDraftSource = {
  orgName: "株式会社ハレノヒファーム",
  field: "農業分野・耕種農業",
  employmentStartOn: "2026-08-25",
  residenceStatus: "特定技能1号",
  residencePermitDate: "2026-08-24",
  status: "在籍中",
  leavingOn: null,
  leavingKind: "",
  leavingReason: "",
  workHistories: [
    {
      start_date: "2023-08-23",
      end_date: "2026-08-23",
      org_name: "株式会社ハレノヒファーム",
      prefecture: "熊本県",
    },
    { start_date: "2026-08-25", end_date: null, org_name: "岩下　みちる", prefecture: "熊本県" },
  ],
};

describe("rosterPreviousJobs", () => {
  it("終了済みの職歴だけを古い順に出し、都道府県もそのまま持ってくる", () => {
    expect(rosterPreviousJobs(SRC.workHistories)).toEqual([
      { company: "株式会社ハレノヒファーム", prefecture: "熊本県" },
    ]);
  });

  it("都道府県が未入力の職歴（0117適用前のデータ）は空欄にする", () => {
    expect(
      rosterPreviousJobs([{ start_date: "2020-04-01", end_date: "2023-03-31", org_name: "◯◯株式会社" }]),
    ).toEqual([{ company: "◯◯株式会社", prefecture: "" }]);
  });

  it("会社名が無い職歴は前職に出さない", () => {
    expect(
      rosterPreviousJobs([{ start_date: "2020-04-01", end_date: "2023-03-31", org_name: "" }]),
    ).toEqual([]);
  });
});

describe("buildRosterDraft", () => {
  it("保存済みの名簿が無ければ登録データから組み立てる", () => {
    const draft = buildRosterDraft(SRC, null, "2026-08-25");
    expect(draft.company_name).toBe("株式会社ハレノヒファーム");
    expect(draft.work_kind).toContain("耕種農業");
    // 入社と在留資格の許可が履歴に入る（古い順）
    expect(draft.history).toEqual([
      { on: "2026年8月24日", content: "特定技能1号ビザの許可" },
      { on: "2026年8月25日", content: "入社" },
    ]);
    expect(draft.previous_jobs).toEqual([
      { company: "株式会社ハレノヒファーム", prefecture: "熊本県" },
    ]);
    expect(draft.leaving_on).toBe("");
    expect(draft.issued_on).toBe("2026-08-25");
  });

  it("退職している人は解雇・退職の欄を埋める", () => {
    const draft = buildRosterDraft(
      {
        ...SRC,
        status: "退職",
        leavingOn: "2027-03-31",
        leavingKind: "自己都合",
        leavingReason: "帰国",
      },
      null,
      "2026-08-25",
    );
    expect(draft.leaving_on).toBe("2027年3月31日");
    expect(draft.leaving_reason).toBe("自己都合・帰国");
  });

  it("保存済みの名簿があればその内容を優先する（画面で直した内容が消えない）", () => {
    const saved = {
      company_name: "株式会社ハレノヒファーム",
      work_kind: "手で直した業務の種類",
      history: [{ on: "2026年8月25日", content: "入社" }],
      previous_jobs: [{ company: "◯◯株式会社", prefecture: "愛知県" }],
      leaving_on: "",
      leaving_reason: "",
      issued_on: "2026-09-01",
    } as WorkerRoster;
    const draft = buildRosterDraft(SRC, saved, "2026-08-25");
    expect(draft.work_kind).toBe("手で直した業務の種類");
    expect(draft.previous_jobs).toEqual([{ company: "◯◯株式会社", prefecture: "愛知県" }]);
    expect(draft.issued_on).toBe("2026-09-01");
  });

  it("雇用開始日が分からないときの発行年月日は今日にする", () => {
    const draft = buildRosterDraft({ ...SRC, employmentStartOn: null }, null, "2026-08-25");
    expect(draft.issued_on).toBe("2026-08-25");
    expect(draft.history).toEqual([{ on: "2026年8月24日", content: "特定技能1号ビザの許可" }]);
  });
});
