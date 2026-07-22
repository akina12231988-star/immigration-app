"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, PackageCheck, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  listPendingOnboardingDocs,
  markOnboardingDocReceived,
  type PendingOnboardingDoc,
} from "@/lib/supabase/queries/onboarding";
import { isPendingDocOverdue } from "@/lib/onboarding";
import { todayStr } from "@/lib/ssw/calc";

// 入社書類の後送アラート:
// 後送予定でメールを送った書類のうち、本人からまだ届いていないものを一覧する。
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
          入社書類の後送待ち {docs.length}件
        </div>
        <p className="mb-2 text-xs text-status-notice-fg/90">
          後送予定でメールを送った書類です。本人から届いたら「受領」を押してください。
        </p>
        <div className="space-y-1.5">
          {docs.map((d) => {
            const overdue = isPendingDocOverdue(d.due_on, today);
            return (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2"
              >
                <Link href={`/onboarding?worker=${d.worker_id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {d.workers?.name ?? "（不明）"}
                    <span className="ml-2 font-medium">{d.label}</span>
                  </span>
                  <span
                    className={`block text-xs tabular-nums ${overdue ? "font-bold text-seal" : "text-muted"}`}
                  >
                    {d.due_on ? `${d.due_on} までに送付` : "期日未設定"}
                    {overdue && "（期日超過）"}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => receive(d.id)}
                  disabled={busyId === d.id}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-status-notice-fg/50 px-2.5 py-1.5 text-[11px] font-bold text-status-notice-fg disabled:opacity-50"
                >
                  <PackageCheck size={13} />
                  受領
                </button>
                <Link href={`/onboarding?worker=${d.worker_id}`} aria-label="入社書類メールを開く">
                  <ChevronRight size={16} className="shrink-0 text-status-notice-fg" />
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
