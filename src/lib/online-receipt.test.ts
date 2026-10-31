import { describe, expect, it } from "vitest";
import type { ApplicationFile } from "@/types/application";
import {
  needsOnlineReceiptNumber,
  onlineReceiptReportText,
  onlineReceiptStage,
  onlineReceiptSummary,
  receiptSlipFiles,
  waitingReceiptNumber,
} from "./online-receipt";

describe("onlineReceiptStage / onlineReceiptSummary（オンライン申請の受付メール3通）", () => {
  it("何も入っていなければ none", () => {
    expect(onlineReceiptStage({})).toBe("none");
    expect(onlineReceiptSummary({ applicationNumber: "" })).toBe("受付メールの内容が未入力です");
    expect(waitingReceiptNumber({})).toBe(true);
  });

  it("1通目（整理番号・申請種別・リンク）だけなら mail1 で、2通目（仮番号）待ちと出す", () => {
    expect(onlineReceiptStage({ onlineRefNo: "650468319129" })).toBe("mail1");
    expect(onlineReceiptStage({ onlineAppType: "在留資格変更許可申請（区分V）" })).toBe("mail1");
    expect(onlineReceiptStage({ emailLink: "https://mail.example/1" })).toBe("mail1");
    expect(onlineReceiptSummary({ onlineRefNo: "650468319129" })).toBe("整理番号 650468319129・2通目・3通目のメール（申請受付番号）待ち");
    expect(onlineReceiptSummary({ emailLink: "https://mail.example/1" })).toBe("2通目・3通目のメール（申請受付番号）待ち");
  });

  it("2通目（仮番号・受付日・在留カード等番号・リンク）が入れば mail2 で、3通目（受付番号）待ち", () => {
    expect(onlineReceiptStage({ onlineRefNo: "1", onlineTempNo: "95820260000440638-00" })).toBe("mail2");
    expect(onlineReceiptStage({ onlineReceivedOn: "2026-10-28" })).toBe("mail2");
    expect(onlineReceiptStage({ onlineCardNo: "LJ41245695EA" })).toBe("mail2");
    expect(onlineReceiptStage({ onlineMail2Link: "https://mail.example/2" })).toBe("mail2");
    expect(onlineReceiptSummary({ onlineTempNo: "95820260000440638-00" })).toBe("仮番号 95820260000440638-00・3通目のメール（申請受付番号）待ち");
    expect(waitingReceiptNumber({ onlineTempNo: "95820260000440638-00" })).toBe(true);
  });

  it("3通目（申請受付番号）が入れば mail3", () => {
    expect(onlineReceiptStage({ onlineTempNo: "x", applicationNumber: "札オンＣＶ26004241" })).toBe("mail3");
    expect(onlineReceiptSummary({ applicationNumber: "札オンＣＶ26004241" })).toBe("申請受付番号 札オンＣＶ26004241");
    expect(waitingReceiptNumber({ applicationNumber: "札オンＣＶ26004241" })).toBe(false);
    // 3通目のリンクだけ入って受付番号が空なら、受付番号の未入力を出す
    expect(onlineReceiptStage({ onlineMail3Link: "https://mail.example/3" })).toBe("mail3");
    expect(onlineReceiptSummary({ onlineMail3Link: "https://mail.example/3", applicationNumber: "" })).toBe("3通目は届いていますが申請受付番号が未入力です");
  });
});

describe("needsOnlineReceiptNumber（申請受付番号の入力待ち）", () => {
  const base = { method: "オンライン" as const, applicationNumber: "", lineReported: false, status: "申請済" as const, approved: false };
  it("オンライン申請で申請受付番号が無く、LINE報告前なら入力待ち", () => {
    expect(needsOnlineReceiptNumber(base)).toBe(true);
  });
  it("申請受付番号が入った・窓口申請・LINE報告済み・取下げ・許可済みなら入力待ちにしない", () => {
    expect(needsOnlineReceiptNumber({ ...base, applicationNumber: "福オンＣＶ26010055" })).toBe(false);
    expect(needsOnlineReceiptNumber({ ...base, applicationNumber: "  " })).toBe(true);
    expect(needsOnlineReceiptNumber({ ...base, method: "窓口" })).toBe(false);
    expect(needsOnlineReceiptNumber({ ...base, lineReported: true })).toBe(false);
    expect(needsOnlineReceiptNumber({ ...base, status: "取下げ" })).toBe(false);
    expect(needsOnlineReceiptNumber({ ...base, status: "申請前" })).toBe(false);
    expect(needsOnlineReceiptNumber({ ...base, approved: true })).toBe(false);
  });
});

describe("receiptSlipFiles（受付票として出す画像）", () => {
  const f = (id: string, kind: ApplicationFile["kind"]) => ({ id, kind }) as ApplicationFile;
  const files = [f("1", "受付票"), f("2", "受付番号メール"), f("3", "受付完了メール"), f("4", "通知書")];
  it("オンライン申請は3通目のスクリーンショットも受付票に出す", () => {
    expect(receiptSlipFiles("オンライン", files).map((x) => x.id)).toEqual(["1", "2"]);
  });
  it("窓口申請は受付票だけ", () => {
    expect(receiptSlipFiles("窓口", files).map((x) => x.id)).toEqual(["1"]);
  });
});

describe("onlineReceiptReportText（申請受付番号の報告文）", () => {
  it("氏名・申請種別・申請受付日・申請受付番号を並べる", () => {
    expect(
      onlineReceiptReportText({
        name: "LE VAN KHOA",
        applicationNumber: "福オンＣＶ26010055",
        onlineAppType: "資格変更（特定技能）",
        onlineReceivedOn: "2026-10-30",
        applicationDate: "2026-10-29",
      }),
    ).toBe(
      "LE VAN KHOAさん\nオンライン申請の申請受付番号が届きました。\n\n申請種別: 資格変更（特定技能）\n申請受付日: 2026年10月30日\n申請受付番号: 福オンＣＶ26010055",
    );
  });
  it("申請種別が無ければ省き、申請受付日が無ければ申請日を使う", () => {
    expect(
      onlineReceiptReportText({ name: "A", applicationNumber: "X1", onlineAppType: "", applicationDate: "2026-10-29" }),
    ).toBe("Aさん\nオンライン申請の申請受付番号が届きました。\n\n申請受付日: 2026年10月29日\n申請受付番号: X1");
  });
});
