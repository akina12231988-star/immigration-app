"use client";

import { messengerWebUrl } from "@/lib/messenger-link";
import { useEffect, useState } from "react";
import Link from "next/link";
import { prepDocLabel, type PostApplyMailing, type PostApplyTask } from "@/lib/post-apply";
import { letterPackTrackingUrl } from "@/lib/application-prep";
import { useRouter } from "next/navigation";
import {
  ArrowDownCircle,
  Copy,
  Check,
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
import { DetailSection, scrollToDetailSection } from "@/components/applications/DetailSection";
import {
  applicationNextAction,
  approvalSummary,
  basicSummary,
  extraSummary,
  extraWarn,
  lineSummary,
  receiveSummary,
} from "@/lib/application-next-action";
import { generateLineReport } from "@/lib/line-report";
import { isExpiryAlert, todayStr, transitionEndDate, formatMonthDay } from "@/lib/application-alerts";
import { useApplications } from "@/lib/application-store";
import { uploadApplicationFile } from "@/lib/application-files";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import {
  listMailAfterApplyDocs,
  listOpenPostApplyTasks,
  listPostApplyMailingsForWorker,
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
import { OnlineReceiptSection } from "./OnlineReceiptSection";
import { receiptSlipFiles } from "@/lib/online-receipt";
import { ContractOrgFormSection } from "./ContractOrgFormSection";
import { EstimateSummarySection } from "./EstimateSummarySection";
import { ORG_HONORIFICS } from "@/types/application";
import type {
  ApplicationExtraRequest,
  ApplicationFile,
  ApplicationFileKind,
} from "@/types/application";

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
  // 追加資料の提出依頼（ExtraRequestSection が読み込んだもの）。見出しの要約と「今やること」に使う
  const [extraRows, setExtraRows] = useState<ApplicationExtraRequest[]>([]);

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
  // 申請準備の「申請後に入管へ郵送するリスト」に入れたタスク（済みでないもの）
  const [postTasks, setPostTasks] = useState<{ todo_no: string; task: PostApplyTask }[]>([]);
  // 入管へ郵送した追加資料の記録（投函日・追跡番号・書類）。郵送し終わったあとも見返せる
  const [postMailings, setPostMailings] = useState<{ todo_no: string; mailing: PostApplyMailing }[]>([]);
  useEffect(() => {
    if (!workerId) return;
    let cancelled = false;
    listMailAfterApplyDocs(createClient(), workerId)
      .then((docs) => {
        if (!cancelled) setMailDocs(docs);
      })
      .catch(() => undefined);
    listOpenPostApplyTasks(createClient(), workerId)
      .then((tasks) => {
        if (!cancelled) setPostTasks(tasks);
      })
      .catch(() => undefined);
    listPostApplyMailingsForWorker(createClient(), workerId)
      .then((rows) => {
        if (!cancelled) setPostMailings(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  // 氏名・進行状況・紐づく外国人のカードは、下へスクロールしても画面上部に固定する。
  // 上のヘッダー（sticky・戻るボタン付き）に重ならないよう、高さを測ってその真下に付ける
  const [stickyTop, setStickyTop] = useState(0);
  useEffect(() => {
    const measure = () => {
      const el = document.querySelector("header");
      if (el instanceof HTMLElement) setStickyTop(el.offsetHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // 氏名のコピー（入管サイト・Notionなどへの貼り付け用）
  const [nameCopied, setNameCopied] = useState(false);
  const copyName = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      setNameCopied(true);
      setTimeout(() => setNameCopied(false), 1500);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };

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

  // 折りたたみの見出しの要約と、上のヘッダーに出す「今やること」。
  // 今やる段階の折りたたみだけを最初から開く（段階が進むと開く枠も変わる）
  const extraOpen = extraRows.filter((r) => r.status !== "郵送済み").length;
  const extraDone = extraRows.length - extraOpen;
  const mailPending = mailDocs.length + postTasks.length;
  const next = applicationNextAction(app, { extraOpen, mailPending });
  const approval = approvalSummary(app);
  const subtitle = [app.applicationContent, `${app.method}申請`, app.organizationName]
    .filter((v): v is string => Boolean(v))
    .join("・");

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
    const message = file.fromWorker
      ? `「${file.fileName}」は外国人詳細の在留カード・指定書で登録した画像です。削除すると外国人詳細からも消えます。削除しますか？`
      : `「${file.fileName}」を削除しますか？（外国人詳細の在留カード・指定書の履歴からも消えます）`;
    if (!confirm(message)) return;
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
      // 転職の申請準備で入れた「申請準備の所属機関（転職先）」は、
      // 現在の所属機関に反映した時点で役目を終えるので消す
      if (currentOrgId === app.organizationId) {
        await updateWorker(supabase, app.workerId, {
          application_prep_organization_id: null,
        });
        return;
      }
      await updateWorker(supabase, app.workerId, {
        current_organization_id: app.organizationId,
        application_prep_organization_id: null,
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
    <div className="space-y-4">
      {alert && app.residenceExpiryAtApply && (
        <div className="flex items-center gap-2 rounded-xl border-2 border-seal bg-seal/10 px-3 py-2.5 text-sm font-bold text-seal">
          <FileX size={16} />
          申請時点の在留期限から1か月以上経過（
          {formatMonthDay(transitionEndDate(app.residenceExpiryAtApply))}で経過措置終了）し、まだ受取処理が済んでいません
        </div>
      )}

      {/* 下へスクロールしても誰の申請か・進行状況・今やることが見えるよう、
          ヘッダー（戻るボタン）の真下に固定する。ヘッダーは z-20 なのでそれより下に置く */}
      <div className="sticky z-10 -mx-4 bg-background px-4 pb-2" style={{ top: stickyTop }}>
        <Card className="p-4 shadow-md">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 text-xl font-bold">
                <span className="min-w-0 select-text break-words">{app.name}</span>
                <button
                  type="button"
                  onClick={() => void copyName(app.name)}
                  aria-label="氏名をコピー"
                  className="shrink-0 text-muted hover:text-brand"
                >
                  {nameCopied ? (
                    <Check size={16} className="text-status-reported-fg" />
                  ) : (
                    <Copy size={16} />
                  )}
                </button>
              </h2>
              <p className="text-xs text-muted sm:text-sm">{subtitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <StatusBadge status={app.status} />
              {/* 編集はここ1か所（申請の基本情報とオンライン申請の受付メールの内容をまとめて直す） */}
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground"
              >
                <Pencil size={16} />
                編集
              </button>
            </div>
          </div>
          {(app.workerId || messengerLink) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {app.workerId && (
                <Link
                  href={`/workers/${app.workerId}`}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-border px-3 text-xs font-bold text-brand"
                >
                  <UserRound size={13} />
                  外国人詳細{app.workerName && app.workerName !== app.name ? `（${app.workerName}）` : ""}
                </Link>
              )}
              {messengerLink && (
                <a
                  href={messengerWebUrl(messengerLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-border px-3 text-xs font-bold text-brand"
                >
                  <MessageCircle size={13} />
                  Messengerグループ
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
          )}
          <div className="mt-3">
            {withdrawn ? (
              <p className="flex items-center gap-2 rounded-xl bg-seal/10 px-3 py-2.5 text-sm font-bold text-seal">
                <FileX size={16} />
                この申請は取下げ済みです（取下げ日: {app.withdrawnOn ?? "不明"}）
              </p>
            ) : (
              <StatusStepper current={app.status} />
            )}
          </div>
          {/* 今やること（今やる段階の折りたたみへ飛べる） */}
          <div
            className={`mt-3 rounded-xl border px-3 py-2 ${
              next.done ? "border-brand/30 bg-brand/5" : "border-seal/30 bg-seal/5"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-bold ${next.done ? "text-brand" : "text-seal"}`}>
                {next.done ? "状態" : "今やること"}
              </span>
              <button
                type="button"
                onClick={() => scrollToDetailSection(`section-${next.section}`)}
                className="inline-flex min-h-[30px] shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3 text-xs font-bold text-brand"
              >
                <ArrowDownCircle size={13} />
                開く
              </button>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed sm:text-sm">{next.text}</p>
          </div>
        </Card>
      </div>

      {/* 段階ごとの折りたたみ。閉じていても見出しに要約が出る */}
      <Card className="overflow-hidden">
        <DetailSection
          id="section-basic"
          title="申請の基本情報・画像"
          summary={basicSummary(app, files.length)}
          open={next.section === "basic"}
        >
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <InfoRow label="所属機関" value={app.organizationName ?? "未設定"} />
            <InfoRow label="申請方法" value={`${app.method}申請`} />
            <InfoRow label="申請番号" value={app.applicationNumber || "未登録"} />
            <InfoRow label="申請日" value={app.applicationDate} />
            <InfoRow label="申請時点の在留期限" value={app.residenceExpiryAtApply ?? "未登録"} />
            <InfoRow label="許可日" value={app.approvalDate ?? "未許可"} />
            <InfoRow label="在留カード受領日" value={app.cardReceivedOn ?? "未受領"} />
            {app.withdrawnOn && <InfoRow label="取下げ日" value={app.withdrawnOn} />}
            <InfoRow label="申請取次士" value={app.isSelfApply ? "本人申請" : app.assignee} />
            <InfoRow label="登録日時" value={new Date(app.createdAt).toLocaleString("ja-JP")} />
            <InfoRow label="更新日時" value={new Date(app.updatedAt).toLocaleString("ja-JP")} />
          </dl>
          {/* オンライン申請の受付メール（1通目: 申請種別・整理番号、2通目: 申請受付仮番号など、3通目: 申請受付番号）。届いた順に入れる */}
          {app.method === "オンライン" && (
            <OnlineReceiptSection
              app={app}
              files={files}
              uploading={uploading}
              canEdit={!withdrawn}
              messengerLink={messengerLink}
              onUpload={(kind, list) => void handleUpload(kind, list)}
              onDeleteFile={(f) => void handleDeleteFile(f)}
            />
          )}
          <h4 className="mb-2 mt-4 text-xs font-bold text-muted">画像</h4>
          {uploadError && (
            <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
              {uploadError}
            </p>
          )}
          <div className="space-y-4">
            {/* オンライン申請は3通目（申請受付番号のお知らせ）のスクリーンショットが受付票になる。
                ここで追加した画像も3通目のスクリーンショットとして残し、受付メールの欄と同じものを出す */}
            <FileGroup
              label={app.method === "オンライン" ? "受付票（3通目のメールのスクリーンショット）" : "受付票"}
              hint={app.method === "オンライン" ? "上の「2通目・3通目 申請受付番号のお知らせ」のスクリーンショットと同じものです" : undefined}
              files={receiptSlipFiles(app.method, files)}
              uploading={uploading === (app.method === "オンライン" ? "受付番号メール" : "受付票")}
              multiple={app.method === "オンライン"}
              onSelect={(list) => handleUpload(app.method === "オンライン" ? "受付番号メール" : "受付票", list)}
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
        </DetailSection>

        {!withdrawn && (
          <DetailSection
            id="section-line"
            title="LINE報告文（申請）"
            summary={lineSummary(app)}
            warn={!app.lineReported}
            open={next.section === "line"}
            actions={
              <button
                type="button"
                onClick={() => void handleCopy(lineReportText, "apply")}
                className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-xs font-bold text-brand"
              >
                {copied === "apply" ? <Check size={13} /> : <Copy size={13} />}
                {copied === "apply" ? "コピーしました" : "コピー"}
              </button>
            }
          >
            {app.organizationName && (
              <div className="mb-2 flex items-center gap-2 text-xs text-muted">
                所属機関の敬称
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
              </div>
            )}
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
          </DetailSection>
        )}

        {/* 審査中に入管から来た追加資料の提出依頼（書類/電話）と、申請後に入管へ郵送する書類・タスク */}
        <DetailSection
          id="section-extra"
          title="追加資料の提出依頼・入管へ郵送"
          summary={extraSummary({ extraOpen, extraDone, mailPending, mailings: postMailings.length })}
          warn={extraWarn({ extraOpen, mailPending })}
          open={next.section === "extra"}
        >
          {/* 申請準備で「申請後に入管へ郵送する」とした書類のアラート */}
          {mailPending > 0 && (
            <div className="mb-3 rounded-xl border-2 border-status-notice-fg bg-status-notice-bg/50 px-3 py-2.5">
              <p className="text-sm font-bold text-status-notice-fg">
                申請後に入管へ郵送する書類・タスクが{mailPending}件あります
              </p>
              <ul className="mt-1 list-disc pl-5 text-xs text-status-notice-fg/90">
                {mailDocs.map((d) => (
                  <li key={`${d.todo_no}-${d.doc_id}`}>入管へ郵送：{mailDocLabel(d)}</li>
                ))}
                {postTasks.map(({ todo_no, task }) => (
                  <li key={`${todo_no}-${task.id}`}>
                    タスク：{task.text}
                    {todo_no ? `（${todo_no}）` : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-status-notice-fg/80">
                発行され次第、入管へ郵送してください。郵送した・済んだものは、申請一覧の
                <Link href="/applications?view=post-apply" className="mx-0.5 font-bold underline">
                  「申請後の郵送・タスク」
                </Link>
                か申請準備の「申請後に入管へ郵送するリスト」で消し込むと、このアラートは消えます。
              </p>
            </div>
          )}
          <ExtraRequestSection
            applicationId={app.id}
            canEdit={!withdrawn}
            noticeFiles={files.filter((f) => f.kind === "追加資料通知")}
            uploading={uploading === "追加資料通知"}
            onUpload={(list) => handleUpload("追加資料通知", list)}
            onDeleteFile={handleDeleteFile}
            onRowsChange={setExtraRows}
          />
          {/* 入管へ郵送した追加資料の記録（申請準備・申請一覧で「入管へ郵送した」と記録したもの） */}
          {postMailings.length > 0 && (
            <div className="mt-3 rounded-xl border border-status-approved-fg/40 bg-status-approved-bg/40 px-3 py-2.5">
              <p className="text-sm font-bold text-status-approved-fg">
                入管へ郵送した追加資料（{postMailings.length}回の投函）
              </p>
              <ul className="mt-1 space-y-1 text-xs">
                {postMailings.map(({ todo_no, mailing }) => (
                  <li key={mailing.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-bold tabular-nums">{postedOnLabel(mailing.posted_on)} 投函</span>
                    <span className="text-muted">
                      追跡番号{" "}
                      {mailing.tracking ? (
                        <a
                          href={letterPackTrackingUrl(mailing.tracking)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold tabular-nums text-brand underline"
                        >
                          {mailing.tracking}
                        </a>
                      ) : (
                        "未入力"
                      )}
                    </span>
                    <span className="min-w-0 break-words">{mailing.doc_ids.map(prepDocLabel).join("・")}</span>
                    {todo_no && <span className="text-[11px] text-muted">（{todo_no}）</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-muted">
                記録の取り消し・追加は、申請一覧の「申請後の郵送・タスク」か申請準備の「申請後に入管へ郵送するリスト」で行います。
              </p>
            </div>
          )}
        </DetailSection>

        {!withdrawn && (
          <DetailSection
            id="section-approval"
            title="許可情報"
            summary={approval.text}
            warn={approval.warn}
            open={next.section === "approval"}
          >
            <ApprovalSection
              app={app}
              files={files}
              uploading={uploading}
              onUpload={handleUpload}
              onDeleteFile={handleDeleteFile}
              messengerLink={messengerLink}
              updateApplication={updateApplication}
            />
          </DetailSection>
        )}

        {/* 許可情報を保存したら在留カード受領を記録して完了にできる。
            受領後は契約機関に関する届出（参考様式1の5）の Excel を作れる */}
        {!withdrawn && (
          <DetailSection
            id="section-receive"
            title="在留カードの受領・届出（1の5）"
            summary={receiveSummary(app)}
            open={next.section === "receive"}
          >
            {!app.approved && !cardReceived && (
              <p className="rounded-xl bg-background p-3 text-xs leading-relaxed text-muted">
                上の「許可情報」で許可の通知を記録して保存すると、ここで在留カードの受け取りを記録できます。
              </p>
            )}
            {app.approved && !cardReceived && (
              <Button
                variant="primary"
                icon={<Check size={18} />}
                fullWidth
                onClick={() => void markCardReceived()}
              >
                在留カードを受け取った（完了）
              </Button>
            )}
            {orgLinkNotice && (
              <p className="mt-2 rounded-lg bg-brand/10 px-3 py-2 text-xs font-bold text-brand">{orgLinkNotice}</p>
            )}
            {cardReceived && (
              <div className="space-y-3">
                <p className="text-xs text-muted">
                  在留カード受領日: <span className="font-bold text-foreground">{app.cardReceivedOn ?? "未入力"}</span>
                </p>
                {app.workerId ? (
                  <ContractOrgFormSection app={app} />
                ) : (
                  <p className="text-xs text-muted">外国人の登録とひも付いていないため、届出の Excel は作れません。</p>
                )}
              </div>
            )}
          </DetailSection>
        )}

        {/* 申請準備の詳細で作った見積書の内容（収入印紙代の負担を選んでいるときだけ出る） */}
        {!withdrawn && app.workerId && (
          <EstimateSummarySection app={app} open={next.section === "estimate"} />
        )}

        {/* 取下げ・削除 */}
        <DetailSection
          id="section-danger"
          title="取下げ・削除"
          summary="誤登録の取り消しはここから"
          danger
          open={next.section === "danger"}
        >
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
        </DetailSection>
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
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-1">
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-bold">{value}</dd>
    </div>
  );
}

// "2026-09-25" → "2026/9/25"（投函日の表記）
function postedOnLabel(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${m[1]}/${Number(m[2])}/${Number(m[3])}` : d || "日付未入力";
}
