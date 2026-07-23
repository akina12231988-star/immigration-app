import type { Worker } from "@/types/db";

// Notion「ビザの状況」データベース（外国人情報）のプロパティ名 ← アプリの外国人情報 の対応。
// - コピー転記（Notion AIに読み込ませる用）と、API連携での直接書き込みの両方で使う。
// - API連携では、実行時にNotion側に実在するプロパティ・型だけへ書き込む（存在しない項目は無視）。
export interface NotionFieldMapEntry {
  prop: string; // Notion のプロパティ名
  get: (w: Worker) => string | null | undefined;
}

export const NOTION_FIELD_MAP: NotionFieldMapEntry[] = [
  { prop: "外国人の名前", get: (w) => w.name },
  { prop: "フリガナ", get: (w) => w.kana },
  { prop: "国籍", get: (w) => w.nationality },
  { prop: "生年月日", get: (w) => w.birth },
  { prop: "住所", get: (w) => w.address },
  { prop: "旅券番号", get: (w) => w.passport_no },
  { prop: "旅券の有効期限", get: (w) => w.passport_expiry_date },
  { prop: "在留資格", get: (w) => w.residence_status },
  { prop: "在留カード番号", get: (w) => w.residence_card_no },
  { prop: "雇用開始年月日", get: (w) => w.employment_start_on },
  { prop: "専門級の職種", get: (w) => w.specialty_grade },
  { prop: "Messanger 🔗", get: (w) => w.messenger_link },
];

// 外国人の情報を「項目：値」形式に整形する（Notion AI 読み込ませ用のコピーテキスト）。空欄は出さない。
export function buildNotionTransferText(worker: Worker): string {
  return NOTION_FIELD_MAP.map(({ prop, get }) => ({
    prop,
    value: (get(worker) ?? "").toString().trim(),
  }))
    .filter((x) => x.value.length > 0)
    .map((x) => `${x.prop}：${x.value}`)
    .join("\n");
}
