import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthConfig, setAuthConfig } from "@/lib/google/gas-client";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

// ログイン設定画面から、社内共通のID・パスワードを変更する。
// 現在のパスワードの再入力を必須とし、セッション奪取だけでは変更できないようにする。
export async function POST(request: Request) {
  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET が設定されていません");

    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token, secret) : null;
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "ログインが必要です" },
        { status: 401 }
      );
    }

    const { currentPassword, newUsername, newPassword } =
      (await request.json()) as {
        currentPassword?: string;
        newUsername?: string;
        newPassword?: string;
      };

    if (!currentPassword || !newUsername || !newPassword) {
      return NextResponse.json(
        { ok: false, error: "すべての項目を入力してください" },
        { status: 400 }
      );
    }
    if (newPassword.length < 6) {
      return NextResponse.json(
        { ok: false, error: "パスワードは6文字以上にしてください" },
        { status: 400 }
      );
    }

    const config = await getAuthConfig({
      defaultUsername: "admin",
      defaultPasswordHash: "",
    });

    if (!verifyPassword(currentPassword, config.passwordHash)) {
      return NextResponse.json(
        { ok: false, error: "現在のパスワードが正しくありません" },
        { status: 401 }
      );
    }

    await setAuthConfig({
      username: newUsername,
      passwordHash: hashPassword(newPassword),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
