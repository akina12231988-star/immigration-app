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
  kind: string; // mailing_files.kind（追加するときの種別）
  // 同じ自治体の2年度を1つの欄にまとめたとき、出す添付の種別（年度ごとに添付していた分も出す）と年度
  kinds?: string[];
  years?: YearType[];
  title: string; // 欄の見出し
  addLabel: string; // 追加ボタンの文言
  // 届いた証明書が「どの証明書か」を選ぶ（課税・納税証明書の記録のときだけ）。
  // 選んだ証明書は種別名の後ろに「｜課税証明書」のように付けて残し、申請準備ではその行にだけ出す
  certTypes?: TaxCertType[];
}

// ---- 届いた証明書が「どの証明書か」（申請準備の行と同じ区分） ----
export interface TaxCertType {
  id: "kazei" | "nozei_shiken" | "nozei_kokuho"; // 申請準備の行の id と同じ
  label: string;
}
export const TAX_CERT_TYPES: TaxCertType[] = [
  { id: "kazei", label: "課税証明書" },
  { id: "nozei_shiken", label: "納税証明書（市県民税）" },
  { id: "nozei_kokuho", label: "納税証明書（国保税）" },
];
const CERT_TAG_SEP = "｜";

// 種別名に「どの証明書か」を付ける（例: 届いた証明書：2025年度（令和7年度）｜課税証明書）
export function certTaggedKind(base: string, certId: string | null): string {
  const t = TAX_CERT_TYPES.find((c) => c.id === certId);
  return t ? `${base}${CERT_TAG_SEP}${t.label}` : base;
}
// 種別名から「どの証明書か」を読む（付いていなければ null）
export function certIdOfKind(kind: string): TaxCertType["id"] | null {
  const i = kind.lastIndexOf(CERT_TAG_SEP);
  if (i < 0) return null;
  const label = kind.slice(i + CERT_TAG_SEP.length);
  return TAX_CERT_TYPES.find((c) => c.label === label)?.id ?? null;
}
// 「どの証明書か」を除いた種別名（欄に出すかどうかの突き合わせに使う）
export function baseKindOf(kind: string): string {
  const i = kind.lastIndexOf(CERT_TAG_SEP);
  return i < 0 || !certIdOfKind(kind) ? kind : kind.slice(0, i);
}

// 課税・納税証明書の記録で選べる証明書（国保税は、国保税も請求した記録のときだけ）
function certTypesOf(r: Partial<SlotSource>): TaxCertType[] {
  const nhi = (r.nhiYears?.length ?? 0) > 0 || (r.docs ?? []).some((d) => d.isNhi);
  return TAX_CERT_TYPES.filter((c) => c.id !== "nozei_kokuho" || nhi);
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
  if (r.requestKind === "nenkin") {
    return [
      { role: "sent", kind: MAIL_REQUEST_KIND, title: "請求した書類（交付申請書・委任状など）", addLabel: "請求した書類を添付（画像・PDF）" },
      { role: "received", kind: RECEIVED_CERT_KIND, title: "届いた年金記録（届いたら添付）", addLabel: "届いた年金記録を添付（画像・PDF）" },
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
    // 同じ自治体（市役所）に請求した年度は、送った書類・届いた証明書・領収書の欄を1つにまとめる
    // （最新年度と前年度を同じ市役所に1通の申請書で請求するため）。自治体が違う年度は年度ごとに分ける
    const muniOf = (yt: YearType) => {
      const y = r.yearRequests?.find((x) => x.yearType === yt);
      if (y) return { key: y.municipalityId || y.municipalityName, name: y.municipalityName };
      const n = r.nhiYears?.find((x) => x.yearType === yt);
      return { key: n?.municipalityId || n?.municipalityName || yt, name: n?.municipalityName ?? "" };
    };
    const groups: { key: string; name: string; years: typeof years }[] = [];
    for (const y of years) {
      const m = muniOf(y.yearType);
      const g = groups.find((x) => x.key === m.key);
      if (g) g.years.push(y);
      else groups.push({ key: m.key, name: m.name, years: [y] });
    }
    return groups.flatMap((g) => {
      const label = (y: (typeof years)[number]) => `${y.yearType === "new" ? "最新年度" : "前年度"} ${yearWithReiwa(y.fiscalStartYear)}`;
      if (g.years.length === 1) {
        const yr = g.years[0];
        const y = label(yr);
        return [
          { role: "sent" as const, year: yr.yearType, kind: yearAttachmentKind(MAIL_REQUEST_KIND, yr.fiscalStartYear), title: `【${y}】郵送請求した書類（申請書などのデータ）`, addLabel: `${y}の郵送請求した書類を添付（画像・PDF）` },
          { role: "received" as const, year: yr.yearType, kind: yearAttachmentKind(RECEIVED_CERT_KIND, yr.fiscalStartYear), title: `【${y}】届いた証明書（届いたら添付）`, addLabel: `${y}の届いた証明書を添付（画像・PDF）`, certTypes: certTypesOf(r) },
          { role: "receipt" as const, year: yr.yearType, kind: yearAttachmentKind(RECEIPT_KIND, yr.fiscalStartYear), title: `【${y}】領収書（後日届いたら添付）`, addLabel: `${y}の領収書を添付（画像・PDF）` },
        ];
      }
      const head = `${g.name ? `${g.name}・` : ""}${g.years.map((y) => yearWithReiwa(y.fiscalStartYear)).join("と")}`;
      const slot = (role: MailingAttachmentRole, base: string, title: string, add: string): MailingAttachmentSlot => ({
        role,
        year: g.years[0].yearType,
        years: g.years.map((y) => y.yearType),
        kind: yearAttachmentKind(base, g.years[0].fiscalStartYear),
        kinds: g.years.map((y) => yearAttachmentKind(base, y.fiscalStartYear)),
        title: `【${head}】${title}`,
        addLabel: add,
      });
      return [
        slot("sent", MAIL_REQUEST_KIND, "郵送請求した書類（申請書などのデータ）", "郵送請求した書類を添付（画像・PDF）"),
        { ...slot("received", RECEIVED_CERT_KIND, "届いた証明書（届いたら添付）", "届いた証明書を添付（画像・PDF）"), certTypes: certTypesOf(r) },
        slot("receipt", RECEIPT_KIND, "領収書（後日届いたら添付）", "領収書を添付（画像・PDF）"),
      ];
    });
  }
  return [
    { role: "sent", kind: MAIL_REQUEST_KIND, title: "郵送請求した書類（申請書などのデータ）", addLabel: "郵送請求した書類を添付（画像・PDF）" },
    {
      role: "received",
      kind: RECEIVED_CERT_KIND,
      title: "届いた証明書（届いたら添付）",
      addLabel: "届いた証明書を添付（画像・PDF）",
      ...(!r.requestKind || r.requestKind === "tax" ? { certTypes: certTypesOf(r) } : {}),
    },
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
  if (r.requestKind === "nenkin") {
    return [{ what: "年金記録", where: r.pensionOffice || "年金事務所未入力" }];
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
