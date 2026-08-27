// ミドルウェアでログイン確認をするときの待ち時間の上限。
//
// Supabase が不調になると supabase.auth.getUser() が返ってこなくなり、
// Vercel が打ち切って全ページが 504（真っ白な画面）になる。
// 上限を付けて、返事が来ないときはログイン画面へ流し、
// 「サーバーに接続できません」と画面で伝えられるようにする。

// 5秒。ふだんは0.1〜0.3秒で返るので、ここまで待って返らなければ不調とみなす
export const AUTH_TIMEOUT_MS = 5_000;

// ログイン画面に「サーバーに接続できません」と出すための目印
export const AUTH_DOWN_PARAM = "down";

// 時間内に返らなければ null を返す。
// 返事が来ないまま固まるのを防ぐのが目的なので、失敗しても例外にはしない。
export async function withAuthTimeout<T>(
  work: Promise<T>,
  timeoutMs: number = AUTH_TIMEOUT_MS,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } catch {
    // 通信そのものが失敗したときも、固まらせずログイン画面へ流す
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
