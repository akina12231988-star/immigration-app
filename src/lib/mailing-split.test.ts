import { describe, expect, it } from "vitest";
import { canSplitNhi, nhiInOtherMunicipality, splitNhiRecord } from "./mailing-split";
import { mailingAttachmentSlots } from "./mailing-attachments";
import type { JudgmentRecord } from "./tax-cert";

const yr = (yearType: "new" | "prev", fiscalStartYear: number, municipalityId: string, municipalityName: string) => ({
  yearType,
  fiscalStartYear,
  municipalityId,
  municipalityName,
  collectionType: "special",
  timingStatus: "ok",
  timingLabel: "",
  timingDetail: "",
  taxCert: true,
  taxPayment: true,
});
const rec = {
  id: "r1",
  createdAt: "",
  requestKind: "tax",
  hasNhi: true,
  requestMethod: "agent_window",
  agentName: "nga",
  yearRequests: [yr("new", 2026, "m1", "八代市"), yr("prev", 2025, "m1", "八代市")],
  nhiYears: [{ yearType: "new", fiscalStartYear: 2026, municipalityId: "m9", municipalityName: "鎌田市" }],
  docs: [
    { title: "課税証明書 R8", meta: "", starred: false, yearType: "new" },
    { title: "課税証明書 R7", meta: "", starred: false, yearType: "prev" },
    { title: "国民健康保険税 納税証明書 R8", meta: "", starred: false, yearType: "new", isNhi: true },
  ],
  moneyOrders: [],
} as unknown as JudgmentRecord;

describe("国保税の納税証明書を別の記録に分ける", () => {
  it("国保の自治体が課税証明書と違うことが分かる", () => {
    expect(nhiInOtherMunicipality(rec)).toBe(true);
    expect(nhiInOtherMunicipality({ ...rec, nhiYears: [{ ...rec.nhiYears![0], municipalityId: "m1" }] })).toBe(false);
    expect(canSplitNhi(rec)).toBe(true);
  });
  it("課税証明書の記録から国保を外し、国保税だけの記録を郵送で作る", () => {
    const { main, nhi } = splitNhiRecord(rec, { requestMethod: "mail", mailRequestDate: "2026-11-06", recipientType: "self", agentName: "" });
    expect(main?.hasNhi).toBe(false);
    expect(main?.docs.map((d) => d.title)).toEqual(["課税証明書 R8", "課税証明書 R7"]);
    expect(main?.requestMethod).toBe("agent_window");
    expect(nhi.yearRequests).toEqual([]);
    expect(nhi.municipalityName).toBe("鎌田市");
    expect(nhi.requestMethod).toBe("mail");
    expect(nhi.docs.map((d) => d.title)).toEqual(["国民健康保険税 納税証明書 R8"]);
    expect(nhi.id).toBe("");
  });
});

describe("添付欄は自治体ごと（同じ市役所の2年度は1つ）", () => {
  it("2年度とも八代市なら、送った書類・届いた証明書・領収書が1つずつ", () => {
    const { main } = splitNhiRecord(rec, { requestMethod: "mail", mailRequestDate: "", recipientType: "self", agentName: "" });
    const slots = mailingAttachmentSlots(main!);
    expect(slots.map((s) => s.role)).toEqual(["sent", "received", "receipt"]);
    expect(slots[0].title).toContain("八代市");
    // 以前に年度ごとに添付した分も出す
    expect(slots[0].kinds).toEqual(["郵送請求した書類：2026年度（令和8年度）", "郵送請求した書類：2025年度（令和7年度）"]);
    expect(slots[0].years).toEqual(["new", "prev"]);
  });
});
