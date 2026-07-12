import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { LogoutButton } from "@/components/LogoutButton";

export function AppHeader({
  title,
  backHref,
}: {
  title: string;
  backHref?: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-brand text-brand-foreground">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          {backHref ? (
            <Link
              href={backHref}
              aria-label="戻る"
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-brand-foreground/10"
            >
              <ArrowLeft size={20} />
            </Link>
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-brand-foreground/70 text-sm font-black">
              入管
            </span>
          )}
          <div className="leading-tight">
            <p className="text-[11px] font-medium opacity-80">
              入管申請管理システム
            </p>
            <h1 className="text-lg font-bold">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <DarkModeToggle />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
