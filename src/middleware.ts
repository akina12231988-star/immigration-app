import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_DOWN_PARAM, withAuthTimeout } from "@/lib/auth-timeout";
import { isMfaPath, mfaStep, mfaStepPath, safeNextPath } from "@/lib/mfa";
import { RESET_PASSWORD_PATH } from "@/lib/password";

// 未ログインユーザーを /login へ誘導し、Supabase セッションを更新する。
// ログイン済みでも二段階認証（認証アプリのコード）が済んでいなければ、
// 登録画面またはコード入力画面へ流し、業務画面には入れない
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Supabase 未設定の環境（セットアップ前）ではそのまま通す
  if (!url || !anonKey) return NextResponse.next();

  // パスワードの再設定・招待のリンクから開く画面は、ログインの有無にかかわらず開ける
  // （リンクの確認はブラウザ側で行う）。Supabase の Redirect URL の設定漏れでトップに
  // 着いたときも、?code= があれば再設定の画面へ回す
  if (request.nextUrl.pathname === RESET_PASSWORD_PATH) return NextResponse.next({ request });
  if (request.nextUrl.pathname === "/" && request.nextUrl.searchParams.has("code")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = RESET_PASSWORD_PATH;
    return NextResponse.redirect(redirectUrl);
  }

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
  if (user) {
    // 二段階認証の進み具合。保証レベルはセッションのトークンから、登録済みの要素は
    // いま確認した user から見る（古い cookie の内容に左右されないように）
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const step = mfaStep(aal?.currentLevel, user.factors);
    const isMfaPage = isMfaPath(request.nextUrl.pathname);

    if (isLoginPage || isMfaPage) {
      // オープンリダイレクト防止のためアプリ内パスのみ許可
      const safeNext = safeNextPath(request.nextUrl.searchParams.get("next"));
      if (step === "done") {
        // 済んでいる人はログイン画面・二段階認証の画面に用はない
        return NextResponse.redirect(new URL(safeNext, request.nextUrl.origin));
      }
      // ログイン画面からは次の段階へ。登録済みの人が登録画面に来たらコード入力へ、
      // 未登録の人がコード入力に来たら登録へ
      const expected = mfaStepPath(step, safeNext);
      if (request.nextUrl.pathname !== expected.split("?")[0]) {
        return NextResponse.redirect(new URL(expected, request.nextUrl.origin));
      }
    } else if (step !== "done") {
      // 業務画面に入る前に、認証アプリの登録またはコード入力へ
      const dest = request.nextUrl.pathname + request.nextUrl.search;
      return NextResponse.redirect(
        new URL(mfaStepPath(step, dest === "/" ? null : dest), request.nextUrl.origin),
      );
    }
  }
  return response;
}

export const config = {
  matcher: [
    // 静的ファイルと API ルート（Webhook 等は独自に認証）、
    // 外国人本人が使う履歴書ツール（/resume）以外のすべてに適用
    "/((?!_next/static|_next/image|api/|resume(?:/|$)|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
