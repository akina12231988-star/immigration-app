import { describe, expect, it } from "vitest";
import { CARD_MAIL_TO, CARD_RETURN_TO, mailAddressText } from "./card-pickup-guide";

describe("在留カードの郵送の宛名", () => {
  it("〒・住所・宛名を改行でつなぐ", () => {
    expect(mailAddressText(CARD_MAIL_TO)).toBe(
      "〒135-0064\n東京都江東区青海2-7-11 東京港湾合同庁舎9階\n東京出入国在留管理局オンライン審査第二部門オンライン申請手続班（おだいば分室内）",
    );
    expect(mailAddressText(CARD_RETURN_TO)).toBe("〒861-8045\n熊本県熊本市東区小山2-13-20 日産共同住宅201\n登録支援機関VUONG VAN THANH");
  });
});
