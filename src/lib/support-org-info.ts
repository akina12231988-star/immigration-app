import type { CustodianInfo } from "@/lib/custody";

// 登録支援機関（当社）の情報の入力欄（メニューの「登録支援機関」で登録・変更する）。
// 値は app_settings（key = support_org）に保存され、申請準備の「申請書に貼る情報」の
// 所属機関等作成用 4（登録支援機関）や預かり証などに使われる
export interface SupportOrgField {
  key: keyof CustodianInfo;
  label: string;
  kind?: "text" | "date";
  hint?: string;
}

export interface SupportOrgFieldGroup {
  title: string;
  fields: SupportOrgField[];
}

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
    ],
  },
  {
    title: "支援を行う事業所",
    fields: [
      { key: "supportOfficeName", label: "5 (8) 支援を行う事業所の名称" },
      { key: "address", label: "5 (9) 所在地" },
      { key: "supportManagerName", label: "5 (10) 支援責任者名" },
      { key: "supportStaffName", label: "5 (11) 支援担当者名" },
      {
        key: "languages",
        label: "5 (12) 対応可能言語",
        hint: "空のままだと、申請準備では外国人の国籍から自動で出します（例: ベトナム語）。複数あるときは「ベトナム語・英語」のように書きます",
      },
    ],
  },
  {
    title: "申請取次者・インボイス",
    fields: [
      { key: "agentName", label: "申請取次者の氏名" },
      { key: "agentCertNo", label: "届出済証明書の番号" },
      { key: "agentCertExpiry", label: "届出済証明書の有効期限", kind: "date" },
      { key: "invoiceRegistrationNo", label: "適格請求書発行事業者（インボイス）登録番号" },
    ],
  },
];
