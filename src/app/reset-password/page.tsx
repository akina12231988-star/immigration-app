import { KeyRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

// 再設定メール・招待メールのリンクから開く画面。新しいパスワードを決めて保存する。
// ログインの有無にかかわらず開ける（ミドルウェアで素通し）。リンクの確認はブラウザ側で行う
export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col bg-brand text-brand-foreground">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-brand-foreground/70">
            <KeyRound size={30} />
          </span>
          <h1 className="text-center text-xl font-bold">パスワードを設定してください</h1>
          <p className="max-w-sm text-center text-sm leading-relaxed opacity-80">
            新しいパスワードを2回入れて「保存する」を押すと、次回からそのパスワードでログインできます。
          </p>
        </div>
        <Card className="w-full max-w-sm bg-surface p-6 text-foreground">
          <ResetPasswordForm />
        </Card>
      </div>
    </div>
  );
}
