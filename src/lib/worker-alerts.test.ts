import { describe, expect, it } from "vitest";
import { isSswInsuranceRenewalTarget } from "./worker-alerts";
import type { Worker } from "@/types/db";

const TODAY = "2026-07-30";

function makeWorker(over: Partial<Worker>): Worker {
  return {
    id: "w1",
    name: "NGUYEN TEST",
    status: "在籍中",
    ssw_insurance_expiry_date: null,
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
