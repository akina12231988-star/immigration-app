"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isPassportRenewalListTarget } from "@/lib/worker-alerts";
import { todayStr } from "@/lib/application-alerts";

// メニューに出すアラート件数。
//  passports    … パスポート更新必要の人数（有効期限まで半年以内。パスポート更新必要のページと同じ判定）
//  orientations … 実施予定日を過ぎた未実施の生活オリエンテーションの件数
export interface NavAlerts {
  passports: number;
  orientations: number;
}

export function useNavAlerts(): NavAlerts {
  const [alerts, setAlerts] = useState<NavAlerts>({ passports: 0, orientations: 0 });

  useEffect(() => {
    const supabase = createClient();
    const today = todayStr();
    // テーブル未作成などで失敗しても、メニュー表示自体は影響を受けないよう握りつぶす
    void supabase
      .from("workers")
      .select("support, status, passport_expiry_date")
      .not("passport_expiry_date", "is", null)
      .then(({ data }) => {
        const rows =
          (data as { support: string; status: string; passport_expiry_date: string | null }[] | null) ??
          [];
        // 一覧（パスポート更新必要）と同じ判定: 現在も支援中の人だけ数える
        const count = rows.filter((w) =>
          isPassportRenewalListTarget(
            w as Parameters<typeof isPassportRenewalListTarget>[0],
            today,
          ),
        ).length;
        setAlerts((a) => ({ ...a, passports: count }));
      });
    void supabase
      .from("orientations")
      .select("id", { count: "exact", head: true })
      .eq("status", "未実施")
      .lte("scheduled_on", today)
      .then(({ count }) => setAlerts((a) => ({ ...a, orientations: count ?? 0 })));
  }, []);

  return alerts;
}
