"use client";

import { messengerWebUrl } from "@/lib/messenger-link";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardList,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  FolderOpen,
  MessageCircle,
  Pencil,
  Plus,
  Printer,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WorkerPhoto } from "@/components/workers/WorkerPhoto";
import { FieldJumpSearch } from "@/components/workers/FieldJumpSearch";
import { WorkerDocuments } from "@/components/workers/WorkerDocuments";
import { WorkerEmploymentInsurance } from "@/components/workers/WorkerEmploymentInsurance";
import { WorkerFollowups } from "@/components/workers/WorkerFollowups";
import { WorkerInsuranceCards } from "@/components/workers/WorkerInsuranceCards";
import { OnboardingDocuments } from "@/components/workers/OnboardingDocuments";
import { HealthCheckSection } from "@/components/workers/HealthCheckSection";
import { GensenDocuments } from "@/components/workers/GensenDocuments";
import { WorkerCertDocRows } from "@/components/workers/WorkerCertDocRows";
import { CopyButton } from "@/components/ui/CopyButton";
import { CertExamList } from "@/components/workers/CertExamList";
import {
  NIHONGO_EXAM_NAME_OPTIONS,
  SENMONGAI_EXAM_NAME_OPTIONS,
} from "@/lib/cert-exam-options";
import { Jisshu2Section } from "@/components/workers/Jisshu2Section";
import { WorkerContracts } from "@/components/workers/WorkerContracts";
import { WorkerTodoLinks } from "@/components/workers/WorkerTodoLinks";
import { WorkerAddressHistory } from "@/components/workers/WorkerAddressHistory";
import { WorkerDependents } from "@/components/workers/WorkerDependents";
import { WorkerEmploymentStarts } from "@/components/workers/WorkerEmploymentStarts";
import { WorkerSalesResignation } from "@/components/workers/WorkerSalesResignation";
import { WorkerPermitSalesNos } from "@/components/workers/WorkerPermitSalesNos";
import { WorkerWages } from "@/components/workers/WorkerWages";
import { WorkerRecurringSales } from "@/components/workers/WorkerRecurringSales";
import { NotionTransferButton } from "@/components/workers/NotionTransferButton";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  FieldJobSelect,
  IMPORT_FIELD_LABELS,
  RelativesEditor,
} from "@/components/workers/WorkerForm";
import { ResidenceCardDialog } from "@/components/workers/ResidenceCardDialog";
import { PassportMrzPanel, SavedMrzCopyList } from "@/components/workers/PassportMrzPanel";
import { WorkerPassportTravel } from "@/components/workers/WorkerPassportTravel";
import {
  HistoryFormDialog,
  type HistoryFormValues,
} from "@/components/workers/HistoryFormDialog";
import { SswGauge } from "@/components/workers/SswGauge";
import { SswStatusBadge, SupportBadge, WorkerStatusBadge } from "@/components/workers/badges";
import {
  calcDocumentTotal,
  calcSsw,
  entryDays,
  sswGaps,
  toYMD,
  todayStr,
  ymdFullText,
  type SswGap,
} from "@/lib/ssw/calc";
import { isSswInsuranceRenewalTarget, remainingLabel } from "@/lib/worker-alerts";
import { orgStaffLabel } from "@/lib/organization-intake";
import { createClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import { notionAppUrl } from "@/lib/notion-link";
import { deleteWorker, updateWorker } from "@/lib/supabase/queries/workers";
import {
  deleteHistory,
  insertHistory,
  toCalcHistory,
  updateHistory,
} from "@/lib/supabase/queries/histories";
import { JobApplicationSection } from "@/components/workers/JobApplicationSection";
import { warekiDate } from "@/lib/dependents";
import { fileLinkCopyPath, isWebFileLink } from "@/lib/file-link";
import { formatStorageNo } from "@/lib/custody";
import { filledFieldCount, overwrittenFields, type FieldChange } from "@/lib/field-overwrite";
import {
  buildUpdatePayload,
  changedFieldCount,
  workerFieldString,
} from "@/lib/worker-inline-edit";
import { employmentStartPatch, type EnrollPatch } from "@/lib/worker-support";
import {
  RESIDENCE_PERIODS,
  cardFaceDate,
  residencePeriodFromDates,
  workRestrictionLabel,
} from "@/lib/residence-card";
import { WORKER_SITUATIONS, autoSituation, situationDescription } from "@/lib/worker-situation";
import { isCountedHistory, type WorkHistory } from "@/types/ssw";
import type { Application } from "@/types/application";
import {
  RESIDENCE_STATUSES,
  SUPPORT_SCOPES,
  WORKER_STATUSES,
  type Organization,
  type WorkHistoryRow,
  type WorkerRelative,
  type WorkerWithHistories,
} from "@/types/db";
import type { ApplicationWithRefs } from "@/lib/supabase/queries/jobs";
import type { PostingWithStats } from "@/lib/supabase/queries/postings";

export function WorkerDetail({
  worker,
  organizations,
  applications,
  jobApplications,
  postings,
  custodyNo,
  canEdit,
}: {
  worker: WorkerWithHistories;
  organizations: Organization[];
  applications: Application[];
  jobApplications: ApplicationWithRefs[];
  postings: PostingWithStats[];
  custodyNo: number | null; // 預かり中の保管番号（預かっていなければ null）
  canEdit: boolean;
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingHistory, setEditingHistory] = useState<WorkHistoryRow | null>(null);
  const [deletingHistory, setDeletingHistory] = useState<WorkHistoryRow | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // その場編集。「編集」を押すと表示中の欄がそのまま入力欄になり、「保存」で直接保存する。
  // 下書き（draft）は項目名→入力中の文字列。保存時は現在の値から変わった項目だけ送る
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  // 在日親族は配列なので別で持つ（null = 触っていない）
  const [relativesDraft, setRelativesDraft] = useState<WorkerRelative[] | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);

  // 申請準備などから「詳細を入力する」で #edit 付きで来たら、その場編集を自動で始める。
  // location.hash は SSR では読めないため（遅延初期化はハイドレーション不整合になる）、
  // マウント後の一度きりの副作用で開く。
  useEffect(() => {
    if (canEdit && typeof window !== "undefined" && window.location.hash === "#edit") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ブラウザ専用APIからの初期化
      setEditing(true);
    }
  }, [canEdit]);

  // バッジと操作ボタンの列は、下へスクロールしても画面上部に固定する。
  // 上のヘッダー（sticky）の高さはページごとに違うため、測ってその真下に付ける
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

  const today = todayStr();
  const calc = useMemo(
    () => calcSsw(worker.work_histories.map(toCalcHistory), today),
    [worker.work_histories, today],
  );
  // 月単位の通算（1日でも在留した月は1か月）。申請書類用と同じ数え方の今日時点の値
  const monthTotal = useMemo(
    () => calcDocumentTotal(worker.work_histories.map(toCalcHistory), today),
    [worker.work_histories, today],
  );
  // 通算に数えていない期間（職歴の登録漏れに気づけるようにするための表示用）
  const gaps = useMemo(
    () => sswGaps(worker.work_histories.map(toCalcHistory), today),
    [worker.work_histories, today],
  );

  const currentOrg = worker.current_organization_id
    ? organizations.find((o) => o.id === worker.current_organization_id)
    : undefined;
  const orgName = worker.current_organization_id
    ? (currentOrg?.name ?? "所属不明")
    : "未所属";
  // 所属機関の支援責任者・支援担当者。会社・機関マスタで登録する
  const orgStaff = orgStaffLabel(currentOrg?.intake);

  // 現在の所属機関の雇用開始日（所属機関別の記録を優先し、無ければ既存の雇用開始年月日）
  const currentOrgStart =
    (worker.org_employment_starts ?? []).find(
      (s) => s.organization_id === worker.current_organization_id && s.start_on,
    )?.start_on ||
    worker.employment_start_on ||
    "";
  // 只今の状況が未入力のときに自動で表示する内容（現在のビザ＋いちばん新しい申請の審査中/許可）
  const autoSituationValue = autoSituation(worker.residence_status, applications[0] ?? null);

  // 特定技能総合保険の負担区分（現在の所属機関の設定）。
  // 外国人負担の場合は、本人が自己負担加入を希望したときだけリンク先・有効期限を表示する
  const insuranceBurden = currentOrg?.intake?.ssw_insurance_burden ?? "";
  const showInsuranceFields =
    insuranceBurden !== "外国人負担" || worker.ssw_insurance_self_join;
  const [selfJoinBusy, setSelfJoinBusy] = useState(false);
  const setSelfJoin = async (value: boolean) => {
    setSelfJoinBusy(true);
    setError(null);
    try {
      await updateWorker(createClient(), worker.id, { ssw_insurance_self_join: value });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSelfJoinBusy(false);
    }
  };

  // 所属機関と雇用開始日がそろっているのに「申請準備中」のまま止まっている人を、
  // このページを開いたときに在籍中（＋支援区分・只今の状況）へ直して保存する。
  // 前は保存したときにしか動かず、登録済みの人がずっと申請準備中のままだったため。
  // 直したことは下の案内で知らせる（黙って書き換えない）
  const [autoEnrolled, setAutoEnrolled] = useState<EnrollPatch | null>(null);
  const autoEnrollRan = useRef(false);
  useEffect(() => {
    if (!canEdit || autoEnrollRan.current) return;
    const auto = employmentStartPatch(
      worker.status,
      worker.residence_status,
      !!worker.current_organization_id,
      !!(worker.employment_start_on || currentOrgStart),
      worker.current_situation,
    );
    if (!auto) return;
    autoEnrollRan.current = true; // 失敗しても繰り返さない
    void updateWorker(createClient(), worker.id, auto)
      .then(() => {
        setAutoEnrolled(auto);
        router.refresh();
      })
      .catch(() => undefined); // 直せなくても詳細の表示は続ける
  }, [
    canEdit,
    worker.id,
    worker.status,
    worker.residence_status,
    worker.current_organization_id,
    worker.employment_start_on,
    worker.current_situation,
    currentOrgStart,
    router,
  ]);

  // 職歴は開始日昇順で表示（calc と同じ並び）
  const histories = useMemo(
    () =>
      [...worker.work_histories].sort((a, b) => (a.start_date < b.start_date ? -1 : 1)),
    [worker.work_histories],
  );

  // ---- その場編集の入力欄 ----

  const workerRecord = worker as unknown as Record<string, unknown>;
  const cur = (key: string) => workerFieldString(workerRecord, key);
  const val = (key: string) => draft[key] ?? cur(key);
  const setField = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  // 入力欄を出すか: 編集モードは全項目、閲覧モードは未記入の欄だけ（その場で埋められる）
  const showInput = (key: string) => canEdit && (editing || cur(key) === "");
  const dirty = changedFieldCount(draft, workerRecord) > 0 || relativesDraft !== null;

  // 閲覧モードの未記入欄は点線枠で「ここに入力できる」ことを示す。編集モードは実線
  const inputCls = (boxed = false) =>
    `mt-0.5 min-h-[36px] w-full rounded-lg border ${editing ? "" : "border-dashed "}border-border ${
      boxed ? "bg-surface" : "bg-background"
    } px-2.5 text-sm focus:border-brand focus:outline-none`;

  const textInput = (key: string, placeholder?: string, boxed = false) =>
    showInput(key) ? (
      <input
        value={val(key)}
        onChange={(e) => setField(key, e.target.value)}
        placeholder={placeholder ?? "未入力"}
        className={inputCls(boxed)}
      />
    ) : undefined;
  const dateInput = (key: string, boxed = false) =>
    showInput(key) ? (
      <input
        type="date"
        value={val(key)}
        onChange={(e) => setField(key, e.target.value)}
        className={inputCls(boxed)}
      />
    ) : undefined;
  const selectInput = (key: string, options: string[], boxed = false) =>
    showInput(key) ? (
      <select
        value={val(key)}
        onChange={(e) => setField(key, e.target.value)}
        className={inputCls(boxed)}
      >
        <option value="">未設定</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    ) : undefined;
  const textareaInput = (key: string, placeholder?: string, boxed = false) =>
    showInput(key) ? (
      <textarea
        rows={2}
        value={val(key)}
        onChange={(e) => setField(key, e.target.value)}
        placeholder={placeholder}
        className={`${inputCls(boxed)} min-h-[52px] py-2 leading-relaxed`}
      />
    ) : undefined;

  const save = async () => {
    setSaveBusy(true);
    setError(null);
    try {
      const payload = buildUpdatePayload(draft, workerRecord);
      // 氏名は必須（空にして保存すると各画面で誰か分からなくなる）
      if ("name" in payload && !payload.name) {
        setError("氏名は空にできません。");
        setSaveBusy(false);
        return;
      }
      if (relativesDraft !== null) payload.relatives = relativesDraft;
      // 所属機関と雇用開始日がそろったら、申請準備中の人は在籍中＋支援区分へ自動で進める
      // （状態・支援区分をこの保存で手で選んでいるときは、その選択を優先する）
      {
        const nextOrg =
          "current_organization_id" in payload
            ? payload.current_organization_id
            : worker.current_organization_id;
        const nextStart =
          "employment_start_on" in payload
            ? payload.employment_start_on
            : worker.employment_start_on || currentOrgStart;
        const auto =
          "status" in payload
            ? null // 状態を手で選んで保存したときは自動では進めない
            : employmentStartPatch(
                worker.status,
                "residence_status" in payload
                  ? payload.residence_status
                  : worker.residence_status,
                !!nextOrg,
                !!nextStart,
                "current_situation" in payload
                  ? payload.current_situation
                  : worker.current_situation,
              );
        if (auto) {
          payload.status = auto.status;
          if (!("support" in payload)) payload.support = auto.support;
          if (auto.current_situation && !("current_situation" in payload)) {
            payload.current_situation = auto.current_situation;
          }
        }
      }
      if (Object.keys(payload).length > 0) {
        await updateWorker(createClient(), worker.id, payload);
      }
      setDraft({});
      setRelativesDraft(null);
      setEditing(false);
      setApplied(null);
      router.refresh();
    } catch (err) {
      // 列が無いときは何を適用すればよいか案内する（新しい列から順に案内）
      setError(
        dbErrorMessage(
          err,
          "file_link" in draft ? "0127_worker_file_link.sql" : "0095_worker_passport_mrz.sql",
          "保存に失敗しました",
        ),
      );
    } finally {
      setSaveBusy(false);
    }
  };

  const cancelEdit = () => {
    setDraft({});
    setRelativesDraft(null);
    setEditing(false);
    setApplied(null);
  };

  // ---- 在留カード・パスポートMRZからの反映（下書きに入れて確認してから保存） ----

  const [cardOpen, setCardOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    fields: Record<string, string>;
    changes: FieldChange[];
    source: string;
  } | null>(null);

  // いま画面に出ている値（下書きがあれば下書き）を集める。上書き確認に使う
  const effectiveValues = (keys: string[]) => {
    const rec: Record<string, unknown> = {};
    for (const k of keys) rec[k] = val(k);
    return rec;
  };

  const applyImported = (source: string, fields: Record<string, string>) => {
    const count = filledFieldCount(effectiveValues(Object.keys(fields)), fields);
    setDraft((d) => ({ ...d, ...fields }));
    setEditing(true);
    setCardOpen(false);
    setPendingImport(null);
    setApplied(`${source}から${count}件を反映しました。内容を確かめて「保存」を押してください。`);
  };

  // 反映の要求を受ける。入っている値を書き換える項目があれば確認を先に出す
  const requestApply = (source: string, fields: Record<string, string>) => {
    const changes = overwrittenFields(effectiveValues(Object.keys(fields)), fields, IMPORT_FIELD_LABELS);
    if (changes.length > 0) {
      setPendingImport({ fields, changes, source });
      return;
    }
    applyImported(source, fields);
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

  // 変更がある間、各カードの下に出す保存ボタン（どこで入力しても押しやすいように）
  const saveBar = canEdit && dirty && (
    <Button fullWidth className="mt-3" disabled={saveBusy} onClick={save}>
      {saveBusy ? "保存中…" : editing ? "保存" : "入力した内容を保存"}
    </Button>
  );

  // 一覧に無い在留資格が登録済みの場合も選択肢に残す（消さない）
  const residenceStatusOptions =
    worker.residence_status &&
    !(RESIDENCE_STATUSES as readonly string[]).includes(worker.residence_status)
      ? [worker.residence_status, ...RESIDENCE_STATUSES]
      : [...RESIDENCE_STATUSES];
  const statusOptions =
    worker.status && !(WORKER_STATUSES as readonly string[]).includes(worker.status)
      ? [worker.status, ...WORKER_STATUSES]
      : [...WORKER_STATUSES];

  // 在留期間は許可年月日と満了日から自動計算（券面の下の欄に表示）。
  // 計算した期間と登録値が食い違うときは、どちらかの入力間違いに気付けるよう注意を出す
  const autoPeriod = residencePeriodFromDates(
    worker.residence_permit_date ?? "",
    worker.residence_expiry_date ?? "",
  );
  const periodMismatch =
    !!autoPeriod &&
    !!worker.residence_period.trim() &&
    worker.residence_period.normalize("NFKC").trim() !== autoPeriod;

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* 開いたときに状態を自動で直したときの案内（黙って書き換えたと思われないように出す） */}
      {autoEnrolled && (
        <p
          role="status"
          className="rounded-lg bg-status-approved-bg px-3 py-2 text-sm text-status-approved-fg"
        >
          所属機関と雇用開始日が登録されていたため、状態を「{autoEnrolled.status}」・支援区分を「
          {autoEnrolled.support}」
          {autoEnrolled.current_situation
            ? `・只今の状況を「${autoEnrolled.current_situation}」`
            : ""}
          に変更しました。違うときは「編集」から直してください。
        </p>
      )}

      {/* バッジと操作ボタン。下へスクロールしてもヘッダーの真下に固定する
          （編集モードでは保存・やめるが常に見える） */}
      <div
        className="sticky z-10 -mx-4 border-b border-border bg-background px-4 py-2 md:-mx-8 md:px-8 print:static"
        style={{ top: stickyTop }}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* 状態・支援区分の変更は「基本情報」の欄から（編集モードでその場で直せる） */}
              <WorkerStatusBadge status={worker.status} />
              <SswStatusBadge status={calc.status} />
              <SupportBadge support={worker.support} />
            </div>
            {/* 名前（上）・フリガナ（下）。下へスクロールしても誰の詳細を見ているか分かるように、
                固定されるこのバーの中に出す。長い名前でも省略せず折り返して全部見せる */}
            <div className="min-w-0">
              {/* 申請書類への転記用に、名前・フリガナはその場でコピーできる */}
              <p className="flex items-start gap-1 text-sm font-bold leading-snug">
                <span className="min-w-0 break-words">{worker.name}</span>
                {worker.name && (
                  <CopyButton value={worker.name} label="名前をコピー" size={13} className="mt-0.5" />
                )}
              </p>
              {worker.kana && (
                <p className="flex items-start gap-1 text-[11px] leading-snug text-muted">
                  <span className="min-w-0 break-words">{worker.kana}</span>
                  <CopyButton value={worker.kana} label="フリガナをコピー" size={12} />
                </p>
              )}
            </div>
            {/* 連絡・資料へのリンク。登録があるものだけボタンで出す
                （リンク先の登録・変更は「編集」で。ファイルは0127） */}
            {(worker.messenger_link || worker.notion_link || worker.file_link) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {worker.messenger_link && (
                  <a
                    href={messengerWebUrl(worker.messenger_link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-border bg-surface px-2 text-[11px] font-bold text-brand"
                  >
                    <MessageCircle size={12} />
                    Messenger
                  </a>
                )}
                {worker.notion_link && (
                  <a
                    href={notionAppUrl(worker.notion_link)}
                    className="inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-border bg-surface px-2 text-[11px] font-bold text-brand"
                  >
                    <ExternalLink size={12} />
                    Notion
                  </a>
                )}
                {worker.file_link &&
                  (isWebFileLink(worker.file_link) ? (
                    <a
                      href={worker.file_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-border bg-surface px-2 text-[11px] font-bold text-brand"
                    >
                      <FolderOpen size={12} />
                      ファイル
                    </a>
                  ) : (
                    /* パソコン上のフォルダはブラウザから直接開けないため、パスをコピーする */
                    <FileLinkCopyButton path={fileLinkCopyPath(worker.file_link)} />
                  ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {canEdit && editing ? (
              <>
                <button
                  type="button"
                  onClick={save}
                  disabled={saveBusy}
                  className="flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-brand-foreground disabled:opacity-50"
                >
                  <Check size={14} />
                  {saveBusy ? "保存中…" : "保存"}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saveBusy}
                  className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted"
                >
                  <X size={14} />
                  やめる
                </button>
              </>
            ) : (
              <>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
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
                {/* 履歴書・労働者名簿は上下に並べて、名前の表示に横幅を空ける */}
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/workers/${worker.id}/resume`}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted"
                  >
                    <FileText size={14} />
                    履歴書
                  </Link>
                  <Link
                    href={`/workers/${worker.id}/roster`}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted"
                  >
                    <ClipboardList size={14} />
                    労働者名簿
                  </Link>
                </div>
                {canEdit && <NotionTransferButton worker={worker} />}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 在留カード（実物のカードの項目順で表示） */}
      <Card className="p-4">
        {applied && (
          <p role="status" className="mb-3 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
            {applied}
          </p>
        )}
        {canEdit && (
          <p className="mb-2 text-[11px] text-muted">
            {editing
              ? "表示のまま直して、右上または各枠の下の「保存」を押してください。「やめる」で元に戻ります。"
              : "未記入の欄はそのまま入力して保存できます。入力済みの内容は右上の「編集」でその場で直せます。"}
          </p>
        )}

        {canEdit && (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => setCardOpen(true)}
              className="flex min-h-[32px] items-center gap-1 rounded-lg border border-brand px-2.5 text-[11px] font-bold text-brand"
            >
              <CreditCard size={12} />
              在留カードから入力
            </button>
          </div>
        )}

        {/* 実物の在留カードの券面に合わせた表示: ヘッダー → 氏名 → 生年月日・性別・国籍 →
            住居地 → 就労制限の有無 → 在留資格 → 満了日 → 番号 → 有効期限。右に顔写真。
            色も券面に合わせて固定（ダークモードでもカードは明るいまま） */}
        <div className="rounded-2xl border border-[#d9bc93] bg-gradient-to-br from-[#fdf2ea] via-[#fbe7dc] to-[#f7dcd1] p-3 text-[#101828]">
          <div className="mb-2 flex items-center justify-between gap-2 border-b-2 border-[#e3c9a8] pb-1.5">
            <div className="shrink-0">
              <p className="text-[11px] font-black leading-tight">日本国政府</p>
              <p className="text-[7px] font-bold leading-tight text-[#475467]">
                GOVERNMENT OF JAPAN
              </p>
            </div>
            <div className="min-w-0 text-center">
              <p className="text-base font-black leading-tight tracking-[0.25em]">在留カード</p>
              <p className="text-[7px] font-bold leading-tight tracking-widest text-[#475467]">
                RESIDENCE CARD
              </p>
            </div>
            {/* 実物の右上の金色のラベルの位置 */}
            <div className="shrink-0 rounded-sm bg-gradient-to-br from-[#d8b74a] via-[#c19a2e] to-[#a37f1d] px-2 py-0.5 text-[10px] font-black italic tracking-widest text-white">
              ISA
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div>
                <p className="text-[10px] font-bold text-[#33415c]">氏名 NAME</p>
                {editing && canEdit ? (
                  <div className="flex flex-col gap-1.5">
                    <input
                      value={val("name")}
                      onChange={(e) => setField("name", e.target.value)}
                      placeholder="NGUYEN VAN A"
                      className={inputCls(true)}
                    />
                    <input
                      value={val("kana")}
                      onChange={(e) => setField("kana", e.target.value)}
                      placeholder="フリガナ（例: グエン バン アー）"
                      className={inputCls(true)}
                    />
                  </div>
                ) : (
                  <>
                    <p className="text-lg font-black">
                      {worker.name}
                      {/* 氏名を書類やメールに貼りやすいようにコピーできる */}
                      <CopyNameButton name={worker.name} />
                      {/* 原本を預かっていれば保管番号（押すと保管ボックスのその番号を開く） */}
                      {custodyNo != null && (
                        <Link
                          href={`/custody?no=${custodyNo}`}
                          className="ml-2 inline-flex align-middle rounded border-2 border-[#b7282e] px-1.5 text-xs font-black tabular-nums tracking-widest text-[#b7282e]"
                          title="原本を預かり中（保管ボックスを開く）"
                        >
                          {formatStorageNo(custodyNo)}
                        </Link>
                      )}
                    </p>
                    {worker.kana && <p className="text-xs text-[#475467]">{worker.kana}</p>}
                  </>
                )}
              </div>

              {/* スマホでは写真の横は狭いので、ここには生年月日・性別だけを置き、
                  縦に積む（横に並べると項目名が折り返してぎゅっと詰まる） */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <CardItem
                  onCard
                  label="生年月日 DATE OF BIRTH"
                  value={
                    worker.birth ? (
                      <>
                        {cardFaceDate(worker.birth) || worker.birth}
                        {/* 申請書類は和暦で書くため、西暦の下に和暦も出す */}
                        {warekiDate(worker.birth) && (
                          <span className="block text-[11px] font-normal text-[#475467]">
                            {warekiDate(worker.birth)}
                          </span>
                        )}
                      </>
                    ) : (
                      ""
                    )
                  }
                  edit={dateInput("birth", true)}
                />
                <CardItem
                  onCard
                  label="性別 SEX"
                  value={worker.gender}
                  edit={selectInput("gender", ["男", "女"], true)}
                />
              </div>
              <CardItem
                onCard
                label="国籍・地域 NATIONALITY/REGION"
                value={worker.nationality}
                edit={textInput("nationality", "例: ベトナム", true)}
              />
            </div>

            {/* 右: 顔写真。下にID・Messenger・Notion */}
            <div className="flex w-[104px] shrink-0 flex-col items-center gap-1">
              <WorkerPhoto
                workerId={worker.id}
                photoPath={worker.photo_path}
                canEdit={canEdit}
                size={96}
              />
              {worker.worker_code && (
                <span className="text-xs font-bold text-[#16325c]">ID {worker.worker_code}</span>
              )}
              {worker.messenger_link && (
                <a
                  href={messengerWebUrl(worker.messenger_link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#16325c]"
                >
                  <MessageCircle size={12} />
                  Messenger
                </a>
              )}
              {worker.notion_link && (
                <a
                  href={notionAppUrl(worker.notion_link)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#16325c]"
                >
                  <ExternalLink size={12} />
                  Notion
                </a>
              )}
            </div>
          </div>

          {/* 写真の下からは横幅いっぱいに使う（スマホで潰れないように） */}
          <div className="mt-2 flex flex-col gap-2">
            <CardItem
              onCard
              label="住居地 ADDRESS"
              value={worker.address}
              edit={textInput("address", "例: 熊本県熊本市中央区◯◯1-2-3", true)}
            />
            {/* 就労制限の有無は在留資格から自動表示（実物と同じ水色の帯） */}
            <div className="rounded-lg bg-[#cfe4f2]/80 px-2.5 py-1.5">
              <CardItem
                onCard
                label="就労制限の有無 WORK RESTRICTIONS"
                value={workRestrictionLabel(worker.residence_status)}
              />
            </div>
            <CardItem
              onCard
              label="在留資格 STATUS"
              value={worker.residence_status}
              edit={selectInput("residence_status", residenceStatusOptions, true)}
            />
            <CardItem
              onCard
              label="在留期間満了日 THE EXPIRY DATE OF THE PERIOD OF STAY"
              value={
                worker.residence_expiry_date ? (
                  <span className="tabular-nums underline underline-offset-2">
                    {cardFaceDate(worker.residence_expiry_date)}
                  </span>
                ) : (
                  ""
                )
              }
              edit={dateInput("residence_expiry_date", true)}
            />
            {/* 番号と有効期限は実物と同じ水色の帯にまとめる */}
            <div className="rounded-lg bg-[#cfe4f2]/80 px-2.5 py-1.5">
              <CardItem
                onCard
                label="番号 No."
                value={
                  worker.residence_card_no ? (
                    <span className="tabular-nums tracking-[0.25em]">
                      {worker.residence_card_no}
                    </span>
                  ) : (
                    ""
                  )
                }
                edit={textInput("residence_card_no", "AB12345678CD", true)}
              />
              <p className="mt-1.5 border-t border-[#a9c8de] pt-1.5 text-center text-xs">
                このカードは{" "}
                <span className="font-black tabular-nums underline underline-offset-2">
                  {cardFaceDate(worker.residence_expiry_date ?? "") || "—"}
                </span>{" "}
                まで有効 です。
              </p>
              <p className="text-center text-[7px] font-bold tracking-wider text-[#475467]">
                PERIOD OF VALIDITY OF THIS CARD
              </p>
            </div>
          </div>
        </div>

        {/* 券面に無いものはカードの下に: 連絡リンクの変更・住所歴 */}
        {editing && canEdit && (
          <div className="mt-2 flex flex-col gap-2">
            <CardItem
              label="Messenger グループ/個人リンク"
              value=""
              edit={textInput("messenger_link", "https://m.me/... または https://www.messenger.com/...", true)}
            />
            <CardItem
              label="Notion 個人ページのリンク"
              value=""
              edit={textInput("notion_link", "https://www.notion.so/... または https://app.notion.com/...", true)}
            />
            <CardItem
              label="資料ファイルのリンク（パソコン上のフォルダのパス、または https://... ）"
              value=""
              edit={textInput(
                "file_link",
                "/Users/◯◯/Documents/… や C:\\…、https://drive.google.com/... など",
                true,
              )}
            />
            <p className="text-[10px] leading-relaxed text-muted">
              パソコン上のフォルダはブラウザの決まりで直接開けないため、上部の「ファイル」ボタンを
              押すとパスがコピーされます（Finder の ⌘⇧G やエクスプローラーに貼り付けて開けます）。
              Mac のパスは、Finder でフォルダを右クリック → option キーを押しながら
              「…のパス名をコピー」で取れます。https:// のリンクはそのまま開きます。
            </p>
          </div>
        )}
        {/* 住所歴（転入日ごと）。最新はそのまま住居地へ反映される */}
        <div className="mt-2">
          <WorkerAddressHistory workerId={worker.id} canEdit={canEdit} embedded />
        </div>

        {/* 読取アプリの表示と同じく、券面の下に在留期間と許可。
            在留期間は許可年月日と満了日から自動計算する */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-sm font-black">
              在留期間 <span className="text-[10px] font-bold text-muted">Period of stay</span>
            </p>
            <div className="mt-1 rounded-xl bg-background px-3 py-2.5">
              <p className="text-lg font-black">
                {autoPeriod ?? (worker.residence_period || "—")}
              </p>
              {autoPeriod ? (
                <p className="mt-0.5 text-[10px] text-muted">
                  許可年月日と在留期間満了日から自動計算しています
                </p>
              ) : worker.residence_permit_date && worker.residence_expiry_date ? (
                <p className="mt-0.5 text-[10px] font-bold text-seal">
                  許可年月日と満了日の組み合わせから期間を計算できません。日付を確かめてください
                </p>
              ) : (
                <p className="mt-0.5 text-[10px] text-muted">
                  許可年月日と在留期間満了日を入れると自動計算します
                </p>
              )}
              {periodMismatch && (
                <p className="mt-0.5 text-[10px] font-bold text-seal">
                  登録済みの「{worker.residence_period}」と違います。日付か登録値を確かめてください
                </p>
              )}
              {/* 自動計算できないときの登録値。編集モードではいつでも直せる */}
              {showInput("residence_period") && (editing || !autoPeriod) && (
                <div className="mt-1.5">
                  <input
                    list="detail-residence-periods"
                    value={val("residence_period")}
                    onChange={(e) => setField("residence_period", e.target.value)}
                    placeholder="例: 1年"
                    autoComplete="off"
                    className={inputCls(true)}
                  />
                  <datalist id="detail-residence-periods">
                    {RESIDENCE_PERIODS.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                  <p className="mt-0.5 text-[10px] text-muted">
                    登録値（日付から計算できないときはこちらを表示します）
                  </p>
                </div>
              )}
            </div>
          </div>
          <div>
            <p className="text-sm font-black">
              許可 <span className="text-[10px] font-bold text-muted">Permission</span>
            </p>
            <div className="mt-1 rounded-xl bg-background px-3 py-2.5">
              <CardItem
                label="許可年月日 DATE OF PERMISSION"
                value={
                  cardFaceDate(worker.residence_permit_date ?? "") || worker.residence_permit_date
                }
                edit={dateInput("residence_permit_date", true)}
              />
            </div>
          </div>
        </div>
        {saveBar}
      </Card>

      {/* パスポート（名・番号・有効期限・PLACE OF BIRTH と、下部のMRZ 2行入力） */}
      <Card className="p-4">
        <div className="rounded-2xl border border-border bg-background p-3">
          <div className="mb-2 flex items-center gap-1.5 border-b border-border pb-2 text-[11px] font-bold text-muted">
            <BookOpen size={13} />
            パスポート PASSPORT
          </div>
          <div className="flex gap-3">
            {/* 左: 写真の位置。顔写真は在留カードの欄にあるので、ここはイメージ図だけ */}
            <div className="flex w-[76px] shrink-0 flex-col items-center gap-1">
              <div className="flex h-[96px] w-[76px] items-center justify-center rounded-lg border border-dashed border-border text-muted/60">
                <UserRound size={34} />
              </div>
              <span className="text-center text-[9px] leading-tight text-muted">
                写真は在留カードの欄（ここはイメージ）
              </span>
            </div>
            {/* スマホで潰れないよう、写真の横は名・番号だけを縦に置く */}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {/* 氏名は在留カードの欄と同じもの（直すときは在留カードの欄で） */}
              <CardItem label="名 NAME" value={worker.name} />
              <CardItem
                label="番号 PASSPORT NO."
                value={
                  worker.passport_no ? (
                    <span className="tabular-nums tracking-wider">{worker.passport_no}</span>
                  ) : (
                    ""
                  )
                }
                edit={textInput("passport_no", "例: C1234567", true)}
              />
            </div>
          </div>

          {/* 写真の下からは横幅いっぱいに使う */}
          <div className="mt-2 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <CardItem label="国籍 NATIONALITY" value={worker.nationality} />
              <CardItem
                label="有効期限 DATE OF EXPIRY"
                value={worker.passport_expiry_date}
                edit={dateInput("passport_expiry_date", true)}
              />
            </div>
            {/* 国によって書き方が違うが、パスポートの PLACE OF BIRTH を母国の住所として記録する */}
            <CardItem
              label="PLACE OF BIRTH（母国の住所）"
              value={worker.home_address}
              edit={textareaInput(
                "home_address",
                "例: KRATIE ／ Số 12, Thôn A, Tỉnh Nghệ An, Việt Nam",
                true,
              )}
              />
            <p className="text-[10px] leading-relaxed text-muted">
              パスポートのPLACE OF BIRTH（出生地）を母国の住所として記録します。
              実際の住所と違う場合は「編集」でここを直してください。
            </p>
          </div>

          {/* 下部: 実物と同じくMRZ（2行）。
              保存済みならコピー候補を常に出し（消えない）、読み取りの入力はたたんでおく */}
          <div className="mt-3 border-t border-border pt-2">
            <p className="mb-1.5 text-[10px] font-bold text-muted">MRZ（下2行）</p>
            {worker.passport_mrz && (
              <div className="mb-2">
                <SavedMrzCopyList mrz={worker.passport_mrz} today={today} />
              </div>
            )}
            {canEdit ? (
              worker.passport_mrz ? (
                <details className="rounded-lg border border-border bg-surface px-3 py-2">
                  <summary className="cursor-pointer text-[11px] font-bold text-brand">
                    MRZを貼り付けて読み取る（入れ直すとき）
                  </summary>
                  <div className="mt-2">
                    <PassportMrzPanel
                      today={today}
                      onApply={(fields) => requestApply("パスポートMRZ", fields)}
                    />
                  </div>
                </details>
              ) : (
                <PassportMrzPanel
                  today={today}
                  onApply={(fields) => requestApply("パスポートMRZ", fields)}
                />
              )
            ) : (
              !worker.passport_mrz && (
                <p className="text-[11px] text-muted">保存されたMRZはありません。</p>
              )
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          有効期限の半年前になると「パスポート更新必要」に自動で表示されます。
        </p>
        {saveBar}
      </Card>

      {/* 出入国の記録（パスポートのスタンプの日付と、スタンプページのPDF・画像） */}
      <WorkerPassportTravel workerId={worker.id} canEdit={canEdit} today={today} />

      {/* 基本情報（在留カード・パスポート以外の項目） */}
      <Card className="p-4">
        <p className="mb-1 text-[11px] font-bold text-muted">基本情報</p>
        <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          {/* 只今の状況（経過メモ）。Notionの「只今の状況」と同じ選択肢＋自由入力。
              「Notionに登録／更新」を押すとNotion側のselectにも反映される */}
          <InfoItem
            label="只今の状況（経過メモ）"
            wide
            value={
              worker.current_situation ? (
                <>
                  {worker.current_situation}
                  {/* どういう人に付ける状況かを添える（選択肢に説明があるものだけ） */}
                  {situationDescription(worker.current_situation) && (
                    <span className="block text-[11px] font-normal text-muted">
                      {situationDescription(worker.current_situation)}
                    </span>
                  )}
                </>
              ) : autoSituationValue ? (
                <>
                  {autoSituationValue}
                  <span className="block text-[11px] font-normal text-muted">
                    在留資格と申請の状況から自動で表示しています（編集で上書きできます）
                  </span>
                </>
              ) : (
                ""
              )
            }
            edit={
              // 未入力でも自動表示（現在のビザ＋審査中/許可）がある間は入力欄を出さず、
              // 自動の内容を見せる。書き換えたいときは「編集」から
              showInput("current_situation") && (editing || !autoSituationValue) ? (
                <>
                  <input
                    list="worker-situations"
                    value={val("current_situation")}
                    onChange={(e) => setField("current_situation", e.target.value)}
                    placeholder={
                      autoSituationValue ||
                      "例: 特定技能の審査中 ／ 入国管理局からビザの許可おりた電話あり"
                    }
                    // ブラウザの住所・電話番号のオートフィルが候補に混ざらないようにする
                    autoComplete="off"
                    className={inputCls()}
                  />
                  <datalist id="worker-situations">
                    {WORKER_SITUATIONS.map((s) => (
                      <option key={s.value} value={s.value} />
                    ))}
                  </datalist>
                  <span className="mt-0.5 block text-[10px] text-muted">
                    {situationDescription(val("current_situation")) ||
                      (autoSituationValue && !val("current_situation")
                        ? `未入力の間は「${autoSituationValue}」（在留資格と申請の状況）を自動で表示します。`
                        : "選択肢から選ぶか、自由に入力できます。「Notionに登録／更新」でNotionの只今の状況にも入ります。")}
                  </span>
                </>
              ) : undefined
            }
          />
          {/* 只今の状況 → 現在の所属機関 → 雇用開始日 → 状態・支援区分 の順で縦に表示する */}
          <InfoItem
            label="現在の所属機関"
            wide
            value={worker.current_organization_id ? orgName : canEdit ? "" : "未所属"}
            edit={
              showInput("current_organization_id") ? (
                <select
                  value={val("current_organization_id")}
                  onChange={(e) => setField("current_organization_id", e.target.value)}
                  className={inputCls()}
                >
                  <option value="">未所属</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              ) : undefined
            }
          />
          <InfoItem
            label="雇用開始日（現在の所属機関）"
            wide
            value={
              currentOrgStart || (
                <span className="text-xs text-muted">
                  未登録（下の「雇用開始日（所属機関別）」で追加できます）
                </span>
              )
            }
          />
          {/* 状態・支援区分（上部のバッジと同じもの）。「編集」でここから直せる */}
          <InfoItem
            label="状態"
            value={worker.status}
            edit={
              editing && canEdit ? (
                <select
                  value={val("status")}
                  onChange={(e) => setField("status", e.target.value)}
                  className={inputCls()}
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : undefined
            }
          />
          <InfoItem
            label="支援区分"
            value={worker.support}
            edit={
              editing && canEdit ? (
                <select
                  value={val("support")}
                  onChange={(e) => setField("support", e.target.value)}
                  className={inputCls()}
                >
                  {SUPPORT_SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : undefined
            }
          />
          <InfoItem
            label="分野・職種"
            wide
            value={worker.field}
            edit={
              showInput("field") ? (
                <div className="mt-0.5">
                  <FieldJobSelect field={val("field")} onChange={(v) => setField("field", v)} />
                </div>
              ) : undefined
            }
          />
          <InfoItem
            label="支援責任者・支援担当者（所属機関）"
            value={orgStaff || (currentOrg ? "未設定（会社・機関マスタで登録）" : null)}
          />
          <InfoItem
            label="配属先営業所"
            value={worker.assigned_office}
            edit={textInput("assigned_office", "例: 熊本営業所")}
          />
          <InfoItem
            label="居住先"
            value={worker.residence_note}
            edit={textInput("residence_note", "例: 社宅 / 自分のアパート")}
          />
          {/* 良好に修了した技能実習2号（職種名・作業名・良好修了の証明）。
              その証明の書類（専門級合格証or技能評価調書）もこの枠の中で添付する */}
          <div>
            <Jisshu2Section workerId={worker.id} canEdit={canEdit} />
          </div>
          <div>
            <InfoItem
              label="特定技能2号の合格試験名"
              value={
                worker.ssw2_exam ? (
                  <>
                    {worker.ssw2_exam}
                    <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">
                      2号合格
                    </span>
                  </>
                ) : null
              }
              edit={textInput("ssw2_exam", "例: ビルクリーニング分野特定技能2号評価試験")}
            />
            <WorkerCertDocRows
              workerId={worker.id}
              canEdit={canEdit}
              defs={[{ key: "cert_ssw2", label: "特定技能2号の合格証" }]}
            />
          </div>
          <div>
            {/* 日本語・専門外の合格証は「受験情報（試験名・受験地・レベル）＋その試験の合格証」を
                1組にして、何件でも登録できる（取り違えを防ぐため合格証は枠の中に置く） */}
            <CertExamList
              workerId={worker.id}
              canEdit={canEdit}
              kind="nihongo"
              nameOptions={NIHONGO_EXAM_NAME_OPTIONS}
            />
            <CertExamList
              workerId={worker.id}
              canEdit={canEdit}
              kind="senmongai"
              nameOptions={SENMONGAI_EXAM_NAME_OPTIONS}
            />
          </div>
          {/* 連絡リンク（在留カードの欄の写真の下のボタンのリンク先）。
              未入力ならそのまま入力でき、登録済みは「編集」でここから直せる */}
          <InfoItem
            label="Messenger グループ/個人リンク"
            wide
            value={
              worker.messenger_link ? (
                <a
                  href={messengerWebUrl(worker.messenger_link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm font-normal text-brand underline"
                >
                  {worker.messenger_link}
                </a>
              ) : (
                ""
              )
            }
            edit={textInput("messenger_link", "https://m.me/... または https://www.messenger.com/...")}
          />
          <InfoItem
            label="Notion 個人ページのリンク"
            wide
            value={
              worker.notion_link ? (
                <a
                  href={notionAppUrl(worker.notion_link)}
                  className="break-all text-sm font-normal text-brand underline"
                >
                  {worker.notion_link}
                </a>
              ) : (
                ""
              )
            }
            edit={textInput("notion_link", "https://www.notion.so/... または https://app.notion.com/...")}
          />
        </dl>
        <p className="mb-1 text-[11px] font-bold text-muted">番号・保険</p>
        <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <InfoItem label="個人番号" value={worker.my_number} edit={textInput("my_number")} />
          <InfoItem
            label="雇用保険被保険者番号"
            value={worker.employment_insurance_no}
            edit={textInput("employment_insurance_no")}
          />
          <InfoItem label="基礎年金番号" value={worker.pension_no} edit={textInput("pension_no")} />
          <InfoItem
            label="特定技能総合保険の負担（現在の所属機関）"
            value={
              insuranceBurden ||
              (currentOrg ? "未設定（会社・機関マスタで登録）" : null)
            }
          />
          {insuranceBurden === "外国人負担" && (
            <div className="col-span-2">
              <dt className="text-[11px] font-bold text-muted">自己負担での加入</dt>
              <dd>
                {worker.ssw_insurance_self_join ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">
                      自己負担加入希望あり
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={selfJoinBusy}
                        onClick={() => setSelfJoin(false)}
                        className="text-[11px] font-bold text-muted underline disabled:opacity-50"
                      >
                        {selfJoinBusy ? "保存中…" : "希望を取り消す"}
                      </button>
                    )}
                  </span>
                ) : (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted">外国人負担のため未加入</span>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={selfJoinBusy}
                        onClick={() => setSelfJoin(true)}
                        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-foreground disabled:opacity-50"
                      >
                        {selfJoinBusy ? "保存中…" : "自己負担加入希望"}
                      </button>
                    )}
                  </span>
                )}
              </dd>
            </div>
          )}
          {showInsuranceFields && (
            <>
              <InfoItem
                label="特定技能総合保険の加入リンク先"
                value={
                  worker.ssw_insurance_link ? (
                    <a
                      href={worker.ssw_insurance_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-brand"
                    >
                      <ExternalLink size={13} className="shrink-0" />
                      加入ページを開く
                    </a>
                  ) : null
                }
                edit={textInput("ssw_insurance_link", "https://...")}
              />
              <InfoItem
                label="特定技能総合保険 有効期限"
                value={
                  worker.ssw_insurance_expiry_date ? (
                    <>
                      {worker.ssw_insurance_expiry_date}
                      {isSswInsuranceRenewalTarget(worker, today) && (
                        <span className="ml-2 rounded-full bg-seal/10 px-2 py-0.5 text-[11px] font-bold text-seal">
                          {remainingLabel(worker.ssw_insurance_expiry_date, today)}
                        </span>
                      )}
                    </>
                  ) : null
                }
                edit={dateInput("ssw_insurance_expiry_date")}
              />
            </>
          )}
        </dl>
        <p className="mb-1 text-[11px] font-bold text-muted">家族情報</p>
        <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <InfoItem label="配偶者の有無" value={worker.has_spouse} edit={selectInput("has_spouse", ["有", "無"])} />
          <InfoItem
            label="在日親族の同居"
            value={worker.relatives_in_japan}
            edit={selectInput("relatives_in_japan", ["有", "無"])}
          />
        </dl>
        {editing && canEdit && val("relatives_in_japan") === "有" ? (
          <div className="mb-3">
            <RelativesEditor
              relatives={relativesDraft ?? worker.relatives ?? []}
              onChange={setRelativesDraft}
            />
          </div>
        ) : (
          worker.relatives_in_japan === "有" &&
          (worker.relatives ?? []).length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-[11px] font-bold text-muted">同居している在日親族</p>
              <div className="space-y-1.5">
                {(worker.relatives ?? []).map((r, i) => (
                  <div key={i} className="rounded-lg bg-background px-3 py-2 text-sm">
                    <p className="font-bold">{r.name || "氏名未登録"}</p>
                    <p className="text-xs text-muted">
                      {[
                        r.birth && `生年月日 ${r.birth}`,
                        r.workplace && `勤務先 ${r.workplace}`,
                        r.residence_card_no && `在留カード番号 ${r.residence_card_no}`,
                      ]
                        .filter(Boolean)
                        .join(" ・ ") || "詳細未登録"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <InfoItem
            label="健康状態"
            value={worker.health_note}
            wide
            edit={textareaInput("health_note", "持病・通院状況など")}
          />
          <InfoItem
            label="家族構成"
            value={worker.family_note}
            wide
            edit={textareaInput("family_note", "配偶者・子どもの有無、同居状況など")}
          />
          <InfoItem label="備考" value={worker.note} wide edit={textareaInput("note")} />
        </dl>
        {saveBar}
      </Card>

      {/* 退職者情報（状態が退職のとき、または退職日が残っているとき）。
          再雇用などで状態を在籍中に戻しても退職日が残っていると請求書作成の名簿から
          消えてしまうため、戻したあとも退職日を消せるように出しておく */}
      {(worker.status === "退職" || worker.leaving_on) && (
        <>
          <LeavingSection worker={worker} canEdit={canEdit} />
          {/* 退職日までの支援代の日割りと、定期売上の締め */}
          <WorkerSalesResignation
            workerId={worker.id}
            workerName={worker.name}
            organizationId={worker.current_organization_id}
            leavingOn={worker.leaving_on}
            residenceStatus={worker.residence_status}
            canEdit={canEdit}
          />
        </>
      )}

      {/* 賃金（時給・月給）。採用時の賃金と昇給の履歴を残す */}
      <WorkerWages
        workerId={worker.id}
        currentOrganizationId={worker.current_organization_id}
        employmentStartOn={worker.employment_start_on}
        organizations={organizations}
        today={todayStr()}
        canEdit={canEdit}
      />

      {/* 許可売上No.・保険No.（売上明細の伝票番号をまとめて見る・直す） */}
      <WorkerPermitSalesNos workerId={worker.id} canEdit={canEdit} />

      {/* 定期売上（毎月の支援代）。定期売上No.が未登録ならここから登録できる */}
      <WorkerRecurringSales
        workerId={worker.id}
        organizationId={worker.current_organization_id}
        organizations={organizations}
        support={worker.support}
        initialSalesNo={worker.recurring_sales_no ?? ""}
        initialPast={worker.past_recurring_sales}
        canEdit={canEdit}
      />

      {/* 雇用開始日（所属機関別）。現在の所属機関の分は雇用開始年月日に自動反映 */}
      <WorkerEmploymentStarts
        workerId={worker.id}
        initial={worker.org_employment_starts}
        currentOrganizationId={worker.current_organization_id}
        currentEmploymentStartOn={worker.employment_start_on}
        workerStatus={worker.status}
        residenceStatus={worker.residence_status}
        currentSituation={worker.current_situation}
        organizations={organizations}
        canEdit={canEdit}
      />

      {/* 扶養家族（扶養親族証明書の内容→控除区分の自動判定・扶養控除等申告書の作成） */}
      <WorkerDependents
        workerId={worker.id}
        initial={worker.dependents}
        canEdit={canEdit}
      />

      {/* 在留カード・指定書の差し替え（履歴保持） */}
      <WorkerDocuments
        workerId={worker.id}
        canEdit={canEdit}
        histories={worker.work_histories}
      />

      {/* 雇用契約書・雇用条件書（雇用開始後の分を所属機関ごとに保管。
          申請時点の記録は申請準備のTODOの中でも同じ保管先を使う） */}
      <WorkerContracts
        workerId={worker.id}
        canEdit={canEdit}
        messengerLink={worker.messenger_link}
        organizations={organizations}
        currentOrganizationId={worker.current_organization_id}
        orgEmploymentStarts={worker.org_employment_starts ?? []}
        // 日付なし（印鑑・署名あり）版は申請準備の詳細で保管するため、外国人詳細では出さない
        showUndated={false}
      />

      {/* 雇用保険（離職票・被保険者証）が届いたときの保管 */}
      <WorkerEmploymentInsurance workerId={worker.id} canEdit={canEdit} />

      {/* 保険証（健康保険）。現在の保険証と履歴。社保は職歴（会社）に紐付けられる */}
      <WorkerInsuranceCards workerId={worker.id} canEdit={canEdit} histories={histories} />

      {/* あとでやる手続き（転居手続き・退職書類が出てからの国保/国民年金の加入）。
          国保の欄には現在の保険証（上の保険証の欄の最新）からの目安も出す */}
      <WorkerFollowups
        workerId={worker.id}
        followups={worker.followups}
        canEdit={canEdit}
        histories={histories}
      />

      {/* 旧「外国人書類（PDF・画像で保存）」カードは解体した:
          合格証4種→基本情報の各合格名の下 / パスポート→出入国の記録のパスポートの記録 /
          履歴書→入社書類 / 在留カード（申請書類準備時）→在留カード・指定書（0101で移行） */}

      {/* 申請準備 書類チェックリストは申請準備のTODO（📋 必要な書類・準備の詳細）に移動した。
          この画面では下の「TODO」カードから各TODOのページへ飛べる */}

      {/* 入社書類メールで登録した添付データ（選択ダウンロード・Gmailリンク） */}
      <OnboardingDocuments workerId={worker.id} canEdit={canEdit} myNumber={worker.my_number} />

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
            label="通算在留日数"
            value={calc.counted.length ? `${ymdFullText(calc.used)}（${calc.usedDays}日）` : null}
          />
          <InfoItem
            label="残り"
            value={calc.counted.length ? `${ymdFullText(calc.remain)}（${calc.remainDays}日）` : null}
          />
          <InfoItem
            label="月単位の通算（1日でも在留した月は1か月）"
            value={
              monthTotal !== null
                ? `${Math.floor(monthTotal / 12)}年${monthTotal % 12}か月（${monthTotal}か月）`
                : null
            }
            wide
          />
          <InfoItem label="起算日" value={calc.firstStart} />
          <InfoItem label="満了予定日" value={calc.expiry} />
        </dl>
        <SswGapNotice gaps={gaps} className="mt-3" />
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          通算在留日数は日数合算による目安です（特定活動〔1号移行準備〕を含む）。
          月単位の通算は申請書類用と同じ数え方（1日でも在留した月は1か月）の今日時点の値です。
          正式な判断は出入国在留管理庁にご確認ください。
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
                  {(h.org_name || h.prefecture || h.role) && (
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {[h.org_name, h.prefecture, h.role].filter(Boolean).join(" ・ ")}
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
        organizations={organizations}
        canEdit={canEdit}
      />

      {/* この人のTODOへのリンク（申請準備・退職の随時報告書・試験の申込。
          申請準備の中身は申請準備のTODOで管理する） */}
      <WorkerTodoLinks workerId={worker.id} />

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

      {/* 在留カードの券面を見ながら入力（反映すると編集モードになり、保存で確定） */}
      <ResidenceCardDialog
        open={cardOpen}
        onClose={() => setCardOpen(false)}
        onApply={(fields) => requestApply("在留カード", fields)}
      />

      {/* 券面・MRZの反映で、入力済みの項目を書き換えるときの確認 */}
      <Modal
        open={pendingImport !== null}
        title="入力済みの項目を書き換えます"
        onClose={() => setPendingImport(null)}
      >
        <p className="mb-3 text-sm leading-relaxed">
          {pendingImport?.source}の内容を反映すると、次の項目が書き換わります。よろしいですか。
        </p>
        <ul className="mb-3 flex flex-col gap-1.5">
          {pendingImport?.changes.map((c) => (
            <li key={c.key} className="rounded-lg bg-background px-3 py-2 text-xs">
              <span className="font-bold">{c.label}</span>
              <span className="mt-0.5 block break-words text-muted">
                今: {c.before} → 反映後:{" "}
                <span className="font-bold text-foreground">{c.after}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mb-3 text-[11px] text-muted">
          反映してもまだ保存されません。画面の内容を確かめてから「保存」を押してください。
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" fullWidth onClick={() => setPendingImport(null)}>
            やめる
          </Button>
          <Button
            type="button"
            fullWidth
            onClick={() => pendingImport && applyImported(pendingImport.source, pendingImport.fields)}
          >
            書き換えて反映
          </Button>
        </div>
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

      {/* 項目が多いので、左下の検索から目的の入力欄へ直接飛べるようにする */}
      <FieldJumpSearch />
    </div>
  );
}

// 氏名のコピー（押すと一瞬チェックに変わる）
// パソコン上のフォルダ・ファイルのパス用のボタン。
// ブラウザの安全上の決まりでウェブページからは直接開けないため、
// 押すとパスをコピーして、Finder（⌘⇧G）やエクスプローラーに貼り付けて開いてもらう
function FileLinkCopyButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(path);
            setCopied(true);
            setTimeout(() => setCopied(false), 8000);
          } catch {
            // クリップボードが使えない環境では何もしない
          }
        }}
        title={`パソコン上のパス:\n${path}\n押すとコピーします（ブラウザからは直接開けないため）`}
        className="inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-border bg-surface px-2 text-[11px] font-bold text-brand"
      >
        {copied ? <Check size={12} /> : <FolderOpen size={12} />}
        {copied ? "パスをコピーしました" : "ファイル"}
      </button>
      {copied && (
        <span className="text-[10px] leading-tight text-muted">
          Finder は ⌘⇧G（移動 &gt; フォルダへ移動）、Windows
          はエクスプローラーのアドレス欄に貼り付けて開けます
        </span>
      )}
    </>
  );
}

function CopyNameButton({ name }: { name: string }) {
  const [done, setDone] = useState(false);
  if (!name) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(name);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // クリップボードが使えない環境では何もしない
        }
      }}
      title={done ? "コピーしました" : "氏名をコピー"}
      aria-label="氏名をコピー"
      className={`ml-1.5 inline-flex h-6 w-6 items-center justify-center rounded-lg align-middle ${
        done ? "text-status-approved-fg" : "text-muted hover:bg-background hover:text-brand"
      }`}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

// 在留カード・パスポート枠の1項目（実物のカードに合わせた小さいラベル）。
// edit があれば入力欄（編集モードや未記入のとき）、なければ値を出す。
// onCard は在留カードの券面の上に置くとき（ダークモードでも読めるよう色を固定する）
function CardItem({
  label,
  value,
  edit,
  onCard = false,
}: {
  label: string;
  value?: React.ReactNode; // 空文字・null は未記入扱い
  edit?: React.ReactNode;
  onCard?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className={`text-[10px] font-bold ${onCard ? "text-[#33415c]" : "text-muted"}`}>
        {label}
      </span>
      {edit ?? (
        <span className="min-h-[20px] whitespace-pre-wrap break-words text-sm font-bold">
          {value || (
            <span className={`font-normal ${onCard ? "text-[#667085]" : "text-muted"}`}>—</span>
          )}
        </span>
      )}
    </label>
  );
}

function InfoItem({
  label,
  value,
  wide = false,
  edit,
}: {
  label: string;
  value: React.ReactNode; // 空文字・null は未記入扱い
  wide?: boolean;
  edit?: React.ReactNode; // 入力欄（編集モードでは値の代わりに出す。省略時は「—」）
}) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[11px] font-bold text-muted">{label}</dt>
      <dd className="whitespace-pre-wrap break-words">{edit ?? (value || "—")}</dd>
    </div>
  );
}

// 通算に数えていない期間（空白）のお知らせ。
//
// 「起算日から今日まで通しで数えたはず」の月数と画面の通算が食い違うときは、
// たいていこの空白に職歴の登録漏れがある。ただし在留資格を切って帰国していた期間なら
// 空白があるのが正しいので、数字は変えずにお知らせだけ出す。
function SswGapNotice({ gaps, className = "" }: { gaps: SswGap[]; className?: string }) {
  if (!gaps.length) return null;
  return (
    <div className={`rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal ${className}`}>
      <p className="flex items-center gap-1.5 font-bold">
        <AlertTriangle size={14} className="shrink-0" />
        通算に数えていない期間があります（{gaps.length}件）
      </p>
      <ul className="mt-1.5 flex flex-col gap-0.5 tabular-nums">
        {gaps.map((g) => (
          <li key={g.start}>
            {g.start} 〜 {g.end}（{ymdFullText(toYMD(g.days))}・{g.days}日）
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] leading-relaxed">
        この期間の職歴が登録されていません。特定技能1号・特定活動〔1号移行準備〕で在留していた期間なら、
        職歴に追加すると通算に入ります。在留資格を切って帰国していた期間なら、このままで正しいです。
      </p>
    </div>
  );
}

// 申請書類用の通算: 通算対象（特定技能1号・特定活動〔1号移行準備〕・在留資格を保持したままの
// 帰国）の期間について「1日でも在留した月」を1か月と数えて「◯年◯か月」を出す。
// 在留資格を切って帰国していた期間などの空白は数えない（通算期間ゲージと同じ範囲）
function DocumentTotalPanel({ histories }: { histories: WorkHistory[] }) {
  const [docDate, setDocDate] = useState(todayStr());
  const [copied, setCopied] = useState(false);
  const calc = useMemo(() => calcSsw(histories, docDate), [histories, docDate]);
  const totalMonths = useMemo(() => calcDocumentTotal(histories, docDate), [histories, docDate]);
  const gaps = useMemo(() => sswGaps(histories, docDate), [histories, docDate]);

  const firstStart = calc.firstStart;
  const shinsei = `${Math.floor((totalMonths ?? 0) / 12)}年${(totalMonths ?? 0) % 12}か月`;
  const hasData = totalMonths !== null && !!firstStart;

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
        特定技能1号（通算対象）の期間について、1日でも在留した月を1か月と数えて合算します。
        在留資格を切って帰国していた期間は数えません。
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
              <span className="ml-2 text-sm font-bold text-muted">（{totalMonths}か月）</span>
            </p>
            <p className="mt-1 text-xs tabular-nums text-muted">
              起算日 {firstStart}
              　1日でも在留した月を1か月と数えています（帰国などの空白は含まず）
            </p>
          </div>
          <SswGapNotice gaps={gaps} />
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
      {/* 状態は戻っているのに退職日が残っている状態。このままだと請求書作成の名簿に出ない */}
      {worker.status !== "退職" && worker.leaving_on && (
        <p className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
          状態は「{worker.status}」ですが退職日（{worker.leaving_on}）が残っています。
          再雇用などで在籍が続いている場合は、退職日を空にして保存してください。
          残っていると請求書作成の名簿に出ません。
        </p>
      )}
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
