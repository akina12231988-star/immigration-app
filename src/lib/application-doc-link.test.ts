import { describe, expect, it } from "vitest";
import {
  applicationDocWindow,
  isDocInWindow,
  isLinkedDocKind,
  permitDateOf,
  type DocLinkApp,
} from "./application-doc-link";

const app = (over: Partial<DocLinkApp> & { id: string; applicationDate: string }): DocLinkApp => ({
  grantedPermitDate: null,
  approvalDate: null,
  withdrawnOn: null,
  ...over,
});

describe("applicationDocWindow（申請の許可の期間）", () => {
  const a1 = app({ id: "a1", applicationDate: "2025-09-01", grantedPermitDate: "2025-10-22" });
  const a2 = app({ id: "a2", applicationDate: "2026-09-10", grantedPermitDate: "2026-10-22" });
  const a3 = app({ id: "a3", applicationDate: "2027-09-01" }); // まだ許可が出ていない

  it("開始は在留許可日。次の許可日が上限（その日は含まない）", () => {
    expect(applicationDocWindow(a1, [a1, a2, a3])).toEqual({ start: "2025-10-22", end: "2026-10-22" });
    expect(applicationDocWindow(a2, [a1, a2, a3])).toEqual({ start: "2026-10-22", end: null });
  });

  it("許可日が無ければ申請日から。取下げた申請は次の許可とみなさない", () => {
    const withdrawn = app({ id: "w", applicationDate: "2026-01-01", grantedPermitDate: "2026-02-01", withdrawnOn: "2026-02-10" });
    expect(applicationDocWindow(a3, [a1, a2, a3])).toEqual({ start: "2027-09-01", end: null });
    expect(applicationDocWindow(a1, [a1, withdrawn, a2])).toEqual({ start: "2025-10-22", end: "2026-10-22" });
  });

  it("在留許可日が無ければ許可日（フロー用）を使う。次の許可日が開始より前なら上限を付けない", () => {
    const b = app({ id: "b", applicationDate: "2026-01-01", approvalDate: "2026-02-01" });
    const odd = app({ id: "odd", applicationDate: "2026-03-01", grantedPermitDate: "2026-01-15" });
    expect(permitDateOf(b)).toBe("2026-02-01");
    expect(applicationDocWindow(b, [b, odd])).toEqual({ start: "2026-02-01", end: null });
  });
});

describe("isDocInWindow / isLinkedDocKind", () => {
  it("開始以上・上限未満だけ入る", () => {
    const w = { start: "2025-10-22", end: "2026-10-22" };
    expect(isDocInWindow("2025-10-22", w)).toBe(true);
    expect(isDocInWindow("2026-10-21", w)).toBe(true);
    expect(isDocInWindow("2026-10-22", w)).toBe(false);
    expect(isDocInWindow("2025-10-21", w)).toBe(false);
    expect(isDocInWindow("", w)).toBe(false);
    expect(isDocInWindow("2030-01-01", { start: "2025-10-22", end: null })).toBe(true);
  });

  it("紐づける種別は在留カード・照合結果・指定書だけ", () => {
    expect(isLinkedDocKind("在留カード")).toBe(true);
    expect(isLinkedDocKind("照合結果")).toBe(true);
    expect(isLinkedDocKind("指定書")).toBe(true);
    expect(isLinkedDocKind("受付票")).toBe(false);
  });
});
