"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  Mail,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { listOnboardingDocs } from "@/lib/supabase/queries/onboarding";
import { getPrepChecklist, upsertPrepChecklist } from "@/lib/supabase/queries/application-prep";
import {
  clearOnboardingDocFile,
  getOnboardingDocDownloadUrl,
  getOnboardingDocPreviewUrl,
} from "@/app/(app)/onboarding/actions";
import { getWorkerPhotoUrl } from "@/app/(app)/workers/actions";
import { uploadOnboardingDoc } from "@/lib/onboarding-files";
import { uploadWorkerPhoto } from "@/lib/worker-photo";
import { gensenDocKey, reiwaYear } from "@/lib/onboarding";
import { todayStr } from "@/lib/ssw/calc";
import {
  EMPTY_PREP_META,
  evaluatePrepChecklist,
  PREP_APP_TYPES,
  prepDocLabel,
  type PrepChecklistMeta,
  type PrepDocDef,
  type PrepDocStatus,
} from "@/lib/application-prep";
import type { OnboardingDocumentRow } from "@/types/db";

// 申請準備の書類チェックリスト。申請種別（変更/更新）と国保・年金の加入で必要書類が
// 切り替わり、今どれが不足しているかを一覧で把握できる。各書類はこの画面から直接添付でき、
// 保存先は既存のセクションと共有する（在留カード=外国人書類、顔写真=写真 など）。
export function ApplicationPrepChecklist({
  workerId,
  canEdit = false,
  photoPath,
  healthCheckOn,
}: {
  workerId: string;
  canEdit?: boolean;
  photoPath: string | null;
  healthCheckOn: string | null;
}) {
  const [meta, setMeta] = useState<PrepChecklistMeta>(EMPTY_PREP_META);
  const [docs, setDocs] = useState<OnboardingDocumentRow[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 顔写真は workers.photo_path と連動（最新の1枚を共有）
  const [photoExists, setPhotoExists] = useState<boolean>(!!photoPath);
  const [photoUrl, setPhotoUrl] = useState<string>("");

  const uploadRef = useRef<{ docKey: string; label: string } | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = () =>
    listOnboardingDocs(createClient(), workerId).then(setDocs).catch(() => undefined);

  useEffect(() => {
    getPrepChecklist(createClient(), workerId).then(setMeta).catch(() => undefined);
    void loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  const today = todayStr();
  const filledDocKeys = new Set(docs.filter((d) => d.storage_path).map((d) => d.doc_key));
  const docByKey = new Map(docs.map((d) => [d.doc_key, d]));
  const { items, missing } = evaluatePrepChecklist(
    meta,
    { filledDocKeys, photoPath: photoExists ? "yes" : null, healthCheckOn },
    today,
  );

  // 書類の実際の保存キー（源泉徴収票は対象年度で変わる）。写真はキーなし。
  const resolveDocKey = (def: PrepDocDef): string | null => {
    switch (def.source.kind) {
      case "doc":
        return def.source.docKey;
      case "gensenYear":
        return meta.target_reiwa != null ? gensenDocKey(meta.target_reiwa) : null;
      case "health":
        return "kenshin";
      case "photo":
        return null;
    }
  };

  async function patchMeta(patch: Partial<PrepChecklistMeta>) {
    const next = { ...meta, ...patch };
    setMeta(next);
    setError(null);
    try {
      await upsertPrepChecklist(createClient(), workerId, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    }
  }

  function startAttach(def: PrepDocDef) {
    setError(null);
    if (def.source.kind === "photo") {
      photoInputRef.current?.click();
      return;
    }
    const key = resolveDocKey(def);
    if (!key) {
      setError("先に対象年度（令和）を入力してください。");
      return;
    }
    uploadRef.current = { docKey: key, label: prepDocLabel(def, meta.target_reiwa) };
    docInputRef.current?.click();
  }

  async function handleDocFile(file: File | undefined) {
    const target = uploadRef.current;
    if (!file || !target) return;
    setBusyKey(target.docKey);
    setError(null);
    try {
      await uploadOnboardingDoc(workerId, { key: target.docKey, label: target.label, num: 0 }, file);
      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusyKey(null);
    }
  }

  async function handlePhotoFile(file: File | undefined) {
    if (!file) return;
    setBusyKey("photo");
    setError(null);
    try {
      const url = await uploadWorkerPhoto(workerId, file);
      setPhotoExists(true);
      setPhotoUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "写真のアップロードに失敗しました");
    } finally {
      setBusyKey(null);
    }
  }

  async function removeDoc(key: string, label: string) {
    if (!window.confirm(`「${label}」の保存データを削除します。よろしいですか？`)) return;
    setBusyKey(key);
    setError(null);
    try {
      const res = await clearOnboardingDocFile(workerId, key);
      if (!res.ok) throw new Error(res.message);
      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusyKey(null);
    }
  }

  async function previewDoc(id: string) {
    const res = await getOnboardingDocPreviewUrl(id);
    if (!res.ok) return setError(res.message);
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function downloadDoc(id: string) {
    const res = await getOnboardingDocDownloadUrl(id);
    if (!res.ok) return setError(res.message);
    const a = document.createElement("a");
    a.href = res.url;
    a.download = res.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function previewPhoto() {
    let url = photoUrl;
    if (!url && photoPath) url = await getWorkerPhotoUrl(photoPath);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  const inputCls =
    "rounded-lg border border-border bg-surface px-2.5 py-2 text-sm focus:border-brand focus:outline-none disabled:opacity-60";

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted">
        <ClipboardList size={15} />
        申請準備 書類チェックリスト
      </h2>
      <p className="mb-3 text-[11px] text-muted">
        申請種別と加入状況を選ぶと、必要書類と不足がわかります。各書類はこの場で添付できます。
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* 条件の選択 */}
      <div className="mb-3 space-y-2.5 rounded-xl border border-border bg-background p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-bold text-muted">
            申請種別
            <select
              value={meta.app_type}
              disabled={!canEdit}
              onChange={(e) => patchMeta({ app_type: e.target.value as PrepChecklistMeta["app_type"] })}
              className={inputCls}
            >
              <option value="">選択してください</option>
              {PREP_APP_TYPES.map((t) => (
                <option key={t} value={t}>
                  在留資格{t}申請
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-bold text-muted">
            対象年度 令和
            <input
              type="number"
              min={1}
              max={99}
              value={meta.target_reiwa ?? ""}
              disabled={!canEdit}
              placeholder={`${reiwaYear(today)}`}
              onChange={(e) =>
                patchMeta({ target_reiwa: e.target.value ? Number(e.target.value) : null })
              }
              className={`${inputCls} w-20 tabular-nums`}
            />
            年
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs font-bold">
            <input
              type="checkbox"
              checked={meta.has_kokuho}
              disabled={!canEdit}
              onChange={(e) => patchMeta({ has_kokuho: e.target.checked })}
              className="h-4 w-4"
            />
            国民健康保険に加入
          </label>
          <label className="flex items-center gap-1.5 text-xs font-bold">
            <input
              type="checkbox"
              checked={meta.has_nenkin}
              disabled={!canEdit}
              onChange={(e) => patchMeta({ has_nenkin: e.target.checked })}
              className="h-4 w-4"
            />
            国民年金に加入
          </label>
        </div>
      </div>

      {!meta.app_type ? (
        <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
          申請種別を選ぶと、必要書類のチェックリストが表示されます。
        </p>
      ) : (
        <>
          {/* 不足サマリ */}
          {missing.length === 0 ? (
            <p className="mb-3 flex items-center gap-1.5 rounded-xl bg-status-approved-bg px-3 py-2.5 text-sm font-bold text-status-approved-fg">
              <CheckCircle2 size={15} />
              必要書類はすべて揃っています
            </p>
          ) : (
            <div className="mb-3 rounded-xl border border-seal/40 bg-seal/5 px-3 py-2.5">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-seal">
                <TriangleAlert size={15} />
                不足 {missing.length}件
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-seal">
                {missing.map((m) => (
                  <li key={m.def.id}>{prepDocLabel(m.def, meta.target_reiwa)}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 書類一覧 */}
          <div className="overflow-hidden rounded-xl border border-border">
            {items.map((item) => {
              const key = resolveDocKey(item.def);
              const row = key ? docByKey.get(key) ?? null : null;
              const isPhoto = item.def.source.kind === "photo";
              return (
                <DocRow
                  key={item.def.id}
                  item={item}
                  meta={meta}
                  row={row}
                  isPhoto={isPhoto}
                  canEdit={canEdit}
                  busy={busyKey === (isPhoto ? "photo" : key)}
                  onAttach={() => startAttach(item.def)}
                  onRemove={() => key && removeDoc(key, prepDocLabel(item.def, meta.target_reiwa))}
                  onPreview={() => (isPhoto ? previewPhoto() : row && previewDoc(row.id))}
                  onDownload={() => row && downloadDoc(row.id)}
                  onToggleKenshin={(v) => patchMeta({ kenshin_items_ok: v })}
                />
              );
            })}
          </div>
        </>
      )}

      {/* 書類（画像・PDF）用の隠しファイル入力 */}
      <input
        ref={docInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          void handleDocFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {/* 顔写真用の隠しファイル入力（画像のみ） */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handlePhotoFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </Card>
  );
}

function DocRow({
  item,
  meta,
  row,
  isPhoto,
  canEdit,
  busy,
  onAttach,
  onRemove,
  onPreview,
  onDownload,
  onToggleKenshin,
}: {
  item: PrepDocStatus;
  meta: PrepChecklistMeta;
  row: OnboardingDocumentRow | null;
  isPhoto: boolean;
  canEdit: boolean;
  busy: boolean;
  onAttach: () => void;
  onRemove: () => void;
  onPreview: () => void;
  onDownload: () => void;
  onToggleKenshin: (v: boolean) => void;
}) {
  const { def, satisfied } = item;
  const label = prepDocLabel(def, meta.target_reiwa);
  const hasFile = !!row?.storage_path;

  return (
    <div className="border-b border-border bg-background px-3 py-2.5 text-sm last:border-b-0">
      <div className="flex items-center gap-2.5">
        <span
          className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${satisfied ? "bg-status-approved-fg" : "bg-seal"}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold">{label}</span>
            {def.viaMail && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-status-applied-bg px-1.5 py-0.5 text-[10px] font-bold text-status-applied-fg">
                <Mail size={10} />
                郵送請求
              </span>
            )}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                satisfied
                  ? "bg-status-approved-bg text-status-approved-fg"
                  : "bg-seal/10 text-seal"
              }`}
            >
              {satisfied ? "登録済み" : "不足"}
            </span>
          </span>
          {hasFile && <span className="block truncate text-[11px] text-muted">{row!.file_name}</span>}
          {def.note && <span className="mt-0.5 block text-[11px] text-muted">※ {def.note}</span>}
          {def.managedIn && (
            <span className="mt-0.5 block text-[11px] text-muted">「{def.managedIn}」と共有</span>
          )}
        </span>

        {/* 添付・操作 */}
        <div className="flex shrink-0 items-center gap-1">
          {busy ? (
            <Loader2 size={15} className="animate-spin text-muted" />
          ) : (
            <>
              {(hasFile || (isPhoto && satisfied)) && (
                <IconButton label="表示" onClick={onPreview}>
                  <Eye size={13} />
                </IconButton>
              )}
              {hasFile && !isPhoto && (
                <IconButton label="ダウンロード" onClick={onDownload}>
                  <Download size={13} />
                </IconButton>
              )}
              {canEdit && (
                <IconButton label={satisfied ? "差し替え" : "添付"} onClick={onAttach}>
                  <Upload size={13} />
                  {satisfied ? "差し替え" : "添付"}
                </IconButton>
              )}
              {canEdit && hasFile && !isPhoto && (
                <IconButton label="削除" tone="danger" onClick={onRemove}>
                  <Trash2 size={13} />
                </IconButton>
              )}
            </>
          )}
        </div>
      </div>

      {/* 郵送請求への導線 */}
      {def.viaMail && (
        <Link
          href="/mailing"
          className="ml-[18px] mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
        >
          <ExternalLink size={11} />
          郵送請求ツールを開く
        </Link>
      )}

      {/* 健康診断書: 受診項目の確認（手動チェック） */}
      {def.source.kind === "health" && (
        <label className="ml-[18px] mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-muted">
          <input
            type="checkbox"
            checked={meta.kenshin_items_ok}
            disabled={!canEdit}
            onChange={(e) => onToggleKenshin(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          受診項目（1〜3号と同じ項目）が足りていることを確認した
        </label>
      )}
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
