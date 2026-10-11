// 従業員の「在留申請オンラインシステム」のログイン情報（利用者ID・パスワード）の整え方。
//
// コピーして貼り付けたときに前後に空白（全角の空白・改行・タブも）が付きやすいので、
// 保存のときに取り除く。中の文字はそのまま（パスワードの途中の空白は消さない）

export function normalizeLoginField(value: string | null | undefined): string {
  // JavaScript の trim() は全角の空白（U+3000）も含めて前後の空白を取る
  return (value ?? "").trim();
}

export interface EmployeeOnlineLoginInput {
  online_user_id: string;
  online_password: string;
}

// 保存する形にそろえる（利用者ID・パスワードの前後の空白を取る）
export function normalizeEmployeeOnlineLogin<T extends EmployeeOnlineLoginInput>(input: T): T {
  return {
    ...input,
    online_user_id: normalizeLoginField(input.online_user_id),
    online_password: normalizeLoginField(input.online_password),
  };
}

// 画面でパスワードを隠して出すときの文字（長さは実際の文字数に合わせない。桁数を知られないように）
export const PASSWORD_MASK = "••••••••";
