import { describe, expect, it } from "vitest";
import {
  defaultReportSuffix,
  reportBundleName,
  reportPdfName,
  reportSheetRows,
  reportStatusLabel,
} from "./doc-request-report";
import { indexChecks, type DocumentRequestCheck } from "./org-document-requests";

const check = (worker_id: string, item_id: string, over: Partial<DocumentRequestCheck>): DocumentRequestCheck => ({
  id: `${worker_id}${item_id}`,
  request_id: "r",
  worker_id,
  item_id,
  informed_on: null,
  issued_on: null,
  sent_on: null,
  not_needed: false,
  note: "",
  created_at: "",
  updated_at: "",
  ...over,
});

describe("会社へ報告する出力の名前", () => {
  it("PDF は No.番号_氏名_末尾.pdf（使えない文字は中黒）", () => {
    expect(reportPdfName(1, "HA SI HIEU", "令和8年度年末調整資料")).toBe("No.1_HA SI HIEU_令和8年度年末調整資料.pdf");
    expect(reportPdfName(12, "A/B", "x:y")).toBe("No.12_A・B_x・y.pdf");
  });

  it("末尾の初期値は、年末調整の依頼なら 令和○年度年末調整資料、それ以外は依頼名", () => {
    expect(defaultReportSuffix("年末調整の書類", "2026-10-24")).toBe("令和8年度年末調整資料");
    expect(defaultReportSuffix("住民票の提出", "2026-10-24")).toBe("住民票の提出");
    expect(defaultReportSuffix("", "2026-10-24")).toBe("提出資料");
  });

  it("ZIP・エクセルの名前", () => {
    expect(reportBundleName("令和8年度年末調整資料", "zip")).toBe("令和8年度年末調整資料_添付資料.zip");
    expect(reportBundleName("令和8年度年末調整資料", "xlsx")).toBe("令和8年度年末調整資料_添付一覧.xlsx");
  });
});

describe("エクセルの一覧", () => {
  const items = [
    { id: "a", name: "扶養控除申告書", note: "", joined_year: null },
    { id: "b", name: "扶養証明書", note: "", joined_year: null },
    { id: "c", name: "源泉徴収票", note: "", joined_year: 2026 },
  ];
  const w1 = { id: "w1", name: "HA SI HIEU", kana: "ハ シ ヒエウ", nationality: "ベトナム", startOn: "2026-05-11" };
  const w2 = { id: "w2", name: "H BOAN MLO", kana: "フー ボアン ムロ", nationality: "ベトナム", startOn: "2023-05-24" };
  const idx = indexChecks([
    check("w1", "a", { informed_on: "2026-10-20", issued_on: "2026-10-24" }),
    check("w1", "b", { informed_on: "2026-10-20", none_replied_on: "2026-10-24" }),
    check("w1", "c", { informed_on: "2026-10-20", issued_on: "2026-10-21", sent_on: "2026-10-24" }),
    check("w2", "a", { not_needed: true, note: "扶養家族なし" }),
    check("w2", "b", { informed_on: "2026-10-20" }),
  ]);

  it("各マスの状況を言葉にする（日付・理由つき。入社年で外れる書類はその理由）", () => {
    expect(reportStatusLabel(items[0], w1.startOn, idx.get("w1_a"))).toBe("発行済 2026-10-24");
    expect(reportStatusLabel(items[1], w1.startOn, idx.get("w1_b"))).toBe("本人から無いと回答 2026-10-24");
    expect(reportStatusLabel(items[2], w1.startOn, idx.get("w1_c"))).toBe("会社へ送付済 2026-10-24");
    expect(reportStatusLabel(items[0], w2.startOn, idx.get("w2_a"))).toBe("対象外（扶養家族なし）");
    expect(reportStatusLabel(items[1], w2.startOn, idx.get("w2_b"))).toBe("案内済（未発行） 2026-10-20");
    expect(reportStatusLabel(items[2], w2.startOn, undefined)).toBe("対象外（2023年入社のため対象外）");
    expect(reportStatusLabel(items[0], w2.startOn, undefined)).toBe("未着手");
  });

  it("見出し＋選んだ順の行（No. は PDF の名前と同じ）", () => {
    const rows = reportSheetRows(items, [w1, w2], idx, {
      organizationName: "有限会社國崎青果",
      requestTitle: "令和8年度年末調整資料",
      dueOn: "2026-11-30",
      today: "2026-10-24",
    });
    expect(rows[0][0]).toBe("有限会社國崎青果 令和8年度年末調整資料");
    expect(rows[2]).toEqual(["No.", "氏名", "フリガナ", "国籍", "入社年月日", "扶養控除申告書", "扶養証明書", "源泉徴収票", "PDF のファイル名"]);
    expect(rows[3]).toEqual([
      1, "HA SI HIEU", "ハ シ ヒエウ", "ベトナム", "2026-05-11",
      "発行済 2026-10-24", "本人から無いと回答 2026-10-24", "会社へ送付済 2026-10-24",
      "No.1_HA SI HIEU_令和8年度年末調整資料.pdf",
    ]);
    expect(rows[4][0]).toBe(2);
    expect(rows[4][5]).toBe("対象外（扶養家族なし）");
  });
});
