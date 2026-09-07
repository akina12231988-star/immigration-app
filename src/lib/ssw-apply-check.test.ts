import { describe, expect, it } from "vitest";
import {
  checkSswApply,
  includesOrgName,
  normalizeApplyName,
  parseSswApplyLines,
  parseSswApplyText,
  splitSswApplyRecords,
  sswApplyKnownNames,
  sswApplySummary,
} from "./ssw-apply-check";
import type { SswInsuranceRow, SswInsuranceWorker } from "./ssw-insurance";

function worker(over: Partial<SswInsuranceWorker> = {}): SswInsuranceWorker {
  return {
    id: "w1",
    name: "VU THI NHAN",
    kana: "ヴー ティ ニャン",
    nationality: "ベトナム",
    gender: "女",
    birth: "1988-09-30",
    support: "支援対象",
    status: "在籍中",
    residence_status: "特定技能1号",
    residence_expiry_date: "2027-04-07",
    residence_permit_date: "2026-02-19",
    leaving_on: null,
    current_organization_id: "o1",
    organizations: { name: "株式会社ベース" },
    messenger_link: "",
    ssw_insurance_link: "",
    ssw_insurance_expiry_date: null,
    ssw_insurance_self_join: false,
    ssw_insurance_no: "",
    ssw_insurance_declined: false,
    ssw_insurance_declined_on: null,
    ssw_insurance_declined_org_id: null,
    ssw_insurance_note: "",
    ...over,
  };
}

function row(over: Partial<SswInsuranceWorker> = {}, orgName = "株式会社ベース"): SswInsuranceRow {
  return {
    worker: worker(over),
    orgName,
    burden: "会社負担",
    state: "notJoined",
    todos: {},
  };
}

const candidates = [
  row(),
  row({ id: "w2", name: "LE XUAN THOAI", gender: "男", birth: "1998-03-03" }, "株式会社高正"),
  row({ id: "w3", name: "TRAN VAN A", gender: "男", birth: "1995-05-05" }, "片山　大輔"),
  row({ id: "w4", name: "TRAN VAN ANH", gender: "男", birth: "1996-06-06" }, "株式会社さくら"),
];
const names = sswApplyKnownNames(candidates);
const orgNames = ["株式会社ベース", "株式会社高正", "片山　大輔", "株式会社さくら"];

describe("normalizeApplyName", () => {
  it("空白・大文字小文字・全角の違いをそろえる", () => {
    expect(normalizeApplyName("Vu  Thi Nhan")).toBe("VUTHINHAN");
    expect(normalizeApplyName("ＶＵ ＴＨＩ ＮＨＡＮ")).toBe("VUTHINHAN");
    expect(normalizeApplyName("NHA N")).toBe("NHAN");
  });
});

describe("splitSswApplyRecords（システムの氏名を手がかりに1人分ずつ切り出す）", () => {
  it("氏名が2行に分かれていても、単語の途中で空白が入っていても1人分にまとめる", () => {
    const text = [
      "被保険者情報一覧",
      "VU THI",
      "NHAN ベトナム 女",
      "1988/09/30 7ヶ月 2026/09/08 株式会社ベース",
      "LE XUAN THOA I ベトナム 男 1998/03/03 1ヶ月 2026/09/08 株式会社高正",
    ].join("\n");
    const records = splitSswApplyRecords(text, names);
    expect(records.map((r) => r.name)).toEqual(["VU THI NHAN", "LE XUAN THOAI"]);
    expect(records[0].text).toContain("1988/09/30");
    expect(records[0].text).not.toContain("1998/03/03");
    expect(records[1].known).toBe(true);
  });

  it("「TRAN VAN A」が「TRAN VAN ANH」の中に紛れない", () => {
    const text = "TRAN VAN ANH ベトナム 男 1996/06/06 7ヶ月 2026/09/08 株式会社さくら";
    const records = splitSswApplyRecords(text, names);
    expect(records.map((r) => r.name)).toEqual(["TRAN VAN ANH"]);
  });

  it("システムに無い氏名（行の頭の大文字アルファベット）も1人分として出す", () => {
    const text = [
      "VU THI NHAN ベトナム 女 1988/09/30 7ヶ月 2026/09/08 株式会社ベース",
      "NGUYEN VAN B ベトナム 男 1990/01/01 7ヶ月 2026/09/08 株式会社ベース",
    ].join("\n");
    const records = splitSswApplyRecords(text, names);
    expect(records.map((r) => [r.name, r.known])).toEqual([
      ["VU THI NHAN", true],
      ["NGUYEN VAN B", false],
    ]);
  });

  it("印刷の見出し・ページの文字（日付やURL）を人として数えない", () => {
    const text = [
      "2026/9/7 10:23 被保険者情報一覧",
      "VU THI NHAN ベトナム 女 1988/09/30 7ヶ月 2026/09/08 株式会社ベース",
      "https://portal.example.jp/apply/list 1/3",
    ].join("\n");
    expect(splitSswApplyRecords(text, names)).toHaveLength(1);
  });

  it("同じ人の氏名が続けて出てきても（氏名の欄が2つ）1人分にまとめる", () => {
    const text = "VU THI NHAN\nVU THI NHAN ベトナム 女 1988/09/30 7ヶ月 2026/09/08";
    expect(splitSswApplyRecords(text, names)).toHaveLength(1);
  });
});

describe("parseSswApplyText", () => {
  it("申込サイトの1行から氏名・性別・生年月日・保険期間・始期・機関名を読み取る", () => {
    const [line] = parseSswApplyText(
      "VU THI NHAN\tベトナム\t女\t1988/09/30\t7ヶ月\t2026/09/08\tA\tなし\t5,470円\t無\t株式会社ベース",
      names,
      orgNames,
    );
    expect(line.name).toBe("VU THI NHAN");
    expect(line.known).toBe(true);
    expect(line.gender).toBe("女");
    expect(line.birth).toBe("1988-09-30");
    expect(line.months).toBe(7);
    expect(line.startOn).toBe("2026-09-08");
    expect(line.orgName).toBe("株式会社ベース");
  });

  it("年月日の書き方（1998年03月03日）や男性・女性の表記、列の順番の違いも読める", () => {
    const [line] = parseSswApplyText(
      "LE XUAN THOAI 2026年09月08日 1ヶ月 男性 1998年03月03日 ベトナム 片山　大輔",
      names,
      orgNames,
    );
    expect(line.gender).toBe("男");
    expect(line.birth).toBe("1998-03-03");
    expect(line.months).toBe(1);
    expect(line.startOn).toBe("2026-09-08");
    expect(line.orgName).toBe("片山　大輔");
  });

  it("次のページの見出しの日付が混ざっても、始期希望日は最初の新しい日付を使う", () => {
    const [line] = parseSswApplyText(
      "VU THI NHAN ベトナム 女 1988/09/30 7ヶ月 2026/09/08 株式会社ベース\n2026/9/7 10:23 被保険者情報一覧",
      names,
    );
    expect(line.startOn).toBe("2026-09-08");
    expect(line.birth).toBe("1988-09-30");
  });

  it("空の文字からは何も読み取らない", () => {
    expect(parseSswApplyText("   ", names)).toHaveLength(0);
    expect(parseSswApplyText("a\n\n \n", names)).toHaveLength(0);
  });
});

describe("PDFのように1人分が何行かに分かれているとき", () => {
  it("氏名の行から次の氏名の行までを1人分にまとめる", () => {
    const lines = [
      "被保険者情報",
      "VU THI NHAN",
      "ベトナム 女",
      "1988/09/30",
      "7ヶ月 2026/09/08",
      "株式会社ベース",
      "LE XUAN THOAI",
      "ベトナム 男",
      "1998/03/03",
      "1ヶ月 2026/09/08",
      "株式会社高正",
    ];
    const parsed = parseSswApplyLines(lines, names, orgNames);
    expect(parsed).toHaveLength(2);
    const nhan = parsed.find((p) => p.name === "VU THI NHAN");
    expect(nhan?.birth).toBe("1988-09-30");
    expect(nhan?.months).toBe(7);
    expect(nhan?.startOn).toBe("2026-09-08");
    expect(nhan?.gender).toBe("女");
    expect(nhan?.orgName).toBe("株式会社ベース");
  });
});

describe("includesOrgName", () => {
  it("法人格の有無・全角半角の違いは同じ扱い", () => {
    expect(includesOrgName("… 無 ベース株式会社", "株式会社ベース")).toBe(true);
    expect(includesOrgName("… 無 ＢＡＳＥ", "BASE株式会社")).toBe(true);
    expect(includesOrgName("… 無 株式会社さくら", "株式会社ベース")).toBe(false);
  });
});

describe("checkSswApply", () => {
  it("合っていれば違いなしになる", () => {
    const lines = parseSswApplyText(
      "VU THI NHAN ベトナム 女 1988/09/30 7ヶ月 2026/09/08 株式会社ベース",
      names,
      orgNames,
    );
    const result = checkSswApply(lines, candidates, candidates.slice(0, 2));
    expect(result.rows[0].workerId).toBe("w1");
    expect(result.rows[0].ok).toBe(true);
    expect(result.missing.map((m) => m.name)).toEqual(["LE XUAN THOAI"]);
  });

  it("生年月日・性別の違いを見つける", () => {
    const lines = parseSswApplyText(
      "VU THI NHAN ベトナム 男 1988/09/03 7ヶ月 2026/09/08 株式会社ベース",
      names,
      orgNames,
    );
    const issues = checkSswApply(lines, candidates).rows[0].issues;
    expect(issues.map((i) => i.field)).toEqual(["生年月日", "性別"]);
    expect(issues[0].expected).toBe("1988/09/30");
    expect(issues[0].actual).toBe("1988/09/03");
  });

  it("保険期間が在留期限までの月数と違うときに知らせる", () => {
    // 2026/09/08 から在留期限 2027/04/07 までは7ヶ月必要
    const lines = parseSswApplyText(
      "VU THI NHAN ベトナム 女 1988/09/30 3ヶ月 2026/09/08 株式会社ベース",
      names,
      orgNames,
    );
    const issues = checkSswApply(lines, candidates).rows[0].issues;
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("保険期間");
    expect(issues[0].expected).toContain("7ヶ月");
  });

  it("所属機関名の違いを見つける（法人格の書き方の違いは同じ扱い）", () => {
    const same = parseSswApplyText(
      "VU THI NHAN ベトナム 女 1988/09/30 7ヶ月 2026/09/08 ベース株式会社",
      names,
      orgNames,
    );
    expect(checkSswApply(same, candidates).rows[0].issues).toHaveLength(0);
    const other = parseSswApplyText(
      "VU THI NHAN ベトナム 女 1988/09/30 7ヶ月 2026/09/08 株式会社さくら",
      names,
      orgNames,
    );
    const issues = checkSswApply(other, candidates).rows[0].issues;
    expect(issues.map((i) => i.field)).toEqual(["所属機関名"]);
    expect(issues[0].actual).toBe("株式会社さくら");
  });

  it("個人事業主（人名の所属機関）でも、システムの機関名で突き合わせる", () => {
    const lines = parseSswApplyText(
      "TRAN VAN A ベトナム 男 1995/05/05 7ヶ月 2026/09/08 片山 大輔",
      names,
      orgNames,
    );
    expect(checkSswApply(lines, candidates).rows[0].ok).toBe(true);
  });

  it("氏名が2行に分かれていても同じ人として照合する", () => {
    const lines = parseSswApplyLines(
      ["VU THI", "NHAN ベトナム 女", "1988/09/30 7ヶ月 2026/09/08", "株式会社ベース"],
      names,
      orgNames,
    );
    const result = checkSswApply(lines, candidates, [candidates[0]]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].ok).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("システムに居ない人はその旨を返す", () => {
    const lines = parseSswApplyText(
      "NGUYEN VAN B ベトナム 男 1990/01/01 7ヶ月 2026/09/08 株式会社ベース",
      names,
      orgNames,
    );
    const result = checkSswApply(lines, candidates);
    expect(result.rows[0].workerId).toBeNull();
    expect(result.rows[0].ok).toBe(false);
    expect(sswApplySummary(result)).toBe(
      "1件を照合：合っている 0件／違いあり 0件／システムに該当者なし 1件",
    );
  });
});
