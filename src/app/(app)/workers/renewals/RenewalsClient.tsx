"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { type WorkerWithOrg } from "@/lib/supabase/queries/workers";
import { isResidenceRenewalTarget } from "@/lib/worker-alerts";
import { todayStr } from "@/lib/application-alerts";
import { type ResidenceRenewalStatus } from "@/types/db";
import {
  WorkerRenewalCard,
  RENEWAL_STATUS_LABEL as STATUS_LABEL,
} from "@/components/workers/WorkerRenewalCard";

type HandlingFilter = ResidenceRenewalStatus | "all";

export function RenewalsClient({
  workers,
  underReviewWorkerIds = [],
  canEdit,
}: {
  workers: WorkerWithOrg[];
  underReviewWorkerIds?: string[];
  canEdit: boolean;
}) {
  const today = todayStr();
  const [filter, setFilter] = useState<HandlingFilter>("");

  // 在留期限の期間検索（指定すると3か月の枠を超えてその期間の人を表示できる）
  const [expiryFrom, setExpiryFrom] = useState("");
  const [expiryTo, setExpiryTo] = useState("");
  const hasExpiryRange = Boolean(expiryFrom || expiryTo);

  const underReview = useMemo(() => new Set(underReviewWorkerIds), [underReviewWorkerIds]);

  const targets = useMemo(() => {
    // 期間指定あり: 在留期限がその期間内の人（3か月より先も含む）。
    // 期間指定なし: 従来どおり在留期限の3か月前になった人。
    const inScope = (w: WorkerWithOrg) => {
      if (!hasExpiryRange) return isResidenceRenewalTarget(w, today);
      const d = w.residence_expiry_date;
      if (w.status === "退職" || !d) return false;
      if (expiryFrom && d < expiryFrom) return false;
      if (expiryTo && d > expiryTo) return false;
      return true;
    };
    return workers
      // 退職者・現在申請審査中の人は対象外
      .filter((w) => inScope(w) && !underReview.has(w.id))
      .sort((a, b) => (a.residence_expiry_date ?? "").localeCompare(b.residence_expiry_date ?? ""));
  }, [workers, today, underReview, hasExpiryRange, expiryFrom, expiryTo]);

  const countFor = (f: HandlingFilter) =>
    f === "all" ? targets.length : targets.filter((w) => w.residence_renewal_status === f).length;

  const filtered = useMemo(
    () => (filter === "all" ? targets : targets.filter((w) => w.residence_renewal_status === filter)),
    [targets, filter],
  );

  const pendingCount = countFor("");

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
        <CalendarClock size={14} className="mt-0.5 shrink-0" />
        在留期限の3か月前になった対象者です。Notionで申請TODOを作成し、そのTODO番号を入力すると「準備中」になります。「準備中」の人は申請一覧に「申請前＜準備中＞」として表示され、申請したらそこから申請登録できます。弊社で準備しない場合は「転職先にて対応中」「他登録支援機関にて対応中」「帰国」を選べます。
      </p>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-seal/40 bg-seal/10 px-3 py-2.5 text-sm font-bold text-seal">
          <AlertTriangle size={17} className="shrink-0" />
          未対応の在留更新対象が{pendingCount}件あります。
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(["", "準備中", "審査中", "転職先にて対応中", "他登録支援機関にて対応中", "帰国", "all"] as HandlingFilter[]).map((f) => (
          <button
            key={f || "pending"}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-xl border px-3 py-2 text-sm font-bold ${
              filter === f
                ? "border-brand bg-brand text-brand-foreground"
                : "border-border bg-surface text-muted"
            }`}
          >
            {f === "all" ? "すべて" : STATUS_LABEL[f]}（{countFor(f)}）
          </button>
        ))}
      </div>

      {/* 在留期限の期間検索: 見落としがないか期間で確認できる */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface px-3.5 py-3">
        <p className="w-full text-[11px] font-bold text-muted">
          在留期限で期間検索（指定すると3か月より先の人も表示されます）
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">いつから</span>
          <input
            type="date"
            value={expiryFrom}
            onChange={(e) => setExpiryFrom(e.target.value)}
            className="min-h-[40px] rounded-lg border border-border bg-background px-2 text-sm focus:border-brand focus:outline-none"
          />
        </label>
        <span className="pb-2.5 text-muted">〜</span>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">いつまで</span>
          <input
            type="date"
            value={expiryTo}
            onChange={(e) => setExpiryTo(e.target.value)}
            className="min-h-[40px] rounded-lg border border-border bg-background px-2 text-sm focus:border-brand focus:outline-none"
          />
        </label>
        {hasExpiryRange && (
          <button
            type="button"
            onClick={() => {
              setExpiryFrom("");
              setExpiryTo("");
            }}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-border bg-surface px-3 text-xs font-bold text-muted"
          >
            <X size={14} />
            クリア
          </button>
        )}
      </div>

      <p className="text-sm font-bold text-muted">{filtered.length}件</p>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">該当者はいません。</Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((w) => (
            <WorkerRenewalCard
              key={w.id}
              worker={w}
              orgName={w.organizations?.name ?? null}
              today={today}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
