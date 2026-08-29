// パスポート更新案内の進捗（純ロジック）。
// 記録テーブルは passport_renewal_guides（0126）。外国人ごとに1件で、
// 案内した日と、案内したときの有効期限（控え）を持つ。

export interface PassportRenewalGuide {
  worker_id: string;
  guided_on: string | null; // 案内した日（null=未案内）
  guided_expiry: string | null; // 案内したときのパスポート有効期限（控え）
}

// 今の有効期限に対して有効な「案内した日」を返す（未案内なら null）。
// パスポートが更新されて有効期限が変わったら、前回の案内は昔のぶんなので
// 数えない（次の更新時期にはまた「未案内」から始まる）。
// guided_expiry が空の古い記録は、そのまま案内済みとして扱う。
export function activeGuidedOn(
  guide: Pick<PassportRenewalGuide, "guided_on" | "guided_expiry"> | undefined | null,
  currentExpiry: string | null,
): string | null {
  if (!guide?.guided_on) return null;
  if (guide.guided_expiry && currentExpiry && guide.guided_expiry !== currentExpiry) return null;
  return guide.guided_on;
}

// worker_passport_files の kind。案内のスクショと新しいパスポートの画像を
// スタンプページ（既定）と区別するための値
export const PASSPORT_FILE_KIND_GUIDE = "更新案内スクショ";
export const PASSPORT_FILE_KIND_RENEWED = "新パスポート";
