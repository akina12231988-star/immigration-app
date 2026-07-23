"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eye, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { listOnboardingDocs } from "@/lib/supabase/queries/onboarding";
import {
  clearOnboardingDocFile,
  getOnboardingDocDownloadUrl,
  getOnboardingDocPreviewUrl,
} from "@/app/(app)/onboarding/actions";
import { uploadOnboardingDoc } from "@/lib/onboarding-files";
import { WORKER_CERT_DOCS } from "@/lib/onboarding";
import type { OnboardingDocumentRow } from "@/types/db";

type CertDef = { key: string; label: string };

// 外国人の書類（PDF・画像）を保存する。専門級の合格証・パスポート・日本語の合格証・
// 専門外の合格証・履歴書・在留カードを、それぞれ保存・差し替え・削除・表示できる。
// 入社書類メールには添付しない（外国人の情報としての保管用）。
export function WorkerCertificateDocs({
  workerId,
  canEdit = false,
}: {
  workerId: string;
  canEdit?: boolean;
}) {
  const [docs, setDocs] = useState<OnboardingDocumentRow[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadDefRef = useRef<CertDef | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () =>
    listOnboardingDocs(createClient(), workerId).then(setDocs).catch(() => undefined);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  const docByKey = new Map(docs.map((d) => [d.doc_key, d]));

  function startUpload(def: CertDef) {
    uploadDefRef.current = def;
    fileInputRef.current?.click();
  }

  async function handleFile(file: File | undefined) {
    const def = uploadDefRef.current;
    if (!file || !def) return;
    setBusyKey(def.key);
    setError(null);
    try {
      await uploadOnboardingDoc(workerId, { key: def.key, label: def.label, num: 0 }, file);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteFile(def: CertDef, fileName: string) {
    if (!window.confirm(`「${def.label}」の保存データ（${fileName}）を削除します。よろしいですか？`)) {
      return;
    }
    setBusyKey(def.key);
    setError(null);
    try {
      const res = await clearOnboardingDocFile(workerId, def.key);
      if (!res.ok) throw new Error(res.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusyKey(null);
    }
  }

  async function openPreview(id: string) {
    const res = await getOnboardingDocPreviewUrl(id);
    if (!res.ok) return setError(res.message);
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function download(id: string) {
    const res = await getOnboardingDocDownloadUrl(id);
    if (!res.ok) return setError(res.message);
    const a = document.createElement("a");
    a.href = res.url;
    a.download = res.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted">
        <FileText size={15} />
        外国人書類（PDF・画像で保存）
      </h2>
      <p className="mb-3 text-[11px] text-muted">
        合格証・パスポート・履歴書などを保存できます（入社書類メールには添付しません）。
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        {WORKER_CERT_DOCS.map((def) => {
          const row = docByKey.get(def.key);
          const hasFile = !!row?.storage_path;
          const busy = busyKey === def.key;
          return (
            <div
              key={def.key}
              className="flex items-center gap-2.5 border-b border-border bg-background px-3 py-2.5 text-sm last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{def.label}</span>
                <span className="block truncate text-[11px] text-muted">
                  {hasFile ? row!.file_name : "未登録"}
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {busy ? (
                  <Loader2 size={15} className="animate-spin text-muted" />
                ) : (
                  <>
                    {hasFile && (
                      <>
                        <IconButton label="表示" onClick={() => openPreview(row!.id)}>
                          <Eye size={13} />
                        </IconButton>
                        <IconButton label="ダウンロード" onClick={() => download(row!.id)}>
                          <Download size={13} />
                        </IconButton>
                      </>
                    )}
                    {canEdit && (
                      <IconButton
                        label={hasFile ? "差し替え" : "アップロード"}
                        onClick={() => startUpload(def)}
                      >
                        <Upload size={13} />
                        {hasFile ? "差し替え" : "追加"}
                      </IconButton>
                    )}
                    {canEdit && hasFile && (
                      <IconButton label="削除" tone="danger" onClick={() => deleteFile(def, row!.file_name)}>
                        <Trash2 size={13} />
                      </IconButton>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </Card>
  );
}

function IconButton({
  label,
  onClick,
  tone = "default",
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold ${
        tone === "danger" ? "text-seal" : "text-brand"
      }`}
    >
      {children}
    </button>
  );
}
