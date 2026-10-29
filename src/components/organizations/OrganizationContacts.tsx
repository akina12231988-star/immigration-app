"use client";

import { useEffect, useState } from "react";
import { MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import {
  deleteOrganizationContact,
  insertOrganizationContact,
  listOrganizationContacts,
  updateOrganizationContact,
} from "@/lib/supabase/queries/organization-contacts";
import {
  CONTACT_METHODS,
  contactInputError,
  sortContactsNewestFirst,
  type OrganizationContact,
} from "@/lib/organization-contacts";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import { todayStr } from "@/lib/application-alerts";

const MIGRATION = "0203_organization_contacts.sql";
// 「こちらの回答・対応」の列（0207）。値を入れたときだけ送る
const MIGRATION_REPLY = "0207_organization_contacts_reply.sql";

const INPUT =
  "min-h-[40px] w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none";
const TEXTAREA =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none";

interface Draft {
  contacted_on: string;
  method: string;
  content: string;
  staff: string;
  reply: string; // こちらの回答・対応
}

const emptyDraft = (): Draft => ({ contacted_on: todayStr(), method: "", content: "", staff: "", reply: "" });

// 所属機関（会社）との連絡の記録。連絡があった日・方法・内容・対応した人を1件ずつ残し、新しい順に出す。
// 記録は「編集 → 直す → 保存」で修正できる（入力のたびに保存はしない）
export function OrganizationContacts({
  organizationId,
  canEdit,
}: {
  organizationId: string;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<OrganizationContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 追加フォーム
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  // 編集中の記録（1件ずつ）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft>(emptyDraft);
  const [deleting, setDeleting] = useState<OrganizationContact | null>(null);

  useEffect(() => {
    let cancelled = false;
    listOrganizationContacts(createClient(), organizationId)
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // テーブル未作成（0203 未適用）でも所属機関の画面は開けるようにする
        setError(dbErrorMessage(err, MIGRATION, errorMessage(err, "連絡の記録を読み込めませんでした")));
        setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const add = async () => {
    const problem = contactInputError(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const row = await insertOrganizationContact(createClient(), {
        organization_id: organizationId,
        contacted_on: draft.contacted_on,
        method: draft.method,
        content: draft.content.trim(),
        staff: draft.staff.trim(),
        // 回答は入れたときだけ送る（0207 未適用の環境でも記録が止まらないように）
        ...(draft.reply.trim() ? { reply: draft.reply.trim() } : {}),
      });
      setRows((prev) => sortContactsNewestFirst([row, ...(prev ?? [])]));
      setDraft(emptyDraft());
      setOpen(false);
    } catch (err) {
      setError(dbErrorMessage(err, draft.reply.trim() ? MIGRATION_REPLY : MIGRATION, errorMessage(err, "連絡の記録の保存に失敗しました")));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (r: OrganizationContact) => {
    setEditingId(r.id);
    setEdit({ contacted_on: r.contacted_on, method: r.method, content: r.content, staff: r.staff, reply: r.reply ?? "" });
    setError(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const problem = contactInputError(edit);
    if (problem) {
      setError(problem);
      return;
    }
    const current = (rows ?? []).find((r) => r.id === editingId);
    const replyChanged = edit.reply.trim() !== (current?.reply ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const patch = {
        contacted_on: edit.contacted_on,
        method: edit.method,
        content: edit.content.trim(),
        staff: edit.staff.trim(),
        // 回答は変えたときだけ送る（0207 未適用の環境でも他の項目は直せるように）
        ...(replyChanged ? { reply: edit.reply.trim() } : {}),
      };
      await updateOrganizationContact(createClient(), editingId, patch);
      setRows((prev) =>
        sortContactsNewestFirst((prev ?? []).map((r) => (r.id === editingId ? { ...r, ...patch } : r))),
      );
      setEditingId(null);
    } catch (err) {
      setError(dbErrorMessage(err, replyChanged ? MIGRATION_REPLY : MIGRATION, errorMessage(err, "連絡の記録の保存に失敗しました")));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    setError(null);
    try {
      await deleteOrganizationContact(createClient(), target.id);
      setRows((prev) => (prev ?? []).filter((r) => r.id !== target.id));
    } catch (err) {
      setError(errorMessage(err, "連絡の記録の削除に失敗しました"));
    }
  };

  // 追加・編集で共通の入力欄
  const fields = (v: Draft, set: (patch: Partial<Draft>) => void) => (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold text-muted">連絡があった日</span>
        <input
          type="date"
          value={v.contacted_on}
          onChange={(e) => set({ contacted_on: e.target.value })}
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold text-muted">連絡の方法</span>
        <select value={v.method} onChange={(e) => set({ method: e.target.value })} className={INPUT}>
          {CONTACT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m || "—（未選択）"}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold text-muted">対応した人（こちら側）</span>
        <input
          value={v.staff}
          onChange={(e) => set({ staff: e.target.value })}
          placeholder="例: 市原"
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-3">
        <span className="text-[11px] font-bold text-muted">連絡の内容（会社からの相談・連絡）</span>
        <textarea
          rows={3}
          value={v.content}
          onChange={(e) => set({ content: e.target.value })}
          placeholder="例: 雇用条件書の年間休日が今後変わるかもしれないが大丈夫か、との相談"
          className={TEXTAREA}
        />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-3">
        <span className="text-[11px] font-bold text-muted">こちらの回答・対応（対応した人がどう答えたか）</span>
        <textarea
          rows={3}
          value={v.reply}
          onChange={(e) => set({ reply: e.target.value })}
          placeholder="例: 年間休日が変わる場合は雇用条件書を作り直して入管へ届出が必要と回答。変更が決まったら連絡してもらうことにした"
          className={TEXTAREA}
        />
      </label>
    </div>
  );

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold">
          <MessageSquareText size={16} />
          連絡の記録
          {rows && rows.length > 0 && <span className="text-xs font-medium text-muted">（{rows.length}件）</span>}
        </h2>
        {canEdit && !open && (
          <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
            連絡を記録
          </Button>
        )}
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        会社と電話・メール・Messenger・訪問などで連絡した内容を、日付ごとに残します。
        誰がいつ何を話したかをあとから追えるようにしておくと、担当が変わっても経緯が分かります。
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
          {error}
        </p>
      )}

      {canEdit && open && (
        <div className="mb-3 rounded-xl border border-dashed border-border p-3">
          {fields(draft, (patch) => setDraft((d) => ({ ...d, ...patch })))}
          <div className="mt-3 flex gap-2">
            <Button fullWidth disabled={busy} onClick={() => void add()}>
              {busy ? "保存中…" : "この内容で記録する"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setDraft(emptyDraft());
              }}
              className="min-h-[44px] shrink-0 px-3 text-sm font-bold text-muted"
            >
              やめる
            </button>
          </div>
        </div>
      )}

      {rows === null ? (
        <p className="text-xs text-muted">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
          連絡の記録はまだありません。
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) =>
            editingId === r.id ? (
              <div key={r.id} className="rounded-xl border border-brand/40 bg-background p-3">
                {fields(edit, (patch) => setEdit((d) => ({ ...d, ...patch })))}
                <div className="mt-3 flex gap-2">
                  <Button fullWidth disabled={busy} onClick={() => void saveEdit()}>
                    {busy ? "保存中…" : "保存"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="min-h-[44px] shrink-0 px-3 text-sm font-bold text-muted"
                  >
                    やめる
                  </button>
                </div>
              </div>
            ) : (
              <div key={r.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="font-bold tabular-nums">{r.contacted_on}</span>
                  {r.method && (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 font-bold text-brand">{r.method}</span>
                  )}
                  {r.staff && <span className="text-muted">対応 {r.staff}</span>}
                  {canEdit && (
                    <span className="ml-auto flex shrink-0 gap-1">
                      <button
                        type="button"
                        aria-label="この記録を編集"
                        onClick={() => startEdit(r)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label="この記録を削除"
                        onClick={() => setDeleting(r)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-seal"
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  )}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{r.content}</p>
                {/* こちらの回答・対応（入っているときだけ出す） */}
                {(r.reply ?? "").trim() && (
                  <div className="mt-2 rounded-lg border-l-4 border-brand/60 bg-brand/5 px-3 py-2">
                    <p className="text-[11px] font-bold text-brand">こちらの回答・対応{r.staff ? `（${r.staff}）` : ""}</p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.reply}</p>
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="連絡の記録を削除"
        message={deleting ? `${deleting.contacted_on} の記録を削除します。よろしいですか？` : ""}
        confirmLabel="削除する"
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  );
}
