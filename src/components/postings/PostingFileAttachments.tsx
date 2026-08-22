"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Loader2, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { listPostingFiles } from "@/lib/supabase/queries/posting-files";
import {
  createPostingFileTicket,
  deletePostingFile,
  getPostingFilePreviewUrl,
  registerPostingFile,
} from "@/app/(app)/postings/file-actions";
import { dbErrorMessage } from "@/lib/errors";
import type { PostingFileRow } from "@/types/db";

// 求人へのファイル添付（企業に記載してもらった求人票のPDF・画像など・複数可）。
// 所属機関の添付（OrgFileAttachments）と同じ方式
export function PostingFileAttachments({
  postingId,
  kind = "求人票",
  addLabel = "求人票を添付（PDF・画像）",
  canEdit,
}: {
  postingId: string;
  kind?: string;
  addLabel?: string;
  canEdit: boolean;
}) {
  const [files, setFiles] = useState<PostingFileRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    listPostingFiles(createClient(), postingId)
      .then((rows) => {
        if (!cancelled) setFiles(rows.filter((r) => r.kind === kind));
      })
      .catch(() => undefined); // 0094未適用のときは空のまま（登録時に案内を出す）
    return () => {
      cancelled = true;
    };
  }, [postingId, kind]);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        const { blob, mimeType, fileName } = await compressImage(file);
        const ticket = await createPostingFileTicket(postingId, fileName, mimeType);
        if (!ticket.ok) throw new Error(ticket.message);
        const { error: upErr } = await createClient()
          .storage.from("app-files")
          .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
        if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
        const res = await registerPostingFile(postingId, kind, ticket.path, fileName, mimeType);
        if (!res.ok) throw new Error(res.message);
      }
      setFiles(
        (await listPostingFiles(createClient(), postingId)).filter((r) => r.kind === kind),
      );
    } catch (err) {
      setError(dbErrorMessage(err, "0094_posting_files.sql", "アップロードに失敗しました"));
    } finally {
      setBusy(false);
    }
  }

  async function preview(id: string) {
    const res = await getPostingFilePreviewUrl(id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  }

  async function remove(f: PostingFileRow) {
    if (!window.confirm(`「${f.file_name}」を削除します。よろしいですか？`)) return;
    setError(null);
    const res = await deletePostingFile(f.id);
    if (res.ok) setFiles((prev) => prev.filter((x) => x.id !== f.id));
    else setError(res.message);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
      {files.length === 0 && !canEdit && (
        <p className="text-[11px] text-muted">添付された求人票はありません。</p>
      )}
      {files.map((f) => (
        <div key={f.id} className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{f.file_name}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted">
            {f.created_at.slice(0, 10)}
          </span>
          <button
            type="button"
            onClick={() => preview(f.id)}
            aria-label="表示"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted hover:text-brand"
          >
            <Eye size={13} />
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => remove(f)}
              aria-label="削除"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-seal"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 self-start rounded-lg border border-dashed border-brand px-3 py-2 text-xs font-bold text-brand disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {busy ? "アップロード中…" : addLabel}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}
