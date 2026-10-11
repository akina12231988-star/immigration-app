// パスワードの再設定・変更の共通ロジック。
//
// 流れ: ログイン画面の「パスワードを忘れた方」→ メールアドレスを入れる → Supabase から再設定メール
//       → メールのリンクで /reset-password を開く → 新しいパスワードを2回入れて保存。
// 招待メールのリンクも同じ /reset-password に着き、招待された人が最初のパスワードをここで決める。
// 認証アプリ（二段階認証）を登録済みの人は、パスワードを変える前にコードの確認を求める。

export const RESET_PASSWORD_PATH = "/reset-password";
export const FORGOT_PASSWORD_PATH = "/login/forgot";
export const PASSWORD_MIN_LENGTH = 8;

// 新しいパスワードの確認。問題なければ null、あれば日本語の理由
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`;
  }
  if (/^\d+$/.test(password)) {
    return "数字だけのパスワードは使えません。英字も入れてください";
  }
  if (/^[a-zA-Z]+$/.test(password)) {
    return "英字だけのパスワードは使えません。数字も入れてください";
  }
  if (/\s/.test(password)) {
    return "パスワードに空白は使えません";
  }
  if (password !== confirm) {
    return "確認用のパスワードが一致しません";
  }
  return null;
}

// Supabase の認証エラーを日本語にする（再設定・変更で起きやすいもの）
export function passwordErrorMessage(message: string | undefined, fallback: string): string {
  const m = message ?? "";
  if (/code verifier|pkce|flow state|invalid flow/i.test(m)) {
    return "このリンクは、メールの送信をした端末・ブラウザで開く必要があります。同じ端末で開き直すか、この画面からもう一度メールを送ってください。";
  }
  if (/expired|invalid.*(token|link|code)|otp.*expired|token has expired|otp_expired|access_denied/i.test(m)) {
    return "リンクの期限が切れているか、すでに使われています。もう一度メールを送ってください。";
  }
  if (/same.*password|different from the old/i.test(m)) {
    return "今と同じパスワードは使えません。別のパスワードにしてください。";
  }
  if (/weak|at least \d+ characters|password should/i.test(m)) {
    return "パスワードが短いか簡単すぎます。8文字以上で、英字と数字を混ぜてください。";
  }
  if (/reauthentication|nonce/i.test(m)) {
    return "安全のため、いったんログアウトしてから「パスワードを忘れた方」でやり直してください。";
  }
  if (/rate limit|too many|over_email_send_rate_limit/i.test(m)) {
    return "短い時間に送りすぎました。しばらく待ってからもう一度お試しください。";
  }
  return m ? `${fallback}: ${m}` : fallback;
}

// 再設定メールのリンク先（このアプリの /reset-password）。
// サーバー側ではリクエストのホストから、ブラウザでは window.location から組み立てる
export function resetPasswordRedirectUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}${RESET_PASSWORD_PATH}`;
}

// メールのリンクで戻ってきたときの URL のハッシュ（#access_token=… / #error_description=…）を読む。
// 管理者が送る招待メールのリンクは、再設定メール（?code= の PKCE 方式）と違い、
// この implicit 方式で戻ってくるので、両方を受け取れるようにする
export type AuthCallbackHash =
  | { kind: "session"; accessToken: string; refreshToken: string }
  | { kind: "error"; message: string }
  | null;

export function parseAuthCallbackHash(hash: string | null | undefined): AuthCallbackHash {
  const raw = (hash ?? "").replace(/^#/, "");
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const errorDescription = params.get("error_description") ?? params.get("error_code") ?? params.get("error");
  if (errorDescription) return { kind: "error", message: errorDescription.replace(/\+/g, " ") };
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) return { kind: "session", accessToken, refreshToken };
  return null;
}

// メールのリンクの種類（招待・再設定など）。URL の ?type= か #type= から読む
export function authCallbackType(search: string, hash: string): string {
  const fromSearch = new URLSearchParams(search.replace(/^\?/, "")).get("type");
  if (fromSearch) return fromSearch;
  return new URLSearchParams(hash.replace(/^#/, "")).get("type") ?? "";
}
