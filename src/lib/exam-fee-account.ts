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

// ---- 国籍別の口座案内の画像 ----
//
// 本人に送る口座案内は、本人の国籍（母国語）に合わせた画像を用意してある（public/bank-account-guide/）。
// 画像の内容（口座）は EXAM_FEE_ACCOUNT と同じで、見出し・項目名を母国語で添えたもの。
// 試験の代金のほか、立替払いした税金などを本人から受け取るときにも同じ画像を送る。

export interface BankAccountGuide {
  key: "ph" | "id" | "kh" | "vn" | "ja";
  label: string; // 画面に出す名前（国籍と言語）
  short: string; // ボタンに出す短い名前
  imagePath: string; // 画像（public/）
  nationalities: string[]; // この画像を出す国籍（国籍の欄にこの語が含まれていれば一致）
}

export const BANK_ACCOUNT_GUIDES: readonly BankAccountGuide[] = [
  {
    key: "ph",
    label: "フィリピン（タガログ語）",
    short: "フィリピン",
    imagePath: "/bank-account-guide/ph.png",
    nationalities: ["フィリピン", "philippines", "pilipinas", "filipino"],
  },
  {
    key: "id",
    label: "インドネシア（インドネシア語）",
    short: "インドネシア",
    imagePath: "/bank-account-guide/id.png",
    nationalities: ["インドネシア", "indonesia"],
  },
  {
    key: "kh",
    label: "カンボジア（クメール語）",
    short: "カンボジア",
    imagePath: "/bank-account-guide/kh.png",
    nationalities: ["カンボジア", "cambodia", "kampuchea", "campuchia", "khmer"],
  },
  {
    key: "vn",
    label: "ベトナム（ベトナム語）",
    short: "ベトナム",
    imagePath: "/bank-account-guide/vn.png",
    nationalities: ["ベトナム", "vietnam", "viet nam", "việt nam"],
  },
  // 日本語だけの画像（国籍が上のどれでもないとき・未登録のとき）
  {
    key: "ja",
    label: "日本語",
    short: "日本語",
    imagePath: EXAM_FEE_ACCOUNT.imagePath,
    nationalities: [],
  },
] as const;

export const DEFAULT_BANK_ACCOUNT_GUIDE: BankAccountGuide = BANK_ACCOUNT_GUIDES[BANK_ACCOUNT_GUIDES.length - 1];

// 国籍の欄の値（「ベトナム」「カンボジア王国」「Vietnam」など）に合う画像。合うものが無ければ null
export function bankAccountGuideForNationality(nationality: string | null | undefined): BankAccountGuide | null {
  const n = (nationality ?? "").normalize("NFKC").trim().toLowerCase();
  if (!n) return null;
  return BANK_ACCOUNT_GUIDES.find((g) => g.nationalities.some((w) => n.includes(w.toLowerCase()))) ?? null;
}

// 本人に送る画像（国籍に合うものが無ければ日本語の画像）
export function bankAccountGuideFor(nationality: string | null | undefined): BankAccountGuide {
  return bankAccountGuideForNationality(nationality) ?? DEFAULT_BANK_ACCOUNT_GUIDE;
}
