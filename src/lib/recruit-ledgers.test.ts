import { describe, expect, it } from "vitest";
import {
  buildFeeLedgerSheet,
  buildForm30Sheet,
  buildPostingLedgerSheet,
  buildSeekerLedgerSheet,
  noPoachingUntil,
  separationSummary,
  type Form30Posting,
  type PostingLedgerEntry,
  type SeekerLedgerEntry,
} from "./recruit-ledgers";

describe("noPoachingUntil", () => {
  it("採用日から2年（前日まで）を返す（厚労省記載例と同じ）", () => {
    expect(noPoachingUntil("2024-04-15")).toBe("2026-04-14");
  });
  it("月またぎ・うるう年でも日付として正しい", () => {
    expect(noPoachingUntil("2024-03-01")).toBe("2026-02-28");
    expect(noPoachingUntil("2022-03-01")).toBe("2024-02-29");
  });
  it("日付でない値は空", () => {
    expect(noPoachingUntil("")).toBe("");
  });
});

describe("separationSummary", () => {
  it("調査日・方法をまとめる", () => {
    expect(
      separationSummary({
        separation_status: "離職せず",
        separation_checked_on: "2026-11-01",
        separation_check_method: "電話確認",
      }),
    ).toBe("離職せず（調査日 2026-11-01・電話確認）");
  });
  it("状況が未入力なら空", () => {
    expect(separationSummary({ separation_checked_on: "2026-11-01" })).toBe("");
  });
});

const postingBase: Omit<PostingLedgerEntry, "applications"> = {
  acceptance_no: "8-1",
  org_name: "株式会社テスト",
  org_address: "熊本県熊本市",
  contact: "総務 096-000-0000",
  received_on: "2026-01-10",
  valid_until: "2026-04-30",
  openings: 2,
  job_type: "惣菜製造",
  work_location: "熊本工場",
  employment_period: "期間の定めなし",
  wage: "月給20万円",
  note: "",
};

describe("buildPostingLedgerSheet", () => {
  it("応募が無い求人も1行出す", () => {
    const sheet = buildPostingLedgerSheet([{ ...postingBase, applications: [] }]);
    expect(sheet.rows).toHaveLength(3); // タイトル＋見出し＋1行
    expect(sheet.rows[2][0]).toBe("8-1");
  });
  it("応募ごとに行を作り、無期採用のときだけ禁止期間・離職状況を書く", () => {
    const sheet = buildPostingLedgerSheet([
      {
        ...postingBase,
        applications: [
          {
            applied_on: "2026-02-01",
            worker_name: "A",
            result: "採用",
            result_on: "2026-02-20",
            employment_term: "無期",
            separation_status: "離職せず",
            separation_checked_on: "2026-09-01",
            separation_check_method: "電話確認",
          },
          {
            applied_on: "2026-02-02",
            worker_name: "B",
            result: "採用",
            result_on: "2026-02-21",
            employment_term: "有期",
            separation_status: "離職せず",
          },
          { applied_on: "2026-02-03", worker_name: "C", result: "不採用", result_on: null },
        ],
      },
    ]);
    const [a, b, c] = sheet.rows.slice(2);
    expect(a.slice(11)).toEqual([
      "2026-02-01",
      "A",
      "採用",
      "2026-02-20",
      "無期",
      "2028-02-19",
      "離職せず（調査日 2026-09-01・電話確認）",
      "",
    ]);
    expect(b[15]).toBe("有期");
    expect(b[16]).toBe(""); // 有期は禁止期間を書かない
    expect(b[17]).toBe("");
    expect(c[13]).toBe("不採用");
    expect(c[14]).toBe(""); // 不採用に採用年月日は無い
  });
});

describe("buildSeekerLedgerSheet", () => {
  it("求職者の基本情報＋応募ごとの取扱状況を並べる", () => {
    const entry: SeekerLedgerEntry = {
      jobseeker_no: "R8KS-2",
      name: "NGUYEN VAN A",
      address: "熊本県熊本市",
      birth: "1999-01-01",
      desired_job_type: "飲食料品製造業",
      accepted_on: "2026-01-05",
      valid_until: "2026-04-05",
      note: "",
      applications: [
        {
          applied_on: "2026-01-20",
          acceptance_no: "8-1",
          employer_name: "株式会社テスト",
          result: "採用",
          result_on: "2026-02-01",
          employment_term: "無期",
        },
      ],
    };
    const sheet = buildSeekerLedgerSheet([entry]);
    expect(sheet.rows[2]).toEqual([
      "R8KS-2",
      "NGUYEN VAN A",
      "熊本県熊本市",
      "1999-01-01",
      "飲食料品製造業",
      "2026-01-05",
      "2026-04-05",
      "2026-01-20",
      "8-1",
      "株式会社テスト",
      "採用",
      "2026-02-01",
      "無期",
      "2028-01-31",
      "",
      "",
    ]);
  });
});

describe("buildFeeLedgerSheet", () => {
  it("算出根拠の補完と未徴収の備考を付ける", () => {
    const sheet = buildFeeLedgerSheet([
      {
        payer_name: "株式会社テスト",
        paid_on: null,
        fee_kind: "紹介手数料",
        fee: 30000,
        calc_basis: "",
        worker_name: "NGUYEN VAN A",
        note: "",
      },
    ]);
    expect(sheet.rows[2]).toEqual([
      "株式会社テスト",
      "",
      "紹介手数料",
      30000,
      "",
      "紹介手数料（NGUYEN VAN A 分）",
      "未徴収",
    ]);
  });
});

describe("buildForm30Sheet", () => {
  const posting = (received: string, referred: string[]): Form30Posting => ({
    received_on: received,
    org_name: "株式会社テスト",
    org_address: "熊本県熊本市",
    job_type: "惣菜製造",
    note: "",
    referred_dates: referred,
  });

  it("過去1年間に紹介実績のある求人だけを新しい順に15件まで出す", () => {
    const postings = [
      posting("2025-01-01", ["2025-02-01"]), // 1年より前の実績 → 除外
      posting("2026-05-01", ["2026-06-01"]),
      posting("2026-07-01", ["2026-07-15"]),
      posting("2026-03-01", []), // 実績なし → 除外
    ];
    const sheet = buildForm30Sheet(postings, "2026-08-13");
    expect(sheet.rows).toHaveLength(4);
    expect(sheet.rows[2][1]).toBe("2026-07-01"); // 受付日の新しい順
    expect(sheet.rows[3][1]).toBe("2026-05-01");
  });
  it("実績が無ければ「実績なし」と書く", () => {
    const sheet = buildForm30Sheet([posting("2026-03-01", [])], "2026-08-13");
    expect(sheet.rows[2][1]).toBe("実績なし");
  });
  it("16件以上あれば直近15件に絞る", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      posting(`2026-06-${String(i + 1).padStart(2, "0")}`, ["2026-07-01"]),
    );
    const sheet = buildForm30Sheet(many, "2026-08-13");
    expect(sheet.rows).toHaveLength(2 + 15);
  });
});
