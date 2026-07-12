"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();

  const onLogout = async () => {
    if (!confirm("ログアウトしますか？")) return;
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={onLogout}
      aria-label="ログアウト"
      className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-brand-foreground/10"
    >
      <LogOut size={18} />
    </button>
  );
}
