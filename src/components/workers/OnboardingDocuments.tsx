"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Download,
  ExternalLink,
  Eye,
  Link2,
  Loader2,
  MailPlus,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { getOnboardingRecord, listOnboardingDocs } from "@/lib/supabase/queries/onboarding";
import {
  clearOnboardingDocFile,
  getOnboardingDocDownloadUrl,
  getOnboardingDocPreviewUrl,
  linkWorkerDocToOnboarding,
} from "@/app/(app)/onboarding/actions";
import { uploadOnboardingDoc } from "@/lib/onboarding-files";
import {
  DOC_REFERENCE_LINKS,
  isGensenYearKey,
  isPendingDocAlert,
  isPendingDocOverdue,
  isWorkerCertKey,
  HEALTH_CHECK_DOC_KEY,
  LINKABLE_DOC_KINDS,
  onboardingDocDefs,
  WORKER_DETAIL_DOC_KEYS,
  type OnboardingDocDef,
} from "@/lib/onboarding";
import { todayStr } from "@/lib/ssw/calc";
import type { OnboardingDocumentRow, OnboardingRecordRow } from "@/types/db";

// 入社書類メールで使うデータの管理。書類ごとに保存・差し替え・削除ができ、
// 在留カード・指定書は登録済みのものから紐付け（複製）できる。
// チェックで選んだファイルは「外国人の氏名＋添付データ名」の名前でダウンロードできる。
export function OnboardingDocuments({
  workerId,
  canEdit = false,
}: {
  workerId: string;
  canEdit?: boolean;
}) {
  const [record, setRecord] = useState<OnboardingRecordRow | null>(null);
  const [docs, setDocs] = useState<OnboardingDocumentRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadDefRef = useRef<OnboardingDocDef | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    const supabase = createClient();
    return Promise.all([
      getOnboardingRecord(supabase, workerId),
      listOnboardingDocs(supabase, workerId),
    ])
      .then(([r, d]) => {
        setRecord(r);
        setDocs(d);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  const today = todayStr();
  const managedDefs = onboardingDocDefs(today).filter((d) =>
    (WORKER_DETAIL_DOC_KEYS as readonly string[]).includes(d.key),
  );
  // 健康診断・源泉徴収票（令和年別）・外国人書類（cert_*）は専用セクションで扱うため除く
  const isDedicated = (key: string) =>
    key === HEALTH_CHECK_DOC_KEY || isGensenYearKey(key) || isWorkerCertKey(key);
  const emailDocs = docs.filter((d) => !isDedicated(d.doc_key));
  const docByKey = new Map(emailDocs.map((d) => [d.doc_key, d]));
  const files = emailDocs.filter((d) => d.storage_path);
  const pending = emailDocs.filter((d) => isPendingDocAlert(d));

  // 職員は常に管理行を表示。閲覧者はファイルがあるときだけ表示する。
  const hasAny = record !== null || files.length > 0;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const downloadSelected = async () => {
    if (selected.size === 0) return;
    setDownloading(true);
    setError(null);
    try {
      for (const doc of files.filter((f) => selected.has(f.id))) {
        const res = await getOnboardingDocDownloadUrl(doc.id);
        if (!res.ok) throw new Error(`${doc.label}: ${res.message}`);
        const a = document.createElement("a");
        a.href = res.url;
        a.download = res.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // 連続ダウンロードがブラウザにブロックされないよう少し間隔をあける
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ダウンロードに失敗しました");
    } finally {
      setDownloading(false);
    }
  };

  const openPreview = async (docId: string) => {
    const res = await getOnboardingDocPreviewUrl(docId);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  };

  const startUpload = (def: OnboardingDocDef) => {
    uploadDefRef.current = def;
    fileInputRef.current?.click();
  };

  const handleFile = async (file: File | undefined) => {
    const def = uploadDefRef.current;
    if (!file || !def) return;
    setBusyKey(def.key);
    setError(null);
    try {
      await uploadOnboardingDoc(workerId, def, file);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusyKey(null);
    }
  };

  const linkDoc = async (def: OnboardingDocDef) => {
    setBusyKey(def.key);
    setError(null);
    try {
      const res = await linkWorkerDocToOnboarding(workerId, def.key, def.label, def.num);
      if (!res.ok) throw new Error(res.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "紐付けに失敗しました");
    } finally {
      setBusyKey(null);
    }
  };

  const deleteDoc = async (def: OnboardingDocDef, fileName: string) => {
    if (!window.confirm(`「${def.label}」の添付データ（${fileName}）を削除します。よろしいですか？`)) {
      return;
    }
    setBusyKey(def.key);
    setError(null);
    try {
      const res = await clearOnboardingDocFile(workerId, def.key);
      if (!res.ok) throw new Error(res.message);
      setSelected((prev) => {
        const row = docByKey.get(def.key);
        if (!row) return prev;
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-muted">入社書類（メール添付データ）</h2>
        <Link
          href={`/onboarding?worker=${workerId}`}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-brand"
        >
          <MailPlus size={13} />
          入社書類メール
        </Link>
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {!canEdit && !hasAny ? (
        <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
          まだ登録がありません。「入社書類メール」から書類のアップロードとメール作成ができます。
        </p>
      ) : (
        <div className="space-y-3">
          {/* 後送のまま未受領の書類 */}
          {pending.length > 0 && (
            <div className="rounded-xl border border-status-notice-fg/40 bg-status-notice-bg/40 px-3 py-2.5">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-status-notice-fg">
                <TriangleAlert size={13} />
                後送待ち {pending.length}件
              </p>
              <ul className="space-y-0.5 text-xs">
                {pending.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{d.label}</span>
                    <span
                      className={`shrink-0 tabular-nums ${
                        isPendingDocOverdue(d.due_on, today) ? "font-bold text-seal" : "text-muted"
                      }`}
                    >
                      {d.due_on ? `期日 ${d.due_on}` : "期日未設定"}
                      {isPendingDocOverdue(d.due_on, today) && "（超過）"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 書類ごとの管理（保存・差し替え・削除・紐付け） */}
          {canEdit ? (
            <div className="overflow-hidden rounded-xl border border-border">
              {managedDefs.map((def) => {
                const row = docByKey.get(def.key);
                const hasFile = !!row?.storage_path;
                const isLinkable = def.key in LINKABLE_DOC_KINDS;
                const busy = busyKey === def.key;
                return (
                  <div
                    key={def.key}
                    className="flex items-center gap-2.5 border-b border-border bg-background px-3 py-2.5 text-sm last:border-b-0"
                  >
                    {hasFile && row ? (
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                        aria-label={`${def.label}を選択`}
                        className="h-4 w-4 shrink-0"
                      />
                    ) : (
                      <span className="h-4 w-4 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{def.label}</span>
                      {DOC_REFERENCE_LINKS[def.key] && (
                        <a
                          href={DOC_REFERENCE_LINKS[def.key]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
                        >
                          <ExternalLink size={11} />
                          国税庁の様式ページ
                        </a>
                      )}
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
                            <IconButton label="表示" onClick={() => openPreview(row!.id)}>
                              <Eye size={13} />
                            </IconButton>
                          )}
                          {isLinkable ? (
                            <IconButton label={hasFile ? "紐付け直す" : "登録済みから紐付け"} onClick={() => linkDoc(def)}>
                              <Link2 size={13} />
                              {hasFile ? "紐付け直す" : "紐付け"}
                            </IconButton>
                          ) : (
                            <IconButton label={hasFile ? "差し替え" : "アップロード"} onClick={() => startUpload(def)}>
                              <Upload size={13} />
                              {hasFile ? "差し替え" : "追加"}
                            </IconButton>
                          )}
                          {hasFile && (
                            <IconButton label="削除" tone="danger" onClick={() => deleteDoc(def, row!.file_name)}>
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
          ) : files.length === 0 ? (
            <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
              アップロード済みのファイルはまだありません。
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              {files.map((d) => (
                <label
                  key={d.id}
                  className="flex items-center gap-2.5 border-b border-border bg-background px-3 py-2.5 text-sm last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{d.label}</span>
                    <span className="block truncate text-[11px] text-muted">{d.file_name}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* 選択ダウンロード */}
          {files.length > 0 && (
            <>
              <button
                type="button"
                onClick={downloadSelected}
                disabled={selected.size === 0 || downloading}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-foreground disabled:opacity-40"
              >
                {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                選択したデータをダウンロード（{selected.size}件）
              </button>
              <p className="text-[11px] text-muted">
                ファイル名は「外国人の氏名＋添付データ名」で保存されます。
              </p>
            </>
          )}

          {/* Gmailリンク */}
          {record?.gmail_link && (
            <a
              href={record.gmail_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold text-brand"
            >
              <ExternalLink size={13} />
              最初に送ったメールをGmailで開く
              {record.mail_sent_on && (
                <span className="font-medium text-muted">（送信日 {record.mail_sent_on}）</span>
              )}
            </a>
          )}
        </div>
      )}

      {/* 差し替え・アップロード用の隠しファイル入力（画像・PDF） */}
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
