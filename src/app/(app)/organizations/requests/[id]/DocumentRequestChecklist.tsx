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
  Link2,
  Loader2,
  MessageCircle,
  MessageSquareText,
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
  filterRequestWorkers,
  findOnboardingDocFor,
  groupFilesByCell,
  indexChecks,
  joinedYearOptions,
  nationalityOptions,
  joinedYearExcludedReason,
  joinedYearOf,
  requestProgress,
  setNoneReplied,
  toggleStep,
  unsetNoneReplied,
  workerPending,
  type DocumentRequestCheck,
  type DocumentRequestCheckInput,
  type DocumentRequestFile,
  type DocumentRequestStepKey,
  type OrganizationDocumentRequest,
  type OrganizationDocumentRequestInput,
} from "@/lib/org-document-requests";
import { DocumentRequestForm } from "../DocumentRequestForm";
import { DocRequestTextDialog } from "./DocRequestTextDialog";
import { getOnboardingDocPreviewUrl } from "@/app/(app)/onboarding/actions";
import type { OnboardingDocumentRow } from "@/types/db";

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
  onboardingDocs = [],
  today,
  canEdit,
}: {
  request: OrganizationDocumentRequest;
  organizationName: string;
  workers: ChecklistWorker[];
  notYetCount: number; // この機関に紐づいているがまだ在籍中ではない人（表には出さない）
  initialChecks: DocumentRequestCheck[];
  initialFiles?: DocumentRequestFile[]; // マスに添付したファイル（0185）
  // 外国人詳細の「入社時に送る資料」に添付済みの書類（同じ書類ならマスから開けるようにする）
  onboardingDocs?: OnboardingDocumentRow[];
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [request, setRequest] = useState(initialRequest);
  const [checks, setChecks] = useState<DocumentRequestCheck[]>(initialChecks);
  const [onlyPending, setOnlyPending] = useState(false);
  // 国籍・入社年の絞り込み（"" = すべて）
  const [nationalityFilter, setNationalityFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const nationalities = useMemo(() => nationalityOptions(workers), [workers]);
  const joinedYears = useMemo(() => joinedYearOptions(workers), [workers]);
  // 外国人ごとの入社書類（添付済み）
  const onboardingByWorker = useMemo(() => {
    const m = new Map<string, OnboardingDocumentRow[]>();
    for (const d of onboardingDocs) m.set(d.worker_id, [...(m.get(d.worker_id) ?? []), d]);
    return m;
  }, [onboardingDocs]);
  const openOnboardingDoc = async (d: OnboardingDocumentRow) => {
    if (d.external_url) {
      window.open(d.external_url, "_blank", "noopener");
      return;
    }
    const res = await getOnboardingDocPreviewUrl(d.id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  };
  const [memoOpen, setMemoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 行の右端の「案内文を表示」で開く、本人への案内文（日本語＋母国語）のダイアログ（どの人か）
  const [textDialog, setTextDialog] = useState<{ workerId: string } | null>(null);

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

  const filtered = filterRequestWorkers(workers, { nationality: nationalityFilter, joinedYear: yearFilter });
  const rows = onlyPending ? filtered.filter((w) => workerPending(request.items, w, idx).length > 0) : filtered;
  const filtering = !!nationalityFilter || !!yearFilter || onlyPending;

  // 1マスの保存（押した段階まで日付を入れる／外す）
  const saveCheck = async (input: DocumentRequestCheckInput) => {
    setError(null);
    try {
      const row = await upsertDocumentRequestCheck(createClient(), input);
      setChecks((prev) => [...prev.filter((c) => checkKey(c.worker_id, c.item_id) !== checkKey(row.worker_id, row.item_id)), row]);
    } catch (err) {
      // 「本人から無いと回答あり」の列だけが無いときは 0198 の未適用
      const migration =
        err instanceof Error && err.message.includes("none_replied_on")
          ? "0198_document_request_none_replied.sql"
          : MIGRATION;
      setError(dbErrorMessage(err, migration, "チェックを保存できませんでした"));
    }
  };
  const current = (workerId: string, itemId: string): DocumentRequestCheckInput =>
    idx.get(checkKey(workerId, itemId)) ?? emptyCheck(request.id, workerId, itemId);
  const press = (workerId: string, itemId: string, step: DocumentRequestStepKey) =>
    void saveCheck(toggleStep(current(workerId, itemId), step, today));
  // その人の「案内」を押した書類（対象外・入社年で対象外の書類を除く）。案内文にまとめて入れる
  const informedItemsOf = (w: ChecklistWorker) =>
    request.items.filter((i) => {
      if (joinedYearExcludedReason(i, w.startOn)) return false;
      const c = idx.get(checkKey(w.id, i.id));
      // 本人から「無い」と回答があった書類は、もう案内しないので文面に入れない
      return !c?.not_needed && !!c?.informed_on && checkState(c) !== "無し回答";
    });
  const dialogWorker = textDialog ? workers.find((w) => w.id === textDialog.workerId) : undefined;
  const toggleNotNeeded = (workerId: string, itemId: string) => {
    const c = unsetNoneReplied(current(workerId, itemId));
    void saveCheck({ ...c, not_needed: !c.not_needed });
  };
  // 対象外にした理由（チェックのメモ欄に保存。変わったときだけ保存する）
  const saveNote = (workerId: string, itemId: string, note: string) => {
    const c = current(workerId, itemId);
    if (note.trim() === (c.note ?? "").trim()) return;
    void saveCheck({ ...c, note: note.trim() });
  };
  // 案内のあと、本人から「無い」と回答があった／その取り消し
  const markNoneReplied = (workerId: string, itemId: string) =>
    void saveCheck(setNoneReplied(current(workerId, itemId), today));
  const undoNoneReplied = (workerId: string, itemId: string) =>
    void saveCheck(unsetNoneReplied(current(workerId, itemId)));

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
                {p.noneReplied > 0 && <span className="text-amber-700">無し回答 {p.noneReplied}名</span>}
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
        <span className="font-bold text-muted">
          在籍者 {workers.length}名{filtering && `（表示 ${rows.length}名）`}
        </span>
        {notYetCount > 0 && <span className="text-muted">（在籍中ではない{notYetCount}名は表に出していません）</span>}
        {/* 国籍・入社年で絞り込む（表の行だけが絞られる。「全員に案内済を付ける」は表示に関係なく全員） */}
        <label className="ml-auto flex min-h-[32px] items-center gap-1.5">
          <span className="text-muted">国籍</span>
          <select
            value={nationalityFilter}
            onChange={(e) => setNationalityFilter(e.target.value)}
            className="min-h-[32px] rounded-lg border border-border bg-surface px-2 text-xs"
          >
            <option value="">すべて</option>
            {nationalities.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-[32px] items-center gap-1.5">
          <span className="text-muted">入社年</span>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="min-h-[32px] rounded-lg border border-border bg-surface px-2 text-xs"
          >
            <option value="">すべて</option>
            {joinedYears.map((y) => (
              <option key={y} value={y}>
                {y === "未登録" ? "未登録" : `${y}年入社`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-[32px] items-center gap-1.5">
          <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} className="h-4 w-4" />
          まだの人だけ
        </label>
        {filtering && (
          <button
            type="button"
            onClick={() => {
              setNationalityFilter("");
              setYearFilter("");
              setOnlyPending(false);
            }}
            className="text-[11px] font-bold text-brand underline"
          >
            絞り込みを解除
          </button>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        マスのボタンを押すと今日の日付で記録します（案内 → 発行 → 会社へ の順。先の段階を押すと前の段階も同じ日で入ります）。
        もう一度押すと取り消せます。その人には要らない書類は「対象外」にすると数に入りません。
        「対象外」にしたマスには理由を入れておけます（入力して別の場所をタップすると保存されます）。
        案内したあと本人から「持っていない」と返事があったら「本人から無いと回答」を押すと、その日付で記録され、会社に送る数からは外れます（あとで手に入って「発行」を押すと自動で外れます）。
        案内する書類の「案内」を押してから、行の右端の「案内文を表示」を押すと、押した書類をまとめた本人への案内文（日本語＋母国語）が出てコピーできます。
        受け取った書類の写真・PDF はマスにドラッグ＆ドロップ（または「添付」）で保管でき、添付すると「発行」まで自動で付きます。
        外国人詳細の「入社時に送る資料」に同じ書類が添付済みなら、マスに「外国人詳細に添付済み」と出て、押すとそのデータを開けます。
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
        <p className="py-12 text-center text-sm text-muted">
          {nationalityFilter || yearFilter ? "絞り込みに当てはまる人がいません" : "全員ぶん会社に送りました"}
        </p>
      ) : (
        <div className="max-h-[calc(100vh-9rem)] overflow-auto rounded-2xl border border-border bg-surface">
          {/* 表の中だけを縦横にスクロールさせ、見出し（書類名・全員に案内済を付ける）は上に、氏名は左に固定して
              下にスクロールしても見えるようにする */}
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="text-left">
                <th className="sticky left-0 top-0 z-30 bg-background px-3 py-2 font-bold shadow-[inset_0_-1px_0_0_var(--color-border)]">
                  氏名
                </th>
                <th className="sticky top-0 z-20 bg-background px-2 py-2 font-bold shadow-[inset_0_-1px_0_0_var(--color-border)]">
                  入社日
                </th>
                {request.items.map((item) => (
                  <th
                    key={item.id}
                    className="sticky top-0 z-20 min-w-[11rem] bg-background px-2 py-2 font-bold shadow-[inset_0_-1px_0_0_var(--color-border)]"
                  >
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
                {/* 行の右端: その人の「案内」を押した書類をまとめた案内文（日本語＋母国語） */}
                <th className="sticky right-0 top-0 z-30 bg-background px-2 py-2 font-bold shadow-[inset_0_-1px_0_0_var(--color-border),inset_1px_0_0_0_var(--color-border)]">
                  案内文
                </th>
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
                      // 外国人詳細の入社書類に同じ書類が添付済みなら、そのデータをここから開ける
                      const linkedDoc = findOnboardingDocFor(item, onboardingByWorker.get(w.id) ?? []);
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
                            <div className="flex flex-col items-start gap-1">
                              <button
                                type="button"
                                onClick={() => canEdit && toggleNotNeeded(w.id, item.id)}
                                disabled={!canEdit}
                                className="rounded-lg bg-background px-2 py-1 text-[11px] text-muted"
                                title="押すと対象に戻します"
                              >
                                対象外
                              </button>
                              {/* 対象外にした理由（別の場所をタップするか Enter で保存。メモ欄に残る） */}
                              {canEdit ? (
                                <input
                                  key={c?.note ?? ""}
                                  defaultValue={c?.note ?? ""}
                                  placeholder="理由（例: 扶養家族なし）"
                                  onBlur={(e) => saveNote(w.id, item.id, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                  }}
                                  className="min-h-[26px] w-full min-w-[9rem] rounded-lg border border-dashed border-border bg-surface px-1.5 text-[11px] focus:border-brand focus:outline-none"
                                  aria-label={`${w.name}さんの「${item.name}」を対象外にした理由`}
                                />
                              ) : (
                                c?.note && <span className="text-[10px] text-muted">理由: {c.note}</span>
                              )}
                            </div>
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
                              {/* 案内したあと、本人から「持っていない」と返事があったとき */}
                              {canEdit && state === "案内済" && (
                                <button
                                  type="button"
                                  onClick={() => markNoneReplied(w.id, item.id)}
                                  className="text-[10px] text-amber-700 underline"
                                  title="本人から「その書類は持っていない」と返事があった（今日の日付で記録。会社に送る数から外れます）"
                                >
                                  本人から無いと回答
                                </button>
                              )}
                              {state === "無し回答" && (
                                <span className="flex w-full flex-wrap items-center gap-1.5">
                                  <span className="rounded-lg border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                    本人から無いと回答あり（{c?.none_replied_on}）
                                  </span>
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => undoNoneReplied(w.id, item.id)}
                                      className="text-[10px] text-muted underline"
                                      title="取り消して案内済に戻す"
                                    >
                                      取り消す
                                    </button>
                                  )}
                                </span>
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
                              {linkedDoc && (
                                <button
                                  type="button"
                                  onClick={() => void openOnboardingDoc(linkedDoc)}
                                  className="inline-flex max-w-[12rem] items-center gap-0.5 rounded-lg border border-status-approved-fg/40 bg-status-approved-bg px-1.5 py-0.5 text-[10px] font-bold text-status-approved-fg"
                                  title={`外国人詳細の「入社時に送る資料」の「${linkedDoc.label}」に添付済み（${linkedDoc.file_name || "リンク"}）。押すと開きます`}
                                >
                                  <Link2 size={11} className="shrink-0" />
                                  <span className="truncate">外国人詳細に添付済み{linkedDoc.file_name ? `：${linkedDoc.file_name}` : ""}</span>
                                </button>
                              )}
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
                    {/* その人の「案内」を押した書類をまとめた案内文を出す（押した書類が無ければ押せない） */}
                    <td className="sticky right-0 z-10 bg-surface px-2 py-2 align-top shadow-[inset_1px_0_0_0_var(--color-border)]">
                      {(() => {
                        const n = informedItemsOf(w).length;
                        return (
                          <button
                            type="button"
                            onClick={() => setTextDialog({ workerId: w.id })}
                            disabled={n === 0}
                            title={
                              n === 0
                                ? "「案内」を押した書類がまだありません。先にマスの「案内」を押してください"
                                : `「案内」を押した${n}件をまとめた案内文（日本語＋母国語）を表示してコピー`
                            }
                            className="inline-flex min-h-[30px] items-center gap-1 whitespace-nowrap rounded-lg border border-brand bg-brand/5 px-2 text-[11px] font-bold text-brand disabled:border-border disabled:bg-background disabled:text-muted"
                          >
                            <MessageSquareText size={12} />
                            案内文を表示{n > 0 && `（${n}）`}
                          </button>
                        );
                      })()}
                    </td>
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
      {textDialog && dialogWorker && (
        <DocRequestTextDialog
          key={textDialog.workerId}
          open
          onClose={() => setTextDialog(null)}
          worker={dialogWorker}
          organizationName={organizationName}
          items={informedItemsOf(dialogWorker)}
          dueOn={request.due_on}
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
