"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownUp,
  Building2,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  HandCoins,
  NotebookPen,
  Pencil,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ApplicationResultBadge } from "@/components/postings/ApplicationResultBadge";
import { JobApplicationDialog } from "@/components/workers/JobApplicationDialog";
import { createClient } from "@/lib/supabase/client";
import {
  insertApplication,
  updateApplication as updateJobApplication,
} from "@/lib/supabase/queries/jobs";
import { insertReferralFee, type ApplicationReferralFee } from "@/lib/supabase/queries/referrals";
import {
  feeDraftOf,
  patchFeeDraft,
  type ReferralFeeDrafts,
} from "@/lib/referral-fee-draft";
import {
  countMissingFromReferralLedger,
  referralLedgerStatus,
} from "@/lib/referral-ledger-status";
import { formatSalesYen, REFERRAL_SALES_KEY } from "@/lib/sales";
import { normalizeSalesItems, parseAmount } from "@/lib/organization-intake";
import { buildXlsx, downloadBlob } from "@/lib/xlsx-export";
import { buildSeekerLedgerSheet } from "@/lib/recruit-ledgers";
import {
  employmentStartAt,
  hasEmploymentStarted,
  type EmploymentStartWorker,
} from "@/lib/job-employment-start";
import { matchesWorkerName } from "@/lib/worker-search";
import { jobOrgOptions } from "@/lib/job-org-filter";
import { useDateIssueSnooze } from "@/lib/date-issue-snooze";
import { NameSearchBox } from "@/components/ui/NameSearchBox";
import { CopyButton } from "@/components/ui/CopyButton";
import {
  DEFAULT_JOB_SORT,
  JOB_SORTS,
  sortJobApplications,
  type JobSort,
} from "@/lib/job-sort";
import { fetchSeekerLedger } from "@/lib/supabase/queries/recruit-ledgers";
import { dbErrorMessage } from "@/lib/errors";
import {
  APPLICATION_RESULTS,
  SEPARATION_STATUSES,
  type ApplicationResult,
} from "@/types/recruiting";
import type { ApplicationWithRefs } from "@/lib/supabase/queries/jobs";
import type { JobApplicationValues } from "@/components/workers/JobApplicationDialog";
import type { PostingWithStats } from "@/lib/supabase/queries/postings";
import type { Organization } from "@/types/db";
import { formatAmountInput } from "@/lib/amount-format";
import { checkLedgerDates, issueKinds } from "@/lib/ledger-date-check";
import { LedgerDateFlow, type LedgerDateStep } from "@/components/jobs/LedgerDateFlow";
import { contractDatesForOrg, normalizeOrgEmploymentStarts } from "@/lib/org-employment";

// 絞り込み。採否のほかに「雇用開始済み」（雇用開始日が入っている人）と
// 「台帳未追加」（採用なのに紹介手数料台帳へ入れていない人）でも絞れる
type ResultFilter = ApplicationResult | "all" | "employed" | "no_referral" | "date_issue";

// 一覧で使う外国人。氏名の選択肢に加えて、雇用開始日の判定と
// 帳簿の日付の並びの確認（求職受付日）にも使う
export type JobsWorker = {
  id: string;
  name: string;
  jobseeker_accepted_on?: string | null;
} & EmploymentStartWorker;

export function JobsExplorer({
  applications,
  postings,
  organizations,
  workers,
  initialReferralFees,
  initialUnlinkedReferralKeys,
  canEdit,
}: {
  applications: ApplicationWithRefs[];
  postings: PostingWithStats[];
  organizations: Organization[];
  workers: JobsWorker[];
  initialReferralFees: Record<string, ApplicationReferralFee>;
  initialUnlinkedReferralKeys: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // 並び替え（採用年月日・雇用開始日の準備をするときに日付順で見られるように）
  const [sort, setSort] = useState<JobSort>(DEFAULT_JOB_SORT);
  // 応募先の企業で絞り込む（""＝すべての企業）。どこで採用が出ているかを見るのに使う
  const [orgFilter, setOrgFilter] = useState("");
  // 氏名で検索（候補から選ぶ・部分一致）。入力中は採否のタブに関わらず全体から探す
  const [nameQuery, setNameQuery] = useState("");
  const query = nameQuery.trim();
  const [rows, setRows] = useState(applications);
  const [error, setError] = useState<string | null>(null);

  // 登録ダイアログでその場で新規登録した外国人・企業も候補に含めるため、
  // 一覧が持つ選択肢は state で持つ
  const [workerList, setWorkerList] = useState(workers);
  const [orgList, setOrgList] = useState(organizations);

  // 新規の応募登録（求職一覧から直接記入する）
  const [adding, setAdding] = useState(false);
  // 応募の内容（応募日＝紹介年月日、結果日＝採用年月日など）を直す
  const [editing, setEditing] = useState<ApplicationWithRefs | null>(null);

  // 帳簿情報（求職受付・採用後の記載事項）の編集ダイアログ
  const [ledgerFor, setLedgerFor] = useState<ApplicationWithRefs | null>(null);

  // 求職管理簿（厚労省様式の項目）のExcel出力。労働局の監査（訪問指導）用
  const [exporting, setExporting] = useState(false);
  const exportLedger = async () => {
    setExporting(true);
    setError(null);
    try {
      const entries = await fetchSeekerLedger(createClient());
      const today = new Date().toISOString().slice(0, 10);
      downloadBlob(
        await buildXlsx([buildSeekerLedgerSheet(entries)]),
        `求職管理簿_${today}.xlsx`,
      );
    } catch (err) {
      setError(dbErrorMessage(err, "0079_recruit_ledgers.sql", "出力に失敗しました"));
    } finally {
      setExporting(false);
    }
  };

  // 応募 → 紹介手数料台帳の状態（手数料・入金の確認と、採用からの台帳追加）
  const [referralFees, setReferralFees] =
    useState<Record<string, ApplicationReferralFee>>(initialReferralFees);
  const [referralBusyId, setReferralBusyId] = useState<string | null>(null);
  // 手数料管理簿から直接足した（応募と紐づいていない）台帳の行。
  // 台帳に載っている人を「未追加」に出さないよう、外国人＋所属機関で照らし合わせる
  const unlinkedReferralKeys = useMemo(
    () => new Set(initialUnlinkedReferralKeys),
    [initialUnlinkedReferralKeys],
  );
  // その応募が紹介手数料台帳のどの状態か（追加済み／別行あり／未追加／対象外）
  const ledgerStatus = (a: ApplicationWithRefs) =>
    referralLedgerStatus(a, referralFees, unlinkedReferralKeys);
  // 台帳に追加する前に入力する「紹介手数料」と「紹介売上No.」（応募ごと）
  const [feeDrafts, setFeeDrafts] = useState<ReferralFeeDrafts>({});
  // 所属機関マスタのあっせん明細の金額を初期値にする
  const defaultFee = (a: ApplicationWithRefs) => {
    const org = orgList.find((o) => o.id === a.organization_id);
    const items = normalizeSalesItems(org?.intake?.sales_items)[REFERRAL_SALES_KEY] ?? [];
    return String(parseAmount(items[0]?.amount ?? "") ?? "");
  };
  const feeDraft = (a: ApplicationWithRefs) => feeDraftOf(feeDrafts, a.id, defaultFee(a));
  // 片方だけ入れたときにもう片方が消えないよう、初期値を含む今の下書きを土台にする
  const setFeeDraft = (a: ApplicationWithRefs, patch: { fee?: string; salesNo?: string }) =>
    setFeeDrafts((prev) => patchFeeDraft(prev, a.id, defaultFee(a), patch));

  // 期間（応募日）で絞った母集団
  const inPeriod = useMemo(
    () =>
      rows.filter((a) => {
        if (from && a.applied_on < from) return false;
        if (to && a.applied_on > to) return false;
        return true;
      }),
    [rows, from, to],
  );

  // 企業の選択肢（期間内の応募から作る。採用の多い順）
  const orgOptions = useMemo(() => jobOrgOptions(inPeriod), [inPeriod]);
  // 企業で絞ったあとの母集団。件数・絞り込み・検索の候補はすべてこれをもとにする
  const inOrg = useMemo(
    () => (orgFilter ? inPeriod.filter((a) => a.organization_id === orgFilter) : inPeriod),
    [inPeriod, orgFilter],
  );

  // 応募先の会社で雇用開始しているか（外国人の雇用開始日から判定する）
  const workerById = useMemo(() => new Map(workerList.map((w) => [w.id, w])), [workerList]);
  const startedOn = (a: ApplicationWithRefs) =>
    employmentStartAt(workerById.get(a.worker_id), a.organization_id);
  // 応募先の会社の契約書の日付（外国人詳細の「雇用契約書・雇用条件書」で入れる）
  const contractDates = (a: ApplicationWithRefs) =>
    contractDatesForOrg(
      normalizeOrgEmploymentStarts(workerById.get(a.worker_id)?.org_employment_starts),
      a.organization_id,
    );
  const isEmployed = (a: ApplicationWithRefs) =>
    hasEmploymentStarted(workerById.get(a.worker_id), a.organization_id);

  // 帳簿の日付の並びの確認（求人受付年月日 → 紹介年月日 → 採用年月日、求職受付日 → 紹介年月日）
  const postingById = useMemo(() => new Map(postings.map((p) => [p.id, p])), [postings]);
  const dateIssuesOf = (a: ApplicationWithRefs) =>
    checkLedgerDates({
      postingReceivedOn: a.job_posting_id
        ? (postingById.get(a.job_posting_id)?.received_on ?? null)
        : null,
      jobseekerAcceptedOn: workerById.get(a.worker_id)?.jobseeker_accepted_on ?? null,
      appliedOn: a.applied_on,
      resultOn: a.result_on,
      result: a.result,
      conditionsOn: contractDates(a).conditions_on,
      contractOn: contractDates(a).contract_on,
      employmentStartOn: startedOn(a),
    });
  // 棒線の上に並べる日付（求職受付 → 求人受付 → 紹介 → 採用 → 条件書 → 契約 → 雇用開始）
  const dateStepsOf = (a: ApplicationWithRefs): LedgerDateStep[] => {
    const c = contractDates(a);
    return [
      {
        label: "求職受付",
        value: workerById.get(a.worker_id)?.jobseeker_accepted_on ?? "",
      },
      {
        label: "求人受付",
        value: a.job_posting_id ? (postingById.get(a.job_posting_id)?.received_on ?? "") : "",
      },
      { label: "紹介", value: a.applied_on, kind: "紹介年月日" },
      { label: "採用", value: a.result_on ?? "", kind: "採用年月日" },
      { label: "条件書", value: c.conditions_on, kind: "雇用条件書の作成日" },
      { label: "契約", value: c.contract_on, kind: "雇用契約日" },
      { label: "雇用開始", value: startedOn(a) ?? "", kind: "雇用開始日" },
    ];
  };

  // 訂正が必要な応募（期間・企業の絞り込みの中から探す）
  const dateIssueRows = useMemo(
    () => inOrg.map((a) => ({ a, issues: dateIssuesOf(a) })).filter((r) => r.issues.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inOrg, workerById, postingById],
  );

  // お知らせを一旦消しているか（この端末に覚えさせる。次のお昼12:00で戻る）
  const dateIssueSnooze = useDateIssueSnooze();

  const stats = useMemo(() => {
    const s = { total: inOrg.length, 選考中: 0, 採用: 0, 不採用: 0, 辞退: 0, 雇用開始済み: 0 };
    for (const a of inOrg) {
      s[a.result as ApplicationResult] += 1;
      if (isEmployed(a)) s.雇用開始済み += 1;
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inOrg, workerById]);

  const filtered = useMemo(() => {
    // 氏名で検索しているときは、採否のタブを気にせず期間内の全体から探す
    const list = query
      ? inOrg.filter((a) => matchesWorkerName({ name: a.workers?.name ?? "" }, query))
      : filter === "all"
        ? inOrg
        : filter === "employed"
          ? inOrg.filter(isEmployed)
          : filter === "no_referral"
            ? inOrg.filter((a) => ledgerStatus(a) === "未追加")
            : filter === "date_issue"
              ? inOrg.filter((a) => dateIssuesOf(a).length > 0)
              : inOrg.filter((a) => a.result === filter);
    return sortJobApplications(list, sort, startedOn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inOrg, filter, sort, query, workerById, postingById, referralFees, unlinkedReferralKeys]);

  // 紹介手数料台帳にまだ追加していない採用の件数（絞り込みのボタンに出す）
  const missingReferralCount = useMemo(
    () => countMissingFromReferralLedger(inOrg, referralFees, unlinkedReferralKeys),
    [inOrg, referralFees, unlinkedReferralKeys],
  );

  // 検索の候補（期間内の応募に出てくる外国人。同じ人は1回だけ）
  const searchCandidates = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; hint: string }>();
    for (const a of inOrg) {
      const w = a.workers;
      if (!w || seen.has(w.id)) continue;
      seen.set(w.id, {
        id: w.id,
        name: w.name,
        hint: a.job_postings?.display_company || a.organizations?.name || "",
      });
    }
    return [...seen.values()];
  }, [inOrg]);

  const addApplication = async (values: JobApplicationValues, workerId?: string) => {
    if (!workerId) throw new Error("外国人を選択してください");
    const row = await insertApplication(createClient(), { ...values, worker_id: workerId });
    // 一覧にすぐ出せるよう、選択肢から表示用の名前を組み立てる
    const w = workerList.find((x) => x.id === workerId);
    const org = orgList.find((o) => o.id === values.organization_id);
    const posting = postings.find((p) => p.id === values.job_posting_id);
    setRows((prev) => [
      {
        ...row,
        workers: w ? { id: w.id, name: w.name } : null,
        organizations: org ? { id: org.id, name: org.name } : null,
        job_postings: posting
          ? { id: posting.id, display_company: posting.display_company, job_type: posting.job_type }
          : null,
      },
      ...prev,
    ]);
    router.refresh();
  };

  // 応募の内容を直す（応募日＝紹介年月日、結果日＝採用年月日、応募先など）
  const editApplication = async (values: JobApplicationValues) => {
    if (!editing) return;
    const row = await updateJobApplication(createClient(), editing.id, values);
    const org = orgList.find((o) => o.id === values.organization_id);
    const posting = postings.find((p) => p.id === values.job_posting_id);
    setRows((prev) =>
      prev.map((r) =>
        r.id === editing.id
          ? {
              ...r,
              ...row,
              organizations: org ? { id: org.id, name: org.name } : r.organizations,
              job_postings: posting
                ? {
                    id: posting.id,
                    display_company: posting.display_company,
                    job_type: posting.job_type,
                  }
                : null,
            }
          : r,
      ),
    );
    router.refresh();
  };

  const changeResult = async (id: string, result: ApplicationResult) => {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, result } : r)));
    try {
      // 結果が確定したら結果日を今日で補完（DB制約: 選考中以外は結果日必須）
      const patch: { result: ApplicationResult; result_on?: string } = { result };
      if (result !== "選考中") patch.result_on = new Date().toISOString().slice(0, 10);
      await updateJobApplication(createClient(), id, patch);
      router.refresh();
    } catch {
      setRows(prev);
    }
  };

  // 採用になった応募を紹介手数料台帳に追加する（応募と紐づけて記録する）。
  // 手数料は所属機関マスタのあっせん明細から初期値を入れ、台帳ページで直せる
  const addToLedger = async (a: ApplicationWithRefs) => {
    setReferralBusyId(a.id);
    setError(null);
    try {
      const org = orgList.find((o) => o.id === a.organization_id);
      const draft = feeDraft(a);
      const fee = parseAmount(draft.fee) ?? 0;
      const row = await insertReferralFee(createClient(), {
        worker_id: a.worker_id,
        organization_id: a.organization_id,
        worker_name: a.workers?.name ?? "",
        domestic: "国内",
        jobseeker_no: "",
        employer_name: a.job_postings?.display_company || org?.name || "",
        referred_on: a.applied_on,
        hired_on: a.result_on,
        fee,
        sales_no: draft.salesNo.trim(),
        billed_on: null,
        paid_on: null,
        note: "",
        job_application_id: a.id,
      });
      setReferralFees((prev) => ({
        ...prev,
        [a.id]: {
          feeId: row.id,
          salesNo: row.sales_no,
          fee: row.fee,
          billedOn: row.billed_on,
          paidOn: row.paid_on,
        },
      }));
    } catch (err) {
      setError(
        dbErrorMessage(err, "0078_referral_fees_job_link.sql", "手数料台帳への追加に失敗しました"),
      );
    } finally {
      setReferralBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* 期間集計（人材紹介事業の定期報告用） */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">開始日（応募日）</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">終了日</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm" />
          </label>
          {(from || to) && (
            <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="text-xs font-bold text-brand">
              期間クリア
            </button>
          )}
          <span className="ml-auto flex items-center gap-2">
            {/* 労働局の訪問指導（監査）で提出する求職管理簿 */}
            <button
              type="button"
              onClick={() => void exportLedger()}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-brand disabled:opacity-50"
            >
              <FileSpreadsheet size={14} />
              {exporting ? "出力中…" : "求職管理簿（Excel）"}
            </button>
            <Link
              href="/postings/form30"
              title="訪問指導の当日点検で労働局から指定されたリストNo.の分だけ出すときはこちら"
              className="text-[11px] font-bold text-brand hover:underline"
            >
              点検分だけ出す（様式30の画面）
            </Link>
            {canEdit && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-brand-foreground"
              >
                <Plus size={14} />
                応募を登録
              </button>
            )}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <StatBox label="応募" value={stats.total} />
          <StatBox label="選考中" value={stats.選考中} />
          <StatBox label="採用" value={stats.採用} />
          <StatBox label="不採用" value={stats.不採用} />
          <StatBox label="辞退" value={stats.辞退} />
          <StatBox label="雇用開始済み" value={stats.雇用開始済み} />
        </div>
      </Card>

      {/* ステータス絞り込み */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Chip label="すべて" active={filter === "all"} onClick={() => setFilter("all")} />
        {APPLICATION_RESULTS.map((r) => (
          <Chip key={r} label={r} active={filter === r} onClick={() => setFilter(r)} />
        ))}
        {/* 雇用開始日が入っている人（実際に働き始めた人）だけを出す */}
        <Chip
          label="雇用開始済み"
          active={filter === "employed"}
          onClick={() => setFilter("employed")}
        />
        {/* 採用なのに紹介手数料台帳へ入れていない人（請求のもれ防止） */}
        <Chip
          label={`台帳未追加 ${missingReferralCount}`}
          active={filter === "no_referral"}
          onClick={() => setFilter("no_referral")}
        />
        {/* 帳簿に出る日付の並びがおかしい人（訪問指導の前に直す） */}
        {dateIssueRows.length > 0 && (
          <Chip
            label={`日付の要訂正 ${dateIssueRows.length}`}
            active={filter === "date_issue"}
            onClick={() => setFilter("date_issue")}
          />
        )}
      </div>

      {/* 応募先の企業で絞り込む（採用が出ている会社が上に来る） */}
      <label className="flex flex-wrap items-center gap-2 text-xs font-bold text-muted">
        <Building2 size={14} />
        企業で絞り込み
        <select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          className="min-h-[40px] min-w-[220px] flex-1 rounded-lg border border-border bg-surface px-2 text-xs font-bold"
        >
          <option value="">すべての企業（{orgOptions.length}社）</option>
          {orgOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}（応募{o.total}・採用{o.hired}）
            </option>
          ))}
        </select>
        {orgFilter && (
          <button type="button" onClick={() => setOrgFilter("")} className="text-xs font-bold text-brand">
            企業クリア
          </button>
        )}
      </label>

      {/* 氏名で検索: 入力すると候補が出て、選ぶとその人の応募だけ表示される */}
      <NameSearchBox
        candidates={searchCandidates}
        value={nameQuery}
        onChange={setNameQuery}
        hintOf={(w) => w.hint}
      />

      {/* 並び替え（採用年月日・雇用開始日の準備をするときに時系列で見る） */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold text-muted">
          {query ? `「${query}」の検索結果 ${filtered.length}件` : `${filtered.length}件`}
          {query && (
            <span className="ml-1 text-[11px] font-normal">（採否のタブに関わらず探しています）</span>
          )}
        </p>
        <label className="ml-auto flex items-center gap-1.5 text-xs font-bold text-muted">
          <ArrowDownUp size={14} />
          並び替え
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as JobSort)}
            className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-xs font-bold"
          >
            {JOB_SORTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      {/* 一旦消している間の控えめなお知らせ（消したままにならないよう、戻す口を残す） */}
      {dateIssueRows.length > 0 && dateIssueSnooze.ready && dateIssueSnooze.snoozedUntil && (
        <p className="-mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <TriangleAlert size={13} className="shrink-0" />
          日付の流れがおかしい応募 {dateIssueRows.length} 件のお知らせは、
          {dateIssueSnooze.untilLabel} まで隠しています。
          <button
            type="button"
            onClick={dateIssueSnooze.show}
            className="font-bold text-brand underline"
          >
            今すぐ出す
          </button>
        </p>
      )}
      {/* 帳簿の日付の並びがおかしい人のお知らせ（訪問指導の前に直す） */}
      {dateIssueRows.length > 0 && dateIssueSnooze.ready && !dateIssueSnooze.snoozedUntil && (
        <div className="rounded-xl border border-seal/40 bg-seal/10 p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-seal">
            <TriangleAlert size={15} className="shrink-0" />
            日付の流れがおかしい応募が {dateIssueRows.length} 件あります。訂正してください。
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            正しい流れは「求人受付年月日 → 応募（紹介年月日） → 結果（採用年月日） →
            条件書・契約 → 雇用開始」です。求職受付日は求人受付年月日より前でも構いませんが、応募より後にはなりません。
            各カードの日付のうち、
            <span className="mx-0.5 rounded border border-seal bg-seal/10 px-1 font-bold text-seal">
              赤い枠
            </span>
            が付いているところを直してください。このまま帳簿を出すと労働局の訪問指導で指摘されます。
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {dateIssueRows.slice(0, 20).map(({ a, issues }) => (
              <li key={a.id} className="text-[11px] leading-relaxed">
                <span className="font-bold">{a.workers?.name ?? "（削除済み）"}</span>
                <span className="text-muted">
                  {" "}
                  ／ {a.job_postings?.display_company || a.organizations?.name || "応募先"} ／{" "}
                  {issues.map((i) => i.message).join("・")}
                </span>
              </li>
            ))}
            {dateIssueRows.length > 20 && (
              <li className="text-[11px] text-muted">ほか {dateIssueRows.length - 20} 件</li>
            )}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {filter !== "date_issue" && (
              <button
                type="button"
                onClick={() => setFilter("date_issue")}
                className="rounded-lg border border-seal px-3 py-1.5 text-[11px] font-bold text-seal"
              >
                この {dateIssueRows.length} 件だけ出す
              </button>
            )}
            {/* 今は直せないときに一旦消す。次のお昼12:00にまた出る */}
            <button
              type="button"
              onClick={dateIssueSnooze.snooze}
              className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted"
            >
              一旦消す{dateIssueSnooze.nextLabel && `（${dateIssueSnooze.nextLabel} まで）`}
            </button>
          </div>
        </div>
      )}
      {filter === "date_issue" && !query && (
        <p className="-mt-2 text-[11px] text-muted">
          帳簿に出る日付の並びがおかしい応募だけを出しています。各カードの「応募を編集」「帳簿情報」「求人受付日を直す」から直してください。
        </p>
      )}
      {filter === "no_referral" && !query && (
        <p className="-mt-2 text-[11px] text-muted">
          採用なのに紹介手数料台帳へ追加していない応募だけを出しています。
          手数料管理簿から直接入れた行（応募と紐づいていないもの）は、同じ人・同じ会社なら追加済みとして数えません。
        </p>
      )}
      {sort !== DEFAULT_JOB_SORT && (
        <p className="-mt-2 text-[11px] text-muted">
          {sort.startsWith("採用年月日")
            ? "結果日（採用年月日）の順に並べています。結果がまだの応募は最後にまとめています。"
            : sort.startsWith("雇用開始日")
              ? "雇用開始日の順に並べています。まだ雇用開始していない人は最後にまとめています。"
              : "応募日の順に並べています。"}
        </p>
      )}

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          {query
            ? `「${query}」に一致する応募はありません。`
            : filter === "no_referral"
              ? "紹介手数料台帳に未追加の採用はありません。"
              : "該当する応募はありません。"}
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((a) => {
            const referral = referralFees[a.id];
            return (
              <Card key={a.id} className="p-3.5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    {/* 氏名はコピーできるよう、リンクとコピーボタンを分けて置く */}
                    <div className="mb-0.5 flex items-center gap-1.5">
                      <Link
                        href={a.workers ? `/workers/${a.workers.id}` : "#"}
                        className="min-w-0 truncate font-bold underline-offset-2 hover:text-brand hover:underline"
                      >
                        {a.workers?.name ?? "（削除済み）"}
                      </Link>
                      {a.workers?.name && (
                        <CopyButton value={a.workers.name} label={`${a.workers.name} の氏名をコピー`} />
                      )}
                      <ApplicationResultBadge result={a.result as ApplicationResult} />
                    </div>
                    <Link
                      href={a.workers ? `/workers/${a.workers.id}` : "#"}
                      className="block min-w-0"
                    >
                      <p className="truncate text-xs text-muted">
                        {a.job_postings?.display_company || a.organizations?.name || "応募先"}
                      </p>
                    </Link>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-muted" />
                </div>

                {/* 受付から雇用開始までの日付の流れ。
                    棒線の上に並べて、どこまで進んでいて、どこを直すかが分かるようにする */}
                <div className="mt-2 border-t border-border pt-2">
                  <p className="mb-1 flex items-center gap-1 text-[10px] font-bold text-muted">
                    <CalendarClock size={11} />
                    受付から雇用開始までの流れ
                    {/* 求職票は求職受付のときに作る書類なので、この流れの並びに置く */}
                    <Link
                      href={`/workers/${a.worker_id}/jobseeker-card`}
                      className="ml-auto flex items-center gap-1 rounded-lg border border-border px-2 py-1 font-bold text-brand"
                    >
                      <ClipboardList size={11} />
                      求職票
                    </Link>
                  </p>
                  <LedgerDateFlow steps={dateStepsOf(a)} bad={issueKinds(dateIssuesOf(a))} />
                </div>

                {/* 帳簿の日付の並びがおかしいときは、そのカードにも出す */}
                {dateIssuesOf(a).length > 0 && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-seal/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-seal">
                    <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                    <span>
                      日付を訂正してください（{dateIssuesOf(a).map((i) => i.message).join("・")}）
                    </span>
                  </p>
                )}

                {/* 紹介手数料台帳との紐づけ（採用 → 台帳に追加 → 請求・入金の状態を表示） */}
                {referral ? (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-xs">
                    <span className="flex items-center gap-1 font-bold text-muted">
                      <HandCoins size={12} />
                      紹介手数料
                    </span>
                    <span className="font-bold tabular-nums">{formatSalesYen(referral.fee)}</span>
                    <span className="text-muted">
                      紹介売上No. {referral.salesNo || "未入力"}
                    </span>
                    <span className={referral.paidOn ? "font-bold text-brand" : "font-bold text-seal"}>
                      {referral.paidOn
                        ? `入金済み ${referral.paidOn}`
                        : referral.billedOn
                          ? `請求済み・未入金（請求 ${referral.billedOn}）`
                          : "未請求"}
                    </span>
                    <Link href="/referrals" className="ml-auto font-bold text-brand underline-offset-2 hover:underline">
                      手数料管理簿を見る
                    </Link>
                  </div>
                ) : (
                  canEdit &&
                  a.result === "採用" && (
                    <div className="mt-2 border-t border-border pt-2">
                      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-muted">
                        <HandCoins size={12} />
                        紹介手数料台帳に追加する内容
                      </p>
                      {/* 手数料管理簿から直接入れた行がある人。二重に追加しないよう先に確認する */}
                      {ledgerStatus(a) === "別行あり" && (
                        <p className="mb-1.5 rounded-lg bg-status-notice-bg px-2 py-1.5 text-[11px] text-status-notice-fg">
                          同じ人・同じ会社の行が紹介手数料台帳にすでにあります（この応募とは紐づいていません）。
                          二重に追加しないよう、
                          <Link href="/referrals" className="font-bold underline underline-offset-2">
                            手数料管理簿
                          </Link>
                          で確認してから追加してください。
                        </p>
                      )}
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] text-muted">紹介手数料（円・税抜）</span>
                          <input
                            inputMode="numeric"
                            value={formatAmountInput(feeDraft(a).fee)}
                            onChange={(e) => setFeeDraft(a, { fee: formatAmountInput(e.target.value) })}
                            placeholder="例: 30,000"
                            className="min-h-[36px] w-32 rounded-lg border border-border bg-background px-2 text-xs tabular-nums focus:border-brand focus:outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] text-muted">紹介売上No.（freee販売）</span>
                          <input
                            value={feeDraft(a).salesNo}
                            onChange={(e) => setFeeDraft(a, { salesNo: e.target.value })}
                            placeholder="例: S-0000004378"
                            className="min-h-[36px] w-44 rounded-lg border border-border bg-background px-2 text-xs tabular-nums focus:border-brand focus:outline-none"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void addToLedger(a)}
                          disabled={referralBusyId === a.id || !parseAmount(feeDraft(a).fee)}
                          className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-brand px-3 py-1.5 text-xs font-bold text-brand disabled:opacity-50"
                        >
                          <HandCoins size={14} />
                          {referralBusyId === a.id ? "追加中…" : "紹介手数料台帳に追加"}
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-muted">
                        手数料は所属機関マスタのあっせん明細から入れています（数字だけ・税抜）。
                        紹介売上No.はあとから手数料管理簿でも入れられます。
                      </p>
                    </div>
                  )
                )}

                {canEdit && (
                  <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                    <span className="text-[11px] font-bold text-muted">結果変更:</span>
                    <select
                      value={a.result}
                      onChange={(e) => changeResult(a.id, e.target.value as ApplicationResult)}
                      className="min-h-[36px] flex-1 rounded-lg border border-border bg-background px-2 text-xs font-bold"
                    >
                      {APPLICATION_RESULTS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setEditing(a)}
                      className="flex items-center gap-1 rounded-lg border border-brand px-2.5 py-1.5 text-[11px] font-bold text-brand"
                      title="応募日（紹介年月日）・結果日（採用年月日）・応募先を直します"
                    >
                      <Pencil size={12} />
                      応募を編集
                    </button>
                    <button
                      type="button"
                      onClick={() => setLedgerFor(a)}
                      className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted"
                      title="求職受付番号（求職管理簿の受付年月日）や採用後の記載事項を入れます"
                    >
                      <NotebookPen size={12} />
                      帳簿情報
                    </button>
                    {a.job_postings?.id && (
                      <Link
                        href={`/postings/${a.job_postings.id}`}
                        className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted"
                        title="求人管理簿の受付年月日（求人受付日）は求人の画面で直します"
                      >
                        <NotebookPen size={12} />
                        求人受付日を直す
                      </Link>
                    )}
                    {a.result === "採用" && (
                      <Link
                        href={`/workers/${a.worker_id}#contracts`}
                        className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-brand"
                        title="雇用契約書・雇用条件書を外国人詳細で登録する"
                      >
                        <FileText size={12} />
                        契約書
                      </Link>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {adding && (
        <JobApplicationDialog
          initial={null}
          postings={postings}
          workers={workerList}
          organizations={orgList}
          onClose={() => setAdding(false)}
          onSubmit={addApplication}
          onWorkerCreated={(w) =>
            setWorkerList((prev) =>
              [...prev, w].sort((a, b) => a.name.localeCompare(b.name, "ja")),
            )
          }
          onOrganizationCreated={(o) =>
            setOrgList((prev) => [...prev, o].sort((a, b) => a.name.localeCompare(b.name, "ja")))
          }
        />
      )}

      {editing && (
        <JobApplicationDialog
          initial={editing}
          postings={postings}
          organizations={orgList}
          onClose={() => setEditing(null)}
          onSubmit={editApplication}
          onOrganizationCreated={(o) =>
            setOrgList((prev) => [...prev, o].sort((a, b) => a.name.localeCompare(b.name, "ja")))
          }
        />
      )}

      {ledgerFor && (
        <LedgerInfoDialog
          application={ledgerFor}
          onClose={() => setLedgerFor(null)}
          onSaved={(patch) => {
            setRows((prev) =>
              prev.map((r) => (r.id === ledgerFor.id ? { ...r, ...patch } : r)),
            );
            setLedgerFor(null);
          }}
        />
      )}
    </div>
  );
}

// 帳簿情報の編集。求職受付（外国人単位）と採用後の記載事項（応募単位）を
// まとめて入力する。求職管理簿・求人管理簿のExcel出力に使われる
function LedgerInfoDialog({
  application,
  onClose,
  onSaved,
}: {
  application: ApplicationWithRefs;
  onClose: () => void;
  onSaved: (patch: Partial<ApplicationWithRefs>) => void;
}) {
  const [jobseekerNo, setJobseekerNo] = useState("");
  const [acceptedOn, setAcceptedOn] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [term, setTerm] = useState(application.employment_term ?? "");
  const [sepStatus, setSepStatus] = useState(application.separation_status ?? "");
  const [sepOn, setSepOn] = useState(application.separation_checked_on ?? "");
  const [sepMethod, setSepMethod] = useState(application.separation_check_method ?? "");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 求職受付情報は外国人に持たせているため開いたときに読み込む
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() =>
      createClient()
        .from("workers")
        .select("jobseeker_no, jobseeker_accepted_on, jobseeker_valid_until")
        .eq("id", application.worker_id)
        .single()
        .then(({ data, error: err }) => {
          if (cancelled) return;
          if (err) {
            setError(dbErrorMessage(err, "0079_recruit_ledgers.sql", "読み込みに失敗しました"));
          } else {
            const w = data as {
              jobseeker_no: string | null;
              jobseeker_accepted_on: string | null;
              jobseeker_valid_until: string | null;
            };
            setJobseekerNo(w.jobseeker_no ?? "");
            setAcceptedOn(w.jobseeker_accepted_on ?? "");
            setValidUntil(w.jobseeker_valid_until ?? "");
          }
          setLoading(false);
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [application.worker_id]);

  const save = async () => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      const { error: wErr } = await supabase
        .from("workers")
        .update({
          jobseeker_no: jobseekerNo.trim(),
          jobseeker_accepted_on: acceptedOn || null,
          jobseeker_valid_until: validUntil || null,
        })
        .eq("id", application.worker_id);
      if (wErr) throw wErr;
      const patch = {
        employment_term: term,
        separation_status: sepStatus,
        separation_checked_on: sepOn || null,
        separation_check_method: sepMethod.trim(),
      };
      const { error: aErr } = await supabase
        .from("job_applications")
        .update(patch)
        .eq("id", application.id);
      if (aErr) throw aErr;
      onSaved(patch);
    } catch (err) {
      setError(dbErrorMessage(err, "0079_recruit_ledgers.sql", "保存に失敗しました"));
      setBusy(false);
    }
  };

  const INPUT =
    "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

  return (
    <Modal open title={`帳簿情報（${application.workers?.name ?? ""}）`} onClose={onClose}>
      <div className="flex flex-col gap-2.5">
        {error && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}

        <p className="text-xs font-bold text-muted">求職受付（求職管理簿・この外国人に共通）</p>
        <div className="grid grid-cols-3 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">求職受付番号</span>
            <input
              value={jobseekerNo}
              onChange={(e) => setJobseekerNo(e.target.value)}
              placeholder="R8KS-2"
              disabled={loading}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">
              受付年月日（求職管理簿）
            </span>
            <input
              type="date"
              value={acceptedOn}
              onChange={(e) => setAcceptedOn(e.target.value)}
              disabled={loading}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">有効期間</span>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              disabled={loading}
              className={INPUT}
            />
          </label>
        </div>
        <p className="text-[11px] text-muted">
          受付年月日が未入力のときは最初の応募日で代用して出力します。希望職種は外国人の「特定産業分野・職種」を使います。
        </p>

        <p className="mt-1 text-xs font-bold text-muted">採用後の記載事項（この応募）</p>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">雇用期間</span>
            <select value={term} onChange={(e) => setTerm(e.target.value)} className={INPUT}>
              <option value="">未選択</option>
              <option value="無期">無期</option>
              <option value="有期">有期</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">6か月以内の離職状況</span>
            <select
              value={sepStatus}
              onChange={(e) => setSepStatus(e.target.value)}
              className={INPUT}
            >
              <option value="">未調査</option>
              {SEPARATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">調査日</span>
            <input
              type="date"
              value={sepOn}
              onChange={(e) => setSepOn(e.target.value)}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">調査方法</span>
            <input
              value={sepMethod}
              onChange={(e) => setSepMethod(e.target.value)}
              placeholder="電話確認"
              className={INPUT}
            />
          </label>
        </div>
        <p className="text-[11px] text-muted">
          無期雇用のときだけ、転職勧奨禁止期間（採用日から2年）と離職状況が帳簿に記載されます。
        </p>

        <Button fullWidth disabled={busy || loading} onClick={() => void save()} className="mt-1">
          {busy ? "保存中…" : "保存する"}
        </Button>
      </div>
    </Modal>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-background p-3 text-center">
      <p className="text-xl font-black tabular-nums">{value}</p>
      <p className="text-[11px] font-medium text-muted">{label}</p>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
        active ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface text-muted"
      }`}
    >
      {label}
    </button>
  );
}
