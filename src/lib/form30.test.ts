import { describe, expect, it } from "vitest";
import {
  FORM30_MAX_ROWS,
  buildForm30Candidates,
  buildForm30Doc,
  defaultSelection,
  isEligible,
  oneYearBefore,
  payStatusOf,
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

const posting = (over: Partial<Form30PostingInput> = {}): Form30PostingInput => ({
  postingId: "p1",
  organizationId: "o1",
  received_on: "2026-05-01",
  org_name: "有限会社國崎青果",
  org_address: "熊本県八代市鏡町1515",
  job_type: "耕種農業全般",
  note: "",
  referred_dates: ["2026-06-19"],
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
  it("入金日が入った手数料が1件でもあれば入金済み", () => {
    const r = payStatusOf([fee({ billed_on: "2026-07-01", paid_on: "2026-07-31" })], "o1");
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
    );
    expect(r.paidOn).toBe("2026-07-31");
    expect(r.paidWorkers).toEqual(["A", "B"]);
  });

  it("請求済みで入金が無ければ請求済み・未入金", () => {
    expect(payStatusOf([fee({ billed_on: "2026-07-01" })], "o1").status).toBe("請求済み・未入金");
  });

  it("台帳に行はあるが請求前なら未請求", () => {
    expect(payStatusOf([fee()], "o1").status).toBe("未請求");
  });

  it("台帳に行が無ければ台帳に無し", () => {
    expect(payStatusOf([fee({ organization_id: "other" })], "o1").status).toBe("台帳に無し");
    expect(payStatusOf([], "o1").status).toBe("台帳に無し");
  });

  it("会社が分からない求人は台帳に無し", () => {
    expect(payStatusOf([fee()], null).status).toBe("台帳に無し");
  });
});

describe("buildForm30Candidates", () => {
  const paid = [fee({ billed_on: "2026-07-01", paid_on: "2026-07-31" })];

  it("過去1年に応募がある求人だけを出す", () => {
    const rows = buildForm30Candidates(
      [posting(), posting({ postingId: "p2", referred_dates: ["2024-01-05"] })],
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
      [posting({ referred_dates: [] })],
      paid,
      BASE,
      { o1: ["2026-06-19"] },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].matchedBy).toBe("会社");
  });

  it("求人票に紐づいた実績がある会社は、会社での拾い直しをしない（二重に出さない）", () => {
    const rows = buildForm30Candidates(
      [posting({ postingId: "p1" }), posting({ postingId: "p2", referred_dates: [] })],
      paid,
      BASE,
      { o1: ["2026-06-19"] },
    );
    expect(rows.map((r) => r.postingId)).toEqual(["p1"]);
  });

  it("期間外の応募しか無ければ拾わない", () => {
    const rows = buildForm30Candidates([posting({ referred_dates: [] })], paid, BASE, {
      o1: ["2024-01-05"],
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
    referred_dates: [],
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
    referred_dates: [],
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
