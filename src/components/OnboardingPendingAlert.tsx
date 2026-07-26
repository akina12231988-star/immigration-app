"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, PackageCheck, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  listPendingOnboardingDocs,
  markOnboardingDocReceived,
  type PendingOnboardingDoc,
} from "@/lib/supabase/queries/onboarding";
import { isPendingDocOverdue, pendingDaysElapsed } from "@/lib/onboarding";
import { todayStr } from "@/lib/ssw/calc";

// 入社書類の未提出アラート:
// 後送・未入手のまま本人からまだ届いていない書類を「誰が・何を・何日経過」で外国人ごとに一覧する。
// 期日（いつまでに送るか）を過ぎたものは赤字で強調し、届いたら「受領」で消し込む。
export function OnboardingPendingAlert() {
  const [docs, setDocs] = useState<PendingOnboardingDoc[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const today = todayStr();

  useEffect(() => {
    listPendingOnboardingDocs(createClient())
      .then(setDocs)
      .catch(() => undefined);
  }, []);

  // 外国人ごとにまとめる（クエリは worker_id・書類番号順で返る）
  const byWorker = useMemo(() => {
    const groups = new Map<string, { name: string; docs: PendingOnboardingDoc[] }>();
    for (const d of docs) {
      const g = groups.get(d.worker_id) ?? { name: d.workers?.name ?? "（不明）", docs: [] };
      g.docs.push(d);
      groups.set(d.worker_id, g);
    }
    return [...groups.entries()];
  }, [docs]);

  if (docs.length === 0) return null;

  const receive = async (id: string) => {
    setBusyId(id);
    try {
      await markOnboardingDocReceived(createClient(), id, today);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch {
      /* 権限が無い場合などは表示を変えない */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <div className="rounded-2xl border-2 border-status-notice-fg bg-status-notice-bg/50 p-4">
        <div className="mb-2 flex items-center gap-2 font-bold text-status-notice-fg">
          <TriangleAlert size={18} />
          入社書類の未提出 {docs.length}件（{byWorker.length}名）
        </div>
        <p className="mb-2 text-xs text-status-notice-fg/90">
          後送・未入手のままの書類です。本人から届いたら「受領」を押してください。
        </p>
        <div className="space-y-2">
          {byWorker.map(([workerId, group]) => (
            <div key={workerId} className="rounded-lg bg-surface px-3 py-2">
              <Link
                href={`/onboarding?worker=${workerId}`}
                className="mb-1 flex items-center justify-between gap-2"
              >
                <span className="truncate text-sm font-bold">{group.name}</span>
                <ChevronRight size={16} className="shrink-0 text-status-notice-fg" />
              </Link>
              <div className="space-y-1">
                {group.docs.map((d) => {
                  const overdue = isPendingDocOverdue(d.due_on, today);
                  const elapsed = pendingDaysElapsed(d.pending_since, today);
                  return (
                    <div key={d.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 text-xs">
                        <span
                          className={`mr-1.5 inline-block rounded px-1 py-0.5 text-[10px] font-bold ${
                            d.status === "後送"
                              ? "bg-status-notice-bg text-status-notice-fg"
                              : "bg-seal/10 text-seal"
                          }`}
                        >
                          {d.status}
                        </span>
                        {d.label}
                        <span
                          className={`ml-1.5 tabular-nums ${
                            overdue ? "font-bold text-seal" : "text-muted"
                          }`}
                        >
                          {elapsed !== null && `${elapsed}日経過`}
                          {d.due_on && `・${d.due_on} まで`}
                          {overdue && "（期日超過）"}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => receive(d.id)}
                        disabled={busyId === d.id}
                        className="flex shrink-0 items-center gap-1 rounded-lg border border-status-notice-fg/50 px-2.5 py-1 text-[11px] font-bold text-status-notice-fg disabled:opacity-50"
                      >
                        <PackageCheck size={13} />
                        受領
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
