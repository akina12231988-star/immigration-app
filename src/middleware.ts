import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

// ログイン必須のルート保護。/login と /api/auth/* 以外は全てセッションCookieを要求する。
export async function middleware(request: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token && secret ? await verifySessionToken(token, secret) : null;

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/login";

  if (!session && !isLoginPage) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (session && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
