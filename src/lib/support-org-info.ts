import type { CustodianInfo } from "@/lib/custody";

// 登録支援機関（当社）の情報の入力欄（メニューの「登録支援機関」で登録・変更する）。
// 値は app_settings（key = support_org）に保存され、申請準備の「申請書に貼る情報」の
// 所属機関等作成用 4（登録支援機関）や預かり証などに使われる
export interface SupportOrgField {
  key: keyof CustodianInfo;
  label: string;
  kind?: "text" | "date" | "textarea";
  hint?: string;
}

export interface SupportOrgFieldGroup {
  title: string;
  fields: SupportOrgField[];
  hasInterpreters?: boolean; // 対応可能言語の下に通訳者の一覧を出す
  hasListingImage?: boolean; // 人材サービス総合サイトの掲載画面の画像を出す
}

// 登録支援機関の添付ファイルの種類（support_org_files.kind）
export const SUPPORT_ORG_LISTING_FILE_KIND = "人材サービス総合サイト";

export const SUPPORT_ORG_FIELD_GROUPS: SupportOrgFieldGroup[] = [
  {
    title: "登録支援機関（申請書 所属機関等作成用 4）",
    fields: [
      { key: "officeName", label: "5 (1) 氏名又は名称" },
      { key: "koyoNo", label: "5 (3) 雇用保険適用事業所番号" },
      { key: "headOfficeAddress", label: "5 (4) 住所（所在地）" },
      { key: "tel", label: "5 (4) 電話番号" },
      { key: "mobile", label: "携帯電話番号", hint: "預かり証などに使います" },
      { key: "representativeName", label: "5 (5) 代表者の氏名" },
      { key: "registrationNo", label: "5 (6) 登録番号" },
      { key: "registeredOn", label: "5 (7) 登録年月日", kind: "date" },
      { key: "invoiceRegistrationNo", label: "適格請求書発行事業者（インボイス）登録番号", hint: "領収書に印字します" },
    ],
  },
  {
    title: "支援を行う事業所",
    hasInterpreters: true,
    fields: [
      { key: "supportOfficeName", label: "5 (8) 支援を行う事業所の名称" },
      { key: "address", label: "5 (9) 所在地" },
      { key: "supportManagerName", label: "5 (10) 支援責任者名" },
      { key: "supportStaffName", label: "5 (11) 支援担当者名" },
      {
        key: "languages",
        label: "5 (12) 対応可能言語",
        hint: "空のままだと、申請準備では外国人の国籍から自動で出します（例: ベトナム語）。複数あるときは「ベトナム語、英語」のように書きます。言語ごとの通訳者はこの下に登録します",
      },
      {
        key: "supportSystemNote",
        label: "支援業務を行う体制についての説明（A4印刷の文章）",
        kind: "textarea",
        hint: "「支援体制を印刷（A4）」の一番上に出る文章です",
      },
    ],
  },
  {
    title: "職業紹介事業者（国内）",
    hasListingImage: true,
    fields: [
      { key: "placementLicenseNo", label: "許可・届出受理番号", hint: "例: 43-ユ-300259" },
      { key: "placementLicensedOn", label: "受理年月日", kind: "date" },
      { key: "placementKind", label: "職業紹介事業者の区分", hint: "有料職業紹介事業者 / 無料職業紹介事業者" },
      { key: "placementName", label: "職業紹介事業者の氏名" },
      { key: "placementPostal", label: "郵便番号", hint: "例: 861-8045" },
      { key: "placementAddress", label: "住所" },
      { key: "placementTel", label: "電話番号" },
    ],
  },
];

// 申請取次者（複数可）は一覧で登録する。ここは1人分の欄の見出し
export const SUPPORT_ORG_AGENT_GROUP_TITLE = "申請取次者";
export const SUPPORT_ORG_INTERPRETER_TITLE = "通訳者（対応可能言語ごと）";
