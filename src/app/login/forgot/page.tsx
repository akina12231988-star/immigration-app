import { KeyRound } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ForgotForm } from "./ForgotForm";

// パスワードを忘れたとき。メールアドレスを入れると再設定メールが届く
export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col bg-brand text-brand-foreground">
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-brand-foreground/70">
            <KeyRound size={30} />
          </span>
          <h1 className="text-center text-xl font-bold">パスワードの再設定</h1>
          <p className="max-w-sm text-center text-sm leading-relaxed opacity-80">
            登録しているメールアドレスを入れると、パスワードを設定し直すためのリンクをメールでお送りします。
          </p>
        </div>
        <Card className="w-full max-w-sm bg-surface p-6 text-foreground">
          <ForgotForm />
          <p className="mt-4 text-center text-xs">
            <Link href="/login" className="font-bold text-brand underline">
              ログイン画面に戻る
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
