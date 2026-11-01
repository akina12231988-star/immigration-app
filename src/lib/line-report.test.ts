import { describe, expect, it } from "vitest";
import { generateLineReport } from "./line-report";
import type { Application } from "@/types/application";

const base = {
  name: "CHUN SODALIS",
  organizationName: "村田敬一",
  reportOrgHonorific: "御中",
  applicationContent: "在留資格の変更許可",
  applicationNumber: "福オンＣＶ26010044",
  applicationDate: "2026-10-30",
  method: "オンライン",
  onlineAppType: "在留資格変更申請",
  onlineReceivedOn: "2026-10-30",
  onlineTempNo: "96720260000443452-00",
  onlineCardNo: "UH92913332RD",
} as unknown as Application;

describe("generateLineReport（LINE報告文・申請）", () => {
  it("オンライン申請で申請受付番号があれば、Messenger と同じ文面（3通目の内容）を宛名の下に入れる", () => {
    const t = generateLineReport(base);
    expect(t.startsWith("村田敬一 御中\n\nCHUN SODALISさん\nオンライン申請の申請受付番号が届きました。")).toBe(true);
    expect(t).toContain("申請人在留カード等番号（Number of the applicant's residence card, etc.）\nUH92913332RD");
    expect(t).toContain("申請受付番号（Application acceptance no.）\n福オンＣＶ26010044");
  });
  it("窓口申請・申請受付番号がまだ無いオンライン申請は今までの文面", () => {
    expect(generateLineReport({ ...base, method: "窓口" } as Application)).toContain("【受付番号】\n福オンＣＶ26010044");
    expect(generateLineReport({ ...base, applicationNumber: "" } as Application)).toContain("【受付番号】\n未登録");
  });
});
