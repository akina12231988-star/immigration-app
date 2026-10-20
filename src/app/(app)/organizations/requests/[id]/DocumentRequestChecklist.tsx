"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  MessageCircle,
  Paperclip,
  Pencil,
  RotateCcw,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { messengerWebUrl } from "@/lib/messenger-link";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import {
  createDocRequestFileTicket,
  deleteDocRequestFile,
  getDocRequestFilePreviewUrl,
  registerDocRequestFile,
} from "../actions";
import {
  deleteDocumentRequest,
  updateDocumentRequest,
  upsertDocumentRequestCheck,
  upsertDocumentRequestChecks,
} from "@/lib/supabase/queries/org-document-requests";
import { dbErrorMessage } from "@/lib/errors";
import {
  checkKey,
  checkState,
  DOCUMENT_REQUEST_STEPS,
  dueLabel,
  daysToDue,
  emptyCheck,
  groupFilesByCell,
  indexChecks,
  joinedYearExcludedReason,
  joinedYearOf,
  requestProgress,
  toggleStep,
  workerPending,
  type DocumentRequestCheck,
  type DocumentRequestCheckInput,
  type DocumentRequestFile,
  type DocumentRequestStepKey,
  type OrganizationDocumentRequest,
  type OrganizationDocumentRequestInput,
} from "@/lib/org-document-requests";
import { DocumentRequestForm } from "../DocumentRequestForm";

const MIGRATION = "0183_organization_document_requests.sql";

export interface ChecklistWorker {
  id: string;
  name: string;
  kana: string;
  nationality: string;
  startOn: string | null; // この機関での雇用開始日
  messengerLink: string; // 本人の Messenger（無ければ ""）
}

// 1件の依頼のチェック表。行＝在籍者、列＝書類。各マスで 案内 → 発行 → 会社へ を押していく
export function DocumentRequestChecklist({
  request: initialRequest,
  organizationName,
  workers,
  notYetCount,
  initialChecks,
  initialFiles = [],
  today,
  canEdit,
}: {
  request: OrganizationDocumentRequest;
  organizationName: string;
  workers: ChecklistWorker[];
  notYetCount: number; // この機関に紐づいているがまだ在籍中ではない人（表には出さない）
  initialChecks: DocumentRequestCheck[];
  initialFiles?: DocumentRequestFile[]; // マスに添付したファイル（0185）
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [request, setRequest] = useState(initialRequest);
  const [checks, setChecks] = useState<DocumentRequestCheck[]>(initialChecks);
  const [onlyPending, setOnlyPending] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idx = useMemo(() => indexChecks(checks), [checks]);
  // マスに添付したファイル
  const [files, setFiles] = useState<DocumentRequestFile[]>(initialFiles);
  const filesByCell = useMemo(() => groupFilesByCell(files), [files]);
  const [uploadingCell, setUploadingCell] = useState<string | null>(null);
  // 「添付」ボタン用の hidden な input（どのマスに入れるかを覚えておく）
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickTarget = useRef<{ workerId: string; itemId: string } | null>(null);
  const progress = requestProgress(request.items, workers, checks);
  const days = daysToDue(request.due_on, today);
  const dueTone = request.closed_on || days === null ? "text-muted" : days < 0 ? "text-seal" : days <= 7 ? "text-amber-700" : "text-foreground";
  // 入社年で対象が限られる書類（源泉徴収票は今年入社の人だけ など）
  const yearItems = request.items.filter((i) => i.joined_year);

  const rows = onlyPending ? workers.filter((w) => workerPending(request.items, w, idx).length > 0) : workers;

  // 1マスの保存（押した段階まで日付を入れる／外す）
  const saveCheck = async (input: DocumentRequestCheckInput) => {
    setError(null);
    try {
      const row = await upsertDocumentRequestCheck(createClient(), input);
      setChecks((prev) => [...prev.filter((c) => checkKey(c.worker_id, c.item_id) !== checkKey(row.worker_id, row.item_id)), row]);
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, "チェックを保存できませんでした"));
    }
  };
  const current = (workerId: string, itemId: string): DocumentRequestCheckInput =>
    idx.get(checkKey(workerId, itemId)) ?? emptyCheck(request.id, workerId, itemId);
  const press = (workerId: string, itemId: string, step: DocumentRequestStepKey) =>
    void saveCheck(toggleStep(current(workerId, itemId), step, today));
  const toggleNotNeeded = (workerId: string, itemId: string) => {
    const c = current(workerId, itemId);
    void saveCheck({ ...c, not_needed: !c.not_needed });
  };

  // マスにファイルを添付する（画像は縮小してから、署名付きURLでアップロード）。
  // 書類を受け取って添付したということなので、まだなら「発行」まで自動で付ける
  const attach = async (workerId: string, itemId: string, list: FileList | null) => {
    if (!list || list.length === 0 || !canEdit) return;
    const key = checkKey(workerId, itemId);
    setUploadingCell(key);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        const { blob, mimeType, fileName } = await compressImage(file);
        const ticket = await createDocRequestFileTicket(request.id, workerId, fileName, mimeType);
        if (!ticket.ok) throw new Error(ticket.message);
        const { error: upErr } = await createClient()
          .storage.from("app-files")
          .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
        if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
        const res = await registerDocRequestFile(request.id, workerId, itemId, ticket.path, fileName, mimeType);
        if (!res.ok) throw new Error(res.message);
        setFiles((prev) => [
          ...prev,
          {
            id: res.id,
            request_id: request.id,
            worker_id: workerId,
            item_id: itemId,
            storage_path: ticket.path,
            file_name: fileName,
            mime_type: mimeType,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      const c = current(workerId, itemId);
      if (!c.issued_on && !c.not_needed) await saveCheck(toggleStep(c, "issued_on", today));
    } catch (err) {
      setError(err instanceof Error ? err.message : "添付に失敗しました");
    } finally {
      setUploadingCell(null);
    }
  };
  const openFile = async (f: DocumentRequestFile) => {
    const res = await getDocRequestFilePreviewUrl(f.id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  };
  const removeFile = async (f: DocumentRequestFile) => {
    if (!window.confirm(`「${f.file_name}」を削除しますか？`)) return;
    const res = await deleteDocRequestFile(f.id);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setFiles((prev) => prev.filter((x) => x.id !== f.id));
  };
  const pickFile = (workerId: string, itemId: string) => {
    pickTarget.current = { workerId, itemId };
    fileInputRef.current?.click();
  };

  // 列（書類）ごとに、まだの人全員に「案内済」を付ける（本人たちにまとめて伝えたとき）
  const informAll = async (itemId: string) => {
    const inputs = workers
      .map((w) => current(w.id, itemId))
      .filter((c) => !c.not_needed && !c.informed_on)
      .map((c) => toggleStep(c, "informed_on", today));
    if (inputs.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const rows = await upsertDocumentRequestChecks(createClient(), inputs);
      const keys = new Set(rows.map((r) => checkKey(r.worker_id, r.item_id)));
      setChecks((prev) => [...prev.filter((c) => !keys.has(checkKey(c.worker_id, c.item_id))), ...rows]);
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, "まとめて保存できませんでした"));
    } finally {
      setBusy(false);
    }
  };

  const saveRequest = async (patch: Partial<OrganizationDocumentRequestInput>) => {
    setBusy(true);
    setError(null);
    try {
      const row = await updateDocumentRequest(createClient(), request.id, patch);
      setRequest(row);
      setEditOpen(false);
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, "依頼を保存できませんでした"));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await deleteDocumentRequest(createClient(), request.id);
      router.push("/organizations/requests");
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, "依頼を削除できませんでした"));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 px-4 py-4 lg:px-8">
      {/* 依頼の内容 */}
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted">{organizationName}</p>
            <h2 className="text-lg font-bold">{request.title}</h2>
            <p className="mt-1 text-xs text-muted">
              依頼日 {request.requested_on}
              {request.source && `（${request.source}）`}
              {request.closed_on && ` ・ ${request.closed_on} に完了`}
            </p>
            <p className={`mt-0.5 text-sm font-bold ${dueTone}`}>
              {request.due_on ? `提出期限 ${request.due_on}まで（${dueLabel(request.due_on, today)}）` : "提出期限なし"}
            </p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-bold"
              >
                <Pencil size={13} />
                編集
              </button>
              {request.closed_on ? (
                <button
                  type="button"
                  onClick={() => void saveRequest({ closed_on: null })}
                  disabled={busy}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-bold text-muted"
                >
                  <RotateCcw size={13} />
                  対応中に戻す
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void saveRequest({ closed_on: today })}
                  disabled={busy}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-brand px-2.5 text-xs font-bold text-brand"
                >
                  <CheckCircle2 size={13} />
                  対応完了にする
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-bold text-seal"
              >
                <Trash2 size={13} />
                削除
              </button>
            </div>
          )}
        </div>

        {/* 書類ごとの進み具合 */}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {progress.items.map((p) => (
            <div key={p.item.id} className="rounded-xl bg-background px-3 py-2 text-xs">
              <p className="font-bold">
                {p.item.name}
                {p.item.note && <span className="ml-1 font-normal text-muted">（{p.item.note}）</span>}
                {p.item.joined_year && (
                  <span className="ml-1 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                    {p.item.joined_year}年入社の人だけ
                  </span>
                )}
              </p>
              <p className="mt-0.5 flex flex-wrap gap-x-3 tabular-nums text-muted">
                <span>案内 {p.informed}/{p.total}</span>
                <span>発行 {p.issued}/{p.total}</span>
                <span className={p.total > 0 && p.sent === p.total ? "font-bold text-status-approved-fg" : ""}>
                  会社へ {p.sent}/{p.total}
                </span>
                {p.notNeeded > 0 && <span>対象外 {p.notNeeded}名</span>}
              </p>
            </div>
          ))}
        </div>
        {progress.done && !request.closed_on && (
          <p className="mt-2 rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-bold text-brand">
            全員ぶん会社に送りました。「対応完了にする」で一覧から外せます。
          </p>
        )}

        {request.memo && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setMemoOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-bold text-brand"
            >
              {memoOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              メモ（メールの本文など）
            </button>
            {memoOpen && <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-background p-3 text-xs leading-relaxed">{request.memo}</pre>}
          </div>
        )}
      </Card>

      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* チェック表 */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold text-muted">在籍者 {workers.length}名</span>
        {notYetCount > 0 && <span className="text-muted">（在籍中ではない{notYetCount}名は表に出していません）</span>}
        <label className="ml-auto flex min-h-[32px] items-center gap-1.5">
          <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} className="h-4 w-4" />
          まだの人だけ
        </label>
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        マスのボタンを押すと今日の日付で記録します（案内 → 発行 → 会社へ の順。先の段階を押すと前の段階も同じ日で入ります）。
        もう一度押すと取り消せます。その人には要らない書類は「対象外」にすると数に入りません。
        受け取った書類の写真・PDF はマスにドラッグ＆ドロップ（または「添付」）で保管でき、添付すると「発行」まで自動で付きます。
        {yearItems.length > 0 && (
          <>
            {" "}
            {yearItems.map((i) => `「${i.name}」は${i.joined_year}年入社の人だけ`).join("、")}
            が対象で、入社日（この機関での雇用開始日）がその年でない人は自動で対象外になります。入社日が未登録の人は対象のままなので、外国人詳細で雇用開始日を登録してください。
          </>
        )}
      </p>

      {workers.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">この機関に在籍中の人がいません</p>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">全員ぶん会社に送りました</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-background text-left">
                <th className="sticky left-0 z-10 bg-background px-3 py-2 font-bold">氏名</th>
                <th className="px-2 py-2 font-bold">入社日</th>
                {request.items.map((item) => (
                  <th key={item.id} className="min-w-[11rem] px-2 py-2 font-bold">
                    <span className="block">{item.name}</span>
                    {item.note && <span className="block font-normal text-muted">{item.note}</span>}
                    {canEdit && !request.closed_on && (
                      <button
                        type="button"
                        onClick={() => void informAll(item.id)}
                        disabled={busy}
                        className="mt-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-brand disabled:opacity-50"
                        title="まだ案内していない人全員に、今日の日付で「案内」を付けます"
                      >
                        全員に案内済を付ける
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const pending = workerPending(request.items, w, idx).length;
                const joinedYear = joinedYearOf(w.startOn);
                return (
                  <tr key={w.id} className={`border-b border-border/60 ${pending === 0 ? "bg-status-approved-bg/40" : ""}`}>
                    <td className="sticky left-0 z-10 bg-surface px-3 py-2 align-top">
                      <Link href={`/workers/${w.id}`} className="inline-flex items-center gap-1 font-bold text-brand">
                        <UserRound size={12} />
                        {w.name}
                      </Link>
                      <span className="block text-[10px] text-muted">
                        {w.kana}
                        {w.nationality && ` ・ ${w.nationality}`}
                      </span>
                      {/* 本人に案内するときにその場で Messenger を開ける */}
                      {w.messengerLink ? (
                        <a
                          href={messengerWebUrl(w.messengerLink)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-border px-2 text-[11px] font-bold text-brand"
                        >
                          <MessageCircle size={12} />
                          Messenger
                        </a>
                      ) : (
                        <span className="mt-1 block text-[10px] text-muted">Messenger未登録</span>
                      )}
                      {pending === 0 && <span className="mt-0.5 block text-[10px] font-bold text-status-approved-fg">全部送付済</span>}
                    </td>
                    {/* この機関での入社日。入社年で対象が決まる書類があるとき、その年の人は目立たせる */}
                    <td className="whitespace-nowrap px-2 py-2 align-top tabular-nums">
                      {w.startOn ? (
                        <>
                          <span className="block">{w.startOn}</span>
                          {yearItems.some((i) => i.joined_year === joinedYear) && (
                            <span className="mt-0.5 inline-block rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                              {joinedYear}年入社
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-seal">未登録</span>
                      )}
                    </td>
                    {request.items.map((item) => {
                      const c = idx.get(checkKey(w.id, item.id));
                      const state = checkState(c);
                      const yearReason = joinedYearExcludedReason(item, w.startOn);
                      const cellKey = checkKey(w.id, item.id);
                      const cellFiles = filesByCell.get(cellKey) ?? [];
                      const uploading = uploadingCell === cellKey;
                      return (
                        <td key={item.id} className="px-1 py-1 align-top">
                          <FileDropArea
                            onFiles={(list) => void attach(w.id, item.id, list)}
                            disabled={!canEdit || !!yearReason}
                            className="rounded-xl border border-transparent px-1 py-1"
                            title="受け取った書類の写真・PDF をここに落とすと添付できます"
                          >
                          {yearReason ? (
                            <span className="inline-block rounded-lg bg-background px-2 py-1 text-[11px] text-muted">{yearReason}</span>
                          ) : state === "対象外" ? (
                            <button
                              type="button"
                              onClick={() => canEdit && toggleNotNeeded(w.id, item.id)}
                              disabled={!canEdit}
                              className="rounded-lg bg-background px-2 py-1 text-[11px] text-muted"
                              title="押すと対象に戻します"
                            >
                              対象外
                            </button>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1">
                              {DOCUMENT_REQUEST_STEPS.map((s) => {
                                const on = !!c?.[s.key];
                                return (
                                  <button
                                    key={s.key}
                                    type="button"
                                    onClick={() => canEdit && press(w.id, item.id, s.key)}
                                    disabled={!canEdit}
                                    aria-pressed={on}
                                    title={on ? `${s.long}（${c?.[s.key]}）。押すと取り消し` : s.long}
                                    className={`inline-flex min-h-[30px] items-center gap-0.5 rounded-lg border px-2 text-[11px] font-bold ${
                                      on
                                        ? s.key === "sent_on"
                                          ? "border-status-approved-fg bg-status-approved-bg text-status-approved-fg"
                                          : "border-brand bg-brand/10 text-brand"
                                        : "border-border bg-background text-muted"
                                    } disabled:opacity-70`}
                                  >
                                    {on && <Check size={11} />}
                                    {s.label}
                                  </button>
                                );
                              })}
                              {canEdit && state === "未着手" && (
                                <button
                                  type="button"
                                  onClick={() => toggleNotNeeded(w.id, item.id)}
                                  className="text-[10px] text-muted underline"
                                >
                                  対象外
                                </button>
                              )}
                              {c?.sent_on ? (
                                <span className="w-full text-[10px] tabular-nums text-muted">送付 {c.sent_on}</span>
                              ) : c?.issued_on ? (
                                <span className="w-full text-[10px] tabular-nums text-muted">発行 {c.issued_on}</span>
                              ) : c?.informed_on ? (
                                <span className="w-full text-[10px] tabular-nums text-muted">案内 {c.informed_on}</span>
                              ) : null}
                            </div>
                          )}
                          {/* 添付した書類（押すと別タブで開く）と「添付」ボタン */}
                          {!yearReason && (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {cellFiles.map((f) => (
                                <span
                                  key={f.id}
                                  className="inline-flex max-w-[11rem] items-center gap-0.5 rounded-lg border border-brand/40 bg-brand/5 px-1.5 py-0.5 text-[10px] text-brand"
                                >
                                  <button type="button" onClick={() => void openFile(f)} className="inline-flex min-w-0 items-center gap-0.5 font-bold" title={f.file_name}>
                                    <FileText size={11} className="shrink-0" />
                                    <span className="truncate">{f.file_name}</span>
                                  </button>
                                  {canEdit && (
                                    <button type="button" onClick={() => void removeFile(f)} aria-label={`${f.file_name}を削除`} className="shrink-0 text-muted">
                                      <X size={11} />
                                    </button>
                                  )}
                                </span>
                              ))}
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => pickFile(w.id, item.id)}
                                  disabled={uploading}
                                  className="inline-flex min-h-[24px] items-center gap-0.5 rounded-lg border border-dashed border-border px-1.5 text-[10px] text-muted disabled:opacity-50"
                                  title="写真・PDF を添付（ここにドロップしても添付できます）"
                                >
                                  {uploading ? <Loader2 size={11} className="animate-spin" /> : <Paperclip size={11} />}
                                  {uploading ? "添付中…" : "添付"}
                                </button>
                              )}
                            </div>
                          )}
                          </FileDropArea>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 「添付」ボタン用のファイル選択（どのマスかは pickTarget で覚えている） */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const t = pickTarget.current;
          if (t) void attach(t.workerId, t.itemId, e.target.files);
          e.target.value = "";
        }}
      />

      {editOpen && (
        <DocumentRequestForm
          organizations={[{ id: request.organization_id, name: organizationName }]}
          initial={request}
          today={today}
          busy={busy}
          error={error}
          onSubmit={(input) => void saveRequest(input)}
          onClose={() => setEditOpen(false)}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="この依頼を削除しますか？"
        message="チェックの記録もすべて消えます。元に戻せません。"
        confirmLabel="削除する"
        onConfirm={() => {
          setConfirmDelete(false);
          void remove();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
