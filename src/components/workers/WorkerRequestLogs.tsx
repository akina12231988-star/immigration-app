"use client";

import { useCallback, useEffect, useState } from "react";
import { NotebookPen, Plus, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import {
  deleteWorkerRequestLog,
  insertWorkerRequestLog,
  listWorkerRequestLogs,
  updateWorkerRequestLog,
  type WorkerRequestLog,
  type WorkerRequestLogInput,
} from "@/lib/supabase/queries/request-logs";
import { dbErrorMessage } from "@/lib/errors";
import { todayStr } from "@/lib/ssw/calc";

const INPUT =
  "min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";
const TEXTAREA =
  "rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-brand focus:outline-none";

// 記録のテーブル（0131）と、相談記録書に合わせた欄（0132）。
// どちらが未適用でも同じ画面で止まるので、案内には両方を出す
const MIGRATION = "0131_worker_request_logs.sql・0132_worker_request_logs_consultation.sql";

const EMPTY: WorkerRequestLogInput = {
  logged_on: "",
  content: "",
  result: "",
  handler_name: "",
  is_consultation: true,
};

// 新しい順（日付の新しい順・同日は登録の新しい順）
function sortLogs(rows: WorkerRequestLog[]): WorkerRequestLog[] {
  return [...rows].sort(
    (a, b) => b.logged_on.localeCompare(a.logged_on) || b.created_at.localeCompare(a.created_at),
  );
}

// 外国人詳細の「記録」ボタン。本人から相談・依頼を受けた日と内容、その対応結果を
// 1件ずつ残す。そのまま参考様式第５－４号「相談記録書」の1行になる（0132）。
export function WorkerRequestLogs({
  workerId,
  organizationId,
  organizationName,
  canEdit,
}: {
  workerId: string;
  organizationId: string | null; // 記録した時点の所属機関として焼き付ける
  organizationName: string;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<WorkerRequestLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 入力フォーム（editingId が null なら追加、そうでなければその記録の編集）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WorkerRequestLogInput>(EMPTY);
  const [meName, setMeName] = useState("");
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof WorkerRequestLogInput>(key: K, value: WorkerRequestLogInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // 追加フォームに戻す（対応者はログイン中の担当者を初期値にする）
  const resetForm = useCallback(
    (name = meName) => {
      setEditingId(null);
      setForm({ ...EMPTY, logged_on: todayStr(), handler_name: name });
    },
    [meName],
  );

  // 開いたときに読み込む（開き直したら最新を取り直す）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const supabase = createClient();

    listWorkerRequestLogs(supabase, workerId)
      .then((rows) => {
        if (!cancelled) setLogs(rows);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            dbErrorMessage(err, MIGRATION, "記録の読み込みに失敗しました"),
          );
      });

    // 対応者の氏名の初期値（プロフィールの表示名 or メール）
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("id", data.user.id)
        .maybeSingle();
      if (cancelled || !p) return;
      const prof = p as { display_name: string; email: string };
      const name = prof.display_name || prof.email;
      setMeName(name);
      // まだ誰も触っていない追加フォームにだけ入れる
      setForm((prev) => (prev.handler_name ? prev : { ...prev, handler_name: name }));
    });

    return () => {
      cancelled = true;
    };
  }, [open, workerId]);

  const save = async () => {
    if (!form.content.trim() || !form.logged_on) return;
    setBusy(true);
    setError(null);
    const patch: WorkerRequestLogInput = {
      logged_on: form.logged_on,
      content: form.content.trim(),
      result: form.result.trim(),
      handler_name: form.handler_name.trim(),
      is_consultation: form.is_consultation,
    };
    try {
      const supabase = createClient();
      if (editingId) {
        const row = await updateWorkerRequestLog(supabase, editingId, patch);
        setLogs((prev) => sortLogs((prev ?? []).map((r) => (r.id === row.id ? row : r))));
      } else {
        const row = await insertWorkerRequestLog(supabase, {
          ...patch,
          worker_id: workerId,
          organization_id: organizationId,
        });
        setLogs((prev) => sortLogs([row, ...(prev ?? [])]));
      }
      resetForm();
    } catch (err) {
      setError(
        dbErrorMessage(err, MIGRATION, "記録の保存に失敗しました"),
      );
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (row: WorkerRequestLog) => {
    setEditingId(row.id);
    setForm({
      logged_on: row.logged_on,
      content: row.content,
      result: row.result,
      handler_name: row.handler_name,
      is_consultation: row.is_consultation,
    });
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteWorkerRequestLog(createClient(), id);
      setLogs((prev) => (prev ?? []).filter((r) => r.id !== id));
      if (editingId === id) resetForm();
    } catch (err) {
      setError(
        dbErrorMessage(err, MIGRATION, "記録の削除に失敗しました"),
      );
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // 開くたびに追加フォームへ戻す（前回の書きかけを持ち越さない）
          resetForm();
          setOpen(true);
        }}
        className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted"
      >
        <NotebookPen size={14} />
        記録
      </button>

      <Modal open={open} title="相談・対応の記録" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <p className="text-[11px] leading-relaxed text-muted">
            本人から相談・依頼を受けた日と内容、その対応結果を1件ずつ残します。
            ここに残した記録が、そのまま相談記録書（参考様式第５－４号）の1行になります。
            {organizationId
              ? `新しい記録は「${organizationName}」の記録として残ります。`
              : "この人は所属機関が未登録のため、機関ごとの相談記録書には出ません。"}
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
                  <span className="text-[11px] font-bold text-muted">相談受理日</span>
                  <input
                    type="date"
                    value={form.logged_on}
                    onChange={(e) => set("logged_on", e.target.value)}
                    className={INPUT}
                  />
                </label>
                <label className="flex min-w-[160px] flex-1 flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted">対応者の氏名</span>
                  <input
                    type="text"
                    value={form.handler_name}
                    onChange={(e) => set("handler_name", e.target.value)}
                    placeholder="例: 法務 花子"
                    className={INPUT}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-muted">相談内容</span>
                <textarea
                  rows={2}
                  value={form.content}
                  onChange={(e) => set("content", e.target.value)}
                  placeholder="例: エアコンの調子が悪い旨の相談があった。"
                  className={TEXTAREA}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-muted">対応結果（あとから書けます）</span>
                <textarea
                  rows={2}
                  value={form.result}
                  onChange={(e) => set("result", e.target.value)}
                  placeholder="例: 本人宅の現状を確認し、家電量販店に連絡をし修理を依頼した。"
                  className={TEXTAREA}
                />
                <span className="text-[11px] leading-relaxed text-muted">
                  労働基準監督署への通報や公共職業安定所への相談を行った場合は、日付と行政機関の名称も書いてください。
                </span>
              </label>

              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.is_consultation}
                  onChange={(e) => set("is_consultation", e.target.checked)}
                  className="mt-0.5 size-4 accent-brand"
                />
                <span className="leading-relaxed">
                  相談記録書に載せる
                  <span className="ml-1 text-muted">（社内の覚え書きだけの記録は外してください）</span>
                </span>
              </label>

              <div className="flex gap-2">
                <Button
                  fullWidth
                  icon={editingId ? undefined : <Plus size={16} />}
                  disabled={busy || !form.content.trim() || !form.logged_on}
                  onClick={save}
                >
                  {busy ? "保存中…" : editingId ? "変更を保存" : "記録を追加"}
                </Button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => resetForm()}
                    disabled={busy}
                    className="flex items-center gap-1 rounded-xl border border-border px-4 text-xs font-bold text-muted"
                  >
                    <X size={14} />
                    やめる
                  </button>
                )}
              </div>
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
                <div
                  key={r.id}
                  className={`rounded-xl px-3 py-2.5 ${
                    r.id === editingId ? "bg-brand/10" : "bg-background"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold tabular-nums">{r.logged_on}</span>
                      {r.is_consultation ? (
                        r.result.trim() ? null : (
                          <span className="rounded-full bg-status-notice-bg px-2 py-0.5 text-[11px] font-bold text-status-notice-fg">
                            対応結果 未記入
                          </span>
                        )
                      ) : (
                        <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-bold text-muted">
                          相談記録書に載せない
                        </span>
                      )}
                    </p>
                    {canEdit && (
                      <span className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="text-[11px] font-bold text-brand"
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(r.id)}
                          className="text-[11px] font-bold text-seal"
                        >
                          削除
                        </button>
                      </span>
                    )}
                  </div>

                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{r.content}</p>
                  {r.result.trim() && (
                    <p className="mt-1 whitespace-pre-wrap border-l-2 border-brand/40 pl-2 text-sm leading-relaxed text-muted">
                      {r.result}
                    </p>
                  )}
                  {r.handler_name && (
                    <p className="mt-1 text-[11px] text-muted">対応者: {r.handler_name}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
