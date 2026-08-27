import { describe, expect, it } from "vitest";
import {
  countFollowupAlerts,
  countPassportAlerts,
  type NavAlertWorker,
} from "@/lib/nav-alert-counts";

const TODAY = "2026-08-27";

const w = (patch: Partial<NavAlertWorker> = {}): NavAlertWorker => ({
  support: "支援対象",
  status: "在籍中",
  passport_expiry_date: null,
  ...patch,
});

describe("countPassportAlerts", () => {
  it("有効期限まで半年以内の人を数える", () => {
    const rows = [
      w({ passport_expiry_date: "2026-10-01" }), // 半年以内 → 数える
      w({ passport_expiry_date: "2026-08-01" }), // 超過 → 数える
      w({ passport_expiry_date: "2027-06-01" }), // まだ先 → 数えない
    ];
    expect(countPassportAlerts(rows, TODAY)).toBe(2);
  });

  it("有効期限が未登録の人は、取得で絞り込まなくても数えない", () => {
    // 取得のときの .not("passport_expiry_date","is",null) を外しても件数が変わらないこと
    const rows = [w({ passport_expiry_date: null }), w({ passport_expiry_date: "2026-10-01" })];
    expect(countPassportAlerts(rows, TODAY)).toBe(1);
  });

  it("支援対象・在籍中でない人は数えない", () => {
    const rows = [
      w({ passport_expiry_date: "2026-10-01", support: "支援開始前" }),
      w({ passport_expiry_date: "2026-10-01", status: "退職" }),
      w({ passport_expiry_date: "2026-10-01" }),
    ];
    expect(countPassportAlerts(rows, TODAY)).toBe(1);
  });

  it("誰もいなくても0", () => {
    expect(countPassportAlerts([], TODAY)).toBe(0);
  });
});

describe("countFollowupAlerts", () => {
  it("残っている手続きがある人を数える", () => {
    const rows = [
      w({ followups: { moving: { needed: true } } }),
      w({ followups: { kokuho: { needed: true } } }),
      w(),
    ];
    expect(countFollowupAlerts(rows)).toBe(2);
  });

  it("終わっている人は数えない", () => {
    const rows = [
      w({ followups: { moving: { needed: true, status: "完了" } } }),
      w({ followups: { kokuho: { needed: true, kokuho_done: true, nenkin_done: true } } }),
    ];
    expect(countFollowupAlerts(rows)).toBe(0);
  });

  it("退職した人は数えない", () => {
    const rows = [w({ status: "退職", followups: { moving: { needed: true } } })];
    expect(countFollowupAlerts(rows)).toBe(0);
  });

  it("0119 が未適用（followups が無い）でも落ちずに0", () => {
    expect(countFollowupAlerts([w(), w({ followups: undefined })])).toBe(0);
  });

  it("支援区分は見ない（支援開始前でも手続きは残る）", () => {
    const rows = [w({ support: "支援開始前", followups: { kokuho: { needed: true } } })];
    expect(countFollowupAlerts(rows)).toBe(1);
  });
});
