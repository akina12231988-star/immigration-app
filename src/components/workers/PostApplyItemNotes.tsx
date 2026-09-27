"use client";

import { useState } from "react";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { PostApplyNote } from "@/lib/post-apply";

// "2026-09-25" → "9/25"
function shortDate(d: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${Number(m[1])}/${Number(m[2])}` : d;
}

// ログイン中の人の表示名（メモの記入者）。取れなければ空
async function currentAuthorName(): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return "";
  const { data: p } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", data.user.id)
    .maybeSingle();
  const prof = p as { display_name?: string; email?: string } | null;
  return prof?.display_name || prof?.email || "";
}

// 申請後の郵送・タスクの1項目に付けるメモ（例：現在発行手続き中との連絡あり）。
// 何件でも足せて、書いた日と記入者が残る。申請一覧と申請準備の両方で使う
export function PostApplyItemNotes({
  notes,
  canEdit,
  onAdd,
  onRemove,
}: {
  notes: PostApplyNote[];
  canEdit: boolean;
  onAdd: (text: string, by: string) => void | Promise<void>;
  onRemove: (noteId: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await onAdd(draft, await currentAuthorName().catch(() => ""));
      setDraft("");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (notes.length === 0 && !canEdit) return null;

  return (
    <div className="mt-1 w-full space-y-1">
      {notes.map((n) => (
        <p
          key={n.id}
          className="flex items-start gap-1.5 rounded-md bg-background px-2 py-1 text-[11px] leading-relaxed"
        >
          <span className="shrink-0 tabular-nums text-muted">
            {shortDate(n.on)}
            {n.by && ` ${n.by}`}
          </span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{n.text}</span>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("このメモを削除します。よろしいですか？")) void onRemove(n.id);
              }}
              aria-label="メモを削除"
              className="shrink-0 text-muted hover:text-seal"
            >
              <Trash2 size={12} />
            </button>
          )}
        </p>
      ))}
      {canEdit &&
        (open ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void save();
                }
              }}
              autoFocus
              placeholder="例：現在発行手続き中との連絡あり"
              aria-label="メモ"
              className="min-h-[36px] min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-xs focus:border-brand focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !draft.trim()}
              className="min-h-[36px] shrink-0 rounded-lg bg-brand px-3 text-[11px] font-bold text-brand-foreground disabled:opacity-50"
            >
              メモを保存
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setDraft("");
              }}
              className="min-h-[36px] shrink-0 rounded-lg border border-border bg-surface px-2.5 text-[11px] font-bold text-muted"
            >
              やめる
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
          >
            <MessageSquarePlus size={12} />
            メモを追加
          </button>
        ))}
    </div>
  );
}
