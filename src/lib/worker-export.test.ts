import { describe, expect, it } from "vitest";
import {
  buildWorkerExportSheet,
  DEFAULT_WORKER_EXPORT_KEYS,
  pickWorkerExportColumns,
  WORKER_EXPORT_COLUMNS,
  workerExportFileName,
  workerExportGroups,
} from "./worker-export";
import type { WorkerWithHistories } from "@/types/db";

const worker = {
  id: "w1",
  worker_code: "V-12",
  name: "NGUYEN THI HONG",
  kana: "グエン ティ ホン",
  nationality: "ベトナム",
  birth: "1994-07-10",
  gender: "女",
  has_spouse: "無",
  field: "農業",
  status: "在籍",
  support: "支援対象",
  current_organization_id: "o1",
  residence_status: "特定技能1号",
  residence_period: "1年",
  residence_expiry_date: "2026-10-13",
  residence_card_no: "AB12345678CD",
  passport_no: "C2970924",
  address: "熊本県八代市郡築三番町175番地2",
  my_number: "1234 5678 9012",
  ssw_insurance_self_join: true,
  created_at: "2024-05-01T09:00:00Z",
  work_histories: [],
} as unknown as WorkerWithHistories;

const ctx = {
  orgName: (id: string | null) => (id === "o1" ? "有限会社國崎青果" : ""),
  calc: () => ({ used: { y: 1, m: 8, d: 3 }, expiry: "2029-05-14" }) as never,
};

describe("外国人の Excel 出力", () => {
  it("項目のキーは重複しない・既定の項目はすべて存在する", () => {
    const keys = WORKER_EXPORT_COLUMNS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of DEFAULT_WORKER_EXPORT_KEYS) expect(keys).toContain(k);
    expect(workerExportGroups()[0]).toBe("基本");
  });

  it("選んだ項目を一覧の並び順でそろえ、知らないキーは無視する", () => {
    expect(pickWorkerExportColumns(["birth", "name", "unknown"]).map((c) => c.key)).toEqual(["name", "birth"]);
  });

  it("1行目が見出し、2行目から1人1行", () => {
    const sheet = buildWorkerExportSheet([worker], ["name", "birth", "org", "ssw_total", "ssw_expiry", "ssw_insurance_self_join", "created_at"], ctx);
    expect(sheet.name).toBe("外国人");
    expect(sheet.headerRows).toBe(1);
    expect(sheet.rows[0]).toEqual(["氏名", "生年月日", "現在の所属機関", "特定技能1号の通算", "通算5年の満了予定日", "総合保険の自己負担加入", "登録日"]);
    expect(sheet.rows[1]).toEqual(["NGUYEN THI HONG", "1994-07-10", "有限会社國崎青果", "1年8か月", "2029-05-14", "はい", "2024-05-01"]);
    expect(sheet.columnWidths).toHaveLength(7);
  });

  it("通算が無い人・所属が無い人は空欄", () => {
    const sheet = buildWorkerExportSheet(
      [{ ...worker, current_organization_id: null } as WorkerWithHistories],
      ["org", "ssw_total"],
      { orgName: () => "", calc: () => null },
    );
    expect(sheet.rows[1]).toEqual(["", ""]);
  });

  it("ファイル名", () => {
    expect(workerExportFileName(12, "2026-10-14")).toBe("外国人一覧_2026-10-14_12名.xlsx");
  });
});
