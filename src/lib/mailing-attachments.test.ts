import { describe, expect, it } from "vitest";
import {
  MAIL_REQUEST_KIND,
  NOZEI3_RECEIVED_KIND,
  RECEIPT_KIND,
  RECEIVED_CERT_KIND,
  mailingAttachmentSlots,
  mailingTargets,
} from "./mailing-attachments";
import type { JudgmentRecord } from "./tax-cert";

function rec(patch: Partial<JudgmentRecord>): JudgmentRecord {
  return {
    id: "r1",
    createdAt: "2026-09-01T00:00:00Z",
    municipalityId: "m1",
    municipalityName: "東京都世田谷区",
    collectionType: "normal",
    appDate: "2026-09-01",
    hasNhi: false,
    nhiMunicipalityId: "",
    nhiMunicipalityName: "",
    nhiFiscalStartYear: null,
    yearType: "prev",
    fiscalStartYear: 2025,
    yearReason: "",
    timingStatus: "ok",
    timingLabel: "",
    timingDetail: "",
    docs: [],
    personName: "A",
    todoNumber: "",
    mainAlternativeNote: "",
    nhiAlternativeNote: "",
    requestMethod: "mail",
    mailRequestDate: "",
    recipientType: "self",
    agentName: "",
    nhiRequestMethod: "window",
    nhiMailRequestDate: "",
    nhiRecipientType: "self",
    nhiAgentName: "",
    nhiSameAsMain: true,
    ...patch,
  };
}

describe("mailingAttachmentSlots", () => {
  it("課税・納税証明書は 郵送請求した書類・届いた証明書・領収書", () => {
    expect(mailingAttachmentSlots({}).map((s) => s.kind)).toEqual([MAIL_REQUEST_KIND, RECEIVED_CERT_KIND, RECEIPT_KIND]);
  });
  it("転出届・住民票は申請書のデータを種別名で残す", () => {
    expect(mailingAttachmentSlots({ requestKind: "juminhyo" }).map((s) => s.kind)).toEqual(["住民票", RECEIVED_CERT_KIND, RECEIPT_KIND]);
    expect(mailingAttachmentSlots({ requestKind: "tenshutsu" })[1].title).toContain("転出証明書");
  });
  it("年度ごとに保存した課税・納税証明書は年度ごとに3つずつ", () => {
    const slots = mailingAttachmentSlots({
      docs: [
        { title: "a", meta: "", starred: false, yearType: "new" },
        { title: "b", meta: "", starred: false, yearType: "prev" },
      ],
      yearRequests: [
        { yearType: "new", fiscalStartYear: 2026, municipalityId: "m1", municipalityName: "A", collectionType: "special", timingStatus: "ok", timingLabel: "", timingDetail: "" },
        { yearType: "prev", fiscalStartYear: 2025, municipalityId: "m2", municipalityName: "B", collectionType: "special", timingStatus: "ok", timingLabel: "", timingDetail: "" },
      ],
    });
    expect(slots).toHaveLength(6);
    expect(slots[0]).toMatchObject({ role: "sent", year: "new", kind: "郵送請求した書類：2026年度（令和8年度）" });
    expect(slots[5]).toMatchObject({ role: "receipt", year: "prev", kind: "領収書：2025年度（令和7年度）" });
  });
  it("納税証明書その3は領収書なし", () => {
    expect(mailingAttachmentSlots({ requestKind: "nozei3" }).map((s) => s.kind)).toEqual([MAIL_REQUEST_KIND, NOZEI3_RECEIVED_KIND]);
  });
});

describe("mailingTargets", () => {
  it("1年度だけの請求", () => {
    expect(mailingTargets(rec({}))).toEqual([{ what: "課税・納税証明書 2025年度（令和7年度）", where: "東京都世田谷区" }]);
  });
  it("両年度は年度ごとの自治体を出す", () => {
    const t = mailingTargets(rec({ requestBothYears: true, fiscalStartYear: 2026, prevFiscalStartYear: 2025, prevMunicipalityName: "東京都荒川区" }));
    expect(t.map((x) => x.where)).toEqual(["東京都世田谷区", "東京都荒川区"]);
    expect(t[1].what).toContain("2025年度");
  });
  it("国保税も並べる", () => {
    const t = mailingTargets(rec({ hasNhi: true, nhiFiscalStartYear: 2026, nhiMunicipalityName: "熊本県八代郡氷川町" }));
    expect(t[1]).toEqual({ what: "国民健康保険税 納税証明書 2026年度（令和8年度）", where: "熊本県八代郡氷川町" });
  });
  it("手順式の記録は年度ごとの自治体と、年度ごとの国保を出す", () => {
    const t = mailingTargets(
      rec({
        yearRequests: [
          { yearType: "prev", fiscalStartYear: 2025, municipalityId: "m2", municipalityName: "東京都荒川区", collectionType: "special", timingStatus: "ok", timingLabel: "", timingDetail: "", taxCert: false, taxPayment: true },
        ],
        nhiYears: [{ yearType: "new", fiscalStartYear: 2026, municipalityId: "m3", municipalityName: "八代郡氷川町" }],
        hasNhi: true,
      }),
    );
    expect(t).toEqual([
      { what: "市県民税納税証明書 2025年度（令和7年度）", where: "東京都荒川区" },
      { what: "国民健康保険税 納税証明書 2026年度（令和8年度）", where: "八代郡氷川町" },
    ]);
  });
  it("税務署・転出届", () => {
    expect(mailingTargets(rec({ requestKind: "nozei3", taxOfficeName: "麹町税務署" }))[0].where).toBe("麹町税務署");
    expect(mailingTargets(rec({ requestKind: "tenshutsu", cityOffice: "八代市" }))[0]).toEqual({ what: "転出届", where: "八代市" });
  });
});
