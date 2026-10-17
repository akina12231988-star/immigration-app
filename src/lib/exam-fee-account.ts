// 試験の代金を本人から振り込んでもらうときの振込先（弊社のゆうちょ銀行の口座）。
//
// 試験の申込のTODOで、本人に送る口座案内の画像（public/exam-fee-account.png）と
// 文章をその場でコピーできるようにする。口座を変えるときはここと画像を直す。

export const EXAM_FEE_ACCOUNT = {
  bank: "ゆうちょ銀行",
  bankCode: "9900",
  symbol: "17100", // 記号（ゆうちょ銀行どうしの送金）
  number: "31711151", // 番号（同上）
  branchName: "七一八", // 店名（ほかの銀行からの振込）
  branchKana: "ナナイチハチ",
  branchNo: "718", // 店番
  accountType: "普通",
  accountNo: "3171115",
  holder: "ノグチ　アキナ",
  imagePath: "/exam-fee-account.png", // 口座案内の画像（public/）
} as const;

// 本人に送る文章（Messenger などに貼る）。代金が分かっていれば金額も入れる
export function examFeeAccountText(fee?: string, examLabel?: string): string {
  const a = EXAM_FEE_ACCOUNT;
  const amount = (fee ?? "").trim();
  const head = examLabel ? `${examLabel}の代金` : "試験の代金";
  return [
    `${head}${amount ? `（${amount}）` : ""}は、下の口座へ振込をお願いします。`,
    "",
    `【${a.bank}どうし】`,
    `記号 ${a.symbol}　番号 ${a.number}`,
    "",
    "【ほかの銀行から】",
    `${a.bank}（金融機関コード ${a.bankCode}）`,
    `店名 ${a.branchName}（${a.branchKana}）　店番 ${a.branchNo}`,
    `${a.accountType} ${a.accountNo}`,
    `名義 ${a.holder}`,
    "",
    "振込の名前は本人の名前（在留カードのローマ字）でお願いします。",
    "振り込んだら、Messenger で知らせてください。",
  ].join("\n");
}
