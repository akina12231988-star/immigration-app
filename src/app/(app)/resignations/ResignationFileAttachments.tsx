"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Loader2, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { dbErrorMessage } from "@/lib/errors";
import {
  createResignationFileTicket,
  deleteResignationFile,
  getResignationFilePreviewUrl,
  listResignationFiles,
  registerResignationFile,
  type ResignationFileView,
} from "./actions";

const MIGRATION = "0086_resignation_progress.sql";

// 署名済みの届出書（スキャンしたPDF・画像）の添付。
// ドラッグ＆ドロップでも、ボタンから選んでも登録できる。
export function ResignationFileAttachments({
  resignationId,
  canEdit,
  onCountChange,
}: {
  resignationId: string;
  canEdit: boolean;
  // 添付の件数（投函完了にできるかの判定に使う）
  onCountChange?: (count: number) => void;
}) {
  const [files, setFiles] = useState<ResignationFileView[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const apply = (rows: ResignationFileView[]) => {
    setFiles(rows);
    onCountChange?.(rows.length);
  };

  useEffect(() => {
    let cancelled = false;
    listResignationFiles(resignationId)
      .then((rows) => {
        if (!cancelled) apply(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resignationId]);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        const { blob, mimeType, fileName } = await compressImage(file);
        const ticket = await createResignationFileTicket(resignationId, fileName, mimeType);
        if (!ticket.ok) throw new Error(ticket.message);
        const { error: upErr } = await createClient()
          .storage.from("app-files")
          .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
        if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
        const res = await registerResignationFile(resignationId, ticket.path, fileName, mimeType);
        if (!res.ok) throw new Error(res.message);
      }
      apply(await listResignationFiles(resignationId));
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, "アップロードに失敗しました"));
    } finally {
      setBusy(false);
    }
  }

  async function preview(id: string) {
    const res = await getResignationFilePreviewUrl(id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  }

  async function remove(f: ResignationFileView) {
    if (!window.confirm(`「${f.file_name}」を削除します。よろしいですか？`)) return;
    setError(null);
    const res = await deleteResignationFile(f.id);
    if (res.ok) apply(files.filter((x) => x.id !== f.id));
    else setError(res.message);
  }

  return (
    <div
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDragOver(false);
        if (!busy) void handleFiles(e.dataTransfer.files);
      }}
      className={`flex flex-col gap-1.5 rounded-xl p-1 ${dragOver ? "bg-brand/10 ring-2 ring-brand" : ""}`}
    >
      {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
      {files.length === 0 && !canEdit && <p className="text-[11px] text-muted">添付はありません</p>}
      {files.map((f) => (
        <div key={f.id} className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{f.file_name}</span>
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
            {busy ? "アップロード中…" : "署名済みの届出書を添付（画像・PDF）"}
          </button>
          <p className="text-[11px] text-muted">
            {dragOver
              ? "ここで離すと添付します"
              : "スキャンしたPDF・画像をこの枠にドラッグ＆ドロップしても添付できます。"}
          </p>
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
