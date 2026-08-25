// 労働局の訪問指導（当日点検）で出す確認書類の一覧。
//
// 訪問通知文の【別紙】確認書類①〜⑨に合わせている。
// ・「保管」= アプリに入れてある固定の書類（規程・手数料表など）。そのままダウンロードできる
// ・「作成」= その場でアプリから作る書類（求人管理簿・求職管理簿・手数料管理簿など）
// ・「別で用意」= アプリの外で用意するもの（通帳の写しなど）
//
// ②⑥⑧⑨は有料職業紹介事業者だけが必要（訪問通知文の注記のとおり）。

export type AuditDocSource = "保管" | "作成" | "別で用意";

export interface AuditDoc {
  no: number; // 別紙の番号（①〜⑨）
  label: string;
  source: AuditDocSource;
  // 「保管」: public に入れてあるPDFの場所とファイル名
  file?: { url: string; fileName: string; pages: number };
  // 「作成」: アプリのどの画面から出すか
  screen?: { href: string; label: string };
  note?: string;
  paidOnly?: boolean; // 有料職業紹介事業者のみ（②⑥⑧⑨）
}

export const AUDIT_DOCS: AuditDoc[] = [
  {
    no: 1,
    label: "求人、求職管理簿",
    source: "作成",
    screen: { href: "/postings/form30", label: "様式30の画面 ＞ 訪問指導の当日点検" },
    note: "当日点検に選ばれたリストNo.の分だけ出せます。全件は求人一覧・求職一覧から出せます。",
  },
  {
    no: 2,
    label: "手数料管理簿",
    source: "作成",
    screen: { href: "/referrals", label: "手数料管理簿" },
    paidOnly: true,
  },
  {
    no: 3,
    label: "業務の運営に関する規程",
    source: "保管",
    file: { url: "/audit-docs/gyomu-unei-kitei.pdf", fileName: "業務の運営に関する規程.pdf", pages: 2 },
  },
  {
    no: 4,
    label: "個人情報の適正管理に関する規程",
    source: "保管",
    file: {
      url: "/audit-docs/kojin-joho-kitei.pdf",
      fileName: "個人情報適正管理規程.pdf",
      pages: 1,
    },
  },
  {
    no: 5,
    label: "取扱職種の範囲等を求人者及び求職者に対して明示した書面",
    source: "保管",
    file: {
      url: "/audit-docs/toriatsukai-shokushu.pdf",
      fileName: "取扱職種の範囲等の明示書面.pdf",
      pages: 2,
    },
  },
  {
    no: 6,
    label: "手数料表",
    source: "保管",
    file: { url: "/audit-docs/tesuryo-hyo.pdf", fileName: "手数料表.pdf", pages: 1 },
    paidOnly: true,
  },
  {
    no: 7,
    label:
      "求人票（別に労働条件明示に使用した書類があればその書類）、求職票、紹介状、契約書、求人不受理に係る自己申告書など職業紹介に係る書類",
    source: "作成",
    screen: { href: "/postings", label: "求人一覧（求人票・雇用契約書）" },
    note: "点検に選ばれた求人の求人票・契約書を、その求人の詳細ページから出してください。",
  },
  {
    no: 8,
    label: "手数料管理簿の記載内容との照合が可能な書類（求人者への請求書や入金確認が可能な通帳等）",
    source: "作成",
    screen: { href: "/sales", label: "請求・入金（請求書）" },
    note: "通帳の写しはアプリの外で用意してください。",
    paidOnly: true,
  },
  {
    no: 9,
    label: "違約金規約（違約金規約を設けている場合のみ）",
    source: "別で用意",
    note: "違約金規約を設けている場合のみ必要です。アプリには入れていません。",
    paidOnly: true,
  },
];

// アプリに入れてある固定の書類（まとめてダウンロードできる分）
export function storedAuditDocs(): AuditDoc[] {
  return AUDIT_DOCS.filter((d) => d.source === "保管" && d.file);
}

// まとめて1つにしたPDFのファイル名
export function auditDocsBundleName(today: string): string {
  return `訪問指導_規程・手数料表_${today}.pdf`;
}
