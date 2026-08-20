import { describe, expect, it } from "vitest";
import { isResidenceRenewalTarget, isSswInsuranceRenewalTarget } from "./worker-alerts";
import type { Worker } from "@/types/db";

const TODAY = "2026-07-30";

function makeWorker(over: Partial<Worker>): Worker {
  return {
    id: "w1",
    name: "NGUYEN TEST",
    status: "在籍中",
    ssw_insurance_expiry_date: null,
    residence_expiry_date: null,
    ...over,
  } as Worker;
}

describe("isSswInsuranceRenewalTarget", () => {
  it("有効期限まで1か月以内なら対象", () => {
    expect(
      isSswInsuranceRenewalTarget(
        makeWorker({ ssw_insurance_expiry_date: "2026-08-30" }),
        TODAY,
      ),
    ).toBe(true);
  });

  it("有効期限を過ぎていても対象", () => {
    expect(
      isSswInsuranceRenewalTarget(
        makeWorker({ ssw_insurance_expiry_date: "2026-07-01" }),
        TODAY,
      ),
    ).toBe(true);
  });

  it("有効期限まで1か月より先なら対象外", () => {
    expect(
      isSswInsuranceRenewalTarget(
        makeWorker({ ssw_insurance_expiry_date: "2026-08-31" }),
        TODAY,
      ),
    ).toBe(false);
  });

  it("期限未登録は対象外", () => {
    expect(
      isSswInsuranceRenewalTarget(makeWorker({ ssw_insurance_expiry_date: null }), TODAY),
    ).toBe(false);
  });

  it("退職者は対象外", () => {
    expect(
      isSswInsuranceRenewalTarget(
        makeWorker({ status: "退職", ssw_insurance_expiry_date: "2026-07-01" }),
        TODAY,
      ),
    ).toBe(false);
  });
});

describe("isResidenceRenewalTarget", () => {
  it("在留期限まで4か月以内なら対象（前もって準備できるよう4か月前から）", () => {
    expect(
      isResidenceRenewalTarget(makeWorker({ residence_expiry_date: "2026-11-30" }), TODAY),
    ).toBe(true);
  });

  it("在留期限まで4か月より先なら対象外", () => {
    expect(
      isResidenceRenewalTarget(makeWorker({ residence_expiry_date: "2026-12-01" }), TODAY),
    ).toBe(false);
  });

  it("在留期限を過ぎていても対象", () => {
    expect(
      isResidenceRenewalTarget(makeWorker({ residence_expiry_date: "2026-07-01" }), TODAY),
    ).toBe(true);
  });

  it("期限未登録は対象外", () => {
    expect(isResidenceRenewalTarget(makeWorker({ residence_expiry_date: null }), TODAY)).toBe(false);
  });

  it("退職者は対象外", () => {
    expect(
      isResidenceRenewalTarget(
        makeWorker({ status: "退職", residence_expiry_date: "2026-08-01" }),
        TODAY,
      ),
    ).toBe(false);
  });
});
