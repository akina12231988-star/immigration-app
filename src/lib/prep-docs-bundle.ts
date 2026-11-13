// 申請準備の「必要な書類の準備」で添付したファイルを、1つの PDF にまとめるための選び分け。
// 在留カード・顔写真・パスポートは除く（入管へ別に出すため）。
// 添付が無い書類は、アラートに出す（準備状況で「対象外」などにして揃ったことになっている書類は出さない）

export const PREP_BUNDLE_EXCLUDED_KINDS = new Set(["photo", "residenceCardDoc", "passportFile"]);

export interface PrepBundleItem<F> {
  id: string;
  label: string;
  kind: string; // 書類の取り方（def.source.kind）
  satisfied: boolean; // 揃っているか
  mailAfterApply: boolean; // 申請後に郵送
  issueNoMail: boolean; // 申請後に発行のみ
  files: F[]; // 添付済みのファイル
}

export interface PrepBundleMissing {
  id: string;
  label: string;
  reason: string; // 未添付 / 申請後に郵送 / 申請後に発行のみ
}

export function prepBundlePlan<F>(items: PrepBundleItem<F>[]): {
  targets: { id: string; label: string; files: F[] }[];
  missing: PrepBundleMissing[];
} {
  const own = items.filter((i) => !PREP_BUNDLE_EXCLUDED_KINDS.has(i.kind));
  const targets = own.filter((i) => i.files.length > 0).map((i) => ({ id: i.id, label: i.label, files: i.files }));
  const missing = own
    .filter((i) => i.files.length === 0 && !i.satisfied)
    .map((i) => ({
      id: i.id,
      label: i.label,
      reason: i.mailAfterApply ? "申請後に郵送" : i.issueNoMail ? "申請後に発行のみ" : "未添付",
    }));
  return { targets, missing };
}

// まとめた PDF のファイル名（氏名_TODO番号_申請書類一式.pdf）
export function prepBundleFileName(workerName: string, todoNo: string): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "");
  return [safe(workerName) || "申請準備", safe(todoNo), "申請書類一式"].filter(Boolean).join("_") + ".pdf";
}
