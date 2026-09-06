"use client";

import { useEffect, useState } from "react";
import { Stamp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { rosterJpDate } from "@/lib/roster";
import {
  buildVisaHistory,
  type VisaHistoryApplication,
  type VisaHistoryCard,
  type VisaHistoryRow,
} from "@/lib/visa-history";

// 在留資格の履歴（いつ何のビザが許可されたか）。
// 「2023年10月5日 特定活動 ビザ許可」「2026年4月23日 特定技能1号 更新許可」のように
// 古い順で並べる。申請一覧の許可欄・在留カードの記録・今の在留カードから自動で作る。
export function WorkerVisaHistory({
  workerId,
  cardNo,
  status,
  permitDate,
  expiryDate,
}: {
  workerId: string;
  // 今の在留カード（いちばん新しい許可として履歴の最後に出す）。
  // 入れ替わりで作り直されないよう、まとめた形ではなく1項目ずつ受け取る
  cardNo: string;
  status: string;
  permitDate: string | null;
  expiryDate: string | null;
}) {
  const [rows, setRows] = useState<VisaHistoryRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void Promise.all([
      supabase
        .from("immigration_applications")
        .select(
          "content, approved, approval_date, granted_permit_date, granted_expiry_date, granted_card_no, visa_at_grant",
        )
        .eq("worker_id", workerId)
        .then(({ data }) => (data as VisaHistoryApplication[] | null) ?? []),
      // 在留カードの記録（0137）。未適用の環境でも他の元データだけで出せるようにする
      supabase
        .from("worker_card_history")
        .select(
          "residence_card_no, residence_status, residence_permit_date, residence_expiry_date",
        )
        .eq("worker_id", workerId)
        .then(({ data }) => (data as VisaHistoryCard[] | null) ?? []),
    ]).then(([apps, cards]) => {
      if (cancelled) return;
      setRows(
        buildVisaHistory({
          apps,
          cards,
          current: permitDate
            ? {
                residence_card_no: cardNo,
                residence_status: status,
                residence_permit_date: permitDate,
                residence_expiry_date: expiryDate,
                residence_period: "",
              }
            : null,
        }),
      );
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [workerId, cardNo, status, permitDate, expiryDate]);

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted">
        <Stamp size={15} />
        在留資格の履歴
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        いつ何のビザが許可されたかを古い順に並べています。申請一覧の許可欄・在留カードの記録・今の在留カードから自動で作られます。
      </p>
      {!loaded ? null : rows.length === 0 ? (
        <p className="rounded-xl bg-background p-3 text-center text-xs text-muted">
          許可の記録がまだありません。申請一覧の申請に許可日（許可時の在留資格・在留期限）を入れると、ここに並びます。
        </p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={`${r.permitDate}_${r.status}`}
              className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 rounded-lg bg-background px-3 py-2 text-xs"
            >
              <span className="font-bold tabular-nums">{rosterJpDate(r.permitDate)}</span>
              <span className="font-bold">{r.label}</span>
              {r.expiryDate && (
                <span className="text-muted">在留期限 {rosterJpDate(r.expiryDate)}</span>
              )}
              {r.cardNo && <span className="text-muted">在留カード {r.cardNo}</span>}
              {r.isCurrent && (
                <span className="rounded-full bg-status-approved-bg px-1.5 py-0.5 text-[10px] font-bold text-status-approved-fg">
                  現在
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
