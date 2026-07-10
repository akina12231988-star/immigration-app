"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, LayoutGrid, Rows3, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Application, ApplicationStatus } from "@/types/application";
import { APPLICATION_STATUS_ORDER } from "@/types/application";

type ViewMode = "card" | "list";

export function ApplicationsExplorer({
  applications,
}: {
  applications: Application[];
}) {
  const [view, setView] = useState<ViewMode>("card");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">(
    "all"
  );

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return applications.filter((a) => {
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
  }, [applications, keyword, statusFilter]);

  return (
    <div className="space-y-4">
      {/* ⑩検索: 氏名・申請番号・申請内容・担当者を横断検索 */}
      <div className="relative">
        <Search
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="氏名・申請番号・申請内容・担当者で検索"
          className="w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-3 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <FilterChip
          label="すべて"
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        {APPLICATION_STATUS_ORDER.map((s) => (
          <FilterChip
            key={s}
            label={s}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-muted">{filtered.length}件</p>
        {/* ⑪表示切替: カード表示 / 一覧表示 */}
        <div className="flex rounded-lg border border-border p-0.5">
          <button
            onClick={() => setView("card")}
            aria-label="カード表示"
            className={`flex h-9 w-9 items-center justify-center rounded-md ${
              view === "card" ? "bg-brand text-brand-foreground" : "text-muted"
            }`}
          >
            <LayoutGrid size={17} />
          </button>
          <button
            onClick={() => setView("list")}
            aria-label="一覧表示"
            className={`flex h-9 w-9 items-center justify-center rounded-md ${
              view === "list" ? "bg-brand text-brand-foreground" : "text-muted"
            }`}
          >
            <Rows3 size={17} />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">
          該当する申請が見つかりません
        </p>
      ) : view === "card" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((a) => (
            <Link key={a.id} href={`/applications/${a.id}`}>
              <Card className="h-full p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="font-bold">{a.name}</p>
                  <StatusBadge status={a.status} />
                </div>
                <p className="mb-1 text-sm text-muted">
                  {a.applicationContent}
                </p>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>申請番号 {a.applicationNumber || "未登録"}</span>
                  <span>{a.assignee}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {filtered.map((a) => (
            <Link
              key={a.id}
              href={`/applications/${a.id}`}
              className="flex items-center gap-3 p-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-bold">{a.name}</p>
                  <StatusBadge status={a.status} />
                </div>
                <p className="truncate text-xs text-muted">
                  {a.applicationDate} ・ {a.applicationContent}
                </p>
              </div>
              <ChevronRight size={18} className="shrink-0 text-muted" />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
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
