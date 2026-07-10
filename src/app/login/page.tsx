import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DarkModeToggle } from "@/components/DarkModeToggle";

// Googleログイン自体はStage3で実装。ここではデザイン確認用の画面のみ。
export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-brand text-brand-foreground">
      <div className="flex justify-end p-4">
        <DarkModeToggle />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <div className="mb-8 flex flex-col items-center gap-3">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-brand-foreground/70 text-xl font-black">
            入管
          </span>
          <h1 className="text-center text-xl font-bold">
            入管申請管理システム
          </h1>
          <p className="text-center text-sm opacity-80">
            社内専用・入管申請の進捗を一元管理
          </p>
        </div>

        <Card className="w-full max-w-sm bg-surface p-6 text-foreground">
          <p className="mb-5 text-center text-sm text-muted">
            会社のGoogleアカウントでログインしてください
          </p>
          <Link
            href="/"
            className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-surface px-5 font-bold hover:bg-background"
          >
            <GoogleIcon />
            Googleでログイン
          </Link>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
            <ShieldCheck size={14} />
            許可された社内アカウントのみアクセスできます
          </p>
        </Card>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
