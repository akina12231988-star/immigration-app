"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ApplicationResultBadge } from "@/components/postings/ApplicationResultBadge";
import { createClient } from "@/lib/supabase/client";
import { updateApplication as updateJobApplication } from "@/lib/supabase/queries/jobs";
import { APPLICATION_RESULTS, type ApplicationResult } from "@/types/recruiting";
import type { ApplicationWithRefs } from "@/lib/supabase/queries/jobs";

type ResultFilter = ApplicationResult | "all";

export function JobsExplorer({
  applications,
  canEdit,
}: {
  applications: ApplicationWithRefs[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState(applications);

  // 期間（応募日）で絞った母集団
  const inPeriod = useMemo(
    () =>
      rows.filter((a) => {
        if (from && a.applied_on < from) return false;
        if (to && a.applied_on > to) return false;
        return true;
      }),
    [rows, from, to],
  );

  const stats = useMemo(() => {
    const s = { total: inPeriod.length, 選考中: 0, 採用: 0, 不採用: 0, 辞退: 0 };
    for (const a of inPeriod) s[a.result as ApplicationResult] += 1;
    return s;
  }, [inPeriod]);

  const filtered = useMemo(
    () => (filter === "all" ? inPeriod : inPeriod.filter((a) => a.result === filter)),
    [inPeriod, filter],
  );

  const changeResult = async (id: string, result: ApplicationResult) => {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, result } : r)));
    try {
      // 結果が確定したら結果日を今日で補完（DB制約: 選考中以外は結果日必須）
      const patch: { result: ApplicationResult; result_on?: string } = { result };
      if (result !== "選考中") patch.result_on = new Date().toISOString().slice(0, 10);
      await updateJobApplication(createClient(), id, patch);
      router.refresh();
    } catch {
      setRows(prev);
    }
  };

  return (
    <div className="space-y-4">
      {/* 期間集計（人材紹介事業の定期報告用） */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">開始日（応募日）</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">終了日</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm" />
          </label>
          {(from || to) && (
            <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="text-xs font-bold text-brand">
              期間クリア
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          <StatBox label="応募" value={stats.total} />
          <StatBox label="選考中" value={stats.選考中} />
          <StatBox label="採用" value={stats.採用} />
          <StatBox label="不採用" value={stats.不採用} />
          <StatBox label="辞退" value={stats.辞退} />
        </div>
      </Card>

      {/* ステータス絞り込み */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Chip label="すべて" active={filter === "all"} onClick={() => setFilter("all")} />
        {APPLICATION_RESULTS.map((r) => (
          <Chip key={r} label={r} active={filter === r} onClick={() => setFilter(r)} />
        ))}
      </div>

      <p className="text-sm font-bold text-muted">{filtered.length}件</p>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">該当する応募はありません。</Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((a) => (
            <Card key={a.id} className="p-3.5">
              <div className="flex items-center gap-3">
                <Link href={a.workers ? `/workers/${a.workers.id}` : "#"} className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <p className="truncate font-bold">{a.workers?.name ?? "（削除済み）"}</p>
                    <ApplicationResultBadge result={a.result as ApplicationResult} />
                  </div>
                  <p className="truncate text-xs text-muted">
                    {a.job_postings?.display_company || a.organizations?.name || "応募先"}
                  </p>
                  <p className="flex items-center gap-1 text-xs tabular-nums text-muted">
                    <CalendarClock size={12} />
                    応募 {a.applied_on}
                    {a.interview_on && ` ・ 面接 ${a.interview_on}`}
                    {a.result_on && ` ・ 結果 ${a.result_on}`}
                  </p>
                </Link>
                <ChevronRight size={16} className="shrink-0 text-muted" />
              </div>
              {canEdit && (
                <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                  <span className="text-[11px] font-bold text-muted">結果変更:</span>
                  <select
                    value={a.result}
                    onChange={(e) => changeResult(a.id, e.target.value as ApplicationResult)}
                    className="min-h-[36px] flex-1 rounded-lg border border-border bg-background px-2 text-xs font-bold"
                  >
                    {APPLICATION_RESULTS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-background p-3 text-center">
      <p className="text-xl font-black tabular-nums">{value}</p>
      <p className="text-[11px] font-medium text-muted">{label}</p>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
        active ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface text-muted"
      }`}
    >
      {label}
    </button>
  );
}
