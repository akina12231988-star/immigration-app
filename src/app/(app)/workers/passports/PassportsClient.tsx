"use client";

import { messengerWebUrl } from "@/lib/messenger-link";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BookMarked,
  CalendarCheck,
  Check,
  Copy,
  ExternalLink,
  ImagePlus,
  MessageCircle,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { createClient } from "@/lib/supabase/client";
import type { WorkerWithOrg } from "@/lib/supabase/queries/workers";
import { updateWorker } from "@/lib/supabase/queries/workers";
import {
  listWorkerPassportFiles,
  type WorkerPassportFileRow,
} from "@/lib/supabase/queries/worker-travels";
import { upsertPassportRenewalGuide } from "@/lib/supabase/queries/passport-renewals";
import {
  activeGuidedOn,
  PASSPORT_FILE_KIND_GUIDE,
  PASSPORT_FILE_KIND_RENEWED,
  type PassportRenewalGuide,
} from "@/lib/passport-renewal";
import {
  createPassportFileTicket,
  deletePassportFile,
  getPassportFilePreviewUrl,
  registerPassportFile,
} from "@/app/(app)/workers/passport-file-actions";
import { compressImage } from "@/lib/image-compress";
import { dbErrorMessage } from "@/lib/errors";
import { isPassportRenewalListTarget, remainingLabel, daysUntil } from "@/lib/worker-alerts";
import { todayStr } from "@/lib/application-alerts";
import { passportGuide } from "@/lib/passport-guides";
import { notionAppUrl } from "@/lib/notion-link";

export function PassportsClient({
  workers,
  guides,
}: {
  workers: WorkerWithOrg[];
  guides: PassportRenewalGuide[];
}) {
  const today = todayStr();

  // 案内の記録（外国人ID → 記録）。保存したらこの場で書き換えて表示に反映する
  const [guideMap, setGuideMap] = useState<Record<string, PassportRenewalGuide>>(() =>
    Object.fromEntries(guides.map((g) => [g.worker_id, g])),
  );
  // この画面で「新しいパスポート」を保存して一覧から外れた人
  const [doneNames, setDoneNames] = useState<string[]>([]);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const targets = useMemo(
    () =>
      workers
        // 現在も支援中（支援対象かつ在籍中）の人だけに絞る
        .filter((w) => isPassportRenewalListTarget(w, today) && !doneIds.has(w.id))
        .sort((a, b) =>
          (a.passport_expiry_date ?? "").localeCompare(b.passport_expiry_date ?? ""),
        ),
    [workers, today, doneIds],
  );

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
        <BookMarked size={14} className="mt-0.5 shrink-0" />
        パスポート有効期限の半年前になった、現在も支援中（支援対象・在籍中）の人です。国籍に応じた更新案内（日本語＋現地語）をコピーして、LINEやMessengerで本人に送れます。案内したら「案内・更新の記録」に案内日とスクショを残し、本人の更新が済んだら新しいパスポートを登録してください。
      </p>

      {doneNames.map((name) => (
        <p key={name} role="status" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
          {name} さんの新しいパスポートを保存しました（更新が済んだので一覧から外れました）
        </p>
      ))}

      <p className="text-sm font-bold text-muted">{targets.length}件</p>

      {targets.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">該当者はいません。</Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {targets.map((w) => (
            <PassportRow
              key={w.id}
              worker={w}
              today={today}
              guide={guideMap[w.id]}
              onGuideSaved={(g) => setGuideMap((prev) => ({ ...prev, [g.worker_id]: g }))}
              onRenewed={() => {
                setDoneIds((prev) => new Set(prev).add(w.id));
                setDoneNames((prev) => [...prev, w.name]);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PassportRow({
  worker,
  today,
  guide,
  onGuideSaved,
  onRenewed,
}: {
  worker: WorkerWithOrg;
  today: string;
  guide: PassportRenewalGuide | undefined;
  onGuideSaved: (g: PassportRenewalGuide) => void;
  onRenewed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"" | "both" | "ja" | "local">("");

  const expiry = worker.passport_expiry_date ?? "";
  const days = expiry ? daysUntil(expiry, today) : 0;
  const overdue = days < 0;
  const guideText = passportGuide(worker.nationality);
  const guidedOn = activeGuidedOn(guide, worker.passport_expiry_date);

  const combined = `${guideText.ja}\n\n---\n\n${guideText.local}`;

  const copy = async (text: string, which: "both" | "ja" | "local") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };

  return (
    <Card className={`p-4 ${overdue ? "border-seal" : ""}`}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <Link href={`/workers/${worker.id}`} className="min-w-0">
          <p className="truncate font-bold">{worker.name}</p>
          <p className="truncate text-xs text-muted">
            {worker.organizations?.name ?? "所属機関未設定"}
            {worker.nationality && ` ・ ${worker.nationality}`}
          </p>
        </Link>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ${overdue ? "bg-seal/10 text-seal" : "bg-status-notice-bg text-status-notice-fg"}`}>
          {expiry ? remainingLabel(expiry, today) : "期限未登録"}
        </span>
      </div>

      <p className="text-xs tabular-nums text-muted">パスポート有効期限 {expiry || "未登録"}</p>
      <p className="mt-1">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ${
            guidedOn ? "bg-brand/10 text-brand" : "bg-background text-muted"
          }`}
        >
          <CalendarCheck size={12} />
          {guidedOn ? `案内済み ${guidedOn}` : "未案内"}
        </span>
      </p>

      <div className="mt-2 flex flex-wrap gap-3">
        {worker.messenger_link && (
          <a href={messengerWebUrl(worker.messenger_link)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-brand">
            <MessageCircle size={13} />
            Messengerで送る
          </a>
        )}
        {worker.notion_link && (
          <a href={notionAppUrl(worker.notion_link)} className="flex items-center gap-1 text-xs font-bold text-brand">
            <ExternalLink size={13} />
            Notion
          </a>
        )}
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between text-sm font-bold text-brand"
        >
          <span>更新案内（{guideText.nationality} / {guideText.localLangLabel}）</span>
          <span className="text-xs">{open ? "閉じる" : "開く"}</span>
        </button>

        {open && (
          <div className="mt-2 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={copied === "both" ? <Check size={15} /> : <Copy size={15} />} onClick={() => copy(combined, "both")}>
                {copied === "both" ? "コピーしました" : "日本語＋現地語をコピー"}
              </Button>
              <Button variant="secondary" icon={copied === "ja" ? <Check size={15} /> : <Copy size={15} />} onClick={() => copy(guideText.ja, "ja")}>
                {copied === "ja" ? "コピー" : "日本語のみ"}
              </Button>
              <Button variant="secondary" icon={copied === "local" ? <Check size={15} /> : <Copy size={15} />} onClick={() => copy(guideText.local, "local")}>
                {copied === "local" ? "コピー" : `${guideText.localLangLabel}のみ`}
              </Button>
            </div>

            <div className="rounded-xl bg-background p-3">
              <p className="mb-1 text-[11px] font-bold text-muted">日本語</p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed">{guideText.ja}</p>
            </div>
            <div className="rounded-xl bg-background p-3">
              <p className="mb-1 text-[11px] font-bold text-muted">{guideText.localLangLabel}</p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed">{guideText.local}</p>
            </div>
            {guideText.officialUrl && (
              <a href={guideText.officialUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-brand">
                <ExternalLink size={13} />
                {guideText.officialName}（公式サイト）
              </a>
            )}
          </div>
        )}
      </div>

      <RenewalProgress
        worker={worker}
        today={today}
        guidedOn={guidedOn}
        onGuideSaved={onGuideSaved}
        onRenewed={onRenewed}
      />
    </Card>
  );
}

// 案内・更新の記録: 案内日＋スクショ、更新完了後の新しいパスポートの登録
function RenewalProgress({
  worker,
  today,
  guidedOn,
  onGuideSaved,
  onRenewed,
}: {
  worker: WorkerWithOrg;
  today: string;
  guidedOn: string | null;
  onGuideSaved: (g: PassportRenewalGuide) => void;
  onRenewed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- 案内日 ----
  const [dateInput, setDateInput] = useState(guidedOn ?? today);
  const [savingDate, setSavingDate] = useState(false);

  const saveGuidedOn = async () => {
    if (!dateInput) return;
    setSavingDate(true);
    setError(null);
    try {
      await upsertPassportRenewalGuide(
        createClient(),
        worker.id,
        dateInput,
        worker.passport_expiry_date,
      );
      onGuideSaved({
        worker_id: worker.id,
        guided_on: dateInput,
        guided_expiry: worker.passport_expiry_date,
      });
    } catch (err) {
      setError(dbErrorMessage(err, "0126_passport_renewal_guides.sql", "案内日の保存に失敗しました"));
    } finally {
      setSavingDate(false);
    }
  };

  // ---- 添付（案内のスクショ / 新しいパスポートの画像） ----
  const [files, setFiles] = useState<WorkerPassportFileRow[]>([]);
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);
  const guideInputRef = useRef<HTMLInputElement>(null);
  const renewedInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listWorkerPassportFiles(createClient(), worker.id)
      .then((rows) => {
        if (!cancelled) setFiles(rows);
      })
      .catch(() => undefined); // 0096未適用のときは空のまま（登録時に案内を出す）
    return () => {
      cancelled = true;
    };
  }, [open, worker.id]);

  const uploadFiles = async (list: FileList | null, kind: string) => {
    if (!list || list.length === 0) return;
    setUploadingKind(kind);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        const { blob, mimeType, fileName } = await compressImage(file);
        const ticket = await createPassportFileTicket(worker.id, fileName, mimeType);
        if (!ticket.ok) throw new Error(ticket.message);
        const { error: upErr } = await createClient()
          .storage.from("app-files")
          .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
        if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
        const res = await registerPassportFile(worker.id, kind, ticket.path, fileName, mimeType);
        if (!res.ok) throw new Error(res.message);
      }
      setFiles(await listWorkerPassportFiles(createClient(), worker.id));
    } catch (err) {
      setError(dbErrorMessage(err, "0096_worker_passport_files.sql", "アップロードに失敗しました"));
    } finally {
      setUploadingKind(null);
    }
  };

  const preview = async (id: string) => {
    const res = await getPassportFilePreviewUrl(id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  };

  const removeFile = async (f: WorkerPassportFileRow) => {
    if (!window.confirm(`「${f.file_name}」を削除します。よろしいですか？`)) return;
    setError(null);
    const res = await deletePassportFile(f.id);
    if (res.ok) setFiles((prev) => prev.filter((x) => x.id !== f.id));
    else setError(res.message);
  };

  // ---- 更新完了（新しいパスポート） ----
  const [newNo, setNewNo] = useState("");
  const [newExpiry, setNewExpiry] = useState("");
  const [savingRenewal, setSavingRenewal] = useState(false);

  const saveRenewal = async () => {
    if (!newExpiry) {
      setError("新しい有効期限を入れてください");
      return;
    }
    if (
      !window.confirm(
        `新しいパスポート（有効期限 ${newExpiry}）を保存します。保存するとこの方は一覧から外れます。よろしいですか？`,
      )
    ) {
      return;
    }
    setSavingRenewal(true);
    setError(null);
    try {
      // 画面に出している項目だけを送る（他の項目を消さないように）
      const patch: { passport_expiry_date: string; passport_no?: string } = {
        passport_expiry_date: newExpiry,
      };
      if (newNo.trim()) patch.passport_no = newNo.trim();
      await updateWorker(createClient(), worker.id, patch);
      onRenewed();
    } catch (err) {
      setError(dbErrorMessage(err, "0001_workers.sql", "新しいパスポートの保存に失敗しました"));
      setSavingRenewal(false);
    }
  };

  const guideFiles = files.filter((f) => f.kind === PASSPORT_FILE_KIND_GUIDE);
  const renewedFiles = files.filter((f) => f.kind === PASSPORT_FILE_KIND_RENEWED);

  const fileList = (rows: WorkerPassportFileRow[]) =>
    rows.length === 0 ? null : (
      <ul className="space-y-1">
        {rows.map((f) => (
          <li key={f.id} className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => preview(f.id)}
              className="min-w-0 flex-1 truncate text-left font-bold text-brand underline-offset-2 hover:underline"
            >
              {f.file_name || "ファイル"}
            </button>
            <span className="shrink-0 tabular-nums text-muted">{f.created_at.slice(0, 10)}</span>
            <button
              type="button"
              onClick={() => removeFile(f)}
              className="shrink-0 text-muted hover:text-seal"
              aria-label="削除"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-sm font-bold text-brand"
      >
        <span>案内・更新の記録</span>
        <span className="text-xs">{open ? "閉じる" : "開く"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-4">
          {error && (
            <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
              {error}
            </p>
          )}

          {/* 案内した日 */}
          <div className="rounded-xl bg-background p-3">
            <p className="mb-2 text-[11px] font-bold text-muted">案内した日</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="min-h-[40px] rounded-xl border border-border bg-surface px-3 text-sm"
              />
              <Button variant="secondary" onClick={saveGuidedOn} disabled={savingDate || !dateInput}>
                {savingDate ? "保存中…" : guidedOn ? "案内日を保存し直す" : "案内済みにする"}
              </Button>
            </div>
            {guidedOn && (
              <p className="mt-1.5 text-[11px] text-muted">案内済み（{guidedOn}）として記録されています。</p>
            )}
          </div>

          {/* 案内のスクショ */}
          <FileDropArea
            onFiles={(list) => uploadFiles(list, PASSPORT_FILE_KIND_GUIDE)}
            disabled={uploadingKind !== null}
            className="rounded-xl border border-dashed border-border bg-background p-3"
          >
            <p className="mb-2 text-[11px] font-bold text-muted">
              案内のスクショ（LINE・Messengerで送った画面）
            </p>
            {fileList(guideFiles)}
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="secondary"
                icon={<ImagePlus size={15} />}
                onClick={() => guideInputRef.current?.click()}
                disabled={uploadingKind !== null}
              >
                {uploadingKind === PASSPORT_FILE_KIND_GUIDE ? "アップロード中…" : "スクショを追加"}
              </Button>
              <span className="text-[11px] text-muted">ここにドラッグ＆ドロップでも追加できます</span>
            </div>
            <input
              ref={guideInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              hidden
              onChange={(e) => {
                void uploadFiles(e.target.files, PASSPORT_FILE_KIND_GUIDE);
                e.target.value = "";
              }}
            />
          </FileDropArea>

          {/* 更新完了 → 新しいパスポート */}
          <FileDropArea
            onFiles={(list) => uploadFiles(list, PASSPORT_FILE_KIND_RENEWED)}
            disabled={uploadingKind !== null}
            className="rounded-xl border border-dashed border-border bg-background p-3"
          >
            <p className="mb-1 text-[11px] font-bold text-muted">更新が完了したら（新しいパスポート）</p>
            <p className="mb-2 text-[11px] leading-relaxed text-muted">
              新しいパスポートの画像を登録し、番号と有効期限を保存してください。保存するとこの方は一覧から外れます。
            </p>
            {fileList(renewedFiles)}
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="secondary"
                icon={<ImagePlus size={15} />}
                onClick={() => renewedInputRef.current?.click()}
                disabled={uploadingKind !== null}
              >
                {uploadingKind === PASSPORT_FILE_KIND_RENEWED ? "アップロード中…" : "画像を追加"}
              </Button>
              <span className="text-[11px] text-muted">ここにドラッグ＆ドロップでも追加できます</span>
            </div>
            <input
              ref={renewedInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              hidden
              onChange={(e) => {
                void uploadFiles(e.target.files, PASSPORT_FILE_KIND_RENEWED);
                e.target.value = "";
              }}
            />

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-xs">
                <span className="mb-1 block text-[11px] font-bold text-muted">新しいパスポート番号</span>
                <input
                  type="text"
                  value={newNo}
                  onChange={(e) => setNewNo(e.target.value)}
                  placeholder={worker.passport_no ? `今: ${worker.passport_no}` : ""}
                  className="min-h-[40px] w-full rounded-xl border border-border bg-surface px-3 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-[11px] font-bold text-muted">新しい有効期限</span>
                <input
                  type="date"
                  value={newExpiry}
                  onChange={(e) => setNewExpiry(e.target.value)}
                  className="min-h-[40px] w-full rounded-xl border border-border bg-surface px-3 text-sm"
                />
              </label>
            </div>
            <div className="mt-2">
              <Button onClick={saveRenewal} disabled={savingRenewal || !newExpiry}>
                {savingRenewal ? "保存中…" : "新しいパスポートを保存"}
              </Button>
            </div>
          </FileDropArea>
        </div>
      )}
    </div>
  );
}
