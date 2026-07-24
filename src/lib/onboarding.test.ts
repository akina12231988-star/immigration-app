import { describe, expect, it } from "vitest";
import {
  buildOnboardingMail,
  formatDateSlash,
  isPendingDocAlert,
  isPendingDocOverdue,
  onboardingDocDefs,
  onboardingDownloadName,
  onboardingPdfName,
  reiwaYear,
} from "./onboarding";

describe("onboardingDocDefs", () => {
  it("11種の書類に1始まりの番号を振る", () => {
    const defs = onboardingDocDefs("2026-07-22");
    expect(defs).toHaveLength(11);
    expect(defs[0]).toMatchObject({ key: "zairyu", label: "在留カード", num: 1 });
    expect(defs[10].num).toBe(11);
  });
  it("源泉徴収票のラベルは令和年で変わる", () => {
    expect(reiwaYear("2026-07-22")).toBe(8);
    const gensen = onboardingDocDefs("2026-07-22").find((d) => d.key === "gensen");
    expect(gensen?.label).toBe("令和8年分源泉徴収票");
  });
});

describe("formatDateSlash", () => {
  it("YYYY/MM/DD に整形する", () => {
    expect(formatDateSlash("2026-07-05")).toBe("2026/07/05");
  });
  it("未入力は空欄（全角スペース）", () => {
    expect(formatDateSlash(null)).toBe("　　　　");
    expect(formatDateSlash("")).toBe("　　　　");
  });
});

describe("buildOnboardingMail", () => {
  const base = {
    workerName: "CHHOURN SOMONNY",
    orgName: "有限会社 國崎青果",
    honorific: "御中" as const,
    employmentStartOn: "2026-08-01",
    office: "熊本",
    residence: "社宅",
    sender: "野口",
    extraNote: "",
    docs: [
      { num: 1, label: "在留カード", status: "添付" as const, note: "" },
      { num: 2, label: "指定書", status: "後送" as const, note: "来週発送" },
      { num: 3, label: "マイナンバー", status: "未入手" as const, note: "" },
      { num: 4, label: "履歴書", status: "対象外" as const, note: "" },
    ],
  };

  it("宛名・基本情報・3区分を組み立てる", () => {
    const mail = buildOnboardingMail(base);
    expect(mail).toContain("有限会社 國崎青果 御中");
    expect(mail).toContain("CHHOURN SOMONNYさんの下記の該当する資料を添付いたします。");
    expect(mail).toContain("雇用開始年月日：2026/08/01");
    expect(mail).toContain("配属先の営業所：熊本");
    expect(mail).toContain("居住地：社宅");
    expect(mail).toContain("【添付資料】\n1. 在留カード");
    expect(mail).toContain("【後送予定】\n2. 指定書→来週発送");
    expect(mail).toContain("【未入手】\n3. マイナンバー");
    expect(mail.endsWith("ご確認のほどよろしくお願いします。\n\n野口")).toBe(true);
  });

  it("対象外はどの区分にも載せない", () => {
    expect(buildOnboardingMail(base)).not.toContain("履歴書");
  });

  it("宛名未入力なら宛名行を出さない・追記事項は結びの前に入る", () => {
    const mail = buildOnboardingMail({ ...base, orgName: "", extraNote: "裏面は転入後に送付します。" });
    expect(mail.startsWith("お世話になっております。")).toBe(true);
    expect(mail).toContain("裏面は転入後に送付します。\n\nご確認のほど");
  });
});

describe("onboardingDownloadName", () => {
  it("氏名_書類名＋元の拡張子", () => {
    expect(onboardingDownloadName("CHHOURN SOMONNY", "在留カード", "scan.pdf")).toBe(
      "CHHOURN_SOMONNY_在留カード.pdf",
    );
  });
  it("括弧の補足と使えない文字を除く", () => {
    expect(
      onboardingDownloadName("NGUYEN VAN A", "申請書類一式（雇用契約書・雇用条件書含む）", "a.JPG"),
    ).toBe("NGUYEN_VAN_A_申請書類一式.jpg");
  });
  it("拡張子が不明なら付けない", () => {
    expect(onboardingDownloadName("A", "指定書", "noext")).toBe("A_指定書");
  });
});

describe("onboardingPdfName", () => {
  it("元の拡張子に関わらず .pdf を付ける", () => {
    expect(onboardingPdfName("CHHOURN SOMONNY", "在留カード")).toBe("CHHOURN_SOMONNY_在留カード.pdf");
  });
  it("括弧の補足と使えない文字を除く", () => {
    expect(onboardingPdfName("NGUYEN VAN A", "申請書類一式（雇用契約書・雇用条件書含む）")).toBe(
      "NGUYEN_VAN_A_申請書類一式.pdf",
    );
  });
});

describe("後送アラート", () => {
  it("後送かつ未受領のみ対象", () => {
    expect(isPendingDocAlert({ status: "後送", received_on: null })).toBe(true);
    expect(isPendingDocAlert({ status: "後送", received_on: "2026-07-01" })).toBe(false);
    expect(isPendingDocAlert({ status: "添付", received_on: null })).toBe(false);
  });
  it("期日を過ぎたら超過（当日は超過でない・未設定は超過扱いしない）", () => {
    expect(isPendingDocOverdue("2026-07-21", "2026-07-22")).toBe(true);
    expect(isPendingDocOverdue("2026-07-22", "2026-07-22")).toBe(false);
    expect(isPendingDocOverdue(null, "2026-07-22")).toBe(false);
  });
});
