"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eye, FileText, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { listOnboardingDocs } from "@/lib/supabase/queries/onboarding";
import {
  clearOnboardingDocFile,
  getOnboardingDocDownloadUrl,
  getOnboardingDocPreviewUrl,
} from "@/app/(app)/onboarding/actions";
import { uploadOnboardingDoc } from "@/lib/onboarding-files";
import {
  gensenDocKey,
  gensenLabel,
  gensenReiwaFromKey,
  isGensenYearKey,
  reiwaYear,
} from "@/lib/onboarding";
import { todayStr } from "@/lib/ssw/calc";
import type { OnboardingDocumentRow } from "@/types/db";

// 源泉徴収票を令和年ごとに蓄積して保存する。年を選んでアップロードすると、
// その年の1件として保存され、過去の年分も一覧で残る。
export function GensenDocuments({
  workerId,
  canEdit = false,
}: {
  workerId: string;
  canEdit?: boolean;
}) {
  const [rows, setRows] = useState<OnboardingDocumentRow[]>([]);
  const [year, setYear] = useState(() => reiwaYear(todayStr()));
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadKeyRef = useRef<{ key: string; label: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () =>
    listOnboardingDocs(createClient(), workerId)
      .then((docs) => {
        const gensen = docs
          .filter((d) => isGensenYearKey(d.doc_key) && d.storage_path)
          .sort((a, b) => (gensenReiwaFromKey(b.doc_key) ?? 0) - (gensenReiwaFromKey(a.doc_key) ?? 0));
        setRows(gensen);
      })
      .catch(() => undefined);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  const existingYears = new Set(rows.map((r) => gensenReiwaFromKey(r.doc_key)));

  function startUpload(reiwa: number) {
    uploadKeyRef.current = { key: gensenDocKey(reiwa), label: gensenLabel(reiwa) };
    fileInputRef.current?.click();
  }

  async function handleFile(file: File | undefined) {
    const target = uploadKeyRef.current;
    if (!file || !target) return;
    setBusyKey(target.key);
    setError(null);
    try {
      await uploadOnboardingDoc(workerId, { key: target.key, label: target.label, num: 10 }, file);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusyKey(null);
    }
  }

  async function remove(row: OnboardingDocumentRow) {
    if (!window.confirm(`「${row.label}」の添付データを削除します。よろしいですか？`)) return;
    setBusyKey(row.doc_key);
    setError(null);
    try {
      const res = await clearOnboardingDocFile(workerId, row.doc_key);
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

  const alreadyThisYear = existingYears.has(year);

  return (
    <Card className="p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-muted">
        <FileText size={15} />
        源泉徴収票（令和年ごとに保存）
      </h2>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* 蓄積済みの一覧 */}
      {rows.length === 0 ? (
        <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
          まだ登録がありません。
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          {rows.map((row) => {
            const busy = busyKey === row.doc_key;
            return (
              <div
                key={row.id}
                className="flex items-center gap-2.5 border-b border-border bg-background px-3 py-2.5 text-sm last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{row.label}</span>
                  <span className="block truncate text-[11px] text-muted">{row.file_name}</span>
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  {busy ? (
                    <Loader2 size={15} className="animate-spin text-muted" />
                  ) : (
                    <>
                      <IconButton label="表示" onClick={() => openPreview(row.id)}>
                        <Eye size={13} />
                      </IconButton>
                      <IconButton label="ダウンロード" onClick={() => download(row.id)}>
                        <Download size={13} />
                      </IconButton>
                      {canEdit && (
                        <>
                          <IconButton
                            label="差し替え"
                            onClick={() => {
                              const r = gensenReiwaFromKey(row.doc_key);
                              if (r != null) startUpload(r);
                            }}
                          >
                            <Upload size={13} />
                          </IconButton>
                          <IconButton label="削除" tone="danger" onClick={() => remove(row)}>
                            <Trash2 size={13} />
                          </IconButton>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 新しい年分の追加 */}
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">追加する年分</span>
            <span className="flex items-center gap-1.5">
              令和
              <input
                type="number"
                min={1}
                max={99}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-20 rounded-lg border border-border bg-surface px-2 py-2 text-sm tabular-nums focus:border-brand focus:outline-none"
              />
              年分
            </span>
          </label>
          <button
            type="button"
            onClick={() => startUpload(year)}
            disabled={busyKey !== null || !year}
            className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground disabled:opacity-40"
          >
            <Plus size={15} />
            {alreadyThisYear ? "この年分を差し替え" : "この年分を追加"}
          </button>
        </div>
      )}

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
