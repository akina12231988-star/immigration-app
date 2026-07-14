"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { updatePosting } from "@/lib/supabase/queries/postings";
import { formatWage, POSTING_STATUSES, type PostingStatus } from "@/types/recruiting";
import { postingDisplayName } from "@/lib/posting-output";
import type { PostingWithStats } from "@/lib/supabase/queries/postings";

export function PostingsExplorer({
  postings,
  canEdit,
}: {
  postings: PostingWithStats[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<PostingStatus | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState(postings);

  // 期間（求人受付日）で絞った母集団 → 集計に使用
  const inPeriod = useMemo(
    () =>
      rows.filter((p) => {
        if (from && p.received_on < from) return false;
        if (to && p.received_on > to) return false;
        return true;
      }),
    [rows, from, to],
  );

  const stats = useMemo(() => {
    const s = { total: inPeriod.length, 募集中: 0, 充足: 0, 終了: 0 };
    for (const p of inPeriod) s[p.status as PostingStatus] += 1;
    return s;
  }, [inPeriod]);

  const filtered = useMemo(
    () => (statusFilter === "all" ? inPeriod : inPeriod.filter((p) => p.status === statusFilter)),
    [inPeriod, statusFilter],
  );

  const changeStatus = async (id: string, status: PostingStatus) => {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      // 充足・終了になったら無効化年月日を記録、募集中へ戻したらクリア
      const patch: { status: PostingStatus; closed_on?: string | null } = { status };
      patch.closed_on = status === "募集中" ? null : new Date().toISOString().slice(0, 10);
      await updatePosting(createClient(), id, patch);
      router.refresh();
    } catch {
      setRows(prev);
    }
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <LinkButton href="/postings/new" fullWidth icon={<Plus size={20} />}>
          求人を登録
        </LinkButton>
      )}

      {/* 期間集計（人材紹介事業の定期報告用） */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">開始日（受付日）</span>
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
        <div className="grid grid-cols-4 gap-2">
          <StatBox label="求人数" value={stats.total} />
          <StatBox label="募集中" value={stats.募集中} />
          <StatBox label="充足" value={stats.充足} />
          <StatBox label="終了" value={stats.終了} />
        </div>
      </Card>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Chip label="すべて" active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
        {POSTING_STATUSES.map((s) => (
          <Chip key={s} label={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
        ))}
      </div>

      <p className="text-sm font-bold text-muted">{filtered.length}件</p>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">
          {rows.length === 0
            ? "まだ求人がありません。「求人を登録」から追加してください。"
            : "条件に合う求人がありません"}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const applicants = p.job_applications?.length ?? 0;
            const hired = p.job_applications?.filter((a) => a.result === "採用").length ?? 0;
            return (
              <Card key={p.id} className="flex flex-col p-4">
                <Link href={`/postings/${p.id}`} className="min-w-0">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold">
                        {postingDisplayName(p, p.organizations?.name)}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {[p.job_type, p.display_address].filter(Boolean).join(" ・ ") || "詳細未設定"}
                      </p>
                    </div>
                    <ChevronRight size={16} className="mt-1 shrink-0 text-muted" />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted">
                    <span className="font-bold text-foreground">{formatWage(p.wage_kind, p.wage_amount)}</span>
                    <span className="flex items-center gap-1">
                      <Users size={13} />
                      応募{applicants}・採用{hired}/{p.openings}名
                    </span>
                  </div>
                </Link>
                {/* ワンクリック状態変更 */}
                <div className="mt-3 flex gap-1.5 border-t border-border pt-3">
                  {POSTING_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={!canEdit || p.status === s}
                      onClick={() => changeStatus(p.id, s)}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold ${
                        p.status === s
                          ? "bg-brand text-brand-foreground"
                          : "border border-border text-muted hover:bg-background disabled:opacity-50"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Card>
            );
          })}
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
