import { describe, expect, it } from "vitest";
import { addressOnDate, reiwaJan1, type WorkerAddress } from "./worker-address";

function addr(moved_on: string, address: string): WorkerAddress {
  return { id: moved_on, worker_id: "w", moved_on, address, kind: "", note: "", created_at: "" };
}

const HISTORY = [
  addr("2024-03-08", "A住所"),
  addr("2025-11-05", "B住所"),
  addr("2026-05-05", "C住所"),
];

describe("reiwaJan1", () => {
  it("令和年の1月1日（西暦）を返す", () => {
    expect(reiwaJan1(7)).toBe("2025-01-01");
    expect(reiwaJan1(6)).toBe("2024-01-01");
  });
});

describe("addressOnDate", () => {
  it("基準日以前で最も新しい住所を返す", () => {
    // 令和7年度課税 → 2025-01-01 時点は A住所（B住所への転入は2025-11-05）
    expect(addressOnDate(HISTORY, "2025-01-01")?.address).toBe("A住所");
    // 令和8年度課税 → 2026-01-01 時点は B住所
    expect(addressOnDate(HISTORY, "2026-01-01")?.address).toBe("B住所");
    // 直近
    expect(addressOnDate(HISTORY, "2026-06-01")?.address).toBe("C住所");
  });

  it("基準日より前の住所が無ければ null", () => {
    expect(addressOnDate(HISTORY, "2024-01-01")).toBeNull();
  });
});
