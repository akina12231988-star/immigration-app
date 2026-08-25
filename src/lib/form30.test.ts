import { describe, expect, it } from "vitest";
import {
  FORM30_MAX_ROWS,
  buildForm30Candidates,
  buildForm30Doc,
  defaultSelection,
  isEligible,
  oneYearBefore,
  payStatusOf,
  applyForm30Edits,
  changedOrgAddresses,
  emptyForm30Edits,
  form30Note,
  isImportNote,
  type Form30Application,
  type Form30Candidate,
  type Form30Fee,
  type Form30PostingInput,
} from "./form30";
import { docxDocumentXml } from "./docx-export";

const BASE = "2026-08-26";

const fee = (over: Partial<Form30Fee> = {}): Form30Fee => ({
  organization_id: "o1",
  worker_name: "NGUYEN VAN A",
  billed_on: null,
  paid_on: null,
  ...over,
});

const app = (over: Partial<Form30Application> = {}): Form30Application => ({
  worker_name: "NGUYEN VAN A",
  applied_on: "2026-06-19",
  result: "採用",
  result_on: "2026-06-22",
  ...over,
});

const posting = (over: Partial<Form30PostingInput> = {}): Form30PostingInput => ({
  postingId: "p1",
  organizationId: "o1",
  received_on: "2026-05-01",
  org_name: "有限会社國崎青果",
  org_address: "熊本県八代市鏡町1515",
  job_type: "耕種農業全般",
  note: "",
  applications: [app()],
  ...over,
});

describe("oneYearBefore", () => {
  it("訪問予定日の1年前を返す", () => {
    expect(oneYearBefore("2026-08-26")).toBe("2025-08-26");
  });

  it("日付の形が違えばそのまま返す", () => {
    expect(oneYearBefore("")).toBe("");
  });
});

describe("payStatusOf", () => {
  // その求人で採用になった人（この人の手数料だけを見る）
  const hiredA = [app()];

  it("入金日が入った手数料が1件でもあれば入金済み", () => {
    const r = payStatusOf([fee({ billed_on: "2026-07-01", paid_on: "2026-07-31" })], "o1", hiredA);
    expect(r.status).toBe("入金済み");
    expect(r.paidOn).toBe("2026-07-31");
    expect(r.paidWorkers).toEqual(["NGUYEN VAN A"]);
  });

  it("入金が複数あればいちばん新しい日を出す", () => {
    const r = payStatusOf(
      [
        fee({ paid_on: "2026-05-31", worker_name: "A" }),
        fee({ paid_on: "2026-07-31", worker_name: "B" }),
      ],
      "o1",
      [app({ worker_name: "A" }), app({ worker_name: "B" })],
    );
    expect(r.paidOn).toBe("2026-07-31");
    expect(r.paidWorkers).toEqual(["A", "B"]);
  });

  it("請求済みで入金が無ければ請求済み・未入金", () => {
    expect(payStatusOf([fee({ billed_on: "2026-07-01" })], "o1", hiredA).status).toBe(
      "請求済み・未入金",
    );
  });

  it("台帳に行はあるが請求前なら未請求", () => {
    expect(payStatusOf([fee()], "o1", hiredA).status).toBe("未請求");
  });

  it("台帳に行が無ければ台帳に無し", () => {
    expect(payStatusOf([fee({ organization_id: "other" })], "o1", hiredA).status).toBe("台帳に無し");
    expect(payStatusOf([], "o1", hiredA).status).toBe("台帳に無し");
  });

  it("会社が分からない求人は台帳に無し", () => {
    expect(payStatusOf([fee()], null, hiredA).status).toBe("台帳に無し");
  });

  it("同じ会社でも、別の求人で採用した人の入金はこの求人に出さない", () => {
    // 会社は同じだが、台帳にあるのは別の人（別の求人の採用者）の分
    const r = payStatusOf([fee({ worker_name: "別の人", paid_on: "2026-07-31" })], "o1", hiredA);
    expect(r.status).toBe("台帳に無し");
    expect(r.paidWorkers).toEqual([]);
  });

  it("採用者がいない求人は、会社に入金があっても台帳に無し", () => {
    expect(payStatusOf([fee({ paid_on: "2026-07-31" })], "o1", []).status).toBe("台帳に無し");
  });

  it("氏名の空白の違いは同じ人として扱う", () => {
    const r = payStatusOf(
      [fee({ worker_name: "NGUYEN　VAN A", paid_on: "2026-07-31" })],
      "o1",
      [app({ worker_name: "NGUYEN VAN A" })],
    );
    expect(r.status).toBe("入金済み");
  });

  it("応募と紐づいた台帳の行は、その応募の求人にだけ出す", () => {
    const fees = [
      fee({ worker_name: "NGUYEN VAN A", paid_on: "2026-07-31", job_application_id: "a2" }),
    ];
    // この求人の採用者は応募a1。台帳の行は別の応募a2の分なので出さない
    expect(payStatusOf(fees, "o1", [app({ application_id: "a1" })]).status).toBe("台帳に無し");
    expect(payStatusOf(fees, "o1", [app({ application_id: "a2" })]).status).toBe("入金済み");
  });
});

describe("buildForm30Candidates", () => {
  const paid = [fee({ billed_on: "2026-07-01", paid_on: "2026-07-31" })];

  it("過去1年に応募がある求人だけを出す", () => {
    const rows = buildForm30Candidates(
      [posting(), posting({ postingId: "p2", applications: [app({ applied_on: "2024-01-05" })] })],
      paid,
      BASE,
    );
    expect(rows.map((r) => r.postingId)).toEqual(["p1"]);
    expect(rows[0].matchedBy).toBe("求人");
    expect(rows[0].payStatus).toBe("入金済み");
  });

  it("求人受付年月日の新しい順に並べる", () => {
    const rows = buildForm30Candidates(
      [
        posting({ postingId: "old", received_on: "2026-01-10" }),
        posting({ postingId: "new", received_on: "2026-06-01" }),
      ],
      paid,
      BASE,
    );
    expect(rows.map((r) => r.postingId)).toEqual(["new", "old"]);
  });

  it("応募が求人票に紐づいていなくても、会社の応募で拾い直す", () => {
    const rows = buildForm30Candidates(
      [posting({ applications: [] })],
      paid,
      BASE,
      { o1: [app()] },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].matchedBy).toBe("会社");
  });

  it("求人票に紐づいた実績がある会社は、会社での拾い直しをしない（二重に出さない）", () => {
    const rows = buildForm30Candidates(
      [posting({ postingId: "p1" }), posting({ postingId: "p2", applications: [] })],
      paid,
      BASE,
      { o1: [app()] },
    );
    expect(rows.map((r) => r.postingId)).toEqual(["p1"]);
  });

  it("期間外の応募しか無ければ拾わない", () => {
    const rows = buildForm30Candidates([posting({ applications: [] })], paid, BASE, {
      o1: [app({ applied_on: "2024-01-05" })],
    });
    expect(rows).toEqual([]);
  });
});

describe("isEligible / defaultSelection", () => {
  const make = (id: string, status: Form30Candidate["payStatus"]): Form30Candidate => ({
    postingId: id,
    organizationId: "o1",
    received_on: "2026-05-01",
    org_name: "テスト",
    org_address: "",
    job_type: "",
    note: "",
    applications: [],
    hired: [],
    payStatus: status,
    paidOn: status === "入金済み" ? "2026-07-31" : null,
    paidWorkers: [],
    matchedBy: "求人",
  });

  it("載せてよいのは入金済みだけ", () => {
    expect(isEligible(make("a", "入金済み"))).toBe(true);
    expect(isEligible(make("b", "請求済み・未入金"))).toBe(false);
    expect(isEligible(make("c", "未請求"))).toBe(false);
    expect(isEligible(make("d", "台帳に無し"))).toBe(false);
  });

  it("最初から選ぶのは入金済みのものだけ", () => {
    const list = [make("a", "入金済み"), make("b", "未請求"), make("c", "入金済み")];
    expect(defaultSelection(list)).toEqual(["a", "c"]);
  });

  it("様式に入る件数までしか選ばない", () => {
    const many = Array.from({ length: 20 }, (_, i) => make(`p${i}`, "入金済み"));
    expect(defaultSelection(many)).toHaveLength(FORM30_MAX_ROWS);
  });
});

describe("buildForm30Doc", () => {
  const row = (over: Partial<Form30Candidate> = {}): Form30Candidate => ({
    postingId: "p1",
    organizationId: "o1",
    received_on: "2026-05-01",
    org_name: "有限会社國崎青果",
    org_address: "熊本県八代市鏡町1515",
    job_type: "耕種農業全般",
    note: "",
    applications: [],
    hired: [],
    payStatus: "入金済み",
    paidOn: "2026-07-31",
    paidWorkers: [],
    matchedBy: "求人",
    ...over,
  });

  it("様式の見出しと紹介事業所名称を入れる", () => {
    const xml = docxDocumentXml(
      buildForm30Doc([row()], { agencyName: "VUONG VAN THANH", baseDate: BASE }),
    );
    expect(xml).toContain("■求人者リスト（訪問予定日から過去１年間の実績）");
    expect(xml).toContain("VUONG VAN THANH");
    expect(xml).toContain("kuma-jukyu@mhlw.go.jp");
    expect(xml).toContain("（様式30）");
  });

  it("A4横で出力する", () => {
    const xml = docxDocumentXml(buildForm30Doc([row()], { agencyName: "A", baseDate: BASE }));
    expect(xml).toContain('w:w="16838"');
    expect(xml).toContain('w:h="11906"');
    expect(xml).toContain('w:orient="landscape"');
  });

  it("選んだ内容を表に入れる", () => {
    const xml = docxDocumentXml(buildForm30Doc([row()], { agencyName: "A", baseDate: BASE }));
    expect(xml).toContain("有限会社國崎青果");
    expect(xml).toContain("熊本県八代市鏡町1515");
    expect(xml).toContain("耕種農業全般");
    expect(xml).toContain("2026-05-01");
  });

  it("様式の行数ぶん（15行）の枠を必ず出す", () => {
    const spec = buildForm30Doc([row()], { agencyName: "A", baseDate: BASE });
    const table = spec.blocks.find((b) => b.kind === "table");
    expect(table && table.kind === "table" && table.rows.length).toBe(FORM30_MAX_ROWS + 1);
  });

  it("実績が無いときは1行目に「実績なし」と書く", () => {
    const spec = buildForm30Doc([], { agencyName: "A", baseDate: BASE });
    const table = spec.blocks.find((b) => b.kind === "table");
    expect(table && table.kind === "table" && table.rows[1]).toEqual([
      "1",
      "実績なし",
      "",
      "",
      "",
      "",
    ]);
  });

  it("15件を超えても様式に入る分だけにする", () => {
    const many = Array.from({ length: 20 }, (_, i) => row({ postingId: `p${i}`, org_name: `会社${i}` }));
    const xml = docxDocumentXml(buildForm30Doc(many, { agencyName: "A", baseDate: BASE }));
    expect(xml).toContain("会社14");
    expect(xml).not.toContain("会社15");
  });
});

describe("isImportNote / form30Note", () => {
  it("過去データ取込の覚え書きは様式の備考に出さない", () => {
    const note = "過去データ取込（2026年4月〜2027年3月 求人管理簿）";
    expect(isImportNote(note)).toBe(true);
    expect(form30Note(note)).toBe("");
  });

  it("前後に空白があっても取込の覚え書きとみなす", () => {
    expect(form30Note("  過去データ取込（2025年4月〜2026年3月 求人管理簿）  ")).toBe("");
  });

  it("手で書いた備考はそのまま残す", () => {
    expect(isImportNote("寮あり")).toBe(false);
    expect(form30Note("寮あり")).toBe("寮あり");
    expect(form30Note("")).toBe("");
  });

  it("候補を作るときに備考から取り除く", () => {
    const rows = buildForm30Candidates(
      [posting({ note: "過去データ取込（2026年4月〜2027年3月 求人管理簿）" })],
      [fee({ paid_on: "2026-07-31" })],
      BASE,
    );
    expect(rows[0].note).toBe("");
  });
});

describe("応募・採用の内訳", () => {
  it("期間内の応募と、そのうちの採用を持つ", () => {
    const rows = buildForm30Candidates(
      [
        posting({
          applications: [
            app({ worker_name: "A", applied_on: "2026-06-19", result: "採用", result_on: "2026-06-22" }),
            app({ worker_name: "B", applied_on: "2026-05-01", result: "不採用", result_on: "2026-05-10" }),
            app({ worker_name: "C", applied_on: "2024-01-05", result: "採用", result_on: "2024-01-10" }),
          ],
        }),
      ],
      [fee({ paid_on: "2026-07-31" })],
      BASE,
    );
    expect(rows[0].applications.map((a) => a.worker_name)).toEqual(["A", "B"]); // 期間外のCは入らない
    expect(rows[0].hired.map((a) => a.worker_name)).toEqual(["A"]);
  });

  it("応募日の新しい順に並べる", () => {
    const rows = buildForm30Candidates(
      [
        posting({
          applications: [
            app({ worker_name: "古", applied_on: "2026-01-05" }),
            app({ worker_name: "新", applied_on: "2026-06-19" }),
          ],
        }),
      ],
      [fee({ paid_on: "2026-07-31" })],
      BASE,
    );
    expect(rows[0].applications.map((a) => a.worker_name)).toEqual(["新", "古"]);
  });

  it("会社で拾い直したときも、その会社の応募を出す", () => {
    const rows = buildForm30Candidates(
      [posting({ applications: [] })],
      [fee({ paid_on: "2026-07-31" })],
      BASE,
      { o1: [app({ worker_name: "会社経由" })] },
    );
    expect(rows[0].matchedBy).toBe("会社");
    expect(rows[0].hired.map((a) => a.worker_name)).toEqual(["会社経由"]);
  });
});

describe("画面で直した内容（applyForm30Edits / changedOrgAddresses）", () => {
  const base = (): Form30Candidate => ({
    postingId: "p1",
    organizationId: "o1",
    received_on: "2026-05-01",
    org_name: "髙濱　伸吉",
    org_address: "",
    job_type: "農業",
    note: "",
    applications: [],
    hired: [],
    payStatus: "入金済み",
    paidOn: "2026-06-26",
    paidWorkers: [],
    matchedBy: "求人",
  });

  it("直していなければ元のまま", () => {
    expect(applyForm30Edits(base(), emptyForm30Edits())).toEqual(base());
  });

  it("所在地は会社ごとに当たる（同じ会社の求人が並んでも1回で済む）", () => {
    const edits = { orgs: { o1: { address: "熊本県八代市◯◯1-2" } }, postings: {} };
    const row1 = applyForm30Edits({ ...base(), postingId: "p1" }, edits);
    const row2 = applyForm30Edits({ ...base(), postingId: "p2" }, edits);
    expect(row1.org_address).toBe("熊本県八代市◯◯1-2");
    expect(row2.org_address).toBe("熊本県八代市◯◯1-2");
  });

  it("受付年月日・職種・備考は求人ごとに当たる", () => {
    const edits = {
      orgs: {},
      postings: { p1: { received_on: "2026-04-02", job_type: "耕種農業", note: "寮あり" } },
    };
    const row = applyForm30Edits(base(), edits);
    expect(row.received_on).toBe("2026-04-02");
    expect(row.job_type).toBe("耕種農業");
    expect(row.note).toBe("寮あり");
    // 別の求人には当たらない
    expect(applyForm30Edits({ ...base(), postingId: "p2" }, edits).job_type).toBe("農業");
  });

  it("会社が分からない求人には会社の直しを当てない", () => {
    const edits = { orgs: { o1: { address: "A" } }, postings: {} };
    expect(applyForm30Edits({ ...base(), organizationId: null }, edits).org_address).toBe("");
  });

  it("マスタに保存するのは、実際に変わった所在地だけ", () => {
    const rows = [base(), { ...base(), postingId: "p2" }];
    const edits = { orgs: { o1: { address: "熊本県八代市◯◯1-2" } }, postings: {} };
    expect(changedOrgAddresses(rows, edits)).toEqual([
      { organizationId: "o1", name: "髙濱　伸吉", address: "熊本県八代市◯◯1-2" },
    ]);
  });

  it("元と同じ内容（空白の違いだけ）なら保存の対象にしない", () => {
    const rows = [{ ...base(), org_address: "熊本県八代市◯◯1-2" }];
    const edits = { orgs: { o1: { address: " 熊本県八代市◯◯1-2 " } }, postings: {} };
    expect(changedOrgAddresses(rows, edits)).toEqual([]);
  });

  it("直していなければ保存の対象は無い", () => {
    expect(changedOrgAddresses([base()], emptyForm30Edits())).toEqual([]);
  });
});
