"use client";

import Link from "next/link";
import { ExternalLink, Mail, MessageCircle } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import { FileGroup } from "@/components/applications/FileGroup";
import { ReceiptSlipCopy } from "@/components/applications/ReceiptSlipCopy";
import { messengerWebUrl } from "@/lib/messenger-link";
import {
  IMMIGRATION_RECEIPT_GROUP_NAME,
  IMMIGRATION_RECEIPT_GROUP_URL,
  onlineReceiptReportText,
  onlineReceiptStage,
  onlineReceiptSummary,
  receiptSlipFiles,
  waitingReceiptNumber,
} from "@/lib/online-receipt";
import type { Application, ApplicationFile, ApplicationFileKind } from "@/types/application";

// オンライン申請の受付（メールが3通に分かれて届く）。
//   1通目「申請受付完了のお知らせ」: 申請種別・整理番号・メールのリンク・スクショ
//   2通目「申請受付仮番号のお知らせ」: 申請受付日・申請受付仮番号・申請種別・申請人在留カード等番号
//   3通目「申請受付番号のお知らせ」: 2通目の内容＋申請受付番号
// 3通目に2通目の内容も載っているので、2通目と3通目は1枚のカードにまとめ、3通目のスクショを受付票として扱う。
// 内容は申請詳細のいちばん上の「編集」から直す（編集する場所を1か所にまとめている）。ここはスクリーンショットの追加だけ
export function OnlineReceiptSection({
  app,
  files,
  uploading,
  canEdit,
  messengerLink,
  onUpload,
  onDeleteFile,
}: {
  app: Application;
  messengerLink: string; // 本人の Messenger グループ（外国人詳細の基本情報）
  files: ApplicationFile[];
  uploading: ApplicationFileKind | null;
  canEdit: boolean;
  onUpload: (kind: ApplicationFileKind, list: FileList | null) => void;
  onDeleteFile: (file: ApplicationFile) => void;
}) {
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
  const nextCard = stage === "none" ? 1 : waiting ? 2 : 0;
  const cardCls = (n: 1 | 2) => {
    const next = nextCard;
    return `rounded-xl border p-3 ${n === next ? "border-seal/40 bg-seal/5" : "border-border bg-surface"}`;
  };
  const nextNote = (n: 1 | 2) => {
    const next = nextCard;
    return n === next ? <span className="ml-2 font-bold text-seal">届いたら上の「編集」から入力してください</span> : null;
  };

  return (
    <div className="mt-3 rounded-xl border border-border bg-background p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-bold">
          <Mail size={14} />
          オンライン申請の受付（メール3通）
        </h4>
        <span className={`text-[11px] ${waiting ? "font-bold text-seal" : "text-muted"}`}>{onlineReceiptSummary(app)}</span>
      </div>
      <p className="mb-2 text-[11px] leading-relaxed text-muted">
        1通目「申請受付完了のお知らせ」には申請種別と整理番号、3通目「申請受付番号のお知らせ」には申請受付日・申請受付仮番号・申請人在留カード等番号と申請受付番号が書かれています。
        メールは時間差で届くので、翌日までに申請受付番号まで入れてから LINE報告をしてください。リンクとスクリーンショット（ドラッグ＆ドロップ可）も残します。
      </p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* 1通目 */}
        <div className={cardCls(1)}>
          <p className="mb-2 text-xs font-bold">1通目 申請受付完了のお知らせ{nextNote(1)}</p>
          <dl>
            {row("申請種別", app.onlineAppType ?? "")}
            {row("整理番号", app.onlineRefNo ?? "")}
            {mailLink(app.emailLink, "1通目のメールを開く")}
          </dl>
          {shots("1通目のスクリーンショット", "受付完了メール")}
        </div>

        {/* 2通目・3通目（3通目に2通目の内容と申請受付番号が載っているので1枚にまとめる） */}
        <div className={`${cardCls(2)} lg:col-span-2`}>
          <p className="mb-1 text-xs font-bold">2通目・3通目 申請受付番号のお知らせ{nextNote(2)}</p>
          <p className="mb-2 text-[11px] leading-relaxed text-muted">
            3通目のメールには2通目の内容（申請受付日・申請受付仮番号・申請人在留カード等番号）に加えて申請受付番号が載っています。
            3通目が届いたら、申請詳細のいちばん上の「編集」からまとめて入れてください。3通目のスクリーンショットは「画像」の受付票にも表示されます。
          </p>
          <dl>
            {row("申請受付日", app.onlineReceivedOn ?? "")}
            {row("申請受付仮番号", app.onlineTempNo ?? "")}
            {row("申請種別", app.onlineAppType ?? "")}
            {row("申請人在留カード等番号", app.onlineCardNo ?? "")}
            {row("申請受付番号", app.applicationNumber)}
            {mailLink(app.onlineMail3Link ?? "", "3通目のメールを開く")}
            {mailLink(app.onlineMail2Link ?? "", "2通目のメールを開く")}
          </dl>
          {shots("3通目のスクリーンショット（受付票）", "受付番号メール")}
          {/* 前に2通目のスクリーンショットを残していたときだけ出す */}
          {files.some((f) => f.kind === "受付仮番号メール") && shots("2通目のスクリーンショット", "受付仮番号メール")}
        </div>
      </div>

      {/* 申請受付番号が入ったら、入管-申請受付票・許可のグループと本人のグループへ報告する */}
      {!waiting && (
        <div className="mt-3 rounded-xl border border-brand/30 bg-brand/5 p-3">
          <p className="mb-1 text-xs font-bold text-brand">申請受付番号が入りました。Messenger で報告してください</p>
          <p className="mb-2 text-[11px] leading-relaxed text-muted">
            報告文（3通目のメールの内容）と受付票の画像をコピーして、下の2つのグループに送ります。
          </p>
          {/* 報告文（3通目のメールの内容すべて）の横に受付票の画像（コピーして一緒に送れる） */}
          <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_220px]">
            <div className="flex items-start gap-2 rounded-lg bg-surface p-2.5">
              <pre className="min-w-0 flex-1 whitespace-pre-wrap text-xs leading-relaxed">{onlineReceiptReportText(app)}</pre>
              <CopyButton value={onlineReceiptReportText(app)} label="報告文をコピー" size={16} />
            </div>
            <ReceiptSlipCopy files={receiptSlipFiles("オンライン", files)} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <a
              href={messengerWebUrl(IMMIGRATION_RECEIPT_GROUP_URL)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-bold text-brand"
            >
              <MessageCircle size={15} />
              {IMMIGRATION_RECEIPT_GROUP_NAME} に報告
              <ExternalLink size={12} />
            </a>
            {messengerLink ? (
              <a
                href={messengerWebUrl(messengerLink)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-bold text-brand"
              >
                <MessageCircle size={15} />
                本人の Messenger グループに報告
                <ExternalLink size={12} />
              </a>
            ) : (
              <p className="flex min-h-[40px] items-center justify-center rounded-xl border border-dashed border-border px-3 text-center text-[11px] text-muted">
                本人の Messenger グループが未登録です。
                {app.workerId && (
                  <Link href={`/workers/${app.workerId}`} className="ml-1 font-bold text-brand hover:underline">
                    外国人詳細で登録
                  </Link>
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
