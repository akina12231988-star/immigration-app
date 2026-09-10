import { describe, expect, it } from "vitest";
import {
  extraSaveBlockers,
  judgeBlockers,
  methodBlockers,
  nozei3SaveBlockers,
  taxSaveBlockers,
} from "./mailing-save-check";

describe("methodBlockers", () => {
  it("窓口取得は理由なし", () => {
    expect(methodBlockers("window", "", "self", "")).toEqual([]);
  });
  it("代理人が窓口で取得は代理人名が要る", () => {
    expect(methodBlockers("agent_window", "", "self", "")).toHaveLength(1);
    expect(methodBlockers("agent_window", "", "self", "山田")).toEqual([]);
  });
  it("郵送請求は請求日が要り、代理人宛なら代理人名も要る（接頭辞を付ける）", () => {
    expect(methodBlockers("mail", "", "agent", "", "国保：")).toEqual([
      "国保：郵送請求した日を入力してください",
      "国保：「代理人宛に届く」の代理人の氏名・宛先を入力してください",
    ]);
    expect(methodBlockers("mail", "2026-09-10", "self", "")).toEqual([]);
  });
});

describe("judgeBlockers", () => {
  const ok = {
    hasMunicipalities: true,
    newMuniSelected: true,
    prevSame: true,
    prevMuniSelected: false,
    appDate: "2026-09-10",
    hasNhi: false,
    nhiMuniSelected: false,
  };
  it("そろっていれば理由なし", () => {
    expect(judgeBlockers(ok)).toEqual([]);
  });
  it("自治体マスタが無ければそれだけを返す", () => {
    expect(judgeBlockers({ ...ok, hasMunicipalities: false, newMuniSelected: false })).toHaveLength(1);
  });
  it("前年度が別の自治体で未選択・申請予定日なし・国保の自治体未選択を全部出す", () => {
    const r = judgeBlockers({ ...ok, prevSame: false, appDate: "", hasNhi: true });
    expect(r).toHaveLength(3);
    expect(r[0]).toContain("前年度");
    expect(r[1]).toContain("申請予定日");
    expect(r[2]).toContain("国保");
  });
});

describe("taxSaveBlockers", () => {
  const ok = {
    canEdit: true,
    saved: false,
    personName: "NGUYEN",
    method: "window" as const,
    mailDate: "",
    recipient: "self" as const,
    agent: "",
    hasNhi: false,
    nhiSameAsMain: true,
    nhiMethod: "window" as const,
    nhiMailDate: "",
    nhiRecipient: "self" as const,
    nhiAgent: "",
  };
  it("そろっていれば理由なし", () => {
    expect(taxSaveBlockers(ok)).toEqual([]);
  });
  it("閲覧権限・記録済みはそれだけを返す", () => {
    expect(taxSaveBlockers({ ...ok, canEdit: false, personName: "" })).toHaveLength(1);
    expect(taxSaveBlockers({ ...ok, saved: true, personName: "" })).toHaveLength(1);
    expect(taxSaveBlockers({ ...ok, saved: true })[0]).toContain("記録済み");
  });
  it("氏名未選択と受領方法の不足を並べる（国保が別の受領方法ならその分も）", () => {
    const r = taxSaveBlockers({
      ...ok,
      personName: "",
      method: "mail",
      mailDate: "",
      hasNhi: true,
      nhiSameAsMain: false,
      nhiMethod: "agent_window",
    });
    expect(r).toHaveLength(3);
    expect(r[0]).toContain("外国人の氏名");
    expect(r[1]).toContain("受領方法：");
    expect(r[2]).toContain("国保税納税証明書の受領方法：");
  });
});

describe("extraSaveBlockers / nozei3SaveBlockers", () => {
  it("転出届・住民票: 氏名とフォームのエラー", () => {
    expect(extraSaveBlockers({ canEdit: true, personName: "A", formError: null })).toEqual([]);
    expect(extraSaveBlockers({ canEdit: true, personName: "", formError: "市役所を選んでください" })).toHaveLength(2);
    expect(extraSaveBlockers({ canEdit: false, personName: "", formError: "x" })).toHaveLength(1);
  });
  it("納税証明書その3: 税務署マスタ未登録 / 税務署未選択", () => {
    expect(nozei3SaveBlockers({ canEdit: true, personName: "A", taxOfficeSelected: true, hasTaxOffices: true })).toEqual([]);
    expect(nozei3SaveBlockers({ canEdit: true, personName: "A", taxOfficeSelected: false, hasTaxOffices: false })[0]).toContain("税務署マスタ");
    expect(nozei3SaveBlockers({ canEdit: true, personName: "A", taxOfficeSelected: false, hasTaxOffices: true })[0]).toContain("投函先の税務署");
  });
});
