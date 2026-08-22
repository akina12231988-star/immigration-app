// 外国人詳細のその場編集（編集ボタンでページの表示をそのまま直して保存）の整形。
//
// 画面は文字列の下書き（draft: 項目名→入力中の値）で持ち、保存のときに
// ・現在の値から変わっていない項目は送らない
// ・日付と所属機関は空文字を null にする（DBの型に合わせる）
// ・その他の文字列は前後の空白を落とす
// という差分だけを updateWorker へ渡す。

import type { WorkerInput } from "@/types/db";

// 空文字を null で保存する項目（date型・uuid型の列）
const NULLABLE_KEYS = new Set<string>([
  "birth",
  "residence_permit_date",
  "residence_expiry_date",
  "passport_expiry_date",
  "current_organization_id",
]);

// 入力欄に出す現在の値（null・undefined は空文字にする）
export function workerFieldString(worker: Record<string, unknown>, key: string): string {
  const v = worker[key];
  return v == null ? "" : String(v);
}

// 下書きの値が現在の値から変わっているか（前後の空白だけの違いは変わっていない扱い）
export function isFieldChanged(
  worker: Record<string, unknown>,
  key: string,
  value: string,
): boolean {
  return value.trim() !== workerFieldString(worker, key).trim();
}

// 変わっている項目の数（保存ボタンを出すかの判定に使う）
export function changedFieldCount(
  draft: Record<string, string>,
  worker: Record<string, unknown>,
): number {
  return Object.entries(draft).filter(([key, value]) => isFieldChanged(worker, key, value))
    .length;
}

// 保存する差分。変わった項目だけを、DBに入る形（trim・空文字→null）にして返す
export function buildUpdatePayload(
  draft: Record<string, string>,
  worker: Record<string, unknown>,
): Partial<WorkerInput> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (!isFieldChanged(worker, key, value)) continue;
    const trimmed = value.trim();
    payload[key] = trimmed === "" && NULLABLE_KEYS.has(key) ? null : trimmed;
  }
  return payload as Partial<WorkerInput>;
}
