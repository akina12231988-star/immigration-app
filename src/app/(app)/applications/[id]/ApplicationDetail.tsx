"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Copy,
  Check,
  ChevronRight,
  CreditCard,
  ExternalLink,
  ImagePlus,
  MessageCircle,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatusStepper } from "@/components/StatusStepper";
import { generateApprovalReport, generateLineReport } from "@/lib/line-report";
import { useApplications } from "@/lib/application-store";
import { uploadApplicationFile } from "@/lib/application-files";
import { listApplicationFiles } from "../actions";
import type { ApplicationFile, ApplicationFileKind } from "@/types/application";

export function ApplicationDetail({ id }: { id: string }) {
  const { applications, loaded, updateApplication } = useApplications();
  const [copied, setCopied] = useState<"apply" | "approval" | null>(null);
  const [files, setFiles] = useState<ApplicationFile[]>([]);
  const [uploading, setUploading] = useState<ApplicationFileKind | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const app = applications.find((a) => a.id === id);

  useEffect(() => {
    let cancelled = false;
    listApplicationFiles(id).then((f) => {
      if (!cancelled) setFiles(f);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

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
  const approvalReportText = generateApprovalReport(app);
  const cardReceived = app.status === "在留カード受領";

  async function handleCopy(text: string, key: "apply" | "approval") {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleUpload(kind: ApplicationFileKind, list: FileList | null) {
    if (!app || !list || list.length === 0) return;
    setUploading(kind);
    setUploadError(null);
    try {
      for (const file of Array.from(list)) {
        const uploaded = await uploadApplicationFile(app.id, kind, file);
        setFiles((prev) => [...prev, uploaded]);
      }
      // 通知書を登録したら状態を「通知書到着」まで進める
      if (
        kind === "通知書" &&
        (app.status === "申請前" || app.status === "申請済" || app.status === "LINE報告済")
      ) {
        void updateApplication(app.id, { status: "通知書到着" });
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setUploading(null);
    }
  }

  // ⑥報告済ボタン: 申請報告のLINE報告済フラグを更新
  function markReported() {
    if (!app) return;
    void updateApplication(app.id, {
      lineReported: true,
      notionSynced: true,
      status: app.status === "申請前" ? "申請済" : "LINE報告済",
    });
  }

  // ⑧許可済ボタン: 許可日を記録。押すと下に許可報告のLINE文が表示される
  function markApproved() {
    const today = new Date().toISOString().slice(0, 10);
    void updateApplication(id, {
      approved: true,
      approvalDate: today,
      status: "許可済",
    });
  }

  // 在留カード受領: 画像登録後に押して完了状態にする
  function markCardReceived() {
    const today = new Date().toISOString().slice(0, 10);
    void updateApplication(id, {
      status: "在留カード受領",
      cardReceivedOn: today,
    });
  }

  function markApprovalReported() {
    void updateApplication(id, { approvalReported: true });
  }

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="mb-1 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">{app.name}</h2>
            <p className="text-sm text-muted">
              {app.applicationContent}
              <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[11px] font-bold text-muted">
                {app.method}申請
              </span>
            </p>
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
          <InfoRow label="申請方法" value={`${app.method}申請`} />
          <InfoRow label="申請番号" value={app.applicationNumber || "未登録"} />
          <InfoRow label="申請日" value={app.applicationDate} />
          <InfoRow label="許可日" value={app.approvalDate ?? "未許可"} />
          <InfoRow
            label="在留カード受領日"
            value={app.cardReceivedOn ?? "未受領"}
          />
          <InfoRow label="申請取次士" value={app.assignee} />
          <InfoRow
            label="登録日時"
            value={new Date(app.createdAt).toLocaleString("ja-JP")}
          />
          <InfoRow
            label="更新日時"
            value={new Date(app.updatedAt).toLocaleString("ja-JP")}
          />
        </dl>
        {app.method === "オンライン" && app.emailLink && (
          <a
            href={app.emailLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-bold text-brand"
          >
            <ExternalLink size={16} />
            申請受付メールのリンクを開く
          </a>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold text-muted">画像</h3>
        {uploadError && (
          <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {uploadError}
          </p>
        )}
        <div className="space-y-4">
          <FileGroup
            label="受付票"
            files={files.filter((f) => f.kind === "受付票")}
            uploading={uploading === "受付票"}
            onSelect={(list) => handleUpload("受付票", list)}
          />
          <FileGroup
            label="通知書"
            hint="登録すると状態が「通知書到着」に進みます"
            files={files.filter((f) => f.kind === "通知書")}
            uploading={uploading === "通知書"}
            onSelect={(list) => handleUpload("通知書", list)}
          />
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-muted">LINE報告文（申請）</h3>
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
            icon={copied === "apply" ? <Check size={17} /> : <Copy size={17} />}
            onClick={() => handleCopy(lineReportText, "apply")}
          >
            {copied === "apply" ? "コピーしました" : "コピーする"}
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

        {/* 許可済を押すと下に許可報告のLINE文が表示される */}
        {app.approved && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-bold text-muted">LINE報告文（許可）</h4>
              {app.approvalReported && (
                <span className="text-xs font-bold text-status-reported-fg">
                  報告済み
                </span>
              )}
            </div>
            <pre className="whitespace-pre-wrap rounded-xl bg-background p-3.5 text-sm leading-relaxed">
              {approvalReportText}
            </pre>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                icon={copied === "approval" ? <Check size={17} /> : <Copy size={17} />}
                onClick={() => handleCopy(approvalReportText, "approval")}
              >
                {copied === "approval" ? "コピーしました" : "コピーする"}
              </Button>
              <Button
                variant={app.approvalReported ? "secondary" : "primary"}
                icon={<MessageCircle size={17} />}
                onClick={markApprovalReported}
                disabled={app.approvalReported}
              >
                {app.approvalReported ? "報告済み" : "報告済にする"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 許可済になったら在留カードの受け取りを記録する */}
      {app.approved && (
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-muted">
            <CreditCard size={15} />
            在留カード
          </h3>
          <FileGroup
            label="在留カード画像（複数枚可）"
            files={files.filter((f) => f.kind === "在留カード")}
            uploading={uploading === "在留カード"}
            multiple
            onSelect={(list) => handleUpload("在留カード", list)}
          />
          <Button
            variant={cardReceived ? "secondary" : "primary"}
            icon={<Check size={18} />}
            fullWidth
            className="mt-3"
            onClick={markCardReceived}
            disabled={cardReceived}
          >
            {cardReceived
              ? `在留カード受領済（${app.cardReceivedOn}）`
              : "在留カードを受け取った"}
          </Button>
        </Card>
      )}
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

// 画像種別ごとのサムネイル一覧＋追加ボタン
function FileGroup({
  label,
  hint,
  files,
  uploading,
  multiple = false,
  onSelect,
}: {
  label: string;
  hint?: string;
  files: ApplicationFile[];
  uploading: boolean;
  multiple?: boolean;
  onSelect: (list: FileList | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold text-muted">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {files.map((f) => (
          <a
            key={f.id}
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-xl border border-border bg-background"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={f.url}
              alt={f.fileName}
              className="aspect-square w-full object-cover"
            />
          </a>
        ))}
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border bg-background text-muted disabled:opacity-50"
          aria-label={`${label}を追加`}
        >
          {uploading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          ) : (
            <ImagePlus size={22} />
          )}
        </button>
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          onSelect(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
