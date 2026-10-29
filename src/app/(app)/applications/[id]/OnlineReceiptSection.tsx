"use client";

import { useState } from "react";
import { ExternalLink, Mail, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FileGroup } from "@/components/applications/FileGroup";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import { ONLINE_APP_TYPE_EXAMPLE, onlineReceiptStage, onlineReceiptSummary, waitingReceiptNumber } from "@/lib/online-receipt";
import type { Application, ApplicationFile, ApplicationFileKind } from "@/types/application";

const MIGRATION = "0206_online_application_receipt_mail3.sql";

const INPUT =
  "min-h-[40px] w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none";

interface Draft {
  onlineAppType: string;
  onlineRefNo: string;
  emailLink: string;
  onlineReceivedOn: string;
  onlineTempNo: string;
  onlineCardNo: string;
  onlineMail2Link: string;
  applicationNumber: string;
  onlineMail3Link: string;
}

const draftOf = (a: Application): Draft => ({
  onlineAppType: a.onlineAppType ?? "",
  onlineRefNo: a.onlineRefNo ?? "",
  emailLink: a.emailLink ?? "",
  onlineReceivedOn: a.onlineReceivedOn ?? "",
  onlineTempNo: a.onlineTempNo ?? "",
  onlineCardNo: a.onlineCardNo ?? "",
  onlineMail2Link: a.onlineMail2Link ?? "",
  applicationNumber: a.applicationNumber ?? "",
  onlineMail3Link: a.onlineMail3Link ?? "",
});

// オンライン申請の受付（メールが3通に分かれて届く）。
//   1通目「申請受付完了のお知らせ」: 申請種別・整理番号・メールのリンク・スクショ
//   2通目「申請受付仮番号のお知らせ」: 申請受付日・申請受付仮番号・申請種別・申請人在留カード等番号・リンク・スクショ
//   3通目「申請受付番号のお知らせ」: 申請受付番号・リンク・スクショ
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

  // 変えた項目だけ送る（0205・0206 未適用の環境でも、触っていない新しい列は送らない）
  const save = async () => {
    const base = draftOf(app);
    const patch: Partial<Application> = {};
    const text = (key: keyof Draft) => {
      const v = draft[key].trim();
      if (v !== base[key].trim()) (patch as Record<string, unknown>)[key] = v;
    };
    (
      ["onlineAppType", "onlineRefNo", "emailLink", "onlineTempNo", "onlineCardNo", "onlineMail2Link", "applicationNumber", "onlineMail3Link"] as const
    ).forEach(text);
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

  const stage = onlineReceiptStage(app);
  const waiting = waitingReceiptNumber(app);
  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-1 text-sm">
      <span className="shrink-0 text-xs text-muted">{label}</span>
      <span className={`min-w-0 truncate text-right ${value ? "font-bold" : "text-muted"}`}>{value || "未入力"}</span>
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
  const field = (label: string, key: keyof Draft, placeholder?: string, type: "text" | "url" | "date" = "text") => (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold text-muted">{label}</span>
      <input
        type={type}
        value={draft[key]}
        onChange={(e) => set({ [key]: e.target.value } as Partial<Draft>)}
        placeholder={placeholder}
        className={`${INPUT} ${type === "text" ? "tabular-nums" : ""}`}
      />
    </label>
  );
  const shots = (label: string, kind: ApplicationFileKind) => (
    <div className="mt-3">
      <FileGroup
        label={label}
        files={files.filter((f) => f.kind === kind)}
        uploading={uploading === kind}
        multiple
        onSelect={(list) => onUpload(kind, list)}
        onDelete={canEdit ? onDeleteFile : undefined}
      />
    </div>
  );
  // 次に届くメールのカードを赤くして、どれを待っているか分かるようにする
  const cardCls = (n: 1 | 2 | 3) => {
    const next = stage === "none" ? 1 : stage === "mail1" ? 2 : stage === "mail2" ? 3 : waiting ? 3 : 0;
    return `rounded-xl border p-3 ${n === next ? "border-seal/40 bg-seal/5" : "border-border bg-surface"}`;
  };
  const nextNote = (n: 1 | 2 | 3) => {
    const next = stage === "none" ? 1 : stage === "mail1" ? 2 : stage === "mail2" ? 3 : waiting ? 3 : 0;
    return n === next ? <span className="ml-2 font-bold text-seal">届いたら入力してください</span> : null;
  };

  return (
    <div className="mt-3 rounded-xl border border-border bg-background p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-bold">
          <Mail size={14} />
          オンライン申請の受付（メール3通）
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
        1通目「申請受付完了のお知らせ」には申請種別と整理番号、2通目「申請受付仮番号のお知らせ」には申請受付日・申請受付仮番号・申請人在留カード等番号、
        3通目「申請受付番号のお知らせ」には申請受付番号が書かれています。届いた順に内容を入れ、リンクとスクリーンショット（ドラッグ＆ドロップ可）を残してください。
      </p>
      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* 1通目 */}
        <div className={cardCls(1)}>
          <p className="mb-2 text-xs font-bold">1通目 申請受付完了のお知らせ{nextNote(1)}</p>
          {editing ? (
            <div className="space-y-2">
              {field("申請種別", "onlineAppType", `例: ${ONLINE_APP_TYPE_EXAMPLE}`)}
              {field("整理番号", "onlineRefNo", "例: 650468319129")}
              {field("メールのリンク", "emailLink", "https://...", "url")}
            </div>
          ) : (
            <dl>
              {row("申請種別", app.onlineAppType ?? "")}
              {row("整理番号", app.onlineRefNo ?? "")}
              {mailLink(app.emailLink, "1通目のメールを開く")}
            </dl>
          )}
          {shots("1通目のスクリーンショット", "受付完了メール")}
        </div>

        {/* 2通目 */}
        <div className={cardCls(2)}>
          <p className="mb-2 text-xs font-bold">2通目 申請受付仮番号のお知らせ{nextNote(2)}</p>
          {editing ? (
            <div className="space-y-2">
              {field("申請受付日", "onlineReceivedOn", undefined, "date")}
              {field("申請受付仮番号", "onlineTempNo", "例: 95820260000440638-00")}
              {field("申請人在留カード等番号", "onlineCardNo", "例: LJ41245695EA")}
              {field("メールのリンク", "onlineMail2Link", "https://...", "url")}
            </div>
          ) : (
            <dl>
              {row("申請受付日", app.onlineReceivedOn ?? "")}
              {row("申請受付仮番号", app.onlineTempNo ?? "")}
              {row("申請種別", app.onlineAppType ?? "")}
              {row("申請人在留カード等番号", app.onlineCardNo ?? "")}
              {mailLink(app.onlineMail2Link ?? "", "2通目のメールを開く")}
            </dl>
          )}
          {shots("2通目のスクリーンショット", "受付仮番号メール")}
        </div>

        {/* 3通目 */}
        <div className={cardCls(3)}>
          <p className="mb-2 text-xs font-bold">3通目 申請受付番号のお知らせ{nextNote(3)}</p>
          {editing ? (
            <div className="space-y-2">
              {field("申請受付番号（申請一覧の申請番号になります）", "applicationNumber", "例: 札オンＣＶ26004241")}
              {field("メールのリンク", "onlineMail3Link", "https://...", "url")}
            </div>
          ) : (
            <dl>
              {row("申請受付番号", app.applicationNumber)}
              {mailLink(app.onlineMail3Link ?? "", "3通目のメールを開く")}
            </dl>
          )}
          {shots("3通目のスクリーンショット", "受付番号メール")}
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
