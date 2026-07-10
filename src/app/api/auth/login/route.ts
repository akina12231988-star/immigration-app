import { NextResponse } from "next/server";
import { getAuthConfig } from "@/lib/google/gas-client";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

// 初回アクセス時のみ使われる初期ログイン情報。ログイン後は必ず「ログイン設定」から変更すること。
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "change-me-123";

export async function POST(request: Request) {
  try {
    const { username, password } = (await request.json()) as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return NextResponse.json(
        { ok: false, error: "IDとパスワードを入力してください" },
        { status: 400 }
      );
    }

    const config = await getAuthConfig({
      defaultUsername: DEFAULT_USERNAME,
      defaultPasswordHash: hashPassword(DEFAULT_PASSWORD),
    });

    const isValid =
      username === config.username &&
      verifyPassword(password, config.passwordHash);

    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: "IDまたはパスワードが正しくありません" },
        { status: 401 }
      );
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      throw new Error("AUTH_SECRET が設定されていません");
    }
    const token = await createSessionToken(username, secret);

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30日
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
