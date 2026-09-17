"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, ChevronRight, Clock, Loader2, Mailbox, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { saveIssueRequestMemo, setIssueRequestDone } from "./actions";
import { prepDetailHref } from "@/lib/application-prep";
import {
  elapsedDays,
  groupByIssuer,
  issueRequestHref,
  issueRequestSummary,
  NO_ISSUER_LABEL,
  type IssueRequestRow,
} from "@/lib/issue-requests";

// 依頼日からこれだけたっていたら赤く出す（催促の目安）
const STALE_DAYS = 14;

// 依頼中のもの（申請準備の発行依頼と、転居手続き・国保加入の依頼）を、誰に依頼したかでまとめて出す。
// 誰に何を頼んで、いつ頼んで、まだ届いていないのか・もう済んだのかが1画面で分かるようにする。
export function IssueRequestsClient({
  rows: initialRows,
  error,
  today,
  canEdit,
}: {
  rows: IssueRequestRow[];
  error: string | null;
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  // 既定は「まだのものだけ」。済みも見たいときに切り替える
  const [showDone, setShowDone] = useState(false);
  // 完了への切り替え・メモの保存は、この画面でもすぐ反映する
  const [rows, setRows] = useState(initialRows);
  const [prevRows, setPrevRows] = useState(initialRows);
  if (initialRows !== prevRows) {
    setPrevRows(initialRows);
    setRows(initialRows);
  }
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const groups = useMemo(() => groupByIssuer(rows), [rows]);
  const summary = useMemo(() => issueRequestSummary(rows), [rows]);

  const rowKey = (r: IssueRequestRow) => `${r.checklistId}-${r.docId}-${r.workerId}`;
  const patchRow = (r: IssueRequestRow, patch: Partial<IssueRequestRow>) =>
    setRows((rs) => rs.map((x) => (rowKey(x) === rowKey(r) ? { ...x, ...patch } : x)));

  // 依頼中 ⇄ 完了（押し間違いは、もう一度押すと戻せる）
  const toggleDone = async (r: IssueRequestRow) => {
    setBusyKey(rowKey(r));
    setActionError(null);
    try {
      const res = await setIssueRequestDone(
        { kind: r.kind, checklistId: r.checklistId, docId: r.docId, workerId: r.workerId, status: r.status },
        !r.done,
      );
      if (!res.ok) throw new Error(res.message);
      patchRow(r, { done: !r.done, status: res.status });
      router.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "切り替えに失敗しました");
    } finally {
      setBusyKey(null);
    }
  };

  const saveMemo = async (r: IssueRequestRow, memo: string) => {
    setActionError(null);
    const res = await saveIssueRequestMemo(
      { kind: r.kind, checklistId: r.checklistId, docId: r.docId, workerId: r.workerId, status: r.status },
      memo,
    );
    if (!res.ok) {
      setActionError(res.message);
      return false;
    }
    patchRow(r, { memo: memo.trim() });
    return true;
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
          <Mailbox size={16} />
          依頼中（発行依頼・手続きの依頼）
        </h2>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          申請準備で準備状況を「発行依頼中」「本人に依頼中」などにした書類（課税証明書・納税証明書・年金記録・保険証など）と、
          外国人詳細の「あとでやる手続き」で依頼を記録した転居手続き・国保加入を、依頼先ごとにまとめています。
          何を押しても、その人の申請準備の詳細（手続きは外国人詳細）が開きます。
          届いたら、そちらで準備状況を「発行完了」などに変えてください。依頼日から{STALE_DAYS}日以上たったものは赤く出ます。
        </p>

        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
            発行依頼を取得できませんでした（{error}）。0件という意味ではありません。
          </p>
        )}
        {actionError && (
          <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
            {actionError}
          </p>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="flex items-center gap-1 rounded-lg border border-seal/40 bg-seal/10 px-2.5 py-1 text-seal">
            <Clock size={13} />
            依頼中 {summary.pending}件
          </span>
          <span className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-muted">
            <CheckCircle2 size={13} />
            済み {summary.done}件
          </span>
          {summary.noIssuer > 0 && (
            <span className="flex items-center gap-1 rounded-lg border border-seal/40 px-2.5 py-1 text-seal">
              <TriangleAlert size={13} />
              依頼先が未選択 {summary.noIssuer}件
            </span>
          )}
          <label className="ml-auto flex items-center gap-1.5 text-muted">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="size-4"
            />
            済みも出す
          </label>
        </div>

        {groups.length === 0 ? (
          <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
            依頼中のものはありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {groups.map((g) => {
              const list = showDone ? [...g.pending, ...g.done] : g.pending;
              if (list.length === 0) return null;
              return (
                <li key={g.issuer || "none"} className="rounded-xl border border-border p-3">
                  <p className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-bold">
                    <span className={g.issuer ? "" : "text-seal"}>
                      {g.issuer || NO_ISSUER_LABEL}
                    </span>
                    <span className="font-normal text-muted">
                      依頼中 {g.pending.length}件
                      {g.done.length > 0 && ` ／ 済み ${g.done.length}件`}
                    </span>
                  </p>
                  {!g.issuer && (
                    <p className="mb-1.5 text-[11px] leading-relaxed text-seal">
                      誰に依頼したかが入っていません。申請準備の「発行依頼先（誰に依頼したか）」か、外国人詳細の「あとでやる手続き」の依頼先で入れてください。
                    </p>
                  )}
                  <ul className="flex flex-col gap-1">
                    {list.map((r) => {
                      const days = r.done ? null : elapsedDays(r.requestedOn, today);
                      const stale = days != null && days >= STALE_DAYS;
                      const key = rowKey(r);
                      return (
                        <RequestRow
                          key={key}
                          r={r}
                          days={days}
                          stale={stale}
                          busy={busyKey === key}
                          canEdit={canEdit}
                          onToggleDone={() => void toggleDone(r)}
                          onSaveMemo={(memo) => saveMemo(r, memo)}
                        />
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// 1件分の行。「依頼中」のボタンで完了に（もう一度押すと依頼中に戻す）、
// 「詳細」を開くとメモを編集・保存できる
function RequestRow({
  r,
  days,
  stale,
  busy,
  canEdit,
  onToggleDone,
  onSaveMemo,
}: {
  r: IssueRequestRow;
  days: number | null;
  stale: boolean;
  busy: boolean;
  canEdit: boolean;
  onToggleDone: () => void;
  onSaveMemo: (memo: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState(r.memo);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const changed = memo.trim() !== r.memo.trim();

  const save = async () => {
    setSaving(true);
    try {
      if (await onSaveMemo(memo)) setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="rounded-lg border border-border/60 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-relaxed">
        {/* 依頼中 ⇄ 完了 のボタン（閲覧のみのロールは表示だけ） */}
        <button
          type="button"
          disabled={!canEdit || busy}
          onClick={onToggleDone}
          title={r.done ? "押すと「依頼中」に戻します" : "届いたら押して「完了」にします"}
          className={`inline-flex min-h-[28px] shrink-0 items-center gap-1 rounded-lg border px-2 font-bold disabled:cursor-default ${
            r.done
              ? "border-status-approved-fg/40 bg-status-approved-bg text-status-approved-fg"
              : "border-seal/40 bg-seal/10 text-seal"
          }`}
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : r.done ? <CheckCircle2 size={12} /> : <Clock size={12} />}
          {r.done ? "完了" : "依頼中"}
        </button>
        <Link
          href={`/workers/${r.workerId}`}
          className="font-bold text-brand underline"
        >
          {r.workerName}
        </Link>
        <Link href={issueRequestHref(r, prepDetailHref)} className="underline">
          {r.docLabel}
        </Link>
        <span className="text-muted">{r.status}</span>
        {/* 依頼日と経過日数。依頼日が入っていないものは最終更新日で見当を付ける */}
        {r.requestedOn && (
          <span className={`tabular-nums ${stale ? "font-bold text-seal" : "text-muted"}`}>
            依頼日 {r.requestedOn}
            {days != null && `（${days}日経過）`}
          </span>
        )}
        {!r.requestedOn && !r.done && (
          <span className="text-seal">依頼日が未入力</span>
        )}
        {r.todoNo && <span className="text-muted">／ {r.todoNo}</span>}
        {/* メモの開閉。メモがあるときは閉じていても先頭を少し見せる */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-bold text-brand"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          詳細{!open && r.memo && <span className="ml-1 max-w-[12rem] truncate font-normal text-muted">{r.memo}</span>}
        </button>
      </div>
      {open && (
        <div className="mt-1.5 flex flex-col gap-1.5 sm:flex-row sm:items-start">
          <textarea
            value={memo}
            onChange={(e) => {
              setMemo(e.target.value);
              setSaved(false);
            }}
            readOnly={!canEdit}
            rows={2}
            placeholder="例: 9/16 に催促。来週に届く予定"
            className="min-h-[48px] w-full flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] leading-relaxed focus:border-brand focus:outline-none"
          />
          {canEdit && (
            <button
              type="button"
              disabled={saving || !changed}
              onClick={() => void save()}
              className="shrink-0 rounded-lg bg-brand px-3 py-2 text-[11px] font-bold text-brand-foreground disabled:opacity-50"
            >
              {saving ? "保存中…" : saved && !changed ? "保存しました" : "メモを保存"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
