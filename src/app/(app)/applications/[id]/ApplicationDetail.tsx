"use client";

import { messengerWebUrl } from "@/lib/messenger-link";
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
import { notionAppUrl } from "@/lib/notion-link";
import { useApplications } from "@/lib/application-store";
import { uploadApplicationFile } from "@/lib/application-files";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import {
  listMailAfterApplyDocs,
  type MailAfterApplyDoc,
} from "@/lib/supabase/queries/application-prep";
import { PREP_DOC_DEFS } from "@/lib/application-prep";
import {
  deleteApplication,
  deleteApplicationFile,
  listApplicationFiles,
} from "../actions";
import { ApplicationEditDialog } from "./ApplicationEditDialog";
import { ApprovalSection } from "./ApprovalSection";
import { ExtraRequestSection } from "./ExtraRequestSection";
import { ContractOrgFormSection } from "./ContractOrgFormSection";
import { SalesEntrySection } from "./SalesEntrySection";
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
  // 在留カード受領で外国人の現在の所属機関を更新したときの知らせ
  const [orgLinkNotice, setOrgLinkNotice] = useState<string | null>(null);

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

  // 申請準備で「申請後に入管へ郵送する」とした書類のアラート
  const [mailDocs, setMailDocs] = useState<MailAfterApplyDoc[]>([]);
  useEffect(() => {
    if (!workerId) return;
    let cancelled = false;
    listMailAfterApplyDocs(createClient(), workerId)
      .then((docs) => {
        if (!cancelled) setMailDocs(docs);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workerId]);
  const mailDocLabel = (d: MailAfterApplyDoc) => {
    const label = PREP_DOC_DEFS.find((def) => def.id === d.doc_id)?.label ?? d.doc_id;
    return d.todo_no ? `${label}（${d.todo_no}）` : label;
  };

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

  // 誤ってアップロードした画像の削除（在留カード・指定書）
  async function handleDeleteFile(file: ApplicationFile) {
    if (!confirm(`「${file.fileName}」を削除しますか？`)) return;
    setUploadError(null);
    const res = await deleteApplicationFile(file.id);
    if (res.ok) {
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } else {
      setUploadError(res.message);
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

  // 在留カード受領: 画像登録後に押して完了状態にする。
  // 許可が下りて在留カードを受け取った時点でその会社で働き始めるため、
  // 申請の所属機関を外国人の「現在の所属機関」に反映する（転職・新規のどちらも）。
  // 雇用開始日も分かっていれば一緒に入れる（外国人詳細から直せる）
  async function markCardReceived() {
    const today = new Date().toISOString().slice(0, 10);
    void updateApplication(id, {
      status: "在留カード受領",
      cardReceivedOn: today,
    });
    if (!app?.workerId || !app.organizationId) return;
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("workers")
        .select("current_organization_id")
        .eq("id", app.workerId)
        .maybeSingle();
      const currentOrgId =
        (data as { current_organization_id: string | null } | null)?.current_organization_id ??
        null;
      if (currentOrgId === app.organizationId) return;
      await updateWorker(supabase, app.workerId, {
        current_organization_id: app.organizationId,
        ...(app.employmentStartOn ? { employment_start_on: app.employmentStartOn } : {}),
      });
      setOrgLinkNotice(
        `外国人の現在の所属機関を「${app.organizationName ?? "この申請の所属機関"}」に更新しました。`,
      );
      router.refresh();
    } catch (err) {
      // 所属機関の反映に失敗しても受領の記録は残す（外国人詳細から直せる）
      setOrgLinkNotice(
        `所属機関の反映に失敗しました（${
          err instanceof Error ? err.message : "エラー"
        }）。外国人詳細から変更してください。`,
      );
    }
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

      {/* 申請準備で「申請後に入管へ郵送する」とした書類のアラート */}
      {mailDocs.length > 0 && (
        <div className="rounded-xl border-2 border-status-notice-fg bg-status-notice-bg/50 px-3 py-2.5">
          <p className="text-sm font-bold text-status-notice-fg">
            申請後に入管へ郵送する書類が{mailDocs.length}件あります
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-status-notice-fg/90">
            {mailDocs.map((d) => (
              <li key={`${d.todo_no}-${d.doc_id}`}>{mailDocLabel(d)}</li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-status-notice-fg/80">
            発行され次第、入管へ郵送してください。郵送したら申請準備のチェックリストで「申請後に郵送する」のチェックを外すと、このアラートは消えます。
          </p>
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
              href={messengerWebUrl(messengerLink)}
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
            onDelete={handleDeleteFile}
          />
          <FileGroup
            label="通知書"
            hint="登録すると状態が「通知書到着」に進みます"
            files={files.filter((f) => f.kind === "通知書")}
            uploading={uploading === "通知書"}
            onSelect={(list) => handleUpload("通知書", list)}
            onDelete={handleDeleteFile}
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

      {/* 審査中に入管から来た追加資料の提出依頼（書類/電話）。レターパックで送ったら完了 */}
      <ExtraRequestSection
        applicationId={app.id}
        canEdit={!withdrawn}
        noticeFiles={files.filter((f) => f.kind === "追加資料通知")}
        uploading={uploading === "追加資料通知"}
        onUpload={(list) => handleUpload("追加資料通知", list)}
        onDeleteFile={handleDeleteFile}
      />

      {!withdrawn && (
        <ApprovalSection
          app={app}
          files={files}
          uploading={uploading}
          onUpload={handleUpload}
          onDeleteFile={handleDeleteFile}
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
            onClick={() => void markCardReceived()}
            disabled={cardReceived}
          >
            {cardReceived
              ? `在留カード受領済（${app.cardReceivedOn}）`
              : "在留カードを受け取った（完了）"}
          </Button>

          {orgLinkNotice && (
            <p className="mt-2 rounded-lg bg-brand/10 px-3 py-2 text-xs font-bold text-brand">
              {orgLinkNotice}
            </p>
          )}

          {/* 受領後は Notion の在籍履歴にも登録するよう案内 */}
          {cardReceived && (
            <div className="mt-3 rounded-xl border border-border bg-background p-3">
              <p className="mb-2 text-xs leading-relaxed text-muted">
                在留カードを受け取りました。Notion の在籍履歴にも登録してください。
              </p>
              <a
                href={notionAppUrl(
                  "https://app.notion.com/p/24c29d7ae649802692f5f920c897f9f9?v=24c29d7ae649802f8fb6000c304654d9&source=copy_link",
                )}
                className="flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-foreground"
              >
                <ExternalLink size={16} />
                Notion 在籍履歴を開いて登録する
              </a>
            </div>
          )}
        </Card>
      )}

      {/* 在留カード受領後: 契約機関に関する届出（参考様式1の5）の作成 */}
      {app.approved && !withdrawn && cardReceived && app.workerId && (
        <ContractOrgFormSection app={app} />
      )}

      {/* 在留カード受領後: freee販売への売上登録の明細を作る */}
      {app.approved && !withdrawn && cardReceived && <SalesEntrySection app={app} />}

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
