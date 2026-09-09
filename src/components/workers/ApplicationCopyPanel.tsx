"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { listWorkerWages } from "@/lib/supabase/queries/wages";
import { toCalcHistory } from "@/lib/supabase/queries/histories";
import { findPlanDatesForTodo, listPlanDates } from "@/lib/supabase/queries/plan-dates";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import {
  buildApplicationCopyGroups,
  copyGroupText,
  type CopyGroup,
  type CopyWorker,
} from "@/lib/application-copy";
import { CopyButton } from "@/components/ui/CopyButton";
import type { Organization, WorkHistoryRow, WorkerWage } from "@/types/db";

// 申請準備 ＞ 申請書に貼る情報。
// 外国人詳細・所属機関・賃金・職歴・支援計画書の日付から、申請書（申請人等作成用・所属機関等作成用）の
// 項目を組み立てて、1項目ずつ（年・月・日は部品ごとにも）コピーできるようにする。
export function ApplicationCopyPanel({
  workerId,
  orgId,
  todoNo,
  desiredStatus,
}: {
  workerId: string;
  orgId: string | null;
  todoNo: string;
  desiredStatus?: string; // 希望する在留資格（申請種別から）
}) {
  const [loaded, setLoaded] = useState<{
    worker: CopyWorker | null;
    org: Organization | null;
    wages: WorkerWage[];
    histories: WorkHistoryRow[];
    planDates: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void Promise.all([
      supabase.from("workers").select("*").eq("id", workerId).maybeSingle().then(({ data }) => (data as CopyWorker | null) ?? null),
      orgId
        ? supabase.from("organizations").select("*").eq("id", orgId).maybeSingle().then(({ data }) => (data as Organization | null) ?? null)
        : Promise.resolve(null),
      listWorkerWages(supabase, workerId).catch(() => [] as WorkerWage[]),
      supabase
        .from("work_histories")
        .select("*")
        .eq("worker_id", workerId)
        .then(({ data }) => ((data as WorkHistoryRow[] | null) ?? [])),
      listPlanDates(supabase, workerId)
        .then((rows) => findPlanDatesForTodo(rows, todoNo)?.dates ?? {})
        .catch(() => ({}) as Record<string, string>),
    ]).then(([worker, org, wages, histories, planDates]) => {
      if (!cancelled) setLoaded({ worker, org, wages, histories, planDates });
    });
    return () => {
      cancelled = true;
    };
  }, [workerId, orgId, todoNo]);

  const groups = useMemo(() => {
    if (!loaded?.worker) return null;
    return buildApplicationCopyGroups({
      worker: loaded.worker,
      org: loaded.org,
      intake: loaded.org ? normalizeOrganizationIntake(loaded.org.intake) : null,
      wages: loaded.wages,
      histories: loaded.histories.map(toCalcHistory),
      planDates: loaded.planDates,
      desiredStatus,
    });
  }, [loaded, desiredStatus]);

  if (!groups) return null;
  return <ApplicationCopyList groups={groups} orgMissing={!orgId} />;
}

// 一覧の表示（データの読み込みと分けて、単体でも描ける）
export function ApplicationCopyList({ groups, orgMissing = false }: { groups: CopyGroup[]; orgMissing?: boolean }) {
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<number>(0);
  const [copiedGroup, setCopiedGroup] = useState<number | null>(null);

  const copyAll = async (i: number) => {
    try {
      await navigator.clipboard.writeText(copyGroupText(groups[i]));
      setCopiedGroup(i);
      setTimeout(() => setCopiedGroup(null), 1500);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };

  const filled = groups.reduce((n, g) => n + g.items.filter((i) => i.value).length, 0);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="rounded-lg bg-background p-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-1 text-left text-[11px] font-bold text-muted"
      >
        <span className="flex items-center gap-1">
          <ClipboardList size={13} className="text-brand" />
          申請書に貼る情報をコピー（外国人・所属機関・賃金・職歴・日付から自動で抽出）
        </span>
        <span className="tabular-nums">
          {filled} / {total}項目 {open ? "▲ 閉じる" : "▼ 開く"}
        </span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] leading-relaxed text-muted">
            申請書（申請人等作成用 1〜3・所属機関等作成用 1・2・4）の項目順に並んでいます。右のコピーで1項目ずつ、
            年・月・日のように欄が分かれているものは部品ごとにもコピーできます。「未登録」は外国人詳細・所属機関で入れると出ます。
            {orgMissing && "所属機関が未設定のため、所属機関の項目は空です。"}
          </p>
          <div className="flex flex-wrap gap-1">
            {groups.map((g, i) => (
              <button
                key={g.title}
                type="button"
                onClick={() => setOpenGroup(i)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                  openGroup === i ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface text-muted"
                }`}
              >
                {g.title.replace(/（.*$/, "")}
              </button>
            ))}
          </div>
          {groups[openGroup] && (
            <div className="rounded-lg bg-surface p-2">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                <p className="text-[11px] font-bold">{groups[openGroup].title}</p>
                <button
                  type="button"
                  onClick={() => void copyAll(openGroup)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-[11px] font-bold text-muted"
                >
                  {copiedGroup === openGroup ? <Check size={12} className="text-status-reported-fg" /> : <Copy size={12} />}
                  {copiedGroup === openGroup ? "コピーしました" : "この欄をまとめてコピー"}
                </button>
              </div>
              {groups[openGroup].items.length === 0 ? (
                <p className="text-[11px] text-muted">登録がありません。</p>
              ) : (
                <div className="divide-y divide-border">
                  {groups[openGroup].items.map((item, i) => (
                    <div key={`${item.label}-${i}`} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 py-1 text-[11px]">
                      <span className="w-full text-muted sm:w-[15rem] sm:shrink-0">{item.label}</span>
                      <span className="flex min-w-0 flex-1 items-start gap-1">
                        {item.value ? (
                          <>
                            <span className="min-w-0 break-all font-bold">{item.value}</span>
                            <CopyButton value={item.value} label={`${item.label}をコピー`} size={13} className="mt-0.5" />
                          </>
                        ) : (
                          <span className="text-seal">未登録</span>
                        )}
                      </span>
                      {item.parts && item.parts.some(Boolean) && (
                        <span className="flex w-full flex-wrap gap-1 pl-0 sm:pl-[15.5rem]">
                          {item.parts.map((p, j) =>
                            p ? (
                              <PartChip key={j} value={p} />
                            ) : null,
                          )}
                        </span>
                      )}
                      {item.note && <span className="w-full text-[10px] text-muted sm:pl-[15.5rem]">{item.note}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 年・月・日などの部品を1つずつコピーする小さなボタン
function PartChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={`「${value}」をコピー`}
      className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] tabular-nums ${
        copied ? "border-status-reported-fg text-status-reported-fg" : "border-border text-muted"
      }`}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {value}
    </button>
  );
}
