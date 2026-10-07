// 二段階認証（認証アプリのワンタイムコード、TOTP）の共通ロジック。
//
// 全職員に必須。パスワードでログインしただけの状態（aal1）では業務画面に入れず、
//   - 認証アプリを登録していない人 → 登録画面（/mfa/setup）
//   - 登録済みの人               → コード入力画面（/mfa/verify）
// へ流す。コードが通ると Supabase のセッションが aal2 になり、業務画面に入れる。
//
// ミドルウェア・ログイン画面・getMyProfile() がこのファイルの判定を共通で使う。

export const MFA_SETUP_PATH = "/mfa/setup";
export const MFA_VERIFY_PATH = "/mfa/verify";

// 二段階認証が済んだあとのセッションの保証レベル（Supabase の aal クレーム）
export const AAL_VERIFIED = "aal2";

// ログイン後に進む画面
export type MfaStep = "setup" | "verify" | "done";

// Supabase の user.factors の必要な部分だけ
export interface MfaFactorLike {
  factor_type: string;
  status: string;
}

// 認証アプリ（TOTP）の登録が完了している要素だけを返す
export function verifiedTotpFactors<T extends MfaFactorLike>(
  factors: readonly T[] | null | undefined,
): T[] {
  return (factors ?? []).filter((f) => f.factor_type === "totp" && f.status === "verified");
}

// セッションの保証レベルと登録済みの要素から、次に進む画面を決める。
//   currentLevel … supabase.auth.mfa.getAuthenticatorAssuranceLevel() の currentLevel
//   factors      … supabase.auth.getUser() が返す user.factors
export function mfaStep(
  currentLevel: string | null | undefined,
  factors: readonly MfaFactorLike[] | null | undefined,
): MfaStep {
  if (verifiedTotpFactors(factors).length === 0) return "setup";
  return currentLevel === AAL_VERIFIED ? "done" : "verify";
}

// ログイン後の戻り先として安全なアプリ内パスだけを通す（オープンリダイレクト防止）
export function safeNextPath(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

// その段階の画面のパス（戻り先 next 付き）
export function mfaStepPath(step: Exclude<MfaStep, "done">, next?: string | null): string {
  const base = step === "setup" ? MFA_SETUP_PATH : MFA_VERIFY_PATH;
  const safe = safeNextPath(next);
  if (safe === "/") return base;
  return `${base}?next=${encodeURIComponent(safe)}`;
}

export function isMfaPath(pathname: string): boolean {
  return pathname === MFA_SETUP_PATH || pathname === MFA_VERIFY_PATH;
}

// 入力されたコードを6桁の数字にそろえる（空白・全角数字を許す）。形式が違えば null
export function normalizeTotpCode(input: string): string | null {
  const digits = input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

// Supabase の認証エラーを日本語にする
export function mfaErrorMessage(message: string | undefined, fallback: string): string {
  const m = message ?? "";
  if (/invalid totp code|invalid code|incorrect/i.test(m)) {
    return "コードが正しくありません。認証アプリに今表示されている6桁を入れてください（時間切れのときは次のコードで）。";
  }
  if (/expired/i.test(m)) {
    return "確認の時間が切れました。もう一度コードを入れてください。";
  }
  if (/mfa.*(disabled|not enabled)|totp.*(disabled|not enabled)/i.test(m)) {
    return "Supabase で二段階認証（TOTP）が無効になっています。Authentication ＞ Multi-Factor で有効にしてください。";
  }
  if (/friendly name/i.test(m)) {
    return "同じ名前の登録が残っています。画面を再読み込みしてやり直してください。";
  }
  return m ? `${fallback}: ${m}` : fallback;
}

// 認証アプリに表示される登録名（同じ名前は登録できないため日時を付ける）
export function totpFriendlyName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `入管申請管理 ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}
