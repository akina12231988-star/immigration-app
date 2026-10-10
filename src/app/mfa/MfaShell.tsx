import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { MfaLogoutLink } from "./MfaLogoutLink";

// 二段階認証の画面（登録・コード入力）の共通の枠。ログイン画面と同じ見た目にする
export function MfaShell({
  title,
  lead,
  email,
  children,
}: {
  title: string;
  lead: string;
  email: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-brand text-brand-foreground">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-brand-foreground/70">
            <ShieldCheck size={30} />
          </span>
          <h1 className="text-center text-xl font-bold">{title}</h1>
          <p className="max-w-sm text-center text-sm leading-relaxed opacity-80">{lead}</p>
        </div>
        <Card className="w-full max-w-sm bg-surface p-6 text-foreground">
          {children}
          <div className="mt-5 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted">
            <span className="truncate">{email ?? ""}</span>
            <MfaLogoutLink />
          </div>
        </Card>
      </div>
    </div>
  );
}
