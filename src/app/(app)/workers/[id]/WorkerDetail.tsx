"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  MessageCircle,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WorkerPhoto } from "@/components/workers/WorkerPhoto";
import { WorkerDocuments } from "@/components/workers/WorkerDocuments";
import { OnboardingDocuments } from "@/components/workers/OnboardingDocuments";
import { HealthCheckSection } from "@/components/workers/HealthCheckSection";
import { GensenDocuments } from "@/components/workers/GensenDocuments";
import { WorkerCertificateDocs } from "@/components/workers/WorkerCertificateDocs";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { WorkerForm } from "@/components/workers/WorkerForm";
import {
  HistoryFormDialog,
  type HistoryFormValues,
} from "@/components/workers/HistoryFormDialog";
import { SswGauge } from "@/components/workers/SswGauge";
import { SswStatusBadge, SupportBadge, WorkerStatusBadge } from "@/components/workers/badges";
import { calcSsw, entryDays, todayStr, ymdFullText } from "@/lib/ssw/calc";
import { createClient } from "@/lib/supabase/client";
import { notionAppUrl } from "@/lib/notion-link";
import { deleteWorker, updateWorker } from "@/lib/supabase/queries/workers";
import {
  deleteHistory,
  insertHistory,
  toCalcHistory,
  updateHistory,
} from "@/lib/supabase/queries/histories";
import { JobApplicationSection } from "@/components/workers/JobApplicationSection";
import { isCountedHistory, type WorkHistory } from "@/types/ssw";
import type { Application } from "@/types/application";
import type { Organization, WorkHistoryRow, WorkerInput, WorkerWithHistories } from "@/types/db";
import type { ApplicationWithRefs } from "@/lib/supabase/queries/jobs";
import type { PostingWithStats } from "@/lib/supabase/queries/postings";

export function WorkerDetail({
  worker,
  organizations,
  applications,
  jobApplications,
  postings,
  canEdit,
}: {
  worker: WorkerWithHistories;
  organizations: Organization[];
  applications: Application[];
  jobApplications: ApplicationWithRefs[];
  postings: PostingWithStats[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingHistory, setEditingHistory] = useState<WorkHistoryRow | null>(null);
  const [deletingHistory, setDeletingHistory] = useState<WorkHistoryRow | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 申請準備などから「詳細を入力する」で #edit 付きで来たら編集モーダルを自動で開く。
  // location.hash は SSR では読めないため（遅延初期化はハイドレーション不整合になる）、
  // マウント後の一度きりの副作用で開く。
  useEffect(() => {
    if (canEdit && typeof window !== "undefined" && window.location.hash === "#edit") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ブラウザ専用APIからの初期化
      setEditOpen(true);
    }
  }, [canEdit]);

  const today = todayStr();
  const calc = useMemo(
    () => calcSsw(worker.work_histories.map(toCalcHistory), today),
    [worker.work_histories, today],
  );

  const orgName = worker.current_organization_id
    ? (organizations.find((o) => o.id === worker.current_organization_id)?.name ?? "所属不明")
    : "未所属";

  // 職歴は開始日昇順で表示（calc と同じ並び）
  const histories = useMemo(
    () =>
      [...worker.work_histories].sort((a, b) => (a.start_date < b.start_date ? -1 : 1)),
    [worker.work_histories],
  );

  const handleUpdateWorker = async (input: WorkerInput) => {
    await updateWorker(createClient(), worker.id, input);
    setEditOpen(false);
    router.refresh();
  };

  const handleDeleteWorker = async () => {
    setDeleting(true);
    try {
      await deleteWorker(createClient(), worker.id);
      router.push("/workers");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const handleSubmitHistory = async (values: HistoryFormValues) => {
    const supabase = createClient();
    if (editingHistory) {
      await updateHistory(supabase, editingHistory.id, values);
    } else {
      await insertHistory(supabase, { ...values, worker_id: worker.id });
    }
    router.refresh();
  };

  const handleDeleteHistory = async () => {
    if (!deletingHistory) return;
    setHistoryBusy(true);
    try {
      await deleteHistory(createClient(), deletingHistory.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setHistoryBusy(false);
      setDeletingHistory(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* 基本情報 */}
      <Card className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <WorkerPhoto workerId={worker.id} photoPath={worker.photo_path} canEdit={canEdit} />
            <div className="min-w-0">
              <p className="text-lg font-black">
                {worker.name}
                {worker.worker_code && (
                  <span className="ml-2 align-middle text-xs font-bold text-brand">
                    ID {worker.worker_code}
                  </span>
                )}
              </p>
              {worker.kana && <p className="text-xs text-muted">{worker.kana}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {worker.messenger_link && (
                  <a
                    href={worker.messenger_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand"
                  >
                    <MessageCircle size={13} />
                    Messenger
                  </a>
                )}
                {worker.notion_link && (
                  <a
                    href={notionAppUrl(worker.notion_link)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand"
                  >
                    <ExternalLink size={13} />
                    Notion
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold"
              >
                <Pencil size={14} />
                編集
              </button>
            )}
            <Link
              href={`/workers/print?worker=${worker.id}`}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted"
            >
              <Printer size={14} />
              印刷
            </Link>
            <Link
              href={`/workers/${worker.id}/resume`}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted"
            >
              <FileText size={14} />
              履歴書
            </Link>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <WorkerStatusBadge status={worker.status} />
          <SswStatusBadge status={calc.status} />
          <SupportBadge support={worker.support} />
        </div>
        <p className="mb-1 text-[11px] font-bold text-muted">基本情報</p>
        <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <InfoItem label="国籍" value={worker.nationality} />
          <InfoItem label="生年月日" value={worker.birth} />
          <InfoItem label="性別" value={worker.gender} />
          <InfoItem label="住所" value={worker.address} />
          <InfoItem label="分野・職種" value={worker.field} />
          <InfoItem label="現在の所属機関" value={orgName} />
          <InfoItem label="専門級の合格名" value={worker.specialty_grade} />
          <InfoItem label="その他の資格・合格名" value={worker.other_qualifications} />
        </dl>
        <p className="mb-1 text-[11px] font-bold text-muted">在留情報</p>
        <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <InfoItem label="在留資格" value={worker.residence_status} />
          <InfoItem label="在留カード番号" value={worker.residence_card_no} />
          <InfoItem label="許可日" value={worker.residence_permit_date} />
          <InfoItem label="在留期限" value={worker.residence_expiry_date} />
          <InfoItem label="パスポート番号" value={worker.passport_no} />
          <InfoItem label="パスポート有効期限" value={worker.passport_expiry_date} />
        </dl>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <InfoItem label="健康状態" value={worker.health_note} wide />
          <InfoItem label="家族構成" value={worker.family_note} wide />
          <InfoItem label="備考" value={worker.note} wide />
        </dl>
      </Card>

      {/* 退職者情報（状態が退職のときのみ表示） */}
      {worker.status === "退職" && (
        <LeavingSection worker={worker} canEdit={canEdit} />
      )}

      {/* 在留カード・指定書の差し替え（履歴保持） */}
      <WorkerDocuments
        workerId={worker.id}
        canEdit={canEdit}
        histories={worker.work_histories}
      />

      {/* 外国人書類（合格証・パスポート・履歴書など）をPDF・画像で保存 */}
      <WorkerCertificateDocs workerId={worker.id} canEdit={canEdit} />

      {/* 入社書類メールで登録した添付データ（選択ダウンロード・Gmailリンク） */}
      <OnboardingDocuments workerId={worker.id} canEdit={canEdit} />

      <GensenDocuments workerId={worker.id} canEdit={canEdit} />

      <HealthCheckSection
        workerId={worker.id}
        initialExamOn={worker.health_check_on ?? null}
        canEdit={canEdit}
      />

      {/* 通算期間 */}
      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
          <CalendarClock size={16} />
          特定技能1号 通算期間
        </h2>
        <SswGauge calc={calc} />
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <InfoItem
            label="通算在留期間"
            value={calc.counted.length ? `${ymdFullText(calc.used)}（${calc.usedDays}日）` : null}
          />
          <InfoItem
            label="残り"
            value={calc.counted.length ? `${ymdFullText(calc.remain)}（${calc.remainDays}日）` : null}
          />
          <InfoItem label="起算日" value={calc.firstStart} />
          <InfoItem label="満了予定日" value={calc.expiry} />
        </dl>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          通算期間は日数合算による目安です（特定活動〔1号移行準備〕を含む）。正式な判断は出入国在留管理庁にご確認ください。
        </p>
      </Card>

      {/* 職歴 */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-muted">職歴（{histories.length}件）</h2>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setEditingHistory(null);
                setHistoryOpen(true);
              }}
              className="flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-brand-foreground"
            >
              <Plus size={14} />
              職歴を追加
            </button>
          )}
        </div>

        {histories.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted">
            職歴がまだ登録されていません
          </Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {histories.map((h) => {
              const counted = isCountedHistory({
                visa: h.visa,
                keptResidence: h.kept_residence_status,
              });
              const days = entryDays({ start: h.start_date, end: h.end_date }, today);
              return (
                <div key={h.id} className="p-3.5">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        counted
                          ? "bg-brand/10 text-brand"
                          : "bg-status-before-bg text-status-before-fg"
                      }`}
                    >
                      {h.visa}
                      {h.kept_residence_status && "（特定技能1号を保持）"}
                      {counted && " ★"}
                    </span>
                    {canEdit && (
                      <span className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          aria-label="職歴を編集"
                          onClick={() => {
                            setEditingHistory(h);
                            setHistoryOpen(true);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label="職歴を削除"
                          onClick={() => setDeletingHistory(h)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-seal"
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold tabular-nums">
                    {h.start_date} 〜 {h.end_date ?? "継続中"}
                    <span className="ml-2 text-xs font-medium text-muted">{days}日</span>
                  </p>
                  {(h.org_name || h.role) && (
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {[h.org_name, h.role].filter(Boolean).join(" ・ ")}
                    </p>
                  )}
                  {h.note && <p className="mt-0.5 truncate text-xs text-muted">{h.note}</p>}
                </div>
              );
            })}
          </Card>
        )}
        <p className="mt-2 text-[11px] text-muted">★ = 通算対象の在留資格</p>
      </section>

      {/* 申請書類用の通算（書類作成日時点・月は切り上げ） */}
      <DocumentTotalPanel histories={worker.work_histories.map(toCalcHistory)} />

      {/* 求職・応募（採用→所属自動更新の起点） */}
      <JobApplicationSection
        workerId={worker.id}
        applications={jobApplications}
        postings={postings}
        canEdit={canEdit}
      />

      {/* 入管申請（申請受付日・申請番号） */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-muted">
            <FileText size={14} />
            入管申請（{applications.length}件）
          </h2>
          {canEdit && (
            <Link
              href="/applications/new"
              className="text-xs font-bold text-brand"
            >
              申請を登録
            </Link>
          )}
        </div>
        {applications.length === 0 ? (
          <Card className="p-5 text-center text-sm text-muted">
            紐づく申請はありません。申請登録時に「外国人と紐づける」でこの人を選ぶとここに表示されます。
          </Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {applications.map((a) => (
              <Link
                key={a.id}
                href={`/applications/${a.id}`}
                className="flex items-center gap-3 p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <p className="truncate text-sm font-bold">
                      {a.applicationContent || "申請"}
                    </p>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="text-xs tabular-nums text-muted">
                    受付日 {a.applicationDate} ・ 申請番号{" "}
                    {a.applicationNumber || "未登録"}
                  </p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-muted" />
              </Link>
            ))}
          </Card>
        )}
      </section>

      {/* 削除 */}
      {canEdit && (
        <Button variant="seal" fullWidth icon={<Trash2 size={18} />} onClick={() => setDeleteOpen(true)}>
          この外国人を削除
        </Button>
      )}

      {/* 編集モーダル */}
      <Modal open={editOpen} title="基本情報を編集" onClose={() => setEditOpen(false)}>
        <WorkerForm
          initial={worker}
          organizations={organizations}
          submitLabel="更新する"
          onSubmit={handleUpdateWorker}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      <HistoryFormDialog
        open={historyOpen}
        initial={editingHistory}
        onClose={() => setHistoryOpen(false)}
        onSubmit={handleSubmitHistory}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="外国人を削除"
        message={`${worker.name} さんの基本情報と職歴${histories.length}件をすべて削除します。この操作は取り消せません。`}
        busy={deleting}
        onConfirm={handleDeleteWorker}
        onCancel={() => setDeleteOpen(false)}
      />

      <ConfirmDialog
        open={deletingHistory !== null}
        title="職歴を削除"
        message={
          deletingHistory
            ? `「${deletingHistory.visa} / ${deletingHistory.start_date}〜${deletingHistory.end_date ?? "継続中"}」を削除します。通算期間の計算にも反映されます。`
            : ""
        }
        busy={historyBusy}
        onConfirm={handleDeleteHistory}
        onCancel={() => setDeletingHistory(null)}
      />
    </div>
  );
}

function InfoItem({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string | null;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[11px] font-bold text-muted">{label}</dt>
      <dd className="whitespace-pre-wrap break-words">{value || "—"}</dd>
    </div>
  );
}

// 2つの日付（from<=to）の暦上の差を {months, days, totalDays} で返す
function monthsSpan(from: string, to: string): { months: number; days: number; totalDays: number } {
  const f = new Date(`${from}T00:00:00Z`);
  const t = new Date(`${to}T00:00:00Z`);
  let months = (t.getUTCFullYear() - f.getUTCFullYear()) * 12 + (t.getUTCMonth() - f.getUTCMonth());
  let days = t.getUTCDate() - f.getUTCDate();
  if (days < 0) {
    months -= 1;
    const prevMonthEnd = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0));
    days += prevMonthEnd.getUTCDate();
  }
  const totalDays = Math.round((t.getTime() - f.getTime()) / 86_400_000);
  return { months: Math.max(months, 0), days: Math.max(days, 0), totalDays: Math.max(totalDays, 0) };
}

// 申請書類用の通算: 最初の通算対象（特定技能1号・特定活動〔1号移行準備〕）の開始日から
// 書類作成日までの期間を数え、端数の月は1か月に切り上げて「◯年◯か月」を出す
function DocumentTotalPanel({ histories }: { histories: WorkHistory[] }) {
  const [docDate, setDocDate] = useState(todayStr());
  const [copied, setCopied] = useState(false);
  const calc = useMemo(() => calcSsw(histories, docDate), [histories, docDate]);

  const firstStart = calc.firstStart;
  const span = useMemo(
    () => (firstStart && docDate >= firstStart ? monthsSpan(firstStart, docDate) : null),
    [firstStart, docDate],
  );
  const totalMonths = span ? span.months : 0;
  // 1日でも端数があれば1か月に切り上げ
  const roundedMonths = span && span.days > 0 ? totalMonths + 1 : totalMonths;
  const shinsei = `${Math.floor(roundedMonths / 12)}年${roundedMonths % 12}か月`;
  const hasData = calc.counted.length > 0 && !!firstStart;

  const copy = async () => {
    const lines = calc.hist.map((h) => {
      const period = `${h.start}〜${h.end || "継続中"}`;
      const detail = [h.visa, h.org, h.role].filter(Boolean).join("　");
      return `${period}　${detail}`;
    });
    const text = `【職歴】\n${lines.join("\n")}\n\n【申請書記載】${shinsei}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };

  const INPUT =
    "min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
        <FileText size={16} />
        申請書類用の通算
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        最初の特定技能1号（通算対象）の開始日から書類作成日までを数えます（1日でも経過した月は1か月に切り上げ）。
      </p>
      {!hasData ? (
        <p className="rounded-xl bg-background p-4 text-center text-sm text-muted">
          特定技能1号の職歴がないため計算できません。
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">書類作成日</span>
            <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className={INPUT} />
          </label>
          <div className="rounded-xl bg-brand/10 p-3.5">
            <p className="text-xs font-bold text-muted">申請書記載</p>
            <p className="text-2xl font-black text-brand">
              {shinsei}
              <span className="ml-2 text-sm font-bold text-muted">（切り上げ・{roundedMonths}か月）</span>
            </p>
            <p className="mt-1 text-xs tabular-nums text-muted">
              起算日 {firstStart}
              {span && `　実際は ${Math.floor(span.months / 12)}年${span.months % 12}か月${span.days}日 ／ ${span.totalDays}日`}
            </p>
          </div>
          <Button
            variant="secondary"
            fullWidth
            icon={copied ? <Check size={15} /> : <Copy size={15} />}
            onClick={copy}
          >
            {copied ? "コピーしました" : "職歴と申請書記載をコピー"}
          </Button>
        </div>
      )}
    </Card>
  );
}

// 退職者情報: 退職日・区分・理由・退職元機関・Notion随時報告TODO番号を記録する。
// 退職＜随時報告＞ページで記録すると自動で転記される（ここでの手修正も可能）。
function LeavingSection({
  worker,
  canEdit,
}: {
  worker: WorkerWithHistories;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [leavingOn, setLeavingOn] = useState(worker.leaving_on ?? "");
  const [leavingTodo, setLeavingTodo] = useState(worker.leaving_todo ?? "");
  const [leavingKind, setLeavingKind] = useState(worker.leaving_kind ?? "");
  const [leavingReason, setLeavingReason] = useState(worker.leaving_reason ?? "");
  const [leavingOrgName, setLeavingOrgName] = useState(worker.leaving_org_name ?? "");
  const [leavingOrgAddress, setLeavingOrgAddress] = useState(worker.leaving_org_address ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateWorker(createClient(), worker.id, {
        leaving_on: leavingOn || null,
        leaving_todo: leavingTodo.trim(),
        leaving_kind: leavingKind,
        leaving_reason: leavingReason.trim(),
        leaving_org_name: leavingOrgName.trim(),
        leaving_org_address: leavingOrgAddress.trim(),
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const INPUT =
    "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

  if (!canEdit) {
    return (
      <Card className="p-4">
        <p className="mb-2 text-[11px] font-bold text-muted">退職者情報</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <InfoItem label="退職日" value={worker.leaving_on} />
          <InfoItem label="Notion 随時報告TODO番号" value={worker.leaving_todo} />
          <InfoItem label="退職区分" value={worker.leaving_kind} />
          <InfoItem label="退職理由" value={worker.leaving_reason} />
          <InfoItem label="退職した所属機関" value={worker.leaving_org_name} />
          <InfoItem label="同・住所" value={worker.leaving_org_address} />
        </dl>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <p className="mb-2 text-sm font-bold">退職者情報</p>
      {error && <p className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">退職日</span>
          <input
            type="date"
            value={leavingOn}
            onChange={(e) => {
              setLeavingOn(e.target.value);
              setSaved(false);
            }}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">Notion 随時報告TODO番号</span>
          <input
            value={leavingTodo}
            onChange={(e) => {
              setLeavingTodo(e.target.value);
              setSaved(false);
            }}
            placeholder="例: TODO-1234"
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">退職区分</span>
          <select
            value={leavingKind}
            onChange={(e) => {
              setLeavingKind(e.target.value);
              setSaved(false);
            }}
            className={INPUT}
          >
            <option value="">未設定</option>
            <option value="会社都合">会社都合</option>
            <option value="自己都合">自己都合</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">退職理由</span>
          <input
            value={leavingReason}
            onChange={(e) => {
              setLeavingReason(e.target.value);
              setSaved(false);
            }}
            placeholder="わかれば入力"
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">退職した所属機関</span>
          <input
            value={leavingOrgName}
            onChange={(e) => {
              setLeavingOrgName(e.target.value);
              setSaved(false);
            }}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">同・住所</span>
          <input
            value={leavingOrgAddress}
            onChange={(e) => {
              setLeavingOrgAddress(e.target.value);
              setSaved(false);
            }}
            className={INPUT}
          />
        </label>
      </div>
      <Button fullWidth className="mt-3" disabled={busy} onClick={save}>
        {busy ? "保存中…" : saved ? "保存しました" : "退職者情報を保存"}
      </Button>
    </Card>
  );
}
