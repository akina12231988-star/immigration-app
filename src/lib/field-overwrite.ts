// 在留カード・パスポートMRZからフォームへ反映するときに、
// 「すでに入っている値を書き換えてしまう項目」を洗い出す。
//
// 空いている項目はそのまま入れてよいが、入力済みの項目を別の値にするときは
// 何がどう変わるかを見せて確認してもらう。

export interface FieldChange {
  key: string;
  label: string; // 画面に出す項目名
  before: string; // 今入っている値
  after: string; // 反映しようとしている値
}

// 反映で変わる項目（空欄が埋まるものは含めない＝確認が要るものだけ）
export function overwrittenFields(
  current: Record<string, unknown>,
  patch: Record<string, string>,
  labels: Record<string, string>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const [key, after] of Object.entries(patch)) {
    const raw = current[key];
    const before = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw);
    if (before === "" || before === after) continue;
    changes.push({ key, label: labels[key] ?? key, before, after });
  }
  return changes;
}

// 反映で新しく埋まる項目の数（「◯件を反映します」の案内に使う）
export function filledFieldCount(
  current: Record<string, unknown>,
  patch: Record<string, string>,
): number {
  return Object.entries(patch).filter(([key, after]) => {
    const raw = current[key];
    const before = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw);
    return before !== after;
  }).length;
}
