// 所属機関（会社）との連絡の記録（organization_contacts・0203）。
// 連絡があった日・方法・内容・対応した人を1件1行で残し、新しい順に出す。

export const CONTACT_METHODS = ["", "電話", "メール", "Messenger", "LINE", "訪問", "来社", "郵送", "その他"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

export interface OrganizationContact {
  id: string;
  organization_id: string;
  contacted_on: string; // YYYY-MM-DD
  method: string;
  content: string;
  staff: string; // 対応した人（こちら側）
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type OrganizationContactInput = Pick<
  OrganizationContact,
  "organization_id" | "contacted_on" | "method" | "content" | "staff"
>;

// 連絡があった日の新しい順（同じ日なら登録の新しい順）
export function sortContactsNewestFirst<T extends Pick<OrganizationContact, "contacted_on" | "created_at">>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const d = b.contacted_on.localeCompare(a.contacted_on);
    return d !== 0 ? d : b.created_at.localeCompare(a.created_at);
  });
}

// 保存前の入力チェック（日付と内容は必須）。問題なければ null
export function contactInputError(input: Pick<OrganizationContactInput, "contacted_on" | "content">): string | null {
  if (!input.contacted_on) return "連絡があった日を入れてください";
  if (!input.content.trim()) return "連絡の内容を入れてください";
  return null;
}
