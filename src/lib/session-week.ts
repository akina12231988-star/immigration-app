// 毎週月曜日の 0時（日本時間）を過ぎたら、ログインし直してもらう。
//
// Supabase のセッションは放っておくと更新され続け、一度ログインしたらずっと入れる。
// 社内の端末が置き忘れ・持ち出しされたときの備えとして、週の初めには必ずパスワードと
// 認証アプリのコードを入れ直してもらう。
// 「いつログインしたか」は、セッションのトークン（JWT）の amr（使った認証方法とその時刻）から見る。
// この時刻はトークンが更新されても変わらないので、最後にパスワード／認証アプリを通した時刻が分かる。

export const WEEK_EXPIRED_PARAM = "expired";
export const WEEK_EXPIRED_VALUE = "week";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// now 以前で最新の「月曜日 0:00（日本時間）」
export function weekStartJst(now: Date): Date {
  // 日本時間の壁時計を UTC の目盛りに移して曜日と日付を取る（日本に夏時間は無い）
  const shifted = new Date(now.getTime() + JST_OFFSET_MS);
  const daysSinceMonday = (shifted.getUTCDay() + 6) % 7; // 月=0 … 日=6
  const mondayShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - daysSinceMonday,
  );
  return new Date(mondayShifted - JST_OFFSET_MS);
}

// JWT の中身（署名の検証はしない。ログイン確認は getUser() で済ませたあとに時刻だけ読む）
export function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = decodeURIComponent(
      Array.from(atob(padded), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""),
    );
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// 最後にパスワード／認証アプリを通した時刻。
// amr（[{ method, timestamp(秒) }]）の中でいちばん新しいもの。無ければ last_sign_in_at
export function lastAuthAt(
  claims: Record<string, unknown> | null,
  lastSignInAt: string | null | undefined,
): Date | null {
  const amr = claims?.amr;
  let latest = 0;
  if (Array.isArray(amr)) {
    for (const entry of amr) {
      const ts = (entry as { timestamp?: unknown } | null)?.timestamp;
      if (typeof ts === "number" && ts > latest) latest = ts;
    }
  }
  if (latest > 0) return new Date(latest * 1000);
  if (lastSignInAt) {
    const d = new Date(lastSignInAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

// 最後のログインが今週の月曜 0時より前なら、ログインし直してもらう。
// いつログインしたか分からないときは追い出さない（誤って閉め出さないため）
export function mustReLogin(lastAuth: Date | null, now: Date): boolean {
  if (!lastAuth) return false;
  return lastAuth.getTime() < weekStartJst(now).getTime();
}
