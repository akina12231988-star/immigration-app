"use client";

import { useState } from "react";
import { ExternalLink, Mail, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FileGroup } from "@/components/applications/FileGroup";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import { ONLINE_APP_TYPE_EXAMPLE, onlineReceiptSummary, waitingSecondMail } from "@/lib/online-receipt";
import type { Application, ApplicationFile, ApplicationFileKind } from "@/types/application";

const MIGRATION = "0205_online_application_receipt.sql";

const INPUT =
  "min-h-[40px] w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none";

interface Draft {
  onlineAppType: string;
  onlineRefNo: string;
  emailLink: string;
  onlineReceivedOn: string;
  onlineTempNo: string;
  onlineCardNo: string;
  applicationNumber: string;
  onlineMail2Link: string;
}

const draftOf = (a: Application): Draft => ({
  onlineAppType: a.onlineAppType ?? "",
  onlineRefNo: a.onlineRefNo ?? "",
  emailLink: a.emailLink ?? "",
  onlineReceivedOn: a.onlineReceivedOn ?? "",
  onlineTempNo: a.onlineTempNo ?? "",
  onlineCardNo: a.onlineCardNo ?? "",
  applicationNumber: a.applicationNumber ?? "",
  onlineMail2Link: a.onlineMail2Link ?? "",
});

// オンライン申請の受付（メールが2通に分かれて届く）。
//   1通目「申請受付完了のお知らせ」: 申請種別・整理番号・メールのリンク・スクショ
//   2通目「申請受付番号のお知らせ」: 申請受付日・申請受付仮番号・申請種別・申請人在留カード等番号・
//     申請受付番号・メールのリンク・スクショ
// 「編集 → 入力 → 保存」で直す（入力のたびに保存はしない）。変えた項目だけ保存する
export function OnlineReceiptSection({
  app,
  files,
  uploading,
  canEdit,
  onUpload,
  onDeleteFile,
  onSave,
}: {
  app: Application;
  files: ApplicationFile[];
  uploading: ApplicationFileKind | null;
  canEdit: boolean;
  onUpload: (kind: ApplicationFileKind, list: FileList | null) => void;
  onDeleteFile: (file: ApplicationFile) => void;
  onSave: (patch: Partial<Application>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(app));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const startEdit = () => {
    setDraft(draftOf(app));
    setError(null);
    setEditing(true);
  };

  // 変えた項目だけ送る（0205 未適用の環境でも、触っていない新しい列は送らない）
  const save = async () => {
    const base = draftOf(app);
    const patch: Partial<Application> = {};
    const text = (key: keyof Draft) => {
      const v = draft[key].trim();
      if (v !== base[key].trim()) (patch as Record<string, unknown>)[key] = v;
    };
    (["onlineAppType", "onlineRefNo", "emailLink", "onlineTempNo", "onlineCardNo", "applicationNumber", "onlineMail2Link"] as const).forEach(text);
    if (draft.onlineReceivedOn !== base.onlineReceivedOn) patch.onlineReceivedOn = draft.onlineReceivedOn || undefined;
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(patch);
      setEditing(false);
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, errorMessage(err, "受付の内容の保存に失敗しました")));
    } finally {
      setBusy(false);
    }
  };

  const waiting = waitingSecondMail(app);
  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-1 text-sm">
      <span className="shrink-0 text-xs text-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-bold">{value || "未入力"}</span>
    </div>
  );
  const mailLink = (href: string, label: string) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-border py-2 text-sm font-bold text-brand"
      >
        <ExternalLink size={15} />
        {label}
      </a>
    ) : null;

  return (
    <div className="mt-3 rounded-xl border border-border bg-background p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-bold">
          <Mail size={14} />
          オンライン申請の受付（メール2通）
        </h4>
        <span className={`text-[11px] ${waiting ? "font-bold text-seal" : "text-muted"}`}>{onlineReceiptSummary(app)}</span>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={startEdit}
            className="ml-auto flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold"
          >
            <Pencil size={12} />
            編集
          </button>
        )}
      </div>
      <p className="mb-2 text-[11px] leading-relaxed text-muted">
        1通目「申請受付完了のお知らせ」には申請種別と整理番号、2通目には申請受付日・申請受付仮番号・申請人在留カード等番号・申請受付番号が書かれています。
        届いたメールの内容を入れ、リンクとスクリーンショット（ドラッグ＆ドロップ可）を残してください。
      </p>
      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* 1通目 */}
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="mb-2 text-xs font-bold">1通目 申請受付完了のお知らせ</p>
          {editing ? (
            <div className="space-y-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-muted">申請種別</span>
                <input value={draft.onlineAppType} onChange={(e) => set({ onlineAppType: e.target.value })} placeholder={`例: ${ONLINE_APP_TYPE_EXAMPLE}`} className={INPUT} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-muted">整理番号</span>
                <input value={draft.onlineRefNo} onChange={(e) => set({ onlineRefNo: e.target.value })} placeholder="例: 650468319129" className={`${INPUT} tabular-nums`} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-muted">メールのリンク</span>
                <input type="url" value={draft.emailLink} onChange={(e) => set({ emailLink: e.target.value })} placeholder="https://..." className={INPUT} />
              </label>
            </div>
          ) : (
            <dl>
              {row("申請種別", app.onlineAppType ?? "")}
              {row("整理番号", app.onlineRefNo ?? "")}
              {mailLink(app.emailLink, "1通目のメールを開く")}
            </dl>
          )}
          <div className="mt-3">
            <FileGroup
              label="1通目のスクリーンショット"
              files={files.filter((f) => f.kind === "受付完了メール")}
              uploading={uploading === "受付完了メール"}
              multiple
              onSelect={(list) => onUpload("受付完了メール", list)}
              onDelete={canEdit ? onDeleteFile : undefined}
            />
          </div>
        </div>

        {/* 2通目 */}
        <div className={`rounded-xl border p-3 ${waiting ? "border-seal/40 bg-seal/5" : "border-border bg-surface"}`}>
          <p className="mb-2 text-xs font-bold">
            2通目 申請受付番号のお知らせ
            {waiting && <span className="ml-2 font-bold text-seal">届いたら入力してください</span>}
          </p>
          {editing ? (
            <div className="space-y-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-muted">申請受付日</span>
                <input type="date" value={draft.onlineReceivedOn} onChange={(e) => set({ onlineReceivedOn: e.target.value })} className={INPUT} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-muted">申請受付仮番号</span>
                <input value={draft.onlineTempNo} onChange={(e) => set({ onlineTempNo: e.target.value })} className={`${INPUT} tabular-nums`} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-muted">申請人在留カード等番号</span>
                <input value={draft.onlineCardNo} onChange={(e) => set({ onlineCardNo: e.target.value })} placeholder="例: AB12345678CD" className={`${INPUT} tabular-nums`} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-muted">申請受付番号（申請一覧の申請番号になります）</span>
                <input value={draft.applicationNumber} onChange={(e) => set({ applicationNumber: e.target.value })} placeholder="例: 福熊E91422" className={`${INPUT} tabular-nums`} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-muted">メールのリンク</span>
                <input type="url" value={draft.onlineMail2Link} onChange={(e) => set({ onlineMail2Link: e.target.value })} placeholder="https://..." className={INPUT} />
              </label>
            </div>
          ) : (
            <dl>
              {row("申請受付日", app.onlineReceivedOn ?? "")}
              {row("申請受付仮番号", app.onlineTempNo ?? "")}
              {row("申請種別", app.onlineAppType ?? "")}
              {row("申請人在留カード等番号", app.onlineCardNo ?? "")}
              {row("申請受付番号", app.applicationNumber)}
              {mailLink(app.onlineMail2Link ?? "", "2通目のメールを開く")}
            </dl>
          )}
          <div className="mt-3">
            <FileGroup
              label="2通目のスクリーンショット"
              files={files.filter((f) => f.kind === "受付番号メール")}
              uploading={uploading === "受付番号メール"}
              multiple
              onSelect={(list) => onUpload("受付番号メール", list)}
              onDelete={canEdit ? onDeleteFile : undefined}
            />
          </div>
        </div>
      </div>

      {editing && (
        <div className="mt-3 flex gap-2">
          <Button fullWidth disabled={busy} onClick={() => void save()}>
            {busy ? "保存中…" : "保存"}
          </Button>
          <button type="button" onClick={() => setEditing(false)} className="min-h-[44px] shrink-0 px-3 text-sm font-bold text-muted">
            やめる
          </button>
        </div>
      )}
    </div>
  );
}
