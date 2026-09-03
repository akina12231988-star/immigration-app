import { describe, expect, it } from "vitest";
import {
  prepPrintAppType,
  prepPrintDateLines,
  prepPrintDocRows,
  prepPrintFileName,
  prepPrintOrgLines,
  prepPrintWageLines,
  prepPrintWorkerLines,
} from "./application-prep-print";
import { EMPTY_PREP_META, PREP_DOC_DEFS, type PrepDocStatus } from "./application-prep";
import type { WorkerWage } from "@/types/db";

const line = (lines: { key: string; value: string }[], key: string) =>
  lines.find((l) => l.key === key)?.value;

describe("prepPrintAppType", () => {
  it("申請の内容を優先し、内容が無い古いデータは申請種別で出す", () => {
    expect(prepPrintAppType({ ...EMPTY_PREP_META, app_content: "特定技能2号申請準備中" })).toBe(
      "特定技能2号申請準備中",
    );
    expect(prepPrintAppType({ ...EMPTY_PREP_META, app_type: "更新" })).toBe("在留資格更新申請");
    expect(prepPrintAppType(EMPTY_PREP_META)).toBe("");
  });
});

describe("prepPrintOrgLines", () => {
  it("代表者はふりがなを添え、協力確認書と売上高は1行にまとめる", () => {
    const lines = prepPrintOrgLines({
      name: "BASE株式会社",
      address: "福岡県…",
      contact: "092-000-0000",
      repName: "髙濱　伸吉",
      repKana: "たかはま　しんきち",
      councilOffice: [
        { to: "建設分野協議会", on: "2026-04-01" },
        { to: "", on: "" },
      ],
      councilResidence: [{ to: "", on: "" }],
      councilNote: "住居地は提出待ち",
      financials: [
        { year: "令和7年度", term: "第10期", period_from: "", period_to: "", sales: "1億円", ordinary: "", net: "", assets: "" },
      ],
    });
    expect(line(lines, "org_rep")).toBe("髙濱　伸吉（たかはま　しんきち）");
    expect(line(lines, "org_council_office")).toBe("建設分野協議会（2026-04-01）");
    // 未記入の協力確認書は空にして、印刷側で「未登録」と出す
    expect(line(lines, "org_council_residence")).toBe("");
    expect(line(lines, "org_sales")).toBe("令和7年度（第10期） 1億円");
  });
});

describe("prepPrintWorkerLines", () => {
  it("氏名はふりがな付き、未登録の項目は空のまま返す", () => {
    const lines = prepPrintWorkerLines({
      name: "NGUYEN VAN A",
      kana: "グエン　ヴァン　アー",
      birth: "1998-05-05",
      nationality: "ベトナム",
      homeAddress: "",
      address: "福岡市…",
      residenceStatus: "特定技能1号",
      residencePeriod: "1年",
      residenceCardNo: "AB12345678CD",
      residenceExpiryDate: "2027-03-31",
      passportNo: "",
      passportExpiryDate: "",
    });
    expect(line(lines, "w_name")).toBe("NGUYEN VAN A（グエン　ヴァン　アー）");
    expect(line(lines, "w_home_address")).toBe("");
    expect(lines).toHaveLength(11);
  });
});

describe("prepPrintDocRows", () => {
  const def = (id: string) => PREP_DOC_DEFS.find((d) => d.id === id)!;
  const items: PrepDocStatus[] = [
    { def: def("zairyu"), required: true, satisfied: true, fileSatisfied: true },
    { def: def("kazei"), required: true, satisfied: false, fileSatisfied: false },
  ];

  it("完了・不足を出し、選んでいる準備状況をメモ欄の初めの値にする", () => {
    const rows = prepPrintDocRows(items, { zairyu: "預かった" }, 7, 8);
    expect(rows[0]).toEqual({
      id: "zairyu",
      label: "在留カード（両面・現住所がわかるもの）",
      state: "完了",
      memo: "預かった",
    });
    // 年度が付く書類は「令和○年度」を頭に付ける
    expect(rows[1].label).toBe("令和7年度 課税証明書");
    expect(rows[1].state).toBe("不足");
    expect(rows[1].memo).toBe("");
  });
});

describe("prepPrintWageLines", () => {
  const wage = (over: Partial<WorkerWage>): WorkerWage => ({
    id: "w1",
    worker_id: "worker",
    organization_id: "o1",
    kind: "月給",
    amount: 180000,
    started_on: "2026-04-01",
    reason: "採用時",
    note: "",
    detail: null,
    created_at: "",
    updated_at: "",
    ...over,
  });

  it("いちばん新しい記録に「現在」を付け、機関名と1-6号別紙の有無も出す", () => {
    const lines = prepPrintWageLines(
      [wage({ detail: { base_wage: "180000" } as WorkerWage["detail"] }), wage({ id: "w2", amount: 170000, started_on: "2025-04-01", reason: "" })],
      { o1: "BASE株式会社" },
    );
    expect(lines[0].label).toBe("月給（現在）");
    expect(lines[0].value).toBe("180,000円（2026-04-01〜・採用時・BASE株式会社・1-6号別紙あり）");
    expect(lines[1].label).toBe("月給");
    expect(lines[1].value).toBe("170,000円（2025-04-01〜・BASE株式会社）");
  });
});

describe("prepPrintDateLines", () => {
  it("支援計画書の項目の並びで、保存済みの日付を和暦なしの年月日で出す", () => {
    const lines = prepPrintDateLines({ apply: "2026-09-10", es: "2026-10-01" });
    expect(lines[0]).toEqual({ key: "apply", label: "申請予定日（入管）", value: "2026年9月10日" });
    expect(line(lines, "es")).toBe("2026年10月1日");
    // 未計算の項目は空のまま（印刷側で「未登録」と出す）
    expect(line(lines, "sign")).toBe("");
  });
});

describe("prepPrintFileName", () => {
  it("申請番号と氏名を並べ、ファイル名に使えない文字は置き換える", () => {
    expect(prepPrintFileName("TODO-1234", "NGUYEN VAN A")).toBe(
      "TODO-1234_NGUYEN VAN A_申請準備の詳細",
    );
    expect(prepPrintFileName("", "")).toBe("申請準備の詳細");
    expect(prepPrintFileName("TODO/1234", "A:B")).toBe("TODO_1234_A_B_申請準備の詳細");
  });
});
