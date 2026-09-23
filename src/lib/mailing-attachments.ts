import { requestKindLabel, yearWithReiwa, type JudgmentRecord, type YearType } from "@/lib/tax-cert";

// 郵送請求の記録に添付するファイルの種別（mailing_files.kind）。
// 自由入力の文字列なので、種別を増やしてもマイグレーションは要らない
export const MAIL_REQUEST_KIND = "郵送請求した書類"; // 自治体・税務署に送った申請書など
export const RECEIVED_CERT_KIND = "届いた証明書"; // 郵送で届いた課税・納税証明書・住民票など
export const RECEIPT_KIND = "領収書"; // 後日届く手数料の領収書
export const NOZEI3_RECEIVED_KIND = "届いた納税証明書"; // 納税証明書その3（税務署から届いたもの）

export type MailingAttachmentRole = "sent" | "received" | "receipt"; // 郵送請求した書類 / 届いた証明書 / 領収書

export interface MailingAttachmentSlot {
  role: MailingAttachmentRole;
  year?: YearType; // 年度ごとの欄のときの年度
  kind: string; // mailing_files.kind
  title: string; // 欄の見出し
  addLabel: string; // 追加ボタンの文言
}

// 添付欄を決めるのに使う記録の項目
type SlotSource = Pick<JudgmentRecord, "requestKind" | "docs" | "yearRequests" | "nhiYears">;

// 年度ごとに添付を分ける記録か（課税・納税証明書で、書類が年度ごとに保存されているもの）
function yearsOfRecord(r: Partial<SlotSource>): { yearType: YearType; fiscalStartYear: number }[] {
  if (r.requestKind && r.requestKind !== "tax") return [];
  const docs = r.docs ?? [];
  if (!docs.some((d) => d.yearType)) return [];
  const fiscalOf = (yt: YearType) =>
    r.yearRequests?.find((y) => y.yearType === yt)?.fiscalStartYear ??
    r.nhiYears?.find((y) => y.yearType === yt)?.fiscalStartYear;
  return (["new", "prev"] as YearType[])
    .filter((yt) => docs.some((d) => d.yearType === yt))
    .map((yt) => ({ yearType: yt, fiscalStartYear: fiscalOf(yt) ?? 0 }));
}

// 年度ごとの添付欄の種別名（例: 郵送請求した書類：2026年度（令和8年度））
export function yearAttachmentKind(base: string, fiscalStartYear: number): string {
  return `${base}：${yearWithReiwa(fiscalStartYear)}`;
}

// 記録の種別ごとの添付欄（郵送請求した書類 → 届いた証明書 → 領収書の順）。
// 記録一覧のカード・編集モーダル・外国人詳細で同じ欄を出す。
// 課税・納税証明書を年度ごとに請求した記録は、年度ごとに3つずつ出す
export function mailingAttachmentSlots(r: Partial<SlotSource>): MailingAttachmentSlot[] {
  if (r.requestKind === "nozei3") {
    return [
      { role: "sent", kind: MAIL_REQUEST_KIND, title: "郵送請求した書類（請求書のPDFなど）", addLabel: "郵送請求した書類を添付（画像・PDF）" },
      { role: "received", kind: NOZEI3_RECEIVED_KIND, title: "届いた納税証明書（届いたら添付）", addLabel: "届いた納税証明書を添付（画像・PDF）" },
    ];
  }
  if (r.requestKind === "tenshutsu" || r.requestKind === "juminhyo") {
    // 転出届・住民票は、以前から種別名（「転出届」「住民票」）で申請書のデータを添付している
    const label = requestKindLabel(r.requestKind);
    const received = r.requestKind === "tenshutsu" ? "届いた転出証明書" : "届いた住民票";
    return [
      { role: "sent", kind: label, title: `${label}・申請書のデータ`, addLabel: `申請書・${label}のデータを追加（画像・PDF）` },
      { role: "received", kind: RECEIVED_CERT_KIND, title: `${received}（届いたら添付）`, addLabel: `${received}を添付（画像・PDF）` },
      { role: "receipt", kind: RECEIPT_KIND, title: "領収書（後日届いたら添付）", addLabel: "領収書を添付（画像・PDF）" },
    ];
  }
  const years = yearsOfRecord(r);
  if (years.length > 0) {
    return years.flatMap(({ yearType, fiscalStartYear }) => {
      const y = `${yearType === "new" ? "最新年度" : "前年度"} ${yearWithReiwa(fiscalStartYear)}`;
      return [
        { role: "sent" as const, year: yearType, kind: yearAttachmentKind(MAIL_REQUEST_KIND, fiscalStartYear), title: `【${y}】郵送請求した書類（申請書などのデータ）`, addLabel: `${y}の郵送請求した書類を添付（画像・PDF）` },
        { role: "received" as const, year: yearType, kind: yearAttachmentKind(RECEIVED_CERT_KIND, fiscalStartYear), title: `【${y}】届いた証明書（届いたら添付）`, addLabel: `${y}の届いた証明書を添付（画像・PDF）` },
        { role: "receipt" as const, year: yearType, kind: yearAttachmentKind(RECEIPT_KIND, fiscalStartYear), title: `【${y}】領収書（後日届いたら添付）`, addLabel: `${y}の領収書を添付（画像・PDF）` },
      ];
    });
  }
  return [
    { role: "sent", kind: MAIL_REQUEST_KIND, title: "郵送請求した書類（申請書などのデータ）", addLabel: "郵送請求した書類を添付（画像・PDF）" },
    { role: "received", kind: RECEIVED_CERT_KIND, title: "届いた証明書（届いたら添付）", addLabel: "届いた証明書を添付（画像・PDF）" },
    { role: "receipt", kind: RECEIPT_KIND, title: "領収書（後日届いたら添付）", addLabel: "領収書を添付（画像・PDF）" },
  ];
}

// どの年度の証明書を、どこ（自治体・税務署）に請求したか。外国人詳細の一覧に出す
export interface MailingTarget {
  what: string; // 例: 課税・納税証明書 2026年度（令和8年度）
  where: string; // 例: 東京都世田谷区
}

export function mailingTargets(r: JudgmentRecord): MailingTarget[] {
  if (r.requestKind === "nozei3") {
    return [{ what: "納税証明書その3", where: r.taxOfficeName || "税務署未選択" }];
  }
  if (r.requestKind === "tenshutsu" || r.requestKind === "juminhyo") {
    return [{ what: requestKindLabel(r.requestKind), where: r.cityOffice || r.municipalityName || "請求先未入力" }];
  }
  const rows: MailingTarget[] = [];
  // 手順式の請求フォームの記録（年度ごとの自治体・国保税も年度ごと）
  if (Array.isArray(r.yearRequests)) {
    for (const y of r.yearRequests) {
      rows.push({ what: `${taxDocsLabel(y.taxCert, y.taxPayment)} ${yearWithReiwa(y.fiscalStartYear)}`, where: y.municipalityName || "自治体未選択" });
    }
    for (const y of r.nhiYears ?? []) {
      rows.push({ what: `国民健康保険税 納税証明書 ${yearWithReiwa(y.fiscalStartYear)}`, where: y.municipalityName || "自治体未選択" });
    }
    return rows;
  }
  if (r.requestBothYears) {
    rows.push({ what: `課税・納税証明書 ${yearWithReiwa(r.fiscalStartYear)}`, where: r.municipalityName || "自治体未選択" });
    rows.push({
      what: `課税・納税証明書 ${yearWithReiwa(r.prevFiscalStartYear ?? r.fiscalStartYear - 1)}`,
      where: r.prevMunicipalityName || "自治体未選択",
    });
  } else if (r.fiscalStartYear) {
    rows.push({ what: `課税・納税証明書 ${yearWithReiwa(r.fiscalStartYear)}`, where: r.municipalityName || "自治体未選択" });
  }
  if (r.hasNhi) {
    rows.push({
      what: `国民健康保険税 納税証明書${r.nhiFiscalStartYear ? ` ${yearWithReiwa(r.nhiFiscalStartYear)}` : ""}`,
      where: r.nhiMunicipalityName || "自治体未選択",
    });
  }
  return rows;
}


// 年度ごとに請求した書類の呼び方（未設定は両方）
export function taxDocsLabel(taxCert?: boolean, taxPayment?: boolean): string {
  const cert = taxCert !== false;
  const pay = taxPayment !== false;
  if (cert && !pay) return "課税証明書";
  if (!cert && pay) return "市県民税納税証明書";
  return "課税・納税証明書";
}
