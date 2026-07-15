"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  Check,
  ChevronRight,
  ExternalLink,
  FileX,
  MessageCircle,
  Pencil,
  Trash2,
  Undo2,
  UserRound,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatusStepper } from "@/components/StatusStepper";
import { FileGroup } from "@/components/applications/FileGroup";
import { generateLineReport } from "@/lib/line-report";
import { isExpiryAlert, todayStr, transitionEndDate, formatMonthDay } from "@/lib/application-alerts";
import { useApplications } from "@/lib/application-store";
import { uploadApplicationFile } from "@/lib/application-files";
import { createClient } from "@/lib/supabase/client";
import { deleteApplication, listApplicationFiles } from "../actions";
import { ApplicationEditDialog } from "./ApplicationEditDialog";
import { ApprovalSection } from "./ApprovalSection";
import { ORG_HONORIFICS } from "@/types/application";
import type { ApplicationFile, ApplicationFileKind } from "@/types/application";

export function ApplicationDetail({ id }: { id: string }) {
  const router = useRouter();
  const { applications, loaded, updateApplication, removeApplication } =
    useApplications();
  const [copied, setCopied] = useState<"apply" | null>(null);
  const [files, setFiles] = useState<ApplicationFile[]>([]);
  const [uploading, setUploading] = useState<ApplicationFileKind | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [messengerLink, setMessengerLink] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const app = applications.find((a) => a.id === id);
  const workerId = app?.workerId ?? null;

  useEffect(() => {
    let cancelled = false;
    listApplicationFiles(id).then((f) => {
      if (!cancelled) setFiles(f);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // 外国人のMessengerリンクを取得（許可処理で表示）
  useEffect(() => {
    if (!workerId) return;
    let cancelled = false;
    void createClient()
      .from("workers")
      .select("messenger_link")
      .eq("id", workerId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setMessengerLink((data as { messenger_link: string }).messenger_link ?? "");
      });
    return () => {
      cancelled = true;
    };
  }, [workerId]);

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
  const cardReceived = app.status === "在留カード受領";
  const withdrawn = app.status === "取下げ";

  async function handleCopy(text: string, key: "apply") {
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

  // 在留カード受領: 画像登録後に押して完了状態にする
  function markCardReceived() {
    const today = new Date().toISOString().slice(0, 10);
    void updateApplication(id, {
      status: "在留カード受領",
      cardReceivedOn: today,
    });
  }

  // 申請取下げ（キャンセル）。誤操作は「元に戻す」で復帰できる
  function withdraw() {
    const today = new Date().toISOString().slice(0, 10);
    void updateApplication(id, { status: "取下げ", withdrawnOn: today });
    setWithdrawOpen(false);
  }

  function restoreWithdrawn() {
    void updateApplication(id, { status: "申請済", withdrawnOn: undefined });
  }

  // 誤登録の削除（画像も含めて完全に削除）
  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteApplication(id);
    if (result.ok) {
      removeApplication(id);
      router.push("/applications");
    } else {
      setDeleteError(result.message);
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  const alert = isExpiryAlert(app, todayStr());

  return (
    <div className="space-y-5">
      {alert && app.residenceExpiryAtApply && (
        <div className="flex items-center gap-2 rounded-xl border-2 border-seal bg-seal/10 px-3 py-2.5 text-sm font-bold text-seal">
          <FileX size={16} />
          申請時点の在留期限から1か月以上経過（
          {formatMonthDay(transitionEndDate(app.residenceExpiryAtApply))}で経過措置終了）し、まだ受取処理が済んでいません
        </div>
      )}
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
          <div className="flex shrink-0 items-center gap-1.5">
            <StatusBadge status={app.status} />
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              aria-label="申請情報を修正"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted"
            >
              <Pencil size={15} />
            </button>
          </div>
        </div>
        <div className="mt-4">
          {withdrawn ? (
            <p className="flex items-center gap-2 rounded-xl bg-seal/10 px-3 py-2.5 text-sm font-bold text-seal">
              <FileX size={16} />
              この申請は取下げ済みです（取下げ日: {app.withdrawnOn ?? "不明"}）
            </p>
          ) : (
            <StatusStepper current={app.status} />
          )}
        </div>
      </Card>

      {app.workerId && (
        <Card className="p-3.5">
          <Link href={`/workers/${app.workerId}`} className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <UserRound size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold text-muted">紐づく外国人</span>
              <span className="block truncate font-bold">{app.workerName ?? app.name}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </Link>
          {/* 氏名の下にメッセンジャーグループのリンクを表示 */}
          {messengerLink && (
            <a
              href={messengerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-brand"
            >
              <MessageCircle size={14} />
              Messengerグループを開く
              <ExternalLink size={12} />
            </a>
          )}
        </Card>
      )}

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold text-muted">基本情報</h3>
        <dl className="space-y-2.5 text-sm">
          <InfoRow label="所属機関" value={app.organizationName ?? "未設定"} />
          <InfoRow label="申請方法" value={`${app.method}申請`} />
          <InfoRow label="申請番号" value={app.applicationNumber || "未登録"} />
          <InfoRow label="申請日" value={app.applicationDate} />
          <InfoRow label="申請時点の在留期限" value={app.residenceExpiryAtApply ?? "未登録"} />
          <InfoRow label="許可日" value={app.approvalDate ?? "未許可"} />
          <InfoRow
            label="在留カード受領日"
            value={app.cardReceivedOn ?? "未受領"}
          />
          {app.withdrawnOn && <InfoRow label="取下げ日" value={app.withdrawnOn} />}
          <InfoRow label="申請取次士" value={app.isSelfApply ? "本人申請" : app.assignee} />
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

      {!withdrawn && (
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-muted">LINE報告文（申請）</h3>
          <div className="flex items-center gap-2">
            {app.organizationName && (
              <div className="flex rounded-lg border border-border p-0.5">
                {ORG_HONORIFICS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => void updateApplication(app.id, { reportOrgHonorific: h })}
                    className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                      (app.reportOrgHonorific ?? "御中") === h
                        ? "bg-brand text-brand-foreground"
                        : "text-muted"
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}
            {app.lineReported && (
              <span className="text-xs font-bold text-status-reported-fg">報告済み</span>
            )}
          </div>
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
      )}

      {!withdrawn && (
        <ApprovalSection
          app={app}
          files={files}
          uploading={uploading}
          onUpload={handleUpload}
          messengerLink={messengerLink}
          updateApplication={updateApplication}
        />
      )}

      {/* 許可情報を保存したら在留カード受領を記録して完了にできる */}
      {app.approved && !withdrawn && (
        <Card className="p-4">
          <Button
            variant={cardReceived ? "secondary" : "primary"}
            icon={<Check size={18} />}
            fullWidth
            onClick={markCardReceived}
            disabled={cardReceived}
          >
            {cardReceived
              ? `在留カード受領済（${app.cardReceivedOn}）`
              : "在留カードを受け取った（完了）"}
          </Button>
        </Card>
      )}

      {/* 取下げ・削除 */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold text-muted">取下げ・削除</h3>
        {deleteError && (
          <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {deleteError}
          </p>
        )}
        <div className="flex flex-col gap-2.5">
          {withdrawn ? (
            <Button
              variant="secondary"
              icon={<Undo2 size={18} />}
              fullWidth
              onClick={restoreWithdrawn}
            >
              取下げを元に戻す（申請済に戻る）
            </Button>
          ) : (
            <Button
              variant="secondary"
              icon={<FileX size={18} />}
              fullWidth
              onClick={() => setWithdrawOpen(true)}
            >
              申請を取り下げる
            </Button>
          )}
          <Button
            variant="seal"
            icon={<Trash2 size={18} />}
            fullWidth
            onClick={() => setDeleteOpen(true)}
          >
            この申請を削除する（誤登録の取り消し）
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          取下げ: 申請をキャンセルした記録として残します（元に戻せます）／
          削除: 画像も含めて完全に消します（元に戻せません）
        </p>
      </Card>

      {editOpen && (
        <ApplicationEditDialog
          app={app}
          onClose={() => setEditOpen(false)}
          onSave={(patch) => updateApplication(app.id, patch)}
        />
      )}

      <ConfirmDialog
        open={withdrawOpen}
        title="申請を取り下げる"
        message={`${app.name} さんの「${app.applicationContent}」を取下げ（キャンセル）扱いにします。記録は残り、あとから元に戻すこともできます。`}
        confirmLabel="取り下げる"
        onConfirm={withdraw}
        onCancel={() => setWithdrawOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="申請を削除"
        message={`${app.name} さんの「${app.applicationContent}」を、登録済みの画像も含めて完全に削除します。この操作は取り消せません。取下げの記録を残したい場合は「申請を取り下げる」を使ってください。`}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
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
