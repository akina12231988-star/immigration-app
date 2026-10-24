import { describe, expect, it } from "vitest";
import { docNameIn, docRequestMessage, docRequestText, docWordFor } from "./doc-request-text";

describe("docWordFor", () => {
  it("よくある書類名を辞書の種類に当てる（扶養控除 は 扶養証明 より先）", () => {
    expect(docWordFor("扶養控除申告書")?.key).toBe("fuyokojo");
    expect(docWordFor("扶養控除等申告書")?.key).toBe("fuyokojo");
    expect(docWordFor("扶養証明書(日本語訳)")?.key).toBe("fuyo");
    expect(docWordFor("在留カードの写し")?.key).toBe("zairyu");
    expect(docWordFor("健康診断書")?.key).toBe("kenkoshindan");
  });

  it("送金証明書・源泉徴収票は年（西暦）も取り出す", () => {
    expect(docWordFor("2026年送金証明書")).toEqual({ key: "soukin", year: 2026 });
    expect(docWordFor("令和8年度源泉徴収票")).toEqual({ key: "gensen", year: 2026 });
    expect(docWordFor("源泉徴収票")).toEqual({ key: "gensen", year: null });
  });

  it("辞書に無い書類は null", () => {
    expect(docWordFor("社宅の鍵の受領書")).toBeNull();
  });
});

describe("docNameIn", () => {
  it("日本語は依頼の書類名のまま、母国語は辞書の訳（年付き）", () => {
    expect(docNameIn("ja", "2026年送金証明書")).toBe("2026年送金証明書");
    expect(docNameIn("vi", "2026年送金証明書")).toBe(
      "Giấy chứng nhận chuyển tiền (送金証明書: chứng từ gửi tiền cho gia đình) năm 2026",
    );
    expect(docNameIn("en", "令和8年度源泉徴収票")).toBe("Withholding tax slip (源泉徴収票) for 2026");
  });

  it("辞書に無い書類は日本語名を「 」で入れる", () => {
    expect(docNameIn("vi", "社宅の鍵の受領書")).toBe("「社宅の鍵の受領書」");
  });
});

describe("docRequestText / docRequestMessage", () => {
  const input = {
    workerName: "CAO NGOC KHUE",
    organizationName: "株式会社テスト",
    dueOn: "2026-11-30",
    items: [
      { name: "扶養控除等申告書", note: "" },
      { name: "扶養証明書(日本語訳)", note: "コピーでよい" },
    ],
  };

  it("日本語の文面に 氏名・会社・期限・番号付きの書類・補足 が入る", () => {
    const t = docRequestText("ja", input);
    expect(t).toContain("CAO NGOC KHUEさん");
    expect(t).toContain("株式会社テストから、次の書類の提出を求められています。");
    expect(t).toContain("期限: 2026-11-30まで");
    expect(t).toContain("1. 扶養控除等申告書\n2. 扶養証明書(日本語訳)（コピーでよい）");
    expect(t).toContain("写真（または PDF）をこちらに送ってください");
  });

  it("期限が無ければ期限の行を書かない", () => {
    expect(docRequestText("ja", { ...input, dueOn: null })).not.toContain("期限");
  });

  it("日本語＋母国語は区切り線でつなぎ、母国語が日本語なら日本語だけ", () => {
    const m = docRequestMessage("vi", input);
    expect(m).toContain("----------");
    expect(m).toContain("Chào CAO NGOC KHUE,");
    expect(m).toContain("Công ty 株式会社テスト yêu cầu bạn nộp các giấy tờ sau.");
    expect(m).toContain("Hạn nộp: trước ngày 2026-11-30");
    expect(m).toContain("1. Tờ khai miễn trừ người phụ thuộc (扶養控除等申告書)");
    expect(docRequestMessage("ja", input)).not.toContain("----------");
  });
});
