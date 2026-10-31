// オンライン申請の受付（メールが3通に分かれて届く）の進み具合。
//
//   1通目「申請受付完了のお知らせ」: 申請種別・整理番号（登録時に入れる）
//   2通目「申請受付仮番号のお知らせ」: 申請受付日・申請受付仮番号・申請種別・申請人在留カード等番号
//   3通目「申請受付番号のお知らせ」: 申請受付番号（申請一覧の申請番号になる）
// 3通目が届くまでは申請受付番号（applicationNumber）が空なので、申請詳細でどこまで届いたか分かるようにする。
// 3通目には2通目の内容（申請受付日・仮番号・在留カード等番号）も載っているので、申請詳細では2通目と3通目を1枚にまとめ、
// 3通目のスクリーンショット（受付番号メール）を受付票として扱う。

import type { Application, ApplicationFile } from "@/types/application";

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
  | "onlineMail3Link"
>;

// 申請種別の書き方の例（メールの記載をそのまま入れる。2通目以降は「資格変更（特定技能）」のように短いことがある）
export const ONLINE_APP_TYPE_EXAMPLE = "在留資格変更許可申請（区分V）";

export type OnlineReceiptStage = "none" | "mail1" | "mail2" | "mail3";

// どこまで届いているか。3通目＝申請受付番号、2通目＝仮番号・受付日・在留カード等番号、1通目＝整理番号・申請種別・リンク
export function onlineReceiptStage(a: Partial<OnlineReceiptFields>): OnlineReceiptStage {
  const t = (v: string | null | undefined) => (v ?? "").trim();
  if (t(a.applicationNumber) || t(a.onlineMail3Link)) return "mail3";
  if (t(a.onlineTempNo) || a.onlineReceivedOn || t(a.onlineCardNo) || t(a.onlineMail2Link)) return "mail2";
  if (t(a.onlineRefNo) || t(a.onlineAppType) || t(a.emailLink)) return "mail1";
  return "none";
}

// 見出しに出す要約
export function onlineReceiptSummary(a: Partial<OnlineReceiptFields>): string {
  const stage = onlineReceiptStage(a);
  const no = (a.applicationNumber ?? "").trim();
  if (stage === "mail3") return no ? `申請受付番号 ${no}` : "3通目は届いていますが申請受付番号が未入力です";
  if (stage === "mail2") {
    const temp = (a.onlineTempNo ?? "").trim();
    return `${temp ? `仮番号 ${temp}・` : ""}3通目のメール（申請受付番号）待ち`;
  }
  if (stage === "mail1") {
    const ref = (a.onlineRefNo ?? "").trim();
    return `${ref ? `整理番号 ${ref}・` : ""}2通目・3通目のメール（申請受付番号）待ち`;
  }
  return "受付メールの内容が未入力です";
}

// 申請受付番号がまだ無いか。見出しを赤くするのに使う
export function waitingReceiptNumber(a: Partial<OnlineReceiptFields>): boolean {
  return !(a.applicationNumber ?? "").trim();
}

// 申請受付番号の入力待ちか（オンライン申請で、申請登録したのに申請受付番号がまだ無く、LINE報告もしていない）。
// オンライン申請はメールが時間差で届くので、翌日に申請受付番号まで入れてから LINE報告をする流れにする。
// 申請一覧・ダッシュボードの「オンライン申請・申請受付番号入力へ」と、申請詳細の「今やること」で使う
export function needsOnlineReceiptNumber(
  a: Pick<Application, "method" | "applicationNumber" | "lineReported" | "status" | "approved">,
): boolean {
  return (
    a.method === "オンライン" &&
    !(a.applicationNumber ?? "").trim() &&
    !a.lineReported &&
    !a.approved &&
    a.status === "申請済" // 申請前は「申請前＜入管提出！！＞」で扱う
  );
}

// 受付票として出す画像。オンライン申請は3通目（申請受付番号のお知らせ）のスクリーンショットが受付票になる
export function receiptSlipFiles(method: Application["method"], files: ApplicationFile[]): ApplicationFile[] {
  return files.filter((f) => f.kind === "受付票" || (method === "オンライン" && f.kind === "受付番号メール"));
}

// 申請受付番号が届いたら報告する Messenger グループ「入管-申請受付票・許可」
export const IMMIGRATION_RECEIPT_GROUP_URL = "https://www.facebook.com/messages/t/9604193213024817";
export const IMMIGRATION_RECEIPT_GROUP_NAME = "入管-申請受付票・許可";

// 申請受付番号が届いたときの報告文（入管-申請受付票・許可のグループと本人のグループに貼る）。
// 受付票（3通目のメールのスクリーンショット）を添えて送る
export function onlineReceiptReportText(
  a: Pick<Application, "name" | "applicationNumber" | "onlineAppType" | "onlineReceivedOn" | "applicationDate">,
): string {
  const date = a.onlineReceivedOn || a.applicationDate;
  const [y, m, d] = (date ?? "").split("-");
  const dateText = y && m && d ? `${Number(y)}年${Number(m)}月${Number(d)}日` : date || "未入力";
  const lines = [`${a.name}さん`, "オンライン申請の申請受付番号が届きました。", ""];
  if (a.onlineAppType?.trim()) lines.push(`申請種別: ${a.onlineAppType.trim()}`);
  lines.push(`申請受付日: ${dateText}`, `申請受付番号: ${(a.applicationNumber ?? "").trim() || "未登録"}`);
  return lines.join("\n");
}
