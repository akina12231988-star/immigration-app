"use client";

import { useEffect, useState } from "react";
import { Link2, Trash2 } from "lucide-react";
import { AttachedFileButton } from "@/components/ui/AttachedFileButton";
import { CopyButton } from "@/components/ui/CopyButton";
import { dbErrorMessage } from "@/lib/errors";
import {
  deleteAdhocFile,
  getAdhocFilePreviewUrl,
  listAdhocFiles,
  registerAdhocFileLink,
  type AdhocFileView,
} from "./actions";
import { ADHOC_FILE_TARGETS, type AdhocFileKind } from "@/lib/adhoc-report-files";

// 署名済みの届出書（スキャンしたPDF・画像）の登録。
// ストレージの容量を使わないよう、Google ドライブに置いたファイルの「リンクをコピー」を貼って登録する（0156）。
// 以前にアップロードしたファイルはそのまま開ける。
// kind で退職の記録・契約内容変更の記録・支援委託終了の記録のどれの添付かを切り替える。
export function AdhocFileAttachments({
  kind,
  recordId,
  canEdit,
  fileName = "",
  onCountChange,
}: {
  kind: AdhocFileKind;
  recordId: string;
  canEdit: boolean;
  // Google ドライブに置くときのファイル名（TODO番号_所属機関名_氏名_退職随時報告）。コピーして使う
  fileName?: string;
  // 添付の件数（投函完了にできるかの判定に使う）
  onCountChange?: (count: number) => void;
}) {
  const MIGRATION = ADHOC_FILE_TARGETS[kind].migration;
  const [files, setFiles] = useState<AdhocFileView[]>([]);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  const apply = (rows: AdhocFileView[]) => {
    setFiles(rows);
    onCountChange?.(rows.length);
  };

  useEffect(() => {
    let cancelled = false;
    listAdhocFiles(kind, recordId)
      .then((rows) => {
        if (!cancelled) apply(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, recordId]);

  async function registerLink() {
    const url = link.trim();
    if (!url) return;
    setBusy(true);
    setError(null);
    try {
      const res = await registerAdhocFileLink(kind, recordId, url);
      if (!res.ok) throw new Error(res.message);
      setLink("");
      apply(await listAdhocFiles(kind, recordId));
    } catch (err) {
      setError(dbErrorMessage(err, "0156_adhoc_report_files_external_url.sql", "リンクの登録に失敗しました"));
    } finally {
      setBusy(false);
    }
  }

  async function preview(id: string) {
    const res = await getAdhocFilePreviewUrl(kind, id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(dbErrorMessage(new Error(res.message), MIGRATION, res.message));
  }

  async function remove(f: AdhocFileView) {
    if (!window.confirm(`「${f.external_url || f.file_name}」を削除します。よろしいですか？`)) return;
    setError(null);
    const res = await deleteAdhocFile(kind, f.id);
    if (res.ok) apply(files.filter((x) => x.id !== f.id));
    else setError(res.message);
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl p-1">
      {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
      {/* Google ドライブに置くときのファイル名（そろえておくと探しやすい） */}
      {fileName && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-surface px-2 py-1.5 text-[11px]">
          <span className="text-muted">ドライブのファイル名:</span>
          <span className="font-bold">{fileName}</span>
          <CopyButton value={fileName} label="ファイル名をコピー" size={13} />
        </div>
      )}
      {files.length === 0 && !canEdit && <p className="text-[11px] text-muted">登録はありません</p>}
      {files.map((f) => (
        <div key={f.id} className="flex items-center gap-1.5">
          <AttachedFileButton
            fileName={f.external_url ? `${f.file_name}: ${f.external_url}` : f.file_name}
            note={f.created_at.slice(0, 10)}
            onOpen={() => preview(f.id)}
            className="flex-1"
          />
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
          <div className="flex items-center gap-1.5">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void registerLink();
                }
              }}
              disabled={busy}
              placeholder="署名済みの届出書の Google ドライブのリンクを貼る（https://drive.google.com/…）"
              aria-label="署名済みの届出書の Google ドライブのリンク"
              className="min-h-[36px] min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-[11px] focus:border-brand focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void registerLink()}
              disabled={busy || !link.trim()}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-brand px-2.5 py-2 text-[11px] font-bold text-brand-foreground disabled:opacity-50"
            >
              <Link2 size={12} />
              {busy ? "登録中…" : "登録"}
            </button>
          </div>
          <p className="text-[11px] text-muted">
            スキャンした届出書を Google ドライブに上のファイル名で置き、「リンクをコピー」したものを貼ってください。
          </p>
        </>
      )}
    </div>
  );
}
