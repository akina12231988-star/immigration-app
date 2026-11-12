// 在留カードの受け取り（オンライン申請）の案内。入管メール通知の「申請ごとの一覧表」の上に出す。
// 郵送で受け取るときは、在留カードの郵送をお願いする書類を東京（オンライン申請手続班）へ送り、
// 返信用封筒にこちら（登録支援機関）の宛名を書いて同封する。

export interface MailAddress {
  postal: string;
  address: string;
  name: string; // 宛名（部署名など）
}

// 郵送先（在留カードの郵送をお願いする書類を送る先）
export const CARD_MAIL_TO: MailAddress = {
  postal: "135-0064",
  address: "東京都江東区青海2-7-11 東京港湾合同庁舎9階",
  name: "東京出入国在留管理局オンライン審査第二部門オンライン申請手続班（おだいば分室内）",
};

// 返信用封筒の宛名（在留カードを送り返してもらう先）
export const CARD_RETURN_TO: MailAddress = {
  postal: "861-8045",
  address: "熊本県熊本市東区小山2-13-20 日産共同住宅201",
  name: "登録支援機関VUONG VAN THANH",
};

// 封筒に書く形（〒・住所・宛名を改行でつなぐ）
export function mailAddressText(a: MailAddress): string {
  return [`〒${a.postal}`, a.address, a.name].filter(Boolean).join("\n");
}
