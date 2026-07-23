"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Download, Eye, HeartPulse, Loader2, Trash2, Upload, ClipboardCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { listOnboardingDocs } from "@/lib/supabase/queries/onboarding";
import {
  clearOnboardingDocFile,
  getOnboardingDocDownloadUrl,
  getOnboardingDocPreviewUrl,
} from "@/app/(app)/onboarding/actions";
import { uploadOnboardingDoc } from "@/lib/onboarding-files";
import { HEALTH_CHECK_DOC_KEY, HEALTH_CHECK_LABEL } from "@/lib/onboarding";
import { healthCheckValidUntil, isHealthCheckValid } from "@/lib/health-check";
import { todayStr } from "@/lib/ssw/calc";
import type { OnboardingDocumentRow } from "@/types/db";

const DOC_DEF = { key: HEALTH_CHECK_DOC_KEY, label: HEALTH_CHECK_LABEL, num: 0 };

// 健康診断のデータ保存。受診日を手入力すると、その1年後を有効期限として表示し、
// 今日時点で有効か無効かを示す。ファイルは入社書類メールには添付しない。
export function HealthCheckSection({
  workerId,
  initialExamOn,
  canEdit = false,
}: {
  workerId: string;
  initialExamOn: string | null;
  canEdit?: boolean;
}) {
  const [examOn, setExamOn] = useState(initialExamOn ?? "");
  const [doc, setDoc] = useState<OnboardingDocumentRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDoc = () =>
    listOnboardingDocs(createClient(), workerId)
      .then((docs) => setDoc(docs.find((d) => d.doc_key === HEALTH_CHECK_DOC_KEY) ?? null))
      .catch(() => undefined);

  useEffect(() => {
    void loadDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  const today = todayStr();
  const validUntil = healthCheckValidUntil(examOn || null);
  const valid = isHealthCheckValid(examOn || null, today);
  const hasFile = !!doc?.storage_path;

  async function saveExamOn(value: string) {
    setExamOn(value);
    setError(null);
    const { error: err } = await createClient()
      .from("workers")
      .update({ health_check_on: value || null })
      .eq("id", workerId);
    if (err) {
      setError(err.message);
      return;
    }
    setSavedTick(true);
    setTimeout(() => setSavedTick(false), 1500);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadOnboardingDoc(workerId, DOC_DEF, file);
      await loadDoc();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function deleteFile() {
    if (!doc) return;
    if (!window.confirm(`健康診断の添付データ（${doc.file_name}）を削除します。よろしいですか？`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await clearOnboardingDocFile(workerId, HEALTH_CHECK_DOC_KEY);
      if (!res.ok) throw new Error(res.message);
      await loadDoc();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function openPreview() {
    if (!doc) return;
    const res = await getOnboardingDocPreviewUrl(doc.id);
    if (!res.ok) return setError(res.message);
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function download() {
    if (!doc) return;
    const res = await getOnboardingDocDownloadUrl(doc.id);
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
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-muted">
        <HeartPulse size={15} />
        健康診断
      </h2>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1 text-xs font-bold text-muted">
            受診日
            {savedTick && <Check size={12} className="text-status-approved-fg" />}
          </span>
          <input
            type="date"
            value={examOn}
            disabled={!canEdit}
            onChange={(e) => void saveExamOn(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-base focus:border-brand focus:outline-none disabled:opacity-60"
          />
        </label>

        <div className="block">
          <span className="mb-1.5 block text-xs font-bold text-muted">有効期限（受診日の1年後）</span>
          <div className="flex min-h-[50px] items-center gap-2 rounded-xl border border-border bg-background px-3.5 py-3 text-base">
            {examOn ? (
              <>
                <span className="tabular-nums">{validUntil}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    valid
                      ? "bg-status-approved-bg text-status-approved-fg"
                      : "bg-seal/10 text-seal"
                  }`}
                >
                  {valid ? "有効" : "無効"}
                </span>
              </>
            ) : (
              <span className="text-sm text-muted">受診日を入力してください</span>
            )}
          </div>
        </div>
      </div>

      {/* 健康診断データ（ファイル） */}
      <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">健康診断データ</span>
          <span className="block truncate text-[11px] text-muted">
            {hasFile ? doc!.file_name : "未登録"}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {busy ? (
            <Loader2 size={15} className="animate-spin text-muted" />
          ) : (
            <>
              {hasFile && (
                <>
                  <IconButton label="表示" onClick={openPreview}>
                    <Eye size={13} />
                  </IconButton>
                  <IconButton label="ダウンロード" onClick={download}>
                    <Download size={13} />
                  </IconButton>
                </>
              )}
              {canEdit && (
                <IconButton label={hasFile ? "差し替え" : "アップロード"} onClick={() => fileInputRef.current?.click()}>
                  <Upload size={13} />
                  {hasFile ? "差し替え" : "追加"}
                </IconButton>
              )}
              {canEdit && hasFile && (
                <IconButton label="削除" tone="danger" onClick={deleteFile}>
                  <Trash2 size={13} />
                </IconButton>
              )}
            </>
          )}
        </div>
      </div>

      <Link
        href={`/workers/${workerId}/health-check`}
        className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline"
      >
        <ClipboardCheck size={13} />
        受診項目・就労可の詳細を確認/入力
      </Link>

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
