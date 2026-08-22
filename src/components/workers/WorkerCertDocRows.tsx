"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eye, Loader2, Trash2, Upload } from "lucide-react";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { createClient } from "@/lib/supabase/client";
import { listOnboardingDocs } from "@/lib/supabase/queries/onboarding";
import {
  clearOnboardingDocFile,
  getOnboardingDocDownloadUrl,
  getOnboardingDocPreviewUrl,
} from "@/app/(app)/onboarding/actions";
import { uploadOnboardingDoc } from "@/lib/onboarding-files";
import type { OnboardingDocumentRow } from "@/types/db";

type CertDef = { key: string; label: string };

// 合格証などのPDF・画像を、基本情報の項目のすぐ下で保存・差し替え・削除・表示する行。
// （旧「外国人書類（PDF・画像で保存）」カードを解体して、関係する項目の下に置いたもの。
//   保存先は入社書類と同じ onboarding_documents ＋ app-files バケット）
export function WorkerCertDocRows({
  workerId,
  defs,
  canEdit = false,
}: {
  workerId: string;
  defs: CertDef[];
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

  async function upload(def: CertDef, file: File | undefined) {
    if (!file) return;
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
    <div className="mt-1 space-y-1">
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-2 py-1.5 text-[11px] text-seal">
          {error}
        </p>
      )}
      {defs.map((def) => {
        const row = docByKey.get(def.key);
        const hasFile = !!row?.storage_path;
        const busy = busyKey === def.key;
        return (
          <FileDropArea
            key={def.key}
            onFiles={(files) => void upload(def, files[0])}
            disabled={!canEdit || busy}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-bold text-muted">{def.label}</span>
              <span className="block truncate text-[11px]">
                {hasFile ? row!.file_name : <span className="text-muted">未登録</span>}
              </span>
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {busy ? (
                <Loader2 size={14} className="animate-spin text-muted" />
              ) : (
                <>
                  {hasFile && (
                    <>
                      <CertIconButton label="表示" onClick={() => openPreview(row!.id)}>
                        <Eye size={12} />
                      </CertIconButton>
                      <CertIconButton label="ダウンロード" onClick={() => download(row!.id)}>
                        <Download size={12} />
                      </CertIconButton>
                    </>
                  )}
                  {canEdit && (
                    <CertIconButton
                      label={hasFile ? "差し替え" : "アップロード"}
                      onClick={() => {
                        uploadDefRef.current = def;
                        fileInputRef.current?.click();
                      }}
                    >
                      <Upload size={12} />
                      {hasFile ? "差し替え" : "追加"}
                    </CertIconButton>
                  )}
                  {canEdit && hasFile && (
                    <CertIconButton
                      label="削除"
                      tone="danger"
                      onClick={() => deleteFile(def, row!.file_name)}
                    >
                      <Trash2 size={12} />
                    </CertIconButton>
                  )}
                </>
              )}
            </div>
          </FileDropArea>
        );
      })}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const def = uploadDefRef.current;
          if (def) void upload(def, e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function CertIconButton({
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
      className={`flex items-center gap-1 rounded-lg border border-border px-1.5 py-1 text-[10px] font-bold ${
        tone === "danger" ? "text-seal" : "text-brand"
      }`}
    >
      {children}
    </button>
  );
}
