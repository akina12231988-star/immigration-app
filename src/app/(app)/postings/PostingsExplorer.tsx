"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { PostingStatusBadge } from "@/components/postings/PostingStatusBadge";
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
  const [statusFilter, setStatusFilter] = useState<PostingStatus | "all">("all");

  const filtered = useMemo(
    () =>
      statusFilter === "all"
        ? postings
        : postings.filter((p) => p.status === statusFilter),
    [postings, statusFilter],
  );

  return (
    <div className="space-y-4">
      {canEdit && (
        <LinkButton href="/postings/new" fullWidth icon={<Plus size={20} />}>
          求人を登録
        </LinkButton>
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Chip label="すべて" active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
        {POSTING_STATUSES.map((s) => (
          <Chip
            key={s}
            label={s}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
          />
        ))}
      </div>

      <p className="text-sm font-bold text-muted">{filtered.length}件</p>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">
          {postings.length === 0
            ? "まだ求人がありません。「求人を登録」から追加してください。"
            : "条件に合う求人がありません"}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const applicants = p.job_applications?.length ?? 0;
            const hired = p.job_applications?.filter((a) => a.result === "採用").length ?? 0;
            return (
              <Link key={p.id} href={`/postings/${p.id}`}>
                <Card className="p-4">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold">
                        {postingDisplayName(p, p.organizations?.name)}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {[p.job_type, p.display_address].filter(Boolean).join(" ・ ") ||
                          "詳細未設定"}
                      </p>
                    </div>
                    <PostingStatusBadge status={p.status} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted">
                    <span className="font-bold text-foreground">
                      {formatWage(p.wage_kind, p.wage_amount)}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <Users size={13} />
                        応募{applicants}・採用{hired}/{p.openings}名
                      </span>
                      <ChevronRight size={16} />
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({
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
      type="button"
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
