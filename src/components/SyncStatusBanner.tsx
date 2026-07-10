"use client";

import { WifiOff } from "lucide-react";
import { useApplications } from "@/lib/application-store";

// Google スプレッドシートとの同期に失敗した場合に、画面上部へ小さく警告を出す。
// データ自体はローカルキャッシュ操作を続けられるため、致命的エラーとしては扱わない。
export function SyncStatusBanner() {
  const { syncError } = useApplications();
  if (!syncError) return null;

  return (
    <div className="flex items-center gap-2 bg-seal/10 px-4 py-2 text-xs font-bold text-seal">
      <WifiOff size={14} className="shrink-0" />
      <span>{syncError}</span>
    </div>
  );
}
