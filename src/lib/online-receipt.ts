// オンライン申請の受付（メールが2通に分かれて届く）の進み具合。
//
//   1通目「申請受付完了のお知らせ」: 申請種別・整理番号（登録時に入れる）
//   2通目「申請受付番号のお知らせ」: 申請受付日・申請受付仮番号・申請種別・申請人在留カード等番号・申請受付番号
// 2通目が届くまでは申請受付番号（applicationNumber）が空なので、申請詳細で「2通目待ち」と分かるようにする。

import type { Application } from "@/types/application";

export type OnlineReceiptFields = Pick<
  Application,
  | "applicationNumber"
  | "emailLink"
  | "onlineAppType"
  | "onlineRefNo"
  | "onlineReceivedOn"
  | "onlineTempNo"
  | "onlineCardNo"
  | "onlineMail2Link"
>;

// 申請種別の書き方の例（メールの記載をそのまま入れる）
export const ONLINE_APP_TYPE_EXAMPLE = "在留資格変更許可申請（区分V）";

export type OnlineReceiptStage = "none" | "mail1" | "mail2";

// どこまで届いているか。2通目の項目（申請受付番号・仮番号・受付日）が1つでも入っていれば mail2
export function onlineReceiptStage(a: Partial<OnlineReceiptFields>): OnlineReceiptStage {
  if ((a.applicationNumber ?? "").trim() || (a.onlineTempNo ?? "").trim() || a.onlineReceivedOn) return "mail2";
  if ((a.onlineRefNo ?? "").trim() || (a.onlineAppType ?? "").trim() || (a.emailLink ?? "").trim()) return "mail1";
  return "none";
}

// 見出しに出す要約
export function onlineReceiptSummary(a: Partial<OnlineReceiptFields>): string {
  const stage = onlineReceiptStage(a);
  if (stage === "mail2") {
    const no = (a.applicationNumber ?? "").trim();
    return no ? `申請受付番号 ${no}` : "2通目は届いていますが申請受付番号が未入力です";
  }
  if (stage === "mail1") {
    const ref = (a.onlineRefNo ?? "").trim();
    return `${ref ? `整理番号 ${ref}・` : ""}2通目のメール（申請受付番号）待ち`;
  }
  return "受付メールの内容が未入力です";
}

// 2通目がまだ（申請受付番号が未入力）か。見出しを赤くするのに使う
export function waitingSecondMail(a: Partial<OnlineReceiptFields>): boolean {
  return onlineReceiptStage(a) !== "mail2" || !(a.applicationNumber ?? "").trim();
}
