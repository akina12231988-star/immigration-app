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

// まとめた PDF のファイル名（〇〇証明書一式.pdf。〇〇は氏名）
export function prepBundleFileName(workerName: string): string {
  const name = (workerName ?? "").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
  return `${name}証明書一式.pdf`;
}

// ---- 課税証明書・納税証明書は、まとめる証明書を選ぶ ----
// 申請準備の添付と、証明書類の請求に届いた証明書の両方があるなど、候補が2つ以上あるときは、
// どれを PDF に入れるかを選んでもらう（選ぶまでは入れない）
export const PREP_BUNDLE_CHOOSE_IDS = new Set(["kazei", "nozei_shiken", "nozei_kokuho"]);

export interface PrepBundleChoiceNeeded<F> {
  id: string;
  label: string;
  files: F[]; // 選べる候補
}

export function applyBundleChoices<F extends { key: string }>(
  items: PrepBundleItem<F>[],
  choices: Record<string, string[]>, // 書類の id → 選んだ候補の key
): { items: PrepBundleItem<F>[]; choosable: PrepBundleChoiceNeeded<F>[]; unchosen: PrepBundleChoiceNeeded<F>[] } {
  const choosable: PrepBundleChoiceNeeded<F>[] = [];
  const unchosen: PrepBundleChoiceNeeded<F>[] = [];
  const out = items.map((i) => {
    if (!PREP_BUNDLE_CHOOSE_IDS.has(i.id) || i.files.length < 2) return i;
    choosable.push({ id: i.id, label: i.label, files: i.files });
    const picked = new Set(choices[i.id] ?? []);
    const files = i.files.filter((f) => picked.has(f.key));
    if (files.length === 0) unchosen.push({ id: i.id, label: i.label, files: i.files });
    // 選ばれていないときは、添付が無いあつかいにはしない（アラートは「どれにするか選んでください」で出す）
    return { ...i, files, satisfied: files.length === 0 ? true : i.satisfied };
  });
  return { items: out, choosable, unchosen };
}
