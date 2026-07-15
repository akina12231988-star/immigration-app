import { describe, expect, it } from "vitest";
import { PAYLOAD_MARKER_START, PAYLOAD_MARKER_END, extractPayload } from "./payload";
import { resumePayloadToWorker } from "./resume";
import { parseDocumentText } from "./index";

// 履歴書ツールと同じ方式で埋め込みテキストを作る（btoa(unescape(encodeURIComponent(json))) と対）。
function embed(payload: unknown, opts: { withNoise?: boolean } = {}): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64");
  // PDF抽出で途中に改行・空白が混じるケースを再現
  const body = opts.withNoise ? b64.replace(/(.{20})/g, "$1\n ") : b64;
  return `履歴書 本文テキスト...\n${PAYLOAD_MARKER_START}${body}${PAYLOAD_MARKER_END}\n末尾`;
}

const samplePayload = {
  docType: "resume",
  schema: "tokutei-rireki",
  version: 1,
  sourceLang: "vi",
  basic: {
    name: "DO VAN VINH",
    kana: "DO VAN VINH",
    gender: "男性",
    birth: "1995-03-01",
    nationality: "ベトナム",
    languages: "日本語・ベトナム語",
    spouse: "無",
    trainingType: "農業",
    trainingWork: "施設園芸",
    trainingEnd: "2022-03-31",
    visaExpiry: "2027-04-01",
    residenceStatus: "特定技能1号",
    addressJapan: "東京都...",
    addressHome: "ハノイ...",
    qualifications: "専門級",
    height: "170",
    weight: "65",
    bloodType: "A型",
    vision: "1.0 / 1.0",
    dominantHand: "右",
    illness: "なし",
    drinking: "時々",
    smoking: "無",
    hobby: "サッカー",
  },
  careers: [
    { startYear: "2019", startMonth: "4", endYear: "2022", endMonth: "3", company: "みどり農園", residenceStatusKey: "ginou_jisshu_2", residenceStatus: "技能実習2号で修了" },
    { startYear: "2022", startMonth: "5", endYear: "", endMonth: "", company: "あおぞら特定技能", residenceStatusKey: "tokutei_1", residenceStatus: "特定技能1号" },
    { startYear: "", startMonth: "", endYear: "", endMonth: "", company: "", residenceStatus: "" }, // 空行
  ],
  families: [
    { relation: "父", name: "DO VAN A", birthYear: "1965", job: "農業" },
  ],
};

describe("extractPayload", () => {
  it("マーカーからJSONを取り出す", () => {
    const text = embed(samplePayload);
    const r = extractPayload(text);
    expect(r).not.toBeNull();
    expect(r!.payload.docType).toBe("resume");
  });

  it("Base64に改行・空白が混入していてもデコードできる", () => {
    const text = embed(samplePayload, { withNoise: true });
    const r = extractPayload(text);
    expect(r).not.toBeNull();
    expect((r!.payload as unknown as { basic: { name: string } }).basic.name).toBe("DO VAN VINH");
  });

  it("マーカーが無ければ null", () => {
    expect(extractPayload("ただの本文です")).toBeNull();
  });
});

describe("resumePayloadToWorker", () => {
  it("基本情報を外国人レコードへ写像する", () => {
    const { worker } = resumePayloadToWorker(samplePayload);
    expect(worker.name).toBe("DO VAN VINH");
    expect(worker.birth).toBe("1995-03-01");
    expect(worker.nationality).toBe("ベトナム");
    expect(worker.residence_status).toBe("特定技能1号");
    expect(worker.residence_expiry_date).toBe("2027-04-01");
    expect(worker.field).toBe("農業");
    expect(worker.legacy_id).toBe("pdf:DO VAN VINH:1995-03-01");
    expect(worker.family_note).toContain("父");
    expect(worker.health_note).toContain("身長 170cm");
    expect(worker.note).toContain("性別: 男性");
  });

  it("職歴を全件（空行を除く）取り込み、在留資格をVisaTypeへ写像する", () => {
    const { worker } = resumePayloadToWorker(samplePayload);
    expect(worker.histories).toHaveLength(2); // 空行は除外
    expect(worker.histories[0]).toMatchObject({
      visa: "技能実習",
      start_date: "2019-04-01",
      end_date: "2022-03-01", // 年月粒度のため月初で表現
      org_name: "みどり農園",
    });
    expect(worker.histories[1]).toMatchObject({
      visa: "特定技能1号",
      start_date: "2022-05-01",
      end_date: null,
      org_name: "あおぞら特定技能",
    });
  });

  it("行数制限なし: 大量の職歴も全件取り込む", () => {
    const many = {
      ...samplePayload,
      careers: Array.from({ length: 25 }, (_, i) => ({
        startYear: String(2000 + i),
        startMonth: "1",
        endYear: String(2001 + i),
        endMonth: "1",
        company: `会社${i}`,
        residenceStatus: "特定技能1号",
      })),
    };
    const { worker } = resumePayloadToWorker(many);
    expect(worker.histories).toHaveLength(25);
  });
});

describe("parseDocumentText", () => {
  it("履歴書PDFテキストから取り込みデータを生成する", () => {
    const r = parseDocumentText(embed(samplePayload, { withNoise: true }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.document.docType).toBe("resume");
      expect(r.document.workers).toHaveLength(1);
      expect(r.document.workers[0].histories).toHaveLength(2);
    }
  });

  it("埋め込みが無ければ no-payload エラー", () => {
    const r = parseDocumentText("テキスト層はあるが埋め込みデータなし");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("no-payload");
  });

  it("未対応の docType は unsupported エラー", () => {
    const r = parseDocumentText(embed({ docType: "support_plan", version: 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === "unsupported") expect(r.error.docType).toBe("support_plan");
  });
});
