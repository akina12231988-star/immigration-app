import { describe, expect, it } from "vitest";
import { offListReason, type OffListWorker } from "./renewal-search";

const TODAY = "2026-08-20";

function makeOffListWorker(over: Partial<OffListWorker> = {}): OffListWorker {
  return {
    id: "w1",
    name: "NGUYEN VAN A",
    kana: "グエン ヴァン ア",
    status: "在籍中",
    residence_expiry_date: "2026-10-01",
    application_prep_kind: "",
    ...over,
  } as OffListWorker;
}

describe("offListReason", () => {
  const base = { today: TODAY, underReview: false, mode: "更新" as const };

  it("対象者になっている人は理由なし", () => {
    expect(offListReason(makeOffListWorker(), base)).toBeNull();
  });

  it("退職者はその旨を返す", () => {
    expect(offListReason(makeOffListWorker({ status: "退職" }), base)).toContain("退職");
  });

  it("申請審査中の人はその旨を返す", () => {
    expect(offListReason(makeOffListWorker(), { ...base, underReview: true })).toContain("審査中");
  });

  it("在留期限が4か月より先ならその旨と期限を返す", () => {
    const reason = offListReason(makeOffListWorker({ residence_expiry_date: "2027-03-01" }), base);
    expect(reason).toContain("4か月より先");
    expect(reason).toContain("2027-03-01");
  });

  it("在留期限のちょうど4か月前は対象者なので理由なし", () => {
    expect(offListReason(makeOffListWorker({ residence_expiry_date: "2026-12-20" }), base)).toBeNull();
  });

  it("新規で登録済みの人は新規タブへ案内する", () => {
    const reason = offListReason(makeOffListWorker({ application_prep_kind: "新規" }), base);
    expect(reason).toContain("新規");
  });

  it("在留期限が未登録ならその旨を返す", () => {
    const reason = offListReason(makeOffListWorker({ residence_expiry_date: null }), base);
    expect(reason).toContain("在留期限が未登録");
  });

  it("新規モードでは更新の対象者を更新タブへ案内する", () => {
    const reason = offListReason(makeOffListWorker(), { ...base, mode: "新規" });
    expect(reason).toContain("更新");
  });

  it("新規モードで新規登録済みの人は理由なし", () => {
    const w = makeOffListWorker({ application_prep_kind: "新規" });
    expect(offListReason(w, { ...base, mode: "新規" })).toBeNull();
  });
});
