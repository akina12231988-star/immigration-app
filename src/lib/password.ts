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
  if (/expired|invalid.*(token|link|code)|otp.*expired|token has expired/i.test(m)) {
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
