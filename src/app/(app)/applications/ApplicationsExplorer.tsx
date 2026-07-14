"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, StickyNote, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/client";
import { listApplicationMemos } from "@/lib/supabase/queries/memos";
import type { ApplicationMemo } from "@/types/application";
import { STAT_VIEWS, type StatViewKey } from "@/lib/application-stats";
import {
  isExpiryAlert,
  todayStr,
  transitionEndDate,
  formatMonthDay,
} from "@/lib/application-alerts";
import type { Application, ApplicationStatus } from "@/types/application";
import { APPLICATION_STATUS_FILTERS } from "@/types/application";

const TODAY = todayStr();

function AlertBadge({ expiry }: { expiry?: string }) {
  const label = expiry
    ? `期限注意（${formatMonthDay(transitionEndDate(expiry))}で経過措置終了）`
    : "期限注意";
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-seal px-2 py-0.5 text-[10px] font-bold text-seal-foreground">
      {label}
    </span>
  );
}

export function ApplicationsExplorer({
  applications,
  initialView = null,
}: {
  applications: Application[];
  initialView?: StatViewKey | null;
}) {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">(
    "all"
  );
  // ホームの集計カードから開いたときの絞り込み（×で解除できる）
  const [statView, setStatView] = useState<StatViewKey | null>(initialView);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return applications.filter((a) => {
      if (statView && !STAT_VIEWS[statView].test(a)) return false;
      const matchesStatus = statusFilter === "all" || a.status === statusFilter;
      if (!matchesStatus) return false;
      if (!kw) return true;
      return (
        a.name.toLowerCase().includes(kw) ||
        a.applicationNumber.toLowerCase().includes(kw) ||
        a.applicationContent.toLowerCase().includes(kw) ||
        a.assignee.toLowerCase().includes(kw)
      );
    });
  }, [applications, keyword, statusFilter, statView]);

  // 「許可済」フィルター時は、入管許可通知後のメモを取得して表示する
  const showApprovedDetail = statusFilter === "許可済";
  const [memosByApp, setMemosByApp] = useState<Record<string, ApplicationMemo[]>>({});
  useEffect(() => {
    if (!showApprovedDetail) return;
    let cancelled = false;
    const supabase = createClient();
    const ids = filtered.map((a) => a.id);
    void Promise.all(
      ids.map(
        async (id) => [id, await listApplicationMemos(supabase, id).catch(() => [])] as const,
      ),
    ).then((entries) => {
      if (!cancelled) setMemosByApp(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [showApprovedDetail, filtered]);

  return (
    <div className="space-y-4">
      {statView && (
        <div className="flex items-center justify-between rounded-xl bg-brand/10 px-3.5 py-2.5">
          <p className="text-sm font-bold text-brand">
            「{STAT_VIEWS[statView].label}」で絞り込み中
          </p>
          <button
            type="button"
            onClick={() => setStatView(null)}
            aria-label="絞り込みを解除"
            className="flex h-7 w-7 items-center justify-center rounded-full text-brand hover:bg-brand/10"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ⑩検索: 氏名・申請番号・申請内容・担当者を横断検索 */}
      <div className="relative">
        <Search
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="氏名・申請番号・申請内容・申請取次士で検索"
          className="w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-3 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <FilterChip
          label="すべて"
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        {APPLICATION_STATUS_FILTERS.map((s) => (
          <FilterChip
            key={s}
            label={s}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
          />
        ))}
      </div>

      <p className="text-sm font-bold text-muted">{filtered.length}件</p>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">該当する申請が見つかりません</p>
      ) : showApprovedDetail ? (
        /* 許可済: 受取予定日＋入管許可通知後のメモを表示 */
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((a) => {
            const memos = memosByApp[a.id] ?? [];
            return (
              <Card key={a.id} className="p-4">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <Link href={`/applications/${a.id}`} className="min-w-0">
                    <p className="truncate font-bold">{a.name}</p>
                    <p className="truncate text-xs text-muted">{a.organizationName ?? "所属機関未設定"}</p>
                  </Link>
                  <StatusBadge status={a.status} />
                </div>
                <p className="text-xs tabular-nums text-muted">
                  受取予定日 {a.receiptScheduledOn ?? "未設定"}
                  {a.receiptReason && ` ・ ${a.receiptReason}`}
                </p>
                <div className="mt-2 border-t border-border pt-2">
                  <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-muted">
                    <StickyNote size={12} />
                    許可通知後のメモ（{memos.length}）
                  </p>
                  {memos.length === 0 ? (
                    <p className="text-xs text-muted">メモはありません</p>
                  ) : (
                    <ul className="space-y-1">
                      {memos.slice(0, 3).map((m) => (
                        <li key={m.id} className="rounded-lg bg-background p-2 text-xs">
                          <span className="block text-[10px] text-muted">
                            {new Date(m.createdAt).toLocaleString("ja-JP")}
                            {m.author && ` ・ ${m.author}`}
                          </span>
                          <span className="whitespace-pre-wrap">{m.body}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <>
          {/* モバイル: カード表示 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {filtered.map((a) => (
              <Link key={a.id} href={`/applications/${a.id}`}>
                <Card className={`h-full p-4 ${isExpiryAlert(a, TODAY) ? "border-seal" : ""}`}>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="font-bold">{a.name}</p>
                    <div className="flex shrink-0 items-center gap-1">
                      {isExpiryAlert(a, TODAY) && <AlertBadge expiry={a.residenceExpiryAtApply} />}
                      <StatusBadge status={a.status} />
                    </div>
                  </div>
                  <p className="mb-1 text-xs text-muted">{a.organizationName ?? "所属機関未設定"}</p>
                  <p className="mb-1 text-sm text-muted">{a.applicationContent}</p>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>申請番号 {a.applicationNumber || "未登録"}</span>
                    <span>{a.applicationDate}</span>
                  </div>
                  {a.residenceExpiryAtApply && (
                    <p className="mt-1 text-xs text-muted">
                      申請時在留期限 {a.residenceExpiryAtApply}
                    </p>
                  )}
                </Card>
              </Link>
            ))}
          </div>

          {/* PC: テーブル表示 */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border lg:block">
            <table className="w-full text-sm">
              <thead className="bg-background text-left text-xs font-bold text-muted">
                <tr>
                  <Th>名前</Th>
                  <Th>所属機関</Th>
                  <Th>申請内容</Th>
                  <Th>申請日</Th>
                  <Th>申請番号</Th>
                  <Th>申請時点在留期限</Th>
                  <Th>状態</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => router.push(`/applications/${a.id}`)}
                    className="cursor-pointer bg-surface hover:bg-background"
                  >
                    <Td className="font-bold">
                      <span className="flex items-center gap-1.5">
                        {a.name}
                        {isExpiryAlert(a, TODAY) && <AlertBadge expiry={a.residenceExpiryAtApply} />}
                      </span>
                    </Td>
                    <Td>{a.organizationName ?? "—"}</Td>
                    <Td>{a.applicationContent || "—"}</Td>
                    <Td className="tabular-nums">{a.applicationDate}</Td>
                    <Td className="tabular-nums">{a.applicationNumber || "—"}</Td>
                    <Td className="tabular-nums">{a.residenceExpiryAtApply ?? "—"}</Td>
                    <Td>
                      <StatusBadge status={a.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-4 py-3 ${className}`}>{children}</td>;
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
        active
          ? "border-brand bg-brand text-brand-foreground"
          : "border-border bg-surface text-muted"
      }`}
    >
      {label}
    </button>
  );
}
