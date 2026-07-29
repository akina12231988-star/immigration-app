import { describe, expect, it } from "vitest";
import {
  applicantLabel,
  isSelfOnlyMunicipality,
  juminhyoTitle,
  requestKindLabel,
  type Municipality,
} from "./tax-cert";

describe("requestKindLabel", () => {
  it("請求種別の表示名を返す（未設定の既存記録は課税・納税証明書）", () => {
    expect(requestKindLabel("tax")).toBe("課税・納税証明書");
    expect(requestKindLabel("tenshutsu")).toBe("転出届");
    expect(requestKindLabel("juminhyo")).toBe("住民票");
    expect(requestKindLabel(undefined)).toBe("課税・納税証明書");
  });
});

describe("juminhyoTitle", () => {
  it("個人番号（マイナンバー）記載の有無をタイトルに含める", () => {
    expect(juminhyoTitle(true)).toBe("住民票の写し（個人番号の記載あり）");
    expect(juminhyoTitle(false)).toBe("住民票の写し（個人番号の記載なし）");
  });
});

describe("applicantLabel", () => {
  it("本人申請・代理人（名前）を表示する", () => {
    expect(applicantLabel("self")).toBe("本人申請");
    expect(applicantLabel(undefined)).toBe("本人申請");
    expect(applicantLabel("agent", "山田太郎")).toBe("代理人（山田太郎）");
    expect(applicantLabel("agent", "")).toBe("代理人（名前未入力）");
  });
});

describe("isSelfOnlyMunicipality", () => {
  const muni = (patch: Partial<Municipality>): Municipality => ({
    id: "m1",
    name: "八代市",
    cert_name: "課税証明書",
    has_income: true,
    has_tax: true,
    needs_tax_payment_cert: false,
    show_asterisk: false,
    note: "",
    tenshutsu_self_only: false,
    juminhyo_self_only: false,
    ...patch,
  });
  it("自治体マスタの設定に応じて本人申請のみか判定する", () => {
    expect(isSelfOnlyMunicipality("tenshutsu", muni({ tenshutsu_self_only: true }))).toBe(true);
    expect(isSelfOnlyMunicipality("tenshutsu", muni({}))).toBe(false);
    expect(isSelfOnlyMunicipality("juminhyo", muni({ juminhyo_self_only: true }))).toBe(true);
    expect(isSelfOnlyMunicipality("juminhyo", muni({ tenshutsu_self_only: true }))).toBe(false);
  });
  it("自治体未選択（null）は制限なし扱い", () => {
    expect(isSelfOnlyMunicipality("tenshutsu", null)).toBe(false);
  });
});
