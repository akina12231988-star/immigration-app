import { describe, expect, it } from "vitest";
import { onlineReceiptStage, onlineReceiptSummary, waitingSecondMail } from "./online-receipt";

describe("onlineReceiptStage / onlineReceiptSummary（オンライン申請の受付メール2通）", () => {
  it("何も入っていなければ none", () => {
    expect(onlineReceiptStage({})).toBe("none");
    expect(onlineReceiptSummary({ applicationNumber: "" })).toBe("受付メールの内容が未入力です");
    expect(waitingSecondMail({})).toBe(true);
  });

  it("1通目（整理番号・申請種別・リンク）だけなら mail1 で、2通目待ちと出す", () => {
    expect(onlineReceiptStage({ onlineRefNo: "650468319129" })).toBe("mail1");
    expect(onlineReceiptStage({ onlineAppType: "在留資格変更許可申請（区分V）" })).toBe("mail1");
    expect(onlineReceiptStage({ emailLink: "https://mail.example/1" })).toBe("mail1");
    expect(onlineReceiptSummary({ onlineRefNo: "650468319129" })).toBe("整理番号 650468319129・2通目のメール（申請受付番号）待ち");
    expect(onlineReceiptSummary({ emailLink: "https://mail.example/1" })).toBe("2通目のメール（申請受付番号）待ち");
    expect(waitingSecondMail({ onlineRefNo: "650468319129" })).toBe(true);
  });

  it("2通目（申請受付番号・仮番号・受付日）が入れば mail2", () => {
    expect(onlineReceiptStage({ onlineRefNo: "1", applicationNumber: "福熊E91422号" })).toBe("mail2");
    expect(onlineReceiptSummary({ applicationNumber: "福熊E91422号" })).toBe("申請受付番号 福熊E91422号");
    expect(waitingSecondMail({ applicationNumber: "福熊E91422号" })).toBe(false);
    // 仮番号だけ入って受付番号が空なら、受付番号の未入力を出す
    expect(onlineReceiptStage({ onlineTempNo: "T-123" })).toBe("mail2");
    expect(onlineReceiptSummary({ onlineTempNo: "T-123", applicationNumber: "" })).toBe("2通目は届いていますが申請受付番号が未入力です");
    expect(waitingSecondMail({ onlineTempNo: "T-123" })).toBe(true);
    expect(onlineReceiptStage({ onlineReceivedOn: "2026-10-29" })).toBe("mail2");
  });
});
