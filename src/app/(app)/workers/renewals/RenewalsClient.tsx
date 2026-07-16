"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, ExternalLink, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { updateWorker, type WorkerWithOrg } from "@/lib/supabase/queries/workers";
import {
  isResidenceRenewalTarget,
  remainingLabel,
  daysUntil,
} from "@/lib/worker-alerts";
import { todayStr } from "@/lib/application-alerts";
import { RESIDENCE_RENEWAL_STATUSES, type ResidenceRenewalStatus } from "@/types/db";

type HandlingFilter = ResidenceRenewalStatus | "all";

const STATUS_LABEL: Record<ResidenceRenewalStatus, string> = {
  "": "未対応",
  準備中: "準備中",
  転職先にて対応中: "転職先にて対応中",
  帰国: "帰国",
};

const STATUS_CLASS: Record<ResidenceRenewalStatus, string> = {
  "": "bg-seal/10 text-seal",
  準備中: "bg-status-applied-bg text-status-applied-fg",
  転職先にて対応中: "bg-status-notice-bg text-status-notice-fg",
  帰国: "bg-background text-muted",
};

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
        {(["", "準備中", "転職先にて対応中", "帰国", "all"] as HandlingFilter[]).map((f) => (
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
            <RenewalRow key={w.id} worker={w} today={today} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

function RenewalRow({
  worker,
  today,
  canEdit,
}: {
  worker: WorkerWithOrg;
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [todo, setTodo] = useState(worker.residence_renewal_todo ?? "");
  const [status, setStatus] = useState<ResidenceRenewalStatus>(worker.residence_renewal_status);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expiry = worker.residence_expiry_date ?? "";
  const days = expiry ? daysUntil(expiry, today) : 0;
  const overdue = days < 0;

  const onTodoChange = (v: string) => {
    setTodo(v);
    setSaved(false);
    // TODO番号を入れたら、未対応のときは自動で「準備中」に
    if (v.trim() && status === "") setStatus("準備中");
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateWorker(createClient(), worker.id, {
        residence_renewal_todo: todo.trim(),
        residence_renewal_status: status,
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const INPUT = "min-h-[40px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

  return (
    <Card className={`p-4 ${status === "" && overdue ? "border-seal" : ""}`}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <Link href={`/workers/${worker.id}`} className="min-w-0">
          <p className="truncate font-bold">{worker.name}</p>
          <p className="truncate text-xs text-muted">
            {worker.organizations?.name ?? "所属機関未設定"}
            {worker.nationality && ` ・ ${worker.nationality}`}
          </p>
        </Link>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_CLASS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <p className="flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-muted">
        <span className="flex items-center gap-1">
          <CalendarClock size={12} />
          在留期限 {expiry || "未登録"}
        </span>
        {expiry && (
          <span className={`font-bold ${overdue ? "text-seal" : "text-status-applied-fg"}`}>
            （{remainingLabel(expiry, today)}）
          </span>
        )}
      </p>

      <div className="mt-2 flex flex-wrap gap-3">
        {worker.notion_link && (
          <a href={worker.notion_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-brand">
            <ExternalLink size={13} />
            Notionを開く
          </a>
        )}
        {worker.messenger_link && (
          <a href={worker.messenger_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-brand">
            <MessageCircle size={13} />
            Messenger
          </a>
        )}
      </div>

      {canEdit && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">Notion 申請TODO番号</span>
            <input
              value={todo}
              onChange={(e) => onTodoChange(e.target.value)}
              placeholder="例: TODO-1234"
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">対応状況</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as ResidenceRenewalStatus);
                setSaved(false);
              }}
              className={INPUT}
            >
              {RESIDENCE_RENEWAL_STATUSES.map((s) => (
                <option key={s || "pending"} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <Button fullWidth disabled={busy} onClick={save}>
            {busy ? "保存中…" : saved ? "保存しました" : "保存する"}
          </Button>
        </div>
      )}
    </Card>
  );
}
