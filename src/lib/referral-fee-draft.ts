// 求職一覧で「紹介手数料台帳に追加」する前に入力する下書き（手数料・紹介売上No.）。
//
// 手数料は所属機関マスタのあっせん明細から初期値を入れている。
// 片方だけ入力したときにもう片方が消えないよう、書き換えの土台は
// 「今の下書き（初期値を含む）」にする。

export interface ReferralFeeDraft {
  fee: string; // 紹介手数料（円・税抜）
  salesNo: string; // 紹介売上No.（freee販売）
}

export type ReferralFeeDrafts = Record<string, ReferralFeeDraft>;

// 表示に使う下書き。まだ触っていない応募は、所属機関マスタの手数料を初期値にする
export function feeDraftOf(
  drafts: ReferralFeeDrafts,
  id: string,
  defaultFee: string,
): ReferralFeeDraft {
  return drafts[id] ?? { fee: defaultFee, salesNo: "" };
}

// 下書きの一部を書き換える。
// 土台を空にすると、紹介売上No.を入れたときに手数料が消えてしまうため、
// 必ず feeDraftOf（初期値を含む）を土台にする。
export function patchFeeDraft(
  drafts: ReferralFeeDrafts,
  id: string,
  defaultFee: string,
  patch: Partial<ReferralFeeDraft>,
): ReferralFeeDrafts {
  return { ...drafts, [id]: { ...feeDraftOf(drafts, id, defaultFee), ...patch } };
}
