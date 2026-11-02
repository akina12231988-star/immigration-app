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
// 3通目のメール「申請受付番号のお知らせ」の内容（申請受付日・申請受付仮番号・申請種別・申請人在留カード等番号・
// 申請受付番号）を、メールと同じ並び・見出しで文面にする。受付票（3通目のスクリーンショット）を添えて送る
export function onlineReceiptReportText(
  a: Pick<
    Application,
    "name" | "applicationNumber" | "onlineAppType" | "onlineReceivedOn" | "onlineTempNo" | "onlineCardNo" | "applicationDate"
  >,
): string {
  const date = a.onlineReceivedOn || a.applicationDate;
  const v = (s: string | null | undefined) => (s ?? "").trim() || "未入力";
  return [
    `${a.name}さん`,
    "オンライン申請の申請受付番号が届きました。",
    "",
    "申請受付日（Application acceptance date）",
    date ? date.replace(/-/g, "/") : "未入力",
    "申請受付仮番号（Provisional application acceptance no.）",
    v(a.onlineTempNo),
    "申請種別（Type of application）",
    v(a.onlineAppType),
    "申請人在留カード等番号（Number of the applicant's residence card, etc.）",
    v(a.onlineCardNo),
    "",
    "上記申請について、申請受付番号をお知らせいたします。",
    "申請受付番号（Application acceptance no.）",
    v(a.applicationNumber),
  ].join("\n");
}

// 申請一覧の「次にやること」に出す、受付メールの次の1通（1通目→2通目→3通目）。
// オンライン申請で申請受付番号がまだ無い（取下げ・許可済みを除く）ときだけ。それ以外は null
export type OnlineReceiptStep = 1 | 2 | 3;
export function onlineReceiptNextStep(
  a: Partial<OnlineReceiptFields> & Pick<Application, "method" | "status" | "approved">,
): OnlineReceiptStep | null {
  if (a.method !== "オンライン" || a.approved) return null;
  if (a.status === "取下げ" || a.status === "申請前" || a.status === "許可済" || a.status === "在留カード受領") return null;
  if ((a.applicationNumber ?? "").trim()) return null;
  const stage = onlineReceiptStage(a);
  if (stage === "none") return 1;
  if (stage === "mail1") return 2;
  return 3;
}

// 申請詳細を開いて、その1通の入力欄から入れるためのリンク（?edit=mail1 など）
export function onlineReceiptStepHref(applicationId: string, step: OnlineReceiptStep): string {
  return `/applications/${applicationId}?edit=mail${step}`;
}

// ?edit=mail1〜3 の読み取り（それ以外は null）
export function parseOnlineReceiptStep(value: string | null | undefined): OnlineReceiptStep | null {
  const m = /^mail([123])$/.exec(value ?? "");
  return m ? (Number(m[1]) as OnlineReceiptStep) : null;
}

// その1通でまずカーソルを入れる項目（1通目＝申請種別、2通目＝申請受付日、3通目＝申請受付番号）
export const ONLINE_RECEIPT_STEP_FOCUS: Record<OnlineReceiptStep, string> = {
  1: "onlineAppType",
  2: "onlineReceivedOn",
  3: "applicationNumber",
};
