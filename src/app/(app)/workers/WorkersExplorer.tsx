"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileUp, Printer, Upload, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { SummaryCards } from "@/components/workers/SummaryCards";
import {
  INITIAL_FILTER,
  WorkerFilters,
  type WorkerFilterState,
} from "@/components/workers/WorkerFilters";
import { SswGauge } from "@/components/workers/SswGauge";
import { SswStatusBadge, SupportBadge, WorkerStatusBadge } from "@/components/workers/badges";
import { calcSsw, todayStr, type SswCalcResult } from "@/lib/ssw/calc";
import { toCalcHistory } from "@/lib/supabase/queries/histories";
import type { Organization, WorkerWithHistories } from "@/types/db";

interface Row {
  worker: WorkerWithHistories;
  calc: SswCalcResult;
}

export function WorkersExplorer({
  workers,
  organizations,
  canEdit,
}: {
  workers: WorkerWithHistories[];
  organizations: Organization[];
  canEdit: boolean;
}) {
  const [filter, setFilter] = useState<WorkerFilterState>(INITIAL_FILTER);

  const orgNames = useMemo(
    () => new Map(organizations.map((o) => [o.id, o.name])),
    [organizations],
  );

  // 同姓同名対策: 氏名が重複する場合のみ表示に（所属機関名）を付す
  const dupNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of workers) counts.set(w.name, (counts.get(w.name) ?? 0) + 1);
    return counts;
  }, [workers]);
  const displayName = (w: WorkerWithHistories) => {
    if ((dupNames.get(w.name) ?? 0) <= 1) return w.name;
    const org = w.current_organization_id ? orgNames.get(w.current_organization_id) : undefined;
    return `${w.name}（${org ?? "所属未設定"}）`;
  };

  // "今日" 依存の通算計算は表示のたびに行う（結果は保存しない）
  const rows = useMemo<Row[]>(() => {
    const today = todayStr();
    return workers.map((worker) => ({
      worker,
      calc: calcSsw(worker.work_histories.map(toCalcHistory), today),
    }));
  }, [workers]);

  const summary = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((r) => r.calc.status === "1号在留中").length,
      withinOneYear: rows.filter(
        (r) => r.calc.counted.length > 0 && r.calc.remainDays > 0 && r.calc.remainDays <= 365,
      ).length,
      reachedCap: rows.filter((r) => r.calc.status === "5年到達").length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const kw = filter.keyword.trim().toLowerCase();
    const result = rows.filter(({ worker }) => {
      if (filter.status !== "all" && worker.status !== filter.status) return false;
      if (filter.support !== "all" && worker.support !== filter.support) return false;
      if (filter.orgId === "none") {
        if (worker.current_organization_id) return false;
      } else if (filter.orgId !== "all") {
        if (worker.current_organization_id !== filter.orgId) return false;
      }
      if (!kw) return true;
      return [worker.name, worker.kana, worker.nationality, worker.residence_card_no, worker.field]
        .join("\n")
        .toLowerCase()
        .includes(kw);
    });

    const collator = new Intl.Collator("ja");
    switch (filter.sort) {
      case "name":
        result.sort((a, b) =>
          collator.compare(a.worker.kana || a.worker.name, b.worker.kana || b.worker.name),
        );
        break;
      case "remain":
        // 1号期間未登録（対象なし）は末尾へ
        result.sort((a, b) => {
          const ra = a.calc.counted.length ? a.calc.remainDays : Infinity;
          const rb = b.calc.counted.length ? b.calc.remainDays : Infinity;
          return ra - rb;
        });
        break;
      case "expiry":
        result.sort((a, b) => {
          const ea = a.worker.residence_expiry_date ?? "9999-12-31";
          const eb = b.worker.residence_expiry_date ?? "9999-12-31";
          return ea < eb ? -1 : ea > eb ? 1 : 0;
        });
        break;
      default:
        break; // 登録順（created_at 昇順で取得済み）
    }
    return result;
  }, [rows, filter]);

  return (
    <div className="space-y-4">
      <SummaryCards summary={summary} />

      {canEdit && (
        <div className="flex gap-2">
          <LinkButton href="/workers/new" fullWidth icon={<UserPlus size={20} />}>
            外国人を登録
          </LinkButton>
          <LinkButton href="/workers/import-pdf" variant="secondary" icon={<FileUp size={18} />}>
            履歴書PDF
          </LinkButton>
          <LinkButton href="/workers/import" variant="secondary" icon={<Upload size={18} />}>
            取込
          </LinkButton>
          <LinkButton href="/workers/print" variant="secondary" icon={<Printer size={18} />}>
            印刷
          </LinkButton>
        </div>
      )}

      <WorkerFilters filter={filter} organizations={organizations} onChange={setFilter} />

      <p className="text-sm font-bold text-muted">{filtered.length}名</p>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">
          {workers.length === 0
            ? "まだ登録がありません。「外国人を登録」から追加してください。"
            : "条件に合う外国人が見つかりません"}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ worker, calc }) => (
            <Link key={worker.id} href={`/workers/${worker.id}`}>
              <Card className="p-4">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{displayName(worker)}</p>
                    <p className="truncate text-xs text-muted">
                      {[worker.kana, worker.nationality, worker.field]
                        .filter(Boolean)
                        .join(" ・ ") || "詳細未登録"}
                    </p>
                  </div>
                  <ChevronRight size={18} className="mt-1 shrink-0 text-muted" />
                </div>
                <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                  <WorkerStatusBadge status={worker.status} />
                  <SswStatusBadge status={calc.status} />
                  <SupportBadge support={worker.support} />
                </div>
                <SswGauge calc={calc} compact />
                <div className="mt-2 flex items-center justify-between text-xs text-muted">
                  <span className="truncate">
                    {worker.current_organization_id
                      ? (orgNames.get(worker.current_organization_id) ?? "所属不明")
                      : "未所属"}
                  </span>
                  {worker.residence_expiry_date && (
                    <span className="shrink-0 tabular-nums">
                      在留期限 {worker.residence_expiry_date}
                    </span>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <p className="pb-2 text-center text-[11px] leading-relaxed text-muted">
        通算期間は日数合算による目安です。正式な判断は出入国在留管理庁にご確認ください。
      </p>
    </div>
  );
}
