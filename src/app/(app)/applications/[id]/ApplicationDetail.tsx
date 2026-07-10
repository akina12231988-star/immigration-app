"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Check,
  MessageCircle,
  ShieldCheck,
  ImageOff,
  Image as ImageIcon,
  Trash2,
  TriangleAlert,
  ExternalLink,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatusStepper } from "@/components/StatusStepper";
import { generateLineReport } from "@/lib/line-report";
import { useApplications } from "@/lib/application-store";

export function ApplicationDetail({ id }: { id: string }) {
  const router = useRouter();
  const { applications, loaded, updateApplication, deleteApplication } =
    useApplications();
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const app = applications.find((a) => a.id === id);

  if (!loaded) {
    return <p className="py-12 text-center text-sm text-muted">読み込み中…</p>;
  }

  if (!app) {
    return (
      <p className="py-12 text-center text-sm text-muted">
        該当する申請が見つかりません
      </p>
    );
  }

  const lineReportText = generateLineReport(app);

  async function handleCopy() {
    await navigator.clipboard.writeText(lineReportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ⑥報告済ボタン: Sheets/Notion双方の報告済フラグを更新する想定（Stage4/7で実API接続）
  function markReported() {
    if (!app) return;
    updateApplication(app.id, {
      lineReported: true,
      notionSynced: true,
      status: app.status === "申請前" ? "申請済" : "LINE報告済",
      updatedAt: new Date().toISOString(),
    });
  }

  // ⑧許可済ボタン: 許可日を自動入力しステータスを許可済に更新する想定
  function markApproved() {
    const today = new Date().toISOString().slice(0, 10);
    updateApplication(id, {
      approved: true,
      approvalDate: today,
      status: "許可済",
      updatedAt: new Date().toISOString(),
    });
  }

  async function handleDelete() {
    await deleteApplication(id);
    router.push("/applications");
  }

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="mb-1 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">{app.name}</h2>
            <p className="text-sm text-muted">{app.applicationContent}</p>
          </div>
          <StatusBadge status={app.status} />
        </div>
        <div className="mt-4">
          <StatusStepper current={app.status} />
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold text-muted">基本情報</h3>
        <dl className="space-y-2.5 text-sm">
          <InfoRow label="申請方法" value={app.applicationMethod} />
          <InfoRow label="申請番号" value={app.applicationNumber || "未登録"} />
          <InfoRow label="申請日" value={app.applicationDate} />
          <InfoRow
            label="許可日"
            value={app.approvalDate ?? "未許可"}
          />
          <InfoRow label="担当者" value={app.assignee} />
          <InfoRow
            label="登録日時"
            value={new Date(app.createdAt).toLocaleString("ja-JP")}
          />
          <InfoRow
            label="更新日時"
            value={new Date(app.updatedAt).toLocaleString("ja-JP")}
          />
        </dl>
      </Card>

      {app.applicationMethod === "オンライン申請" ? (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-bold text-muted">
            確認メール情報
          </h3>
          {app.emailLink && (
            <a
              href={app.emailLink}
              target="_blank"
              rel="noreferrer"
              className="mb-3 flex items-center gap-1.5 break-all text-sm font-bold text-brand underline"
            >
              <ExternalLink size={14} className="shrink-0" />
              {app.emailLink}
            </a>
          )}
          {app.emailBody ? (
            <pre className="whitespace-pre-wrap rounded-xl bg-background p-3.5 text-sm leading-relaxed">
              {app.emailBody}
            </pre>
          ) : (
            <p className="text-sm text-muted">メール本文は未登録です</p>
          )}
        </Card>
      ) : (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-bold text-muted">画像</h3>
          <div className="grid grid-cols-3 gap-2">
            <ImageSlot label="受付票" url={app.receiptImageUrl} />
            <ImageSlot label="通知書" url={app.noticeImageUrl} />
            <ImageSlot label="在留カード" url={app.residenceCardImageUrl} />
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-muted">LINE報告文</h3>
          {app.lineReported && (
            <span className="text-xs font-bold text-status-reported-fg">
              報告済み
            </span>
          )}
        </div>
        <pre className="whitespace-pre-wrap rounded-xl bg-background p-3.5 text-sm leading-relaxed">
          {lineReportText}
        </pre>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            icon={copied ? <Check size={17} /> : <Copy size={17} />}
            onClick={handleCopy}
          >
            {copied ? "コピーしました" : "コピーする"}
          </Button>
          <Button
            variant={app.lineReported ? "secondary" : "primary"}
            icon={<MessageCircle size={17} />}
            onClick={markReported}
            disabled={app.lineReported}
          >
            {app.lineReported ? "報告済み" : "報告済にする"}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold text-muted">許可処理</h3>
        <Button
          variant={app.approved ? "secondary" : "seal"}
          icon={<ShieldCheck size={18} />}
          fullWidth
          onClick={markApproved}
          disabled={app.approved}
        >
          {app.approved
            ? `許可済（許可日: ${app.approvalDate}）`
            : "許可済にする"}
        </Button>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold text-muted">この申請の削除</h3>
        {!confirmingDelete ? (
          <Button
            variant="secondary"
            icon={<Trash2 size={17} />}
            fullWidth
            onClick={() => setConfirmingDelete(true)}
          >
            削除する
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl bg-seal/10 p-3 text-sm text-seal">
              <TriangleAlert size={18} className="mt-0.5 shrink-0" />
              <p>
                「{app.name}」の申請情報を削除します。この操作は取り消せません。本当に削除しますか？
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
                キャンセル
              </Button>
              <Button
                variant="seal"
                icon={<Trash2 size={17} />}
                onClick={handleDelete}
              >
                削除する
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  );
}

function ImageSlot({ label, url }: { label: string; url?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-border bg-background text-muted">
        {url ? <ImageIcon size={22} /> : <ImageOff size={22} />}
      </div>
      <span className="text-[11px] font-bold text-muted">{label}</span>
    </div>
  );
}
