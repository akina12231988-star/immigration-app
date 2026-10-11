// 職員の表示名（profiles.display_name）。
//
// 職員・権限管理で管理者が名前を付ける。メモ・記録の「誰が」はこの名前で保存し、画面にも名前で出す。
// 名前が付く前に保存した記録にはメールアドレスが入っているので、
// 表示のときにメールアドレス → 名前に置き換える（staffNameOf）。

export interface StaffNameSource {
  display_name: string;
  email: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 前後の空白（全角の空白も）を取り除く。連続する空白は1つにする
export function normalizeStaffName(s: string | null | undefined): string {
  return (s ?? "").replace(/[\s　]+/g, " ").trim();
}

export function isEmailLike(s: string | null | undefined): boolean {
  return EMAIL_RE.test((s ?? "").trim());
}

// 職員の呼び名。名前があれば名前、無ければメールアドレス
export function staffLabel(p: StaffNameSource): string {
  return normalizeStaffName(p.display_name) || p.email;
}

// メールアドレス（小文字）→ 名前。名前が付いていない職員は入れない
export function buildStaffNameMap(profiles: StaffNameSource[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of profiles) {
    const name = normalizeStaffName(p.display_name);
    if (name && p.email) map.set(p.email.trim().toLowerCase(), name);
  }
  return map;
}

// 記録に残っている記入者（名前かメールアドレス）を画面に出す呼び名にする。
// メールアドレスで、その職員に名前が付いていれば名前にする。付いていなければそのまま
export function staffNameOf(author: string | null | undefined, map: Map<string, string>): string {
  const s = (author ?? "").trim();
  if (!s) return "";
  if (!isEmailLike(s)) return s;
  return map.get(s.toLowerCase()) ?? s;
}
