"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Copy,
  Check,
  ChevronRight,
  MessageCircle,
  ShieldCheck,
  ImageOff,
  Image as ImageIcon,
  UserRound,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatusStepper } from "@/components/StatusStepper";
import { generateLineReport } from "@/lib/line-report";
import { useApplications } from "@/lib/application-store";

export function ApplicationDetail({ id }: { id: string }) {
  const { applications, loaded, updateApplication } = useApplications();
  const [copied, setCopied] = useState(false);

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

  // ⑥報告済ボタン: LINE報告済フラグを更新（updated_at はDBトリガーが自動更新）
  function markReported() {
    if (!app) return;
    void updateApplication(app.id, {
      lineReported: true,
      notionSynced: true,
      status: app.status === "申請前" ? "申請済" : "LINE報告済",
    });
  }

  // ⑧許可済ボタン: 許可日を自動入力しステータスを許可済に更新する
  function markApproved() {
    const today = new Date().toISOString().slice(0, 10);
    void updateApplication(id, {
      approved: true,
      approvalDate: today,
      status: "許可済",
    });
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

      {app.workerId && (
        <Link href={`/workers/${app.workerId}`}>
          <Card className="flex items-center gap-3 p-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <UserRound size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold text-muted">
                紐づく外国人
              </span>
              <span className="block truncate font-bold">
                {app.workerName ?? app.name}
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </Card>
        </Link>
      )}

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold text-muted">基本情報</h3>
        <dl className="space-y-2.5 text-sm">
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

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold text-muted">画像</h3>
        <div className="grid grid-cols-3 gap-2">
          <ImageSlot label="受付票" url={app.receiptImageUrl} />
          <ImageSlot label="通知書" url={app.noticeImageUrl} />
          <ImageSlot label="在留カード" url={app.residenceCardImageUrl} />
        </div>
      </Card>

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
