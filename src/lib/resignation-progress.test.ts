import { describe, expect, it } from "vitest";
import {
  canCompletePosting,
  countByResignationStatus,
  postingMissingLabel,
  resignationStatus,
  statusAfterFormDownload,
} from "./resignation-progress";

const base = { status: undefined, posted_on: null, tracking_no: "", forms_downloaded_at: null };

describe("resignationStatus", () => {
  it("保存されている進み具合をそのまま使う", () => {
    expect(resignationStatus({ ...base, status: "投函完了" })).toBe("投函完了");
  });

  it("0086より前の記録は投函日・作成日時から見当をつける", () => {
    expect(resignationStatus(base)).toBe("準備中");
    expect(resignationStatus({ ...base, forms_downloaded_at: "2026-08-18T00:00:00Z" })).toBe(
      "署名依頼中",
    );
    expect(resignationStatus({ ...base, posted_on: "2026-08-19" })).toBe("投函完了");
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

describe("countByResignationStatus", () => {
  it("進み具合ごとに数える", () => {
    const counts = countByResignationStatus([
      base,
      { ...base, status: "署名依頼中" },
      { ...base, posted_on: "2026-08-19" },
      { ...base, status: "投函完了" },
    ]);
    expect(counts).toEqual({ 準備中: 1, 署名依頼中: 1, 投函完了: 2 });
  });
});
