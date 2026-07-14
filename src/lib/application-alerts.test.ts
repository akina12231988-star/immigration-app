import { describe, expect, it } from "vitest";
import { isExpiryAlert, oneMonthAfter, countExpiryAlerts } from "./application-alerts";
import type { Application } from "@/types/application";

function makeApp(over: Partial<Application>): Application {
  return {
    id: "1",
    workerId: null,
    organizationId: null,
    name: "テスト",
    applicationDate: "2026-01-01",
    applicationNumber: "1",
    applicationContent: "在留期間の更新許可",
    method: "窓口",
    emailLink: "",
    isSelfApply: false,
    reportOrgHonorific: "御中",
    approvalReported: false,
    lineReported: false,
    notionSynced: false,
    approved: false,
    status: "申請済",
    assignee: "担当",
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

describe("oneMonthAfter", () => {
  it("1か月後を返す", () => {
    expect(oneMonthAfter("2026-03-15")).toBe("2026-04-15");
  });
});

describe("isExpiryAlert", () => {
  it("在留期限+1か月を過ぎ、未受取ならアラート", () => {
    const app = makeApp({ residenceExpiryAtApply: "2026-03-01" });
    expect(isExpiryAlert(app, "2026-04-02")).toBe(true);
  });

  it("1か月経過前はアラートにならない", () => {
    const app = makeApp({ residenceExpiryAtApply: "2026-03-01" });
    expect(isExpiryAlert(app, "2026-03-20")).toBe(false);
  });

  it("在留カード受領済みは対象外", () => {
    const app = makeApp({ residenceExpiryAtApply: "2026-03-01", status: "在留カード受領" });
    expect(isExpiryAlert(app, "2026-06-01")).toBe(false);
  });

  it("取下げは対象外", () => {
    const app = makeApp({ residenceExpiryAtApply: "2026-03-01", status: "取下げ" });
    expect(isExpiryAlert(app, "2026-06-01")).toBe(false);
  });

  it("申請時点在留期限が未登録なら判定しない", () => {
    const app = makeApp({});
    expect(isExpiryAlert(app, "2026-06-01")).toBe(false);
  });

  it("countExpiryAlerts は該当件数を返す", () => {
    const apps = [
      makeApp({ id: "a", residenceExpiryAtApply: "2026-01-01" }),
      makeApp({ id: "b", residenceExpiryAtApply: "2026-01-01", status: "在留カード受領" }),
      makeApp({ id: "c" }),
    ];
    expect(countExpiryAlerts(apps, "2026-05-01")).toBe(1);
  });
});
