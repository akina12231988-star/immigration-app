import { describe, expect, it } from "vitest";
import { printHistoryNote, printHistoryStartSource } from "./print-history-note";
import type { VisaHistoryRow } from "./visa-history";

const row = (permitDate: string, label = "特定技能1号 ビザ許可"): VisaHistoryRow => ({
  permitDate,
  status: "特定技能1号",
  label,
  expiryDate: "",
  cardNo: "",
  isCurrent: false,
});
const r1 = row("2025-07-04");
const r2 = row("2026-05-22", "特定技能1号 更新許可");

describe("printHistoryStartSource", () => {
  it("所属機関別の雇用開始日と職歴の入社日は早いほう、無ければ外国人の雇用開始日", () => {
    expect(printHistoryStartSource({ orgStart: "2026-05-22", historyStart: "2025-07-04", workerStart: "2026-05-22" })).toEqual({ start: "2025-07-04", source: "history" });
    expect(printHistoryStartSource({ orgStart: "2025-07-01", historyStart: "2025-07-04", workerStart: "" })).toEqual({ start: "2025-07-01", source: "org" });
    expect(printHistoryStartSource({ orgStart: "", historyStart: "", workerStart: "2025-09-03" })).toEqual({ start: "2025-09-03", source: "worker" });
    expect(printHistoryStartSource({ orgStart: "", historyStart: "", workerStart: "" })).toEqual({ start: "", source: "" });
  });
});

describe("printHistoryNote", () => {
  it("全部出ていれば注意は無し", () => {
    expect(
      printHistoryNote({ orgName: "白石智和", allRows: [r1, r2], shownRows: [r1, r2], histories: [{ org_name: "白石 智和", start_date: "2025-07-04", end_date: null, visa: "特定技能1号" }], start: "2025-07-04", source: "history" }),
    ).toBeNull();
  });

  it("在籍の始まりが分からないときは、職歴を登録するよう案内する", () => {
    const note = printHistoryNote({ orgName: "有限会社國崎青果", allRows: [r1, r2], shownRows: [r1, r2], histories: [], start: "", source: "" });
    expect(note?.title).toContain("在籍期間が分からない");
    expect(note?.lines[0]).toContain("外国人詳細 ＞ 職歴");
  });

  it("職歴が無く雇用開始日から数えて抜けた許可は、抜けた許可と直す場所を出す", () => {
    const note = printHistoryNote({ orgName: "白石智和", allRows: [r1, r2], shownRows: [r2], histories: [], start: "2026-05-22", source: "worker" });
    expect(note?.title).toBe("白石智和にいた間の許可が表から抜けています（1件）");
    expect(note?.lines[0]).toContain("外国人の雇用開始日（2026年5月22日）");
    expect(note?.lines[0]).toContain("2025年7月4日 特定技能1号 ビザ許可");
    expect(note?.lines[1]).toContain("職歴 で 白石智和 の在籍期間（入社日）を登録");
  });

  it("職歴はあるが入社日が遅くて抜けたときは、入社日の確認を案内する", () => {
    const note = printHistoryNote({
      orgName: "白石智和",
      allRows: [r1, r2],
      shownRows: [r2],
      histories: [{ org_name: "白石 智和", start_date: "2026-05-22", end_date: null, visa: "特定技能1号" }],
      start: "2026-05-22",
      source: "org",
    });
    expect(note?.lines[1]).toContain("入社日を確認");
    expect(note?.lines[2]).toContain("所属機関別の雇用開始日");
  });

  it("別の会社にいた間の許可が出ていないのは正しいので注意は無し", () => {
    expect(
      printHistoryNote({
        orgName: "白石智和",
        allRows: [r1, r2],
        shownRows: [r2],
        histories: [
          { org_name: "前の農園", start_date: "2025-01-01", end_date: "2026-05-21", visa: "特定技能1号" },
          { org_name: "白石 智和", start_date: "2026-05-22", end_date: null, visa: "特定技能1号" },
        ],
        start: "2026-05-22",
        source: "history",
      }),
    ).toBeNull();
  });

  it("職歴が無くても全部出ているときは、職歴の登録だけを促す", () => {
    const note = printHistoryNote({ orgName: "白石智和", allRows: [r1, r2], shownRows: [r1, r2], histories: [], start: "2025-07-01", source: "worker" });
    expect(note).toBeNull();
  });
});
