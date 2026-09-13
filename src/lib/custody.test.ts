import { describe, expect, it } from "vitest";
import {
  custodyRefNo,
  defaultExpireOn,
  formatStorageNo,
  nextFreeStorageNo,
  parseAzkLedger,
  receiptTranslation,
  CUSTODIAN_INFO,
  mergeCustodianInfo,
  mergeSupportOrgLists,
  supportOrgSettingValue,
} from "./custody";

describe("formatStorageNo", () => {
  it("3桁ゼロ埋めで表示する", () => {
    expect(formatStorageNo(1)).toBe("001");
    expect(formatStorageNo(42)).toBe("042");
    expect(formatStorageNo(999)).toBe("999");
  });
});

describe("nextFreeStorageNo", () => {
  it("最小の空き番号を返す", () => {
    expect(nextFreeStorageNo([])).toBe(1);
    expect(nextFreeStorageNo([1, 2, 4])).toBe(3);
    expect(nextFreeStorageNo([2, 3])).toBe(1);
  });
  it("全て使用中なら null", () => {
    const all = Array.from({ length: 999 }, (_, i) => i + 1);
    expect(nextFreeStorageNo(all)).toBeNull();
  });
});

describe("custodyRefNo", () => {
  it("AZK-YYYYMMDD-番号 の形式", () => {
    expect(custodyRefNo("2026-07-22", 7)).toBe("AZK-20260722-007");
  });
});

describe("defaultExpireOn", () => {
  it("預かった日の3ヶ月後", () => {
    expect(defaultExpireOn("2026-07-22")).toBe("2026-10-22");
    expect(defaultExpireOn("2026-11-30")).toBe("2027-02-28"); // 同じ日が無い月は月末に丸める
  });
  it("不正な日付は空文字", () => {
    expect(defaultExpireOn("")).toBe("");
    expect(defaultExpireOn("2026/07/22")).toBe("");
  });
});

describe("receiptTranslation", () => {
  it("国籍表記から言語を判定する", () => {
    expect(receiptTranslation("ベトナム")?.langLabel).toBe("ベトナム語");
    expect(receiptTranslation("Vietnam")?.langLabel).toBe("ベトナム語");
    expect(receiptTranslation("カンボジア")?.langLabel).toBe("クメール語");
    expect(receiptTranslation("インドネシア")?.langLabel).toBe("インドネシア語");
    expect(receiptTranslation("フィリピン")?.langLabel).toBe("タガログ語");
  });
  it("該当なしは null", () => {
    expect(receiptTranslation("日本")).toBeNull();
    expect(receiptTranslation("")).toBeNull();
  });
});

describe("parseAzkLedger", () => {
  it("azkバックアップの配列を取り込む", () => {
    const json = JSON.stringify([
      {
        boxno: "007",
        name: "PHAT CHANNY",
        nat: "カンボジア",
        cardno: "uh88121481rf",
        status: "特定技能1号",
        date: "2026-07-01",
        expire: "2026-10-01",
        content: "福岡出入局管理局への在留資格変更許可申請",
        refno: "AZK-20260701-1234",
        returned: false,
        returnedAt: null,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
      { boxno: "???", name: "番号なし" },
    ]);
    const { entries, skipped } = parseAzkLedger(json);
    expect(entries).toHaveLength(1);
    expect(skipped).toBe(1);
    expect(entries[0].boxno).toBe(7);
    expect(entries[0].cardno).toBe("UH88121481RF");
    expect(entries[0].returned).toBe(false);
  });

  it("配列以外・壊れたJSONはエラー", () => {
    expect(() => parseAzkLedger("{}")).toThrow();
    expect(() => parseAzkLedger("not json")).toThrow();
  });
});

describe("登録支援機関の情報（既定値と app_settings の上書き）", () => {
  it("上書きが無ければ既定値、あれば一部だけでもかぶせる。空文字は未登録として残す", () => {
    expect(mergeCustodianInfo(null)).toEqual({ ...CUSTODIAN_INFO });
    const m = mergeCustodianInfo({ supportStaffName: "秋吉 伽恋", tel: "", registeredOn: 123 as unknown as string });
    expect(m.supportStaffName).toBe("秋吉 伽恋");
    expect(m.tel).toBe("");
    expect(m.registeredOn).toBe(CUSTODIAN_INFO.registeredOn); // 文字列でない値は無視
    expect(m.officeName).toBe(CUSTODIAN_INFO.officeName);
  });
});

describe("登録支援機関の一覧（通訳者・申請取次者）", () => {
  it("未保存なら申請取次者は従来の1人分から作り、通訳者は空", () => {
    const lists = mergeSupportOrgLists(null);
    expect(lists.interpreters).toEqual([]);
    expect(lists.agents).toEqual([
      { name: CUSTODIAN_INFO.agentName, certNo: CUSTODIAN_INFO.agentCertNo, certExpiry: CUSTODIAN_INFO.agentCertExpiry },
    ]);
  });

  it("保存されている一覧を読み、空の行は捨てる", () => {
    const lists = mergeSupportOrgLists({
      interpreters: [{ language: "ベトナム語", name: "グエン" }, { language: "", name: "" }],
      agents: [{ name: "秋吉 伽恋", certNo: "受-1", certExpiry: "2027-06-18" }, { name: "山田", certNo: "", certExpiry: "" }],
    });
    expect(lists.interpreters).toEqual([{ language: "ベトナム語", name: "グエン" }]);
    expect(lists.agents.map((a) => a.name)).toEqual(["秋吉 伽恋", "山田"]);
  });

  it("保存する値には1人目の申請取次者を従来の欄にも入れる", () => {
    const v = supportOrgSettingValue(mergeCustodianInfo(null), {
      interpreters: [],
      agents: [{ name: "山田", certNo: "受-9", certExpiry: "2028-01-01" }],
    });
    expect(v.agentName).toBe("山田");
    expect(v.agentCertNo).toBe("受-9");
    expect(v.agentCertExpiry).toBe("2028-01-01");
    expect(v.agents).toHaveLength(1);
  });
});
