import type { Worker } from "@/types/db";

// Notion「ビザの状況」データベース（外国人情報）の項目名に合わせて、外国人の情報を
// 「項目：値」形式のテキストに整形する。Notion のページで貼り付けて Notion AI に読み込ませ、
// 各プロパティへ入力してもらうための転記用テキスト。空欄の項目は出力しない。
const FIELD_MAP: { label: string; get: (w: Worker) => string | null | undefined }[] = [
  { label: "外国人の名前", get: (w) => w.name },
  { label: "フリガナ", get: (w) => w.kana },
  { label: "国籍", get: (w) => w.nationality },
  { label: "生年月日", get: (w) => w.birth },
  { label: "住所", get: (w) => w.address },
  { label: "旅券番号", get: (w) => w.passport_no },
  { label: "旅券の有効期限", get: (w) => w.passport_expiry_date },
  { label: "在留資格", get: (w) => w.residence_status },
  { label: "在留カード番号", get: (w) => w.residence_card_no },
  { label: "雇用開始年月日", get: (w) => w.employment_start_on },
  { label: "専門級の職種", get: (w) => w.specialty_grade },
  { label: "Messanger 🔗", get: (w) => w.messenger_link },
];

export function buildNotionTransferText(worker: Worker): string {
  return FIELD_MAP.map(({ label, get }) => ({
    label,
    value: (get(worker) ?? "").toString().trim(),
  }))
    .filter((x) => x.value.length > 0)
    .map((x) => `${x.label}：${x.value}`)
    .join("\n");
}
