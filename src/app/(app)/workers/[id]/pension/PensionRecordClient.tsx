"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  Upload,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { listOnboardingDocs } from "@/lib/supabase/queries/onboarding";
import { getPensionRecord, upsertPensionRecord } from "@/lib/supabase/queries/pension";
import {
  clearOnboardingDocFile,
  getOnboardingDocDownloadUrl,
  getOnboardingDocPreviewUrl,
} from "@/app/(app)/onboarding/actions";
import { uploadOnboardingDoc } from "@/lib/onboarding-files";
import { judgePension, parsePensionSymbols, PENSION_SYMBOLS } from "@/lib/pension";
import type { OnboardingDocumentRow } from "@/types/db";

const NENKIN_KEY = "prep_nenkin";

// 年金記録票の記号を選び、意味とアラート（未納なら支払い/免除申請が必要）を表示し、
// 年金記録票のファイルを添付できるページ。
export function PensionRecordClient({
  workerId,
  workerName,
  canEdit,
}: {
  workerId: string;
  workerName: string;
  canEdit: boolean;
}) {
  const [symbols, setSymbols] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [file, setFile] = useState<OnboardingDocumentRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFile = () =>
    listOnboardingDocs(createClient(), workerId)
      .then((docs) => setFile(docs.find((d) => d.doc_key === NENKIN_KEY && d.storage_path) ?? null))
      .catch(() => undefined);

  useEffect(() => {
    getPensionRecord(createClient(), workerId)
      .then((r) => {
        setSymbols(new Set(parsePensionSymbols(r.symbols)));
        setNote(r.note);
      })
      .catch(() => undefined);
    void loadFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  const codes = [...symbols];
  const result = judgePension(codes);
  const hasFile = !!file?.storage_path;

  const toggle = (code: string) =>
    setSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await upsertPensionRecord(createClient(), workerId, {
        symbols: PENSION_SYMBOLS.filter((s) => symbols.has(s.code)).map((s) => s.code).join(","),
        note,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      await uploadOnboardingDoc(workerId, { key: NENKIN_KEY, label: "年金記録", num: 0 }, f);
      await loadFile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function removeFile() {
    if (!window.confirm("年金記録票の添付を削除します。よろしいですか？")) return;
    setBusy(true);
    try {
      await clearOnboardingDocFile(workerId, NENKIN_KEY);
      await loadFile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    if (!file) return;
    const res = await getOnboardingDocPreviewUrl(file.id);
    if (!res.ok) return setError(res.message);
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function download() {
    if (!file) return;
    const res = await getOnboardingDocDownloadUrl(file.id);
    if (!res.ok) return setError(res.message);
    const a = document.createElement("a");
    a.href = res.url;
    a.download = res.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const alertTone =
    result.judgment === "pay"
      ? "bg-seal/10 text-seal"
      : result.judgment === "ok"
        ? "bg-status-approved-bg text-status-approved-fg"
        : "bg-status-notice-bg text-status-notice-fg";

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      <Card className="p-4">
        <p className="mb-2 text-sm font-bold">{workerName}</p>
        <p className="text-[11px] text-muted">
          年金記録票（通知書）に記載の記号を選ぶと、意味と対応が判定されます。国民年金加入者向け。
        </p>
        {codes.length > 0 && (
          <div
            className={`mt-3 flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold ${alertTone}`}
          >
            {result.judgment === "pay" ? (
              <AlertTriangle size={15} />
            ) : result.judgment === "ok" ? (
              <CheckCircle2 size={15} />
            ) : (
              <AlertTriangle size={15} />
            )}
            {result.alert}
          </div>
        )}
      </Card>

      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* 記号の選択（通知書に出てくる記号にチェック） */}
      <Card className="space-y-3 p-4">
        <p className="text-xs font-bold text-muted">記録票に出てくる記号（複数選択可）</p>
        <div className="overflow-hidden rounded-xl border border-border">
          {PENSION_SYMBOLS.map((s) => {
            const on = symbols.has(s.code);
            return (
              <label
                key={s.code}
                className="flex items-center gap-2.5 border-b border-border bg-background px-3 py-2 text-sm last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!canEdit}
                  onChange={() => toggle(s.code)}
                  className="h-4 w-4 shrink-0"
                />
                <span className="w-16 shrink-0 font-bold">{s.code}</span>
                <span className="min-w-0 flex-1 text-muted">{s.meaning}</span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    s.action === "pay"
                      ? "bg-seal/10 text-seal"
                      : s.action === "ok"
                        ? "bg-status-approved-bg text-status-approved-fg"
                        : "bg-status-notice-bg text-status-notice-fg"
                  }`}
                >
                  {s.action === "pay"
                    ? "要支払い/免除申請"
                    : s.action === "exempt"
                      ? "免除・猶予"
                      : s.action === "ok"
                        ? "問題なし"
                        : "要確認"}
                </span>
              </label>
            );
          })}
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-bold text-muted">
            内訳メモ（例: 令和6年 3/12ヶ月 未納 など）
          </span>
          <textarea
            rows={2}
            value={note}
            readOnly={!canEdit}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
          />
        </label>

        {canEdit && (
          <Button type="button" fullWidth onClick={save} disabled={saving}>
            {saving ? (
              <span className="flex items-center gap-1">
                <Loader2 size={15} className="animate-spin" /> 保存中…
              </span>
            ) : saved ? (
              <span className="flex items-center gap-1">
                <Check size={15} /> 保存しました
              </span>
            ) : (
              "保存する"
            )}
          </Button>
        )}
      </Card>

      {/* 年金記録票ファイル（結果の添付） */}
      <Card className="p-4">
        <div className="flex items-center gap-2.5 text-sm">
          <span className="min-w-0 flex-1">
            <span className="block font-bold">年金記録票（結果の添付）</span>
            <span className="block truncate text-[11px] text-muted">
              {hasFile ? file!.file_name : "未登録"}
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {busy ? (
              <Loader2 size={15} className="animate-spin text-muted" />
            ) : (
              <>
                {hasFile && (
                  <>
                    <IconButton label="表示" onClick={preview}>
                      <Eye size={13} />
                    </IconButton>
                    <IconButton label="ダウンロード" onClick={download}>
                      <Download size={13} />
                    </IconButton>
                  </>
                )}
                {canEdit && (
                  <IconButton label={hasFile ? "差し替え" : "添付"} onClick={() => fileInputRef.current?.click()}>
                    <Upload size={13} />
                    {hasFile ? "差し替え" : "添付"}
                  </IconButton>
                )}
                {canEdit && hasFile && (
                  <IconButton label="削除" tone="danger" onClick={removeFile}>
                    削除
                  </IconButton>
                )}
              </>
            )}
          </div>
        </div>
      </Card>

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
    </div>
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
