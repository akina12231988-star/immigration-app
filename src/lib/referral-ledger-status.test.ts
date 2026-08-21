import { describe, expect, it } from "vitest";
import {
  countMissingFromReferralLedger,
  isMissingFromReferralLedger,
  referralLedgerStatus,
  referralWorkerOrgKey,
  type ReferralLedgerRow,
} from "./referral-ledger-status";

const row = (over: Partial<ReferralLedgerRow> = {}): ReferralLedgerRow => ({
  id: "a1",
  worker_id: "w1",
  organization_id: "o1",
  result: "採用",
  ...over,
});

const NONE = new Set<string>();

describe("referralLedgerStatus", () => {
  it("採用ではない応募は対象外（台帳に載せる応募ではない）", () => {
    for (const result of ["選考中", "不採用", "辞退"]) {
      expect(referralLedgerStatus(row({ result }), {}, NONE)).toBe("対象外");
    }
  });

  it("この応募と紐づく台帳の行があれば追加済み", () => {
    expect(referralLedgerStatus(row(), { a1: { feeId: "f1" } }, NONE)).toBe("追加済み");
  });

  it("採用なのに台帳に見当たらなければ未追加", () => {
    expect(referralLedgerStatus(row(), {}, NONE)).toBe("未追加");
  });

  it("紐づいていなくても、同じ人・同じ会社の行が台帳にあれば別行あり", () => {
    const keys = new Set([referralWorkerOrgKey("w1", "o1")]);
    expect(referralLedgerStatus(row(), {}, keys)).toBe("別行あり");
  });

  it("同じ人でも会社が違えば未追加のまま", () => {
    const keys = new Set([referralWorkerOrgKey("w1", "o2")]);
    expect(referralLedgerStatus(row(), {}, keys)).toBe("未追加");
  });

  it("他の応募と紐づいているだけでは追加済みにしない", () => {
    expect(referralLedgerStatus(row(), { a2: { feeId: "f1" } }, NONE)).toBe("未追加");
  });
});

describe("isMissingFromReferralLedger", () => {
  it("未追加のときだけ true", () => {
    expect(isMissingFromReferralLedger(row(), {}, NONE)).toBe(true);
    expect(isMissingFromReferralLedger(row(), { a1: { feeId: "f1" } }, NONE)).toBe(false);
    expect(isMissingFromReferralLedger(row({ result: "選考中" }), {}, NONE)).toBe(false);
  });
});

describe("countMissingFromReferralLedger", () => {
  it("採用のうち、台帳に見当たらない件数を数える", () => {
    const rows = [
      row({ id: "a1" }), // 未追加
      row({ id: "a2", worker_id: "w2" }), // 追加済み
      row({ id: "a3", worker_id: "w3" }), // 別行あり
      row({ id: "a4", worker_id: "w4", result: "不採用" }), // 対象外
      row({ id: "a5", worker_id: "w5" }), // 未追加
    ];
    const keys = new Set([referralWorkerOrgKey("w3", "o1")]);
    expect(countMissingFromReferralLedger(rows, { a2: { feeId: "f1" } }, keys)).toBe(2);
  });

  it("応募が無ければ0件", () => {
    expect(countMissingFromReferralLedger([], {}, NONE)).toBe(0);
  });
});

describe("referralWorkerOrgKey", () => {
  it("外国人と所属機関の組み合わせで1つの鍵になる", () => {
    expect(referralWorkerOrgKey("w1", "o1")).toBe(referralWorkerOrgKey("w1", "o1"));
    expect(referralWorkerOrgKey("w1", "o1")).not.toBe(referralWorkerOrgKey("w1", "o2"));
  });

  it("台帳の行で外国人・所属機関が空でも鍵を作れる（応募の鍵とはぶつからない）", () => {
    expect(referralWorkerOrgKey(null, null)).toBe("|");
    expect(referralWorkerOrgKey(null, "o1")).not.toBe(referralWorkerOrgKey("w1", "o1"));
  });
});
