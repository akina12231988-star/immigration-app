import { describe, expect, it } from "vitest";
import {
  approvalNoticeFileName,
  approvalNoticeHeadline,
  buildApprovalNoticeItems,
  chunkApprovalNoticeItems,
  defaultNoticeDate,
  formatJpDate,
  nowLabel,
  wrapByWidth,
} from "./approval-notice-image";

const app = {
  id: "a1",
  name: "NGUYEN THI HONG",
  organizationName: "有限会社國崎青果",
  assignee: "木村",
  applicationDate: "2026-09-02",
  applicationNumber: "EC2109130",
  applicationContent: "在留期間の更新許可" as const,
  approvalDate: "2026-10-17",
};

describe("許可のお知らせ画像のデータ", () => {
  it("申請から1枠ぶんの項目を作る（空は — や未登録にする）", () => {
    const items = buildApprovalNoticeItems(
      [app, { ...app, id: "a2", organizationName: null, assignee: "", applicationNumber: "", applicationContent: "", approvalDate: undefined }],
      { today: "2026-10-18", via: "はがき", custodyNoLabel: (a) => (a.id === "a1" ? "012" : "—") },
    );
    expect(items[0]).toEqual({
      id: "a1",
      name: "NGUYEN THI HONG",
      org: "有限会社國崎青果",
      assignee: "木村",
      custodyNo: "012",
      applicationDate: "2026-09-02",
      applicationNo: "EC2109130",
      content: "在留期間の更新許可",
      noticeDate: "2026-10-17",
      via: "はがき",
    });
    expect(items[1]).toMatchObject({ org: "所属機関未設定", assignee: "—", custodyNo: "—", applicationNo: "未登録", content: "未登録", noticeDate: "2026-10-18" });
  });

  it("人ごとに連絡が来た日・手段を直せる", () => {
    const [i] = buildApprovalNoticeItems([app], {
      today: "2026-10-18",
      via: "はがき",
      custodyNoLabel: () => "—",
      overrides: { a1: { noticeDate: "2026-10-16", via: "メール" } },
    });
    expect(i.noticeDate).toBe("2026-10-16");
    expect(i.via).toBe("メール");
  });

  it("連絡が来た日の初期値は許可日、無ければ今日", () => {
    expect(defaultNoticeDate({ approvalDate: "2026-10-01" }, "2026-10-18")).toBe("2026-10-01");
    expect(defaultNoticeDate({ approvalDate: undefined }, "2026-10-18")).toBe("2026-10-18");
  });

  it("1枚の人数で分ける", () => {
    expect(chunkApprovalNoticeItems([1, 2, 3, 4, 5, 6, 7], 5)).toEqual([[1, 2, 3, 4, 5], [6, 7]]);
    expect(chunkApprovalNoticeItems([1, 2], 0)).toEqual([[1, 2]]);
    expect(chunkApprovalNoticeItems([], 5)).toEqual([]);
  });

  it("見出しの日付", () => {
    expect(formatJpDate("2026-10-07")).toBe("2026年10月7日");
    expect(formatJpDate("")).toBe("");
    expect(approvalNoticeHeadline([{ noticeDate: "2026-10-17" }, { noticeDate: "2026-10-17" }])).toBe("許可のお知らせ　2026年10月17日");
    expect(approvalNoticeHeadline([{ noticeDate: "2026-10-17" }, { noticeDate: "2026-10-16" }])).toBe(
      "許可のお知らせ　2026年10月16日〜2026年10月17日",
    );
    expect(approvalNoticeHeadline([])).toBe("許可のお知らせ");
  });

  it("ファイル名と作成日時", () => {
    expect(approvalNoticeFileName("2026-10-17", 3)).toBe("許可のお知らせ_2026-10-17_3名.png");
    expect(approvalNoticeFileName("2026-10-17", 5, 1, 2)).toBe("許可のお知らせ_2026-10-17_5名_1of2.png");
    expect(nowLabel(new Date(2026, 9, 17, 15, 7))).toBe("2026-10-17 15:07");
  });

  it("文字幅で1文字ずつ折り返す", () => {
    const measure = (s: string) => Array.from(s).length * 10;
    expect(wrapByWidth(measure, "あいうえおかきくけこ", 45)).toEqual(["あいうえ", "おかきく", "けこ"]);
    expect(wrapByWidth(measure, "", 45)).toEqual([""]);
    expect(wrapByWidth(measure, "あ\nい", 45)).toEqual(["あ", "い"]);
  });
});
