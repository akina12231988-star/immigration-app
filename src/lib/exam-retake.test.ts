import { describe, expect, it } from "vitest";
import { daysUntilRetake, examDateTooEarly, examRetake } from "./exam-retake";

describe("examRetake（不合格のあと次に受けられる日）", () => {
  it("受験日の翌日から45日間は受けられず、46日後から申し込める", () => {
    expect(examRetake("2026-10-30")).toEqual({ waitFrom: "2026-10-31", waitUntil: "2026-12-14", availableOn: "2026-12-15" });
    // 月・年をまたぐ
    expect(examRetake("2026-12-20")?.availableOn).toBe("2027-02-04");
    // うるう年
    expect(examRetake("2028-01-20")?.availableOn).toBe("2028-03-06");
  });
  it("受験日が無い・形がおかしいときは null", () => {
    expect(examRetake("")).toBeNull();
    expect(examRetake(null)).toBeNull();
    expect(examRetake("2026/10/30")).toBeNull();
  });
});

describe("daysUntilRetake", () => {
  it("申し込める日まであと何日か。その日以降は 0", () => {
    expect(daysUntilRetake("2026-12-15", "2026-11-01")).toBe(44);
    expect(daysUntilRetake("2026-12-15", "2026-12-15")).toBe(0);
    expect(daysUntilRetake("2026-12-15", "2026-12-20")).toBe(0);
  });
});

describe("examDateTooEarly", () => {
  it("次の回の試験日が申し込める日より前なら true", () => {
    expect(examDateTooEarly("2026-12-14", "2026-12-15")).toBe(true);
    expect(examDateTooEarly("2026-12-15", "2026-12-15")).toBe(false);
    expect(examDateTooEarly("", "2026-12-15")).toBe(false);
    expect(examDateTooEarly("2026-12-01", null)).toBe(false);
  });
});
