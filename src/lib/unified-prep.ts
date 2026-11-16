// 申請書類作成をアプリ一本化計画（試験中）。
//
// 入管の提出書類一覧表と同じ番号・順番で書類を並べ、有／無を選び、「有」の書類をそこで添付・作成していく
// 新しい申請準備の詳細画面を、管理者だけが開ける試験用のページ（/workers/[id]/application-prep/unified）で作る。
// 動作に問題がなければ、今の申請準備の詳細画面と入れ替える（docs/10_unified_prep_plan.md）。

export const UNIFIED_PREP_TITLE = "申請書類作成をアプリ一本化計画（試験中）";

// 試験用ページを開けるのは管理者（職員・権限管理で「管理者」の人）だけ
export function canUseUnifiedPrep(role: string | null | undefined): boolean {
  return role === "admin";
}
