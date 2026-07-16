"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock } from "lucide-react";
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

  const underReview = useMemo(() => new Set(underReviewWorkerIds), [underReviewWorkerIds]);

  const targets = useMemo(
    () =>
      workers
        // 退職者・現在申請審査中の人は対象外
        .filter((w) => isResidenceRenewalTarget(w, today) && !underReview.has(w.id))
        .sort((a, b) => (a.residence_expiry_date ?? "").localeCompare(b.residence_expiry_date ?? "")),
    [workers, today, underReview],
  );

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
        在留期限の3か月前になった対象者です。Notionで申請TODOを作成し、そのTODO番号を入力すると「準備中」になります。弊社で準備しない場合は「転職先にて対応中」「帰国」を選べます。
      </p>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-seal/40 bg-seal/10 px-3 py-2.5 text-sm font-bold text-seal">
          <AlertTriangle size={17} className="shrink-0" />
          未対応の在留更新対象が{pendingCount}件あります。
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(["", "準備中", "審査中", "転職先にて対応中", "帰国", "all"] as HandlingFilter[]).map((f) => (
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
