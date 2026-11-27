import { describe, expect, it } from "vitest";
import {
  buildPayrollRequestRows,
  fiscalYearLabel,
  fiscalYearPeriod,
  lastEndedFiscalYear,
  manualPayrollRequestRow,
  payrollRequestFileName,
  ymRangeText,
  ymText,
  type PayrollRequestCandidate,
} from "@/lib/payroll-request";

const base: PayrollRequestCandidate = {
  id: "w1",
  name: "NGUYEN VAN A",
  kana: "グエン バン アー",
  nationality: "ベトナム",
  residenceStatus: "特定技能1号",
  residencePermitDate: "2024-06-01",
  startOn: "2024-06-01",
  leavingOn: null,
};

describe("lastEndedFiscalYear", () => {
  it("4月以降は前年度・3月までは前々年度", () => {
    expect(lastEndedFiscalYear("2026-11-26")).toBe(2025); // 2025-04〜2026-03 が終わっている
    expect(lastEndedFiscalYear("2026-04-01")).toBe(2025);
    expect(lastEndedFiscalYear("2026-02-01")).toBe(2024); // 2025年度はまだ途中
  });
});

describe("fiscalYearPeriod / ラベル・月の表記", () => {
  it("年度の期間", () => {
    expect(fiscalYearPeriod(2025)).toEqual({ from: "2025-04-01", to: "2026-03-31" });
    expect(fiscalYearLabel(2025)).toBe("2025年度（令和7年度・2025年4月1日〜2026年3月31日）");
  });
  it("月の表記", () => {
    expect(ymText("2025-08")).toBe("2025年8月分");
    expect(ymRangeText("2025-04", "2026-03")).toBe("2025年4月分〜2026年3月分");
    expect(ymRangeText("2026-03", "2026-03")).toBe("2026年3月分");
  });
});

describe("buildPayrollRequestRows", () => {
  it("年度を通して在籍している1号の人は、年度の12か月分", () => {
    const { rows, excluded } = buildPayrollRequestRows(
      [base],
      { w1: [{ permitDate: "2024-06-01", visa: "特定技能1号" }] },
      2025,
    );
    expect(excluded).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].grade).toBe("特定技能1号");
    expect(rows[0].fromYm).toBe("2025-04");
    expect(rows[0].toYm).toBe("2026-03");
    expect(rows[0].prevYear).toBe(false); // 2024-06開始 → 2026-04-01時点で2年未満
  });

  it("特定活動の期間はお願いしない（特定技能の許可日から）", () => {
    // 2025-02 入社（特定活動）→ 2025-08-20 に特定技能1号へ変更
    const c = { ...base, startOn: "2025-02-01", residencePermitDate: "2025-08-20" };
    const { rows } = buildPayrollRequestRows(
      [c],
      { w1: [{ permitDate: "2025-08-20", visa: "特定技能1号" }] },
      2025,
    );
    expect(rows[0].fromYm).toBe("2025-08");
    expect(rows[0].toYm).toBe("2026-03");
    expect(rows[0].note).toContain("特定技能の許可日（2025年8月20日）より前の分は不要");
  });

  it("特定活動のみの人（特定技能の許可なし）は載せない", () => {
    const c = { ...base, residenceStatus: "特定活動（特定技能1号以降準備）" };
    const { rows, excluded } = buildPayrollRequestRows([c], {}, 2025);
    expect(rows).toHaveLength(0);
    expect(excluded).toHaveLength(1);
    expect(excluded[0].reason).toContain("特定技能1号・2号の許可の記録がありません");
  });

  it("年度の途中で退職した人は退職月まで。備考に退職日", () => {
    const c = { ...base, leavingOn: "2025-10-15" };
    const { rows } = buildPayrollRequestRows(
      [c],
      { w1: [{ permitDate: "2024-06-01", visa: "特定技能1号" }] },
      2025,
    );
    expect(rows[0].toYm).toBe("2025-10");
    expect(rows[0].note).toContain("2025年10月15日 退職");
  });

  it("年度より前に退職した人・年度より後に許可された人は載せない", () => {
    const left = { ...base, id: "w2", leavingOn: "2025-03-31" };
    const future = { ...base, id: "w3" };
    const { rows, excluded } = buildPayrollRequestRows(
      [left, future],
      {
        w2: [{ permitDate: "2023-06-01", visa: "特定技能1号" }],
        w3: [{ permitDate: "2026-05-01", visa: "特定技能1号" }],
      },
      2025,
    );
    expect(rows).toHaveLength(0);
    expect(excluded.map((e) => e.id).sort()).toEqual(["w2", "w3"]);
  });

  it("2年以上継続している人は前年度分もお願いする（昇給率の対象）", () => {
    // 2023-06-01 から1号 → 2026-04-01 時点で2年以上
    const c = { ...base, startOn: "2023-06-01", residencePermitDate: "2023-06-01" };
    const { rows } = buildPayrollRequestRows(
      [c],
      { w1: [{ permitDate: "2023-06-01", visa: "特定技能1号" }] },
      2025,
    );
    expect(rows[0].prevYear).toBe(true);
    expect(rows[0].prevFromYm).toBe("2024-04");
    expect(rows[0].prevToYm).toBe("2025-03");
  });

  it("ちょうど2年（前々年度の4月1日開始）は前年度分もお願いする。それより後は対象外", () => {
    const just = { ...base, id: "w4", startOn: "2024-04-01" };
    const under = { ...base, id: "w5", startOn: "2024-04-02" };
    const { rows } = buildPayrollRequestRows(
      [just, under],
      {
        w4: [{ permitDate: "2024-04-01", visa: "特定技能1号" }],
        w5: [{ permitDate: "2024-04-02", visa: "特定技能1号" }],
      },
      2025,
    );
    const r4 = rows.find((r) => r.id === "w4");
    const r5 = rows.find((r) => r.id === "w5");
    expect(r4?.prevYear).toBe(true);
    expect(r5?.prevYear).toBe(false);
  });

  it("期間の途中で2号へ移行した人は2号として載せ、備考に移行日。号が変わると2年の数え直し", () => {
    // 1号 2022-10-01 → 2号 2025-09-15（2026-04-01時点で2号は2年未満 → 前年度分は不要）
    const c = { ...base, startOn: "2022-10-01", residenceStatus: "特定技能2号" };
    const { rows } = buildPayrollRequestRows(
      [c],
      {
        w1: [
          { permitDate: "2022-10-01", visa: "特定技能1号" },
          { permitDate: "2025-09-15", visa: "特定技能２号" }, // 全角の号数もならして判定する
        ],
      },
      2025,
    );
    expect(rows[0].grade).toBe("特定技能2号");
    expect(rows[0].note).toContain("特定技能2号へ移行（2025年9月15日）");
    expect(rows[0].prevYear).toBe(false);
  });

  it("許可の記録が無い人は現在の許可日で補って警告を出す", () => {
    const { rows } = buildPayrollRequestRows([base], {}, 2025);
    expect(rows).toHaveLength(1);
    expect(rows[0].warning).toContain("特定技能の許可日の記録が無い");
  });

  it("許可日も未登録でも、在留資格が特定技能なら雇用開始日から対象に載せる", () => {
    const c = { ...base, residencePermitDate: null, startOn: "2025-06-10" };
    const { rows } = buildPayrollRequestRows([c], {}, 2025);
    expect(rows).toHaveLength(1);
    expect(rows[0].fromYm).toBe("2025-06");
    expect(rows[0].warning).toContain("特定技能の許可日の記録が無い");
  });

  it("許可日も雇用開始日も未登録なら、年度の初めから対象に載せる（昇給率の対象にはしない）", () => {
    const c = { ...base, residencePermitDate: null, startOn: null };
    const { rows } = buildPayrollRequestRows([c], {}, 2025);
    expect(rows).toHaveLength(1);
    expect(rows[0].fromYm).toBe("2025-04");
    expect(rows[0].toYm).toBe("2026-03");
    expect(rows[0].prevYear).toBe(false);
  });

  it("退職して判定日（4月1日）にいない人は、2年以上でも前年度分はお願いしない", () => {
    const c = { ...base, startOn: "2023-06-01", leavingOn: "2026-01-31" };
    const { rows } = buildPayrollRequestRows(
      [c],
      { w1: [{ permitDate: "2023-06-01", visa: "特定技能1号" }] },
      2025,
    );
    expect(rows[0].prevYear).toBe(false);
    expect(rows[0].toYm).toBe("2026-01");
  });
});

describe("payrollRequestFileName", () => {
  it("機関名を入れ、ファイル名に使えない文字は置き換える", () => {
    expect(payrollRequestFileName("株式会社サンプル")).toBe("定期報告書_賃金台帳・証明書のお願い_株式会社サンプル");
    expect(payrollRequestFileName("A/B")).toBe("定期報告書_賃金台帳・証明書のお願い_A-B");
  });
});

describe("manualPayrollRequestRow（手で対象に入れる）", () => {
  it("許可の記録が無くても在籍期間から行を作る（警告つき・前年度分なし）", () => {
    const c = { ...base, residenceStatus: "", residencePermitDate: null, startOn: "2025-06-10", leavingOn: null };
    const row = manualPayrollRequestRow(c, 2025);
    expect(row?.grade).toBe("特定技能1号");
    expect(row?.fromYm).toBe("2025-06");
    expect(row?.toYm).toBe("2026-03");
    expect(row?.prevYear).toBe(false);
    expect(row?.warning).toContain("手で対象に入れた人");
  });

  it("年度と在籍期間が重ならなければ null。2号の在留資格なら2号", () => {
    expect(manualPayrollRequestRow({ ...base, leavingOn: "2025-03-31" }, 2025)).toBeNull();
    expect(manualPayrollRequestRow({ ...base, residenceStatus: "特定技能２号" }, 2025)?.grade).toBe("特定技能2号");
  });
});
