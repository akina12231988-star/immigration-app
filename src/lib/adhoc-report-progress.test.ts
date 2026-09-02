import { describe, expect, it } from "vitest";
import {
  canCompletePosting,
  countByAdhocStatus,
  postingMissingLabel,
  adhocReportStatus,
  statusAfterFormDownload,
} from "./adhoc-report-progress";
import { ADHOC_FILE_TARGETS, isAdhocFileKind } from "./adhoc-report-files";

const base = { status: undefined, posted_on: null, tracking_no: "", forms_downloaded_at: null };

describe("adhocReportStatus", () => {
  it("保存されている進み具合をそのまま使う", () => {
    expect(adhocReportStatus({ ...base, status: "投函完了" })).toBe("投函完了");
  });

  it("0086より前の記録は投函日・作成日時から見当をつける", () => {
    expect(adhocReportStatus(base)).toBe("準備中");
    expect(adhocReportStatus({ ...base, forms_downloaded_at: "2026-08-18T00:00:00Z" })).toBe(
      "署名依頼中",
    );
    expect(adhocReportStatus({ ...base, posted_on: "2026-08-19" })).toBe("投函完了");
  });
});

describe("canCompletePosting / postingMissingLabel", () => {
  it("スキャン・追跡番号・投函日がそろってはじめて完了にできる", () => {
    expect(canCompletePosting({ posted_on: "2026-08-19", tracking_no: "1234" }, 1)).toBe(true);
    expect(canCompletePosting({ posted_on: "2026-08-19", tracking_no: "1234" }, 0)).toBe(false);
    expect(canCompletePosting({ posted_on: "2026-08-19", tracking_no: " " }, 1)).toBe(false);
    expect(canCompletePosting({ posted_on: null, tracking_no: "1234" }, 1)).toBe(false);
  });

  it("足りないものを案内する", () => {
    expect(postingMissingLabel({ posted_on: null, tracking_no: "" }, 0)).toBe(
      "あと 署名済み届出書のスキャン・レターパックの追跡番号・投函日 を入れると投函完了になります",
    );
    expect(postingMissingLabel({ posted_on: "2026-08-19", tracking_no: "1" }, 1)).toBe("");
  });
});

describe("statusAfterFormDownload", () => {
  it("準備中のときだけ署名依頼中にする", () => {
    expect(statusAfterFormDownload(base)).toBe("署名依頼中");
    expect(statusAfterFormDownload({ ...base, status: "署名依頼中" })).toBeNull();
    expect(statusAfterFormDownload({ ...base, status: "投函完了" })).toBeNull();
  });
});

describe("countByAdhocStatus", () => {
  it("進み具合ごとに数える", () => {
    const counts = countByAdhocStatus([
      base,
      { ...base, status: "署名依頼中" },
      { ...base, posted_on: "2026-08-19" },
      { ...base, status: "投函完了" },
    ]);
    expect(counts).toEqual({ 準備中: 1, 署名依頼中: 1, 投函完了: 2 });
  });
});

describe("随時報告書の添付の置き場所", () => {
  it("記録の種別ごとにテーブル・フォルダが分かれている", () => {
    const kinds = Object.values(ADHOC_FILE_TARGETS);
    expect(new Set(kinds.map((t) => t.table)).size).toBe(kinds.length);
    expect(new Set(kinds.map((t) => t.prefix)).size).toBe(kinds.length);
    expect(ADHOC_FILE_TARGETS.resignation.column).toBe("resignation_id");
    expect(ADHOC_FILE_TARGETS["contract-change"].column).toBe("contract_change_id");
  });

  it("知らない種別は受け付けない", () => {
    expect(isAdhocFileKind("resignation")).toBe(true);
    expect(isAdhocFileKind("contract-change")).toBe(true);
    expect(isAdhocFileKind("other")).toBe(false);
    expect(isAdhocFileKind(undefined)).toBe(false);
  });
});
