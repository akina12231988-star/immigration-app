import { describe, expect, it } from "vitest";
import {
  applicantLabel,
  isSelfOnlyMunicipality,
  juminhyoTitle,
  mailedDocTitles,
  mainMailedTitles,
  moneyOrderNo,
  moneyOrderSummary,
  nhiMailedTitles,
  requestKindLabel,
  syncMoneyOrders,
  type MoneyOrder,
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

describe("定額小為替", () => {
  it("番号は前半-後半でつなぐ（未入力なら空）", () => {
    expect(moneyOrderNo({ first: "12345", second: "67890" })).toBe("12345-67890");
    expect(moneyOrderNo({ first: "", second: "" })).toBe("");
  });

  it("郵送請求する証明書の数だけ行を作る", () => {
    const rows = syncMoneyOrders(["課税証明書（前年度分）", "納税証明書（前年度分）"]);
    expect(rows).toHaveLength(2);
    expect(rows[0].docTitle).toBe("課税証明書（前年度分）");
    expect(rows[1].first).toBe("");
  });

  it("入力済みの番号は同じ証明書の行に引き継ぐ", () => {
    const first = syncMoneyOrders(["課税証明書（前年度分）"]);
    first[0].first = "12345";
    first[0].second = "67890";
    const next = syncMoneyOrders(
      ["課税証明書（前年度分）", "納税証明書（前年度分）"],
      first,
    );
    expect(moneyOrderNo(next[0])).toBe("12345-67890");
    expect(moneyOrderNo(next[1])).toBe("");
  });

  it("証明書が減っても、番号が入っている行は残す", () => {
    const rows = syncMoneyOrders(
      [],
      [{ id: "a", docTitle: "課税証明書（前年度分）", first: "1", second: "2" }],
    );
    expect(rows).toHaveLength(1);
  });

  it("住民票は請求する通数だけ小為替の行を作る", () => {
    expect(
      mailedDocTitles({
        requestKind: "juminhyo",
        juminhyoMethod: "mail",
        juminhyoMyNumber: false,
        juminhyoCopies: 2,
      }),
    ).toEqual([
      "住民票の写し（個人番号の記載なし）（1通目）",
      "住民票の写し（個人番号の記載なし）（2通目）",
    ]);
    expect(
      mailedDocTitles({ requestKind: "juminhyo", juminhyoMethod: "mail", juminhyoCopies: 1 }),
    ).toEqual(["住民票の写し（個人番号の記載なし）"]);
  });

  it("転出届は手数料がかからないので自動では行を作らない", () => {
    expect(mailedDocTitles({ requestKind: "tenshutsu", requestMethod: "mail" })).toEqual([]);
  });

  it("窓口で受け取るものは小為替の対象にしない", () => {
    expect(
      mailedDocTitles({
        requestMethod: "window",
        docs: [{ title: "課税証明書（前年度分）", meta: "", starred: false }],
      }),
    ).toEqual([]);
    expect(
      mailedDocTitles({ requestKind: "juminhyo", juminhyoMethod: "window" }),
    ).toEqual([]);
  });

  it("課税証明書と市県民税納税証明書で1行ずつ作る（判定結果に納税証明書が無くても）", () => {
    expect(
      mainMailedTitles({
        requestMethod: "mail",
        yearType: "prev",
        docs: [{ title: "課税証明書（前年度分）", meta: "", starred: false }],
      }),
    ).toEqual(["課税証明書（前年度分）", "市県民税納税証明書（前年度分）"]);
  });

  it("国保は受領方法に従い、国保の欄の分として1行作る", () => {
    const docs = [
      { title: "課税証明書（前年度分）", meta: "", starred: false },
      { title: "国民健康保険税 納税証明書", meta: "", starred: false, isNhi: true },
    ];
    expect(
      nhiMailedTitles({ requestMethod: "mail", hasNhi: true, nhiSameAsMain: true, docs }),
    ).toEqual(["国民健康保険税 納税証明書"]);
    expect(
      nhiMailedTitles({
        requestMethod: "mail",
        hasNhi: true,
        nhiSameAsMain: false,
        nhiRequestMethod: "window",
        docs,
      }),
    ).toEqual([]);
  });

  it("手で追加した行は、番号が空でも消えない", () => {
    const added: MoneyOrder[] = [
      {
        id: "mo-main-extra-1",
        docTitle: "課税証明書（前年度分）",
        first: "",
        second: "",
        group: "main",
        extra: true,
      },
    ];
    const rows = syncMoneyOrders(["課税証明書（前年度分）"], added, "main");
    expect(rows).toHaveLength(2);
    expect(rows[1].extra).toBe(true);
  });

  it("金額を入れると合計を出す", () => {
    expect(
      moneyOrderSummary([
        { id: "a", docTitle: "課税証明書", first: "1", second: "2", amount: "300" },
        { id: "b", docTitle: "納税証明書", first: "3", second: "4", amount: "400" },
      ]),
    ).toBe("定額小為替 2枚（番号入力済み 2枚）・合計 700円");
  });

  it("一覧に出す一言は枚数と入力済み枚数を出す", () => {
    expect(
      moneyOrderSummary([
        { id: "a", docTitle: "課税証明書", first: "1", second: "2" },
        { id: "b", docTitle: "納税証明書", first: "", second: "" },
      ]),
    ).toBe("定額小為替 2枚（番号入力済み 1枚）");
    expect(moneyOrderSummary([])).toBe("");
  });
});
