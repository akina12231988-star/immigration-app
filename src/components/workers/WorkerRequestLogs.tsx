"use client";

import { useEffect, useState } from "react";
import { NotebookPen, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import {
  deleteWorkerRequestLog,
  insertWorkerRequestLog,
  listWorkerRequestLogs,
  WORKER_REQUEST_LOG_KINDS,
  type WorkerRequestLog,
} from "@/lib/supabase/queries/request-logs";
import { dbErrorMessage } from "@/lib/errors";
import { todayStr } from "@/lib/ssw/calc";

const INPUT =
  "min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

// 種別ごとの色。依頼と対応が時系列で見分けられるようにする
const KIND_CLASS: Record<string, string> = {
  本人からの依頼: "bg-status-notice-bg text-status-notice-fg",
  対応したこと: "bg-brand/10 text-brand",
};

// 外国人詳細の「記録」ボタン。いつ本人から依頼があって、いつ何をやったかを
// 時系列で残す（本人からの依頼／対応したこと の2種類・新しい順に表示）
export function WorkerRequestLogs({
  workerId,
  canEdit,
}: {
  workerId: string;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<WorkerRequestLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 追加フォーム
  const [loggedOn, setLoggedOn] = useState(todayStr());
  const [kind, setKind] = useState<string>(WORKER_REQUEST_LOG_KINDS[0]);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  // 開いたときに読み込む（開き直したら最新を取り直す）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listWorkerRequestLogs(createClient(), workerId)
      .then((rows) => {
        if (!cancelled) setLogs(rows);
      })
      .catch((err) => {
        if (!cancelled)
          setError(dbErrorMessage(err, "0131_worker_request_logs.sql", "記録の読み込みに失敗しました"));
      });
    return () => {
      cancelled = true;
    };
  }, [open, workerId]);

  const add = async () => {
    if (!content.trim() || !loggedOn) return;
    setBusy(true);
    setError(null);
    try {
      const row = await insertWorkerRequestLog(createClient(), {
        worker_id: workerId,
        logged_on: loggedOn,
        kind,
        content: content.trim(),
      });
      // 新しい順の並び（日付の新しい順・同日は登録の新しい順）を保って差し込む
      setLogs((prev) => {
        const rows = [row, ...(prev ?? [])];
        rows.sort(
          (a, b) =>
            b.logged_on.localeCompare(a.logged_on) || b.created_at.localeCompare(a.created_at),
        );
        return rows;
      });
      setContent("");
    } catch (err) {
      setError(dbErrorMessage(err, "0131_worker_request_logs.sql", "記録の保存に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteWorkerRequestLog(createClient(), id);
      setLogs((prev) => (prev ?? []).filter((r) => r.id !== id));
    } catch (err) {
      setError(dbErrorMessage(err, "0131_worker_request_logs.sql", "記録の削除に失敗しました"));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted"
      >
        <NotebookPen size={14} />
        記録
      </button>

      <Modal open={open} title="対応の記録" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <p className="text-[11px] leading-relaxed text-muted">
            いつ本人から依頼があって、いつ何をやったかを時系列で残します。
            「本人からの依頼」と「対応したこと」を分けて記録すると、あとから流れを追えます。
          </p>

          {error && (
            <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
              {error}
            </p>
          )}

          {canEdit && (
            <div className="space-y-2 rounded-xl border border-border bg-background p-3">
              <div className="flex flex-wrap gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted">日付</span>
                  <input
                    type="date"
                    value={loggedOn}
                    onChange={(e) => setLoggedOn(e.target.value)}
                    className={INPUT}
                  />
                </label>
                <label className="flex min-w-[160px] flex-1 flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted">種別</span>
                  <select value={kind} onChange={(e) => setKind(e.target.value)} className={INPUT}>
                    {WORKER_REQUEST_LOG_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-muted">内容</span>
                <textarea
                  rows={2}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="例: 家族の在留資格について相談があった ／ 入管に電話で確認した"
                  className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                />
              </label>
              <Button
                fullWidth
                icon={<Plus size={16} />}
                disabled={busy || !content.trim() || !loggedOn}
                onClick={add}
              >
                {busy ? "追加中…" : "記録を追加"}
              </Button>
            </div>
          )}

          {logs === null ? (
            <p className="py-4 text-center text-xs text-muted">読み込み中…</p>
          ) : logs.length === 0 ? (
            <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
              まだ記録はありません。
            </p>
          ) : (
            <div className="space-y-2">
              {logs.map((r) => (
                <div key={r.id} className="rounded-xl bg-background px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-xs">
                      <span className="font-bold tabular-nums">{r.logged_on}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          KIND_CLASS[r.kind] ?? "bg-background text-muted"
                        }`}
                      >
                        {r.kind}
                      </span>
                    </p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => void remove(r.id)}
                        className="text-[11px] font-bold text-seal"
                      >
                        削除
                      </button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{r.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
