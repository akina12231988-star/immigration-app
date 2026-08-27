import { ShieldCheck, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; down?: string }>;
}) {
  // ログイン後の戻り先（QRコードのリンク先など）。アプリ内パスのみ許可
  const { next, down } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  // ミドルウェアがログイン確認の返事を待てなかった（Supabase が不調）
  const serverDown = down === "1";
  return (
    <div className="flex min-h-screen flex-col bg-brand text-brand-foreground">
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <div className="mb-8 flex flex-col items-center gap-3">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-brand-foreground/70 text-xl font-black">
            入管
          </span>
          <h1 className="text-center text-xl font-bold">
            外国人材・入管申請管理システム
          </h1>
          <p className="text-center text-sm opacity-80">
            社内専用・職歴と申請の進捗を一元管理
          </p>
        </div>

        {/* 真っ白な504にせず、何が起きているかを画面で伝える */}
        {serverDown && (
          <div
            role="alert"
            className="mb-3 w-full max-w-sm rounded-xl bg-surface p-4 text-foreground"
          >
            <p className="flex items-center gap-1.5 text-sm font-bold text-seal">
              <TriangleAlert size={15} className="shrink-0" />
              サーバーに接続できません
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              データベース（Supabase）から返事がありません。しばらく待つと直ることがあります。
              何度も続くときは、Supabase のダッシュボードで
              <span className="font-bold">Settings ＞ General ＞ Restart project</span>
              を実行してください。ログインしていた方も、いったんこの画面に戻されています。
            </p>
          </div>
        )}

        <Card className="w-full max-w-sm bg-surface p-6 text-foreground">
          <LoginForm next={safeNext} />
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
            <ShieldCheck size={14} />
            招待された職員アカウントのみアクセスできます
          </p>
        </Card>
      </div>
    </div>
  );
}
