"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  countFollowupAlerts,
  countPassportAlerts,
  type NavAlertWorker,
} from "@/lib/nav-alert-counts";
import { todayStr } from "@/lib/application-alerts";

// メニューに出すアラート件数。
//  passports    … パスポート更新必要の人数（有効期限まで半年以内。パスポート更新必要のページと同じ判定）
//  orientations … 実施予定日を過ぎた未実施の生活オリエンテーションの件数
//  followups    … あとでやる手続き（転居手続き・国保/国民年金の加入）が残っている人数
export interface NavAlerts {
  passports: number;
  orientations: number;
  followups: number;
}

// メニューはどのページにも出るので、問い合わせは少なくする。
// パスポートと手続きの宿題はどちらも workers を丸ごと見るため、1回の取得から両方を数える。
const WORKER_COLUMNS = "support, status, passport_expiry_date, followups";
// 0119（followups 列）が未適用の環境では上の取得が失敗するので、その列を外して取り直す
const WORKER_COLUMNS_LEGACY = "support, status, passport_expiry_date";

export function useNavAlerts(): NavAlerts {
  const [alerts, setAlerts] = useState<NavAlerts>({
    passports: 0,
    orientations: 0,
    followups: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const today = todayStr();

    const applyWorkers = (rows: NavAlertWorker[]) => {
      if (cancelled) return;
      setAlerts((a) => ({
        ...a,
        passports: countPassportAlerts(rows, today),
        followups: countFollowupAlerts(rows),
      }));
    };

    // テーブル未作成などで失敗しても、メニュー表示自体は影響を受けないよう握りつぶす
    void supabase
      .from("workers")
      .select(WORKER_COLUMNS)
      .then(({ data, error }) => {
        if (!error) {
          applyWorkers((data as NavAlertWorker[] | null) ?? []);
          return;
        }
        // followups 列が無いだけのときは、パスポートの件数まで出なくならないようにする
        return supabase
          .from("workers")
          .select(WORKER_COLUMNS_LEGACY)
          .then(({ data: legacy }) => applyWorkers((legacy as NavAlertWorker[] | null) ?? []));
      });

    void supabase
      .from("orientations")
      .select("id", { count: "exact", head: true })
      .eq("status", "未実施")
      .lte("scheduled_on", today)
      .then(({ count }) => {
        if (!cancelled) setAlerts((a) => ({ ...a, orientations: count ?? 0 }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return alerts;
}
