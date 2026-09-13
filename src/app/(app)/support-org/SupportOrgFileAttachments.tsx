"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { AttachedFileButton } from "@/components/ui/AttachedFileButton";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { dbErrorMessage } from "@/lib/errors";
import {
  createSupportOrgFileTicket,
  deleteSupportOrgFile,
  getSupportOrgFilePreviewUrl,
  listSupportOrgFiles,
  registerSupportOrgFile,
  type SupportOrgFileView,
} from "./actions";

const MIGRATION = "0153_support_org_files.sql";

// 人材サービス総合サイトに掲載している画面の画像など、登録支援機関（当社）の添付。
// 最新版（いちばん新しいアップロード日の分）の画像はその場に表示し、古い分はファイル名だけ出す。
// ボタンからでも、枠にドラッグ＆ドロップでも添付できる
export function SupportOrgFileAttachments({
  kind,
  addLabel,
  canEdit,
}: {
  kind: string;
  addLabel: string;
  canEdit: boolean;
}) {
  const [files, setFiles] = useState<SupportOrgFileView[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () =>
    listSupportOrgFiles(kind)
      .then(setFiles)
      .catch((err) => setError(dbErrorMessage(err, MIGRATION, "添付の読み込みに失敗しました")));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  // 最新版 = いちばん新しいアップロード日の分（複数ページの画像もまとめて出す）
  const newestDay = files[0]?.created_at.slice(0, 10) ?? "";
  const latest = files.filter((f) => f.created_at.slice(0, 10) === newestDay).reverse();
  const older = files.filter((f) => f.created_at.slice(0, 10) !== newestDay);
  const latestImageKey = latest
    .filter((f) => f.mime_type.startsWith("image/"))
    .map((f) => f.id)
    .join(",");

  useEffect(() => {
    if (!latestImageKey) return;
    let cancelled = false;
    void Promise.all(
      latestImageKey.split(",").map(async (id) => {
        const res = await getSupportOrgFilePreviewUrl(id);
        return [id, res.ok ? res.url : ""] as const;
      }),
    ).then((pairs) => {
      if (!cancelled) setUrls(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [latestImageKey]);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        const { blob, mimeType, fileName } = await compressImage(file);
        const ticket = await createSupportOrgFileTicket(fileName, mimeType);
        if (!ticket.ok) throw new Error(ticket.message);
        const { error: upErr } = await createClient()
          .storage.from("app-files")
          .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
        if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
        const res = await registerSupportOrgFile(kind, ticket.path, fileName, mimeType);
        if (!res.ok) throw new Error(res.message);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function preview(id: string) {
    const res = await getSupportOrgFilePreviewUrl(id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  }

  async function remove(f: SupportOrgFileView) {
    if (!window.confirm(`「${f.file_name}」を削除します。よろしいですか？`)) return;
    setError(null);
    const res = await deleteSupportOrgFile(f.id);
    if (res.ok) setFiles((prev) => prev.filter((x) => x.id !== f.id));
    else setError(res.message);
  }

  const row = (f: SupportOrgFileView) => (
    <div key={f.id} className="flex items-center gap-1.5">
      <AttachedFileButton
        fileName={f.file_name}
        note={f.created_at.slice(0, 10)}
        onOpen={() => void preview(f.id)}
        className="flex-1"
      />
      {canEdit && (
        <button
          type="button"
          onClick={() => void remove(f)}
          aria-label="削除"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-seal"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
      {latest.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold text-muted">最新版（{newestDay} にアップロード）</p>
          {latest.map((f) => (
            <div key={f.id} className="flex flex-col gap-1">
              {row(f)}
              {f.mime_type.startsWith("image/") && urls[f.id] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urls[f.id]}
                  alt={f.file_name}
                  className="max-h-96 w-auto max-w-full self-start rounded-lg border border-border bg-white object-contain"
                />
              )}
            </div>
          ))}
        </div>
      )}
      {older.length > 0 && (
        <details className="text-[11px] text-muted">
          <summary className="cursor-pointer font-bold">前の版（{older.length}件）</summary>
          <div className="mt-1 flex flex-col gap-1">{older.map(row)}</div>
        </details>
      )}
      {canEdit && (
        <FileDropArea
          onFiles={(list) => void handleFiles(list)}
          disabled={busy}
          className="flex flex-col gap-1 rounded-lg border border-dashed border-border p-2"
        >
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 self-start rounded-lg border border-dashed border-brand px-3 py-2 text-xs font-bold text-brand disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {busy ? "アップロード中…" : addLabel}
          </button>
          <p className="text-[11px] text-muted">
            画像・PDFをこの枠にドラッグ＆ドロップしても添付できます。新しく添付した分が最新版として表示されます。
          </p>
        </FileDropArea>
      )}
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
    </div>
  );
}
