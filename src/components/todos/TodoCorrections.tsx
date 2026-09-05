"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { dbErrorMessage } from "@/lib/errors";
import {
  createTodoCorrectionTicket,
  deleteTodoCorrection,
  listTodoCorrections,
  registerTodoCorrection,
  type TodoCorrectionView,
} from "@/app/(app)/todos/correction-actions";

// 申請書類の訂正記録（チェック後）。訂正書類名・訂正箇所の画像・訂正内容を複数保存できる
export function TodoCorrections({
  todoId,
  canEdit,
  defaultOpen = false,
}: {
  todoId: string;
  canEdit: boolean;
  defaultOpen?: boolean; // 訂正記録のページで開いた状態にするとき true
}) {
  const [rows, setRows] = useState<TodoCorrectionView[]>([]);
  const [open, setOpen] = useState(defaultOpen);
  const [docName, setDocName] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => listTodoCorrections(todoId).then(setRows).catch(() => undefined);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todoId]);

  const add = async () => {
    if (!docName.trim() && !content.trim() && !file) return;
    setBusy(true);
    setError(null);
    try {
      let path: string | undefined;
      let fileName: string | undefined;
      let mimeType: string | undefined;
      if (file) {
        const { blob, mimeType: mt, fileName: fn } = await compressImage(file);
        const ticket = await createTodoCorrectionTicket(todoId, fn, mt);
        if (!ticket.ok) throw new Error(ticket.message);
        const { error: upErr } = await createClient()
          .storage.from("app-files")
          .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mt });
        if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
        path = ticket.path;
        fileName = fn;
        mimeType = mt;
      }
      const res = await registerTodoCorrection(todoId, {
        doc_name: docName.trim(),
        content: content.trim(),
        path,
        fileName,
        mimeType,
      });
      if (!res.ok) throw new Error(res.message);
      setDocName("");
      setContent("");
      setFile(null);
      await load();
    } catch (err) {
      setError(
        dbErrorMessage(err, "0103_todo_prep_extras.sql", "訂正記録の保存に失敗しました"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-lg bg-background p-2"
    >
      <summary className="cursor-pointer text-[11px] font-bold text-muted">
        📝 申請書類の訂正記録（チェック後）{rows.length > 0 && `（${rows.length}件）`}
      </summary>
      <div className="mt-2 space-y-2">
        {error && <p className="rounded-lg bg-seal/10 px-2 py-1.5 text-[11px] text-seal">{error}</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-start gap-2 rounded-lg border border-border bg-surface p-2">
            {r.url && (
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.url} alt="訂正箇所" className="h-14 w-14 rounded border border-border object-cover" />
              </a>
            )}
            <span className="min-w-0 flex-1 text-[11px]">
              <span className="block font-bold">{r.doc_name || "（書類名なし）"}</span>
              <span className="block whitespace-pre-wrap">{r.content}</span>
              <span className="block text-[10px] text-muted">{r.created_at.slice(0, 10)}</span>
            </span>
            {canEdit && (
              <button
                type="button"
                aria-label="この訂正記録を削除"
                onClick={() => {
                  if (window.confirm("この訂正記録を削除します。よろしいですか？")) {
                    void deleteTodoCorrection(r.id).then(load);
                  }
                }}
                className="shrink-0 text-seal"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <div className="space-y-1.5 rounded-lg border border-dashed border-border p-2">
            <input
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="訂正書類名（例: 1-6号別紙）"
              className="min-h-[34px] w-full rounded-lg border border-border bg-surface px-2 text-xs"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={2}
              placeholder="訂正内容"
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs"
            />
            {/* ファイルを選ぶか、この枠にドラッグ＆ドロップして添付する */}
            <FileDropArea
              onFiles={(files) => setFile(files[0] ?? null)}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-1.5"
            >
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="min-w-0 flex-1 text-[11px]"
              />
              {file && (
                <span className="max-w-full truncate text-[11px] font-bold text-brand">
                  選択中: {file.name}
                </span>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void add()}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-brand disabled:opacity-50"
              >
                <Plus size={12} />
                {busy ? "保存中…" : "訂正記録を追加"}
              </button>
            </FileDropArea>
          </div>
        )}
      </div>
    </details>
  );
}
