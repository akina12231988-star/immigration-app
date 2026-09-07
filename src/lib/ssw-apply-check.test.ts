import { describe, expect, it } from "vitest";
import {
  checkSswApply,
  parseSswApplyLine,
  parseSswApplyText,
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

describe("parseSswApplyLine", () => {
  it("申込サイトの1行から氏名・性別・生年月日・保険期間・始期・機関名を読み取る", () => {
    const line = parseSswApplyLine(
      "VU THI NHAN\tベトナム\t女\t1988/09/30\t7ヶ月\t2026/09/08\tA\tなし\t5,470円\t無\t株式会社ベース",
    );
    expect(line).not.toBeNull();
    expect(line?.name).toBe("VU THI NHAN");
    expect(line?.gender).toBe("女");
    expect(line?.birth).toBe("1988-09-30");
    expect(line?.months).toBe(7);
    expect(line?.startOn).toBe("2026-09-08");
    expect(line?.orgName).toBe("株式会社ベース");
  });

  it("和暦まじりでない年月日の書き方（1998年03月03日）や男性・女性の表記も読める", () => {
    const line = parseSswApplyLine("LE XUAN THOAI ベトナム 男性 1998年03月03日 1ヶ月 2026年09月08日 片山　大輔");
    expect(line?.gender).toBe("男");
    expect(line?.birth).toBe("1998-03-03");
    expect(line?.months).toBe(1);
    expect(line?.startOn).toBe("2026-09-08");
  });

  it("空行は読み飛ばす", () => {
    expect(parseSswApplyLine("   ")).toBeNull();
    expect(parseSswApplyText("a\n\n \n")).toHaveLength(1);
  });
});

describe("checkSswApply", () => {
  const candidates = [
    row(),
    row({ id: "w2", name: "LE XUAN THOAI", gender: "男", birth: "1998-03-03" }, "株式会社高正"),
  ];

  it("合っていれば違いなしになる", () => {
    const lines = parseSswApplyText("VU THI NHAN ベトナム 女 1988/09/30 7ヶ月 2026/09/08 株式会社ベース");
    const result = checkSswApply(lines, candidates);
    expect(result.rows[0].workerId).toBe("w1");
    expect(result.rows[0].ok).toBe(true);
    expect(result.missing.map((m) => m.name)).toEqual(["LE XUAN THOAI"]);
  });

  it("生年月日・性別の違いを見つける", () => {
    const lines = parseSswApplyText("VU THI NHAN ベトナム 男 1988/09/03 7ヶ月 2026/09/08 株式会社ベース");
    const issues = checkSswApply(lines, candidates).rows[0].issues;
    expect(issues.map((i) => i.field)).toEqual(["生年月日", "性別"]);
    expect(issues[0].expected).toBe("1988/09/30");
    expect(issues[0].actual).toBe("1988/09/03");
  });

  it("保険期間が在留期限までの月数と違うときに知らせる", () => {
    // 2026/09/08 から在留期限 2027/04/07 までは7ヶ月必要
    const lines = parseSswApplyText("VU THI NHAN ベトナム 女 1988/09/30 3ヶ月 2026/09/08 株式会社ベース");
    const issues = checkSswApply(lines, candidates).rows[0].issues;
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("保険期間");
    expect(issues[0].expected).toContain("7ヶ月");
  });

  it("所属機関名の違いを見つける（法人格の書き方の違いは同じ扱い）", () => {
    const same = parseSswApplyText("VU THI NHAN ベトナム 女 1988/09/30 7ヶ月 2026/09/08 ベース株式会社");
    expect(checkSswApply(same, candidates).rows[0].issues).toHaveLength(0);
    const other = parseSswApplyText("VU THI NHAN ベトナム 女 1988/09/30 7ヶ月 2026/09/08 株式会社さくら");
    expect(checkSswApply(other, candidates).rows[0].issues.map((i) => i.field)).toEqual([
      "所属機関名",
    ]);
  });

  it("システムに居ない人はその旨を返す", () => {
    const lines = parseSswApplyText("TRAN VAN A ベトナム 男 1990/01/01 7ヶ月 2026/09/08 株式会社ベース");
    const result = checkSswApply(lines, candidates);
    expect(result.rows[0].workerId).toBeNull();
    expect(result.rows[0].ok).toBe(false);
    expect(sswApplySummary(result)).toBe(
      "1件を照合：合っている 0件／違いあり 0件／システムに該当者なし 1件",
    );
  });
});
