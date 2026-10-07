"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 二段階認証の途中でやめる（別のアカウントで入り直すときなど）
export function MfaLogoutLink() {
  const router = useRouter();
  const onClick = async () => {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };
  return (
    <button type="button" onClick={onClick} className="shrink-0 font-bold underline">
      ログアウト
    </button>
  );
}
