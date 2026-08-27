import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_DOWN_PARAM, withAuthTimeout } from "@/lib/auth-timeout";

// 未ログインユーザーを /login へ誘導し、Supabase セッションを更新する
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Supabase 未設定の環境（セットアップ前）ではそのまま通す
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Supabase が不調だと getUser() が返ってこなくなり、全ページが 504（真っ白）になる。
  // 上限を付けて、返らないときはログイン画面へ流し、画面で状況を伝えられるようにする
  const auth = await withAuthTimeout(supabase.auth.getUser());
  const user = auth?.data.user ?? null;
  // 返事が来なかった（＝ログインしていないのか、サーバーが不調なのか分からない）
  const authUnknown = auth === null;

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  if (!user && !isLoginPage) {
    // ログイン後に元のページ（例: QRコードのリンク先 /custody?no=7）へ戻れるよう next に保持する
    const dest = request.nextUrl.pathname + request.nextUrl.search;
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    const params = new URLSearchParams();
    if (dest && dest !== "/") params.set("next", dest);
    // サーバーが不調のときは、ログイン画面でその旨を出す
    if (authUnknown) params.set(AUTH_DOWN_PARAM, "1");
    redirectUrl.search = params.toString() ? `?${params.toString()}` : "";
    return NextResponse.redirect(redirectUrl);
  }
  if (user && isLoginPage) {
    // オープンリダイレクト防止のためアプリ内パスのみ許可
    const next = request.nextUrl.searchParams.get("next");
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    const redirectUrl = new URL(safeNext, request.nextUrl.origin);
    return NextResponse.redirect(redirectUrl);
  }
  return response;
}

export const config = {
  matcher: [
    // 静的ファイルと API ルート（Webhook 等は独自に認証）以外のすべてに適用
    "/((?!_next/static|_next/image|api/|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
