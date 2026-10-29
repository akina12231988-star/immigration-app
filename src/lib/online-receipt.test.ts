import { describe, expect, it } from "vitest";
import { onlineReceiptStage, onlineReceiptSummary, waitingReceiptNumber } from "./online-receipt";

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
    expect(onlineReceiptSummary({ onlineRefNo: "650468319129" })).toBe("整理番号 650468319129・2通目のメール（申請受付仮番号）待ち");
    expect(onlineReceiptSummary({ emailLink: "https://mail.example/1" })).toBe("2通目のメール（申請受付仮番号）待ち");
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
