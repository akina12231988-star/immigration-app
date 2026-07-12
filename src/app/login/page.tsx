import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { LoginForm } from "./LoginForm";

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
            外国人材・入管申請管理システム
          </h1>
          <p className="text-center text-sm opacity-80">
            社内専用・職歴と申請の進捗を一元管理
          </p>
        </div>

        <Card className="w-full max-w-sm bg-surface p-6 text-foreground">
          <LoginForm />
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
            <ShieldCheck size={14} />
            招待された職員アカウントのみアクセスできます
          </p>
        </Card>
      </div>
    </div>
  );
}
