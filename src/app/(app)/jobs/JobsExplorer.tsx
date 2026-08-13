"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  HandCoins,
  NotebookPen,
  Plus,
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
import { formatSalesYen, REFERRAL_SALES_KEY } from "@/lib/sales";
import { normalizeSalesItems, parseAmount } from "@/lib/organization-intake";
import { buildXlsx, downloadBlob } from "@/lib/xlsx-export";
import { buildSeekerLedgerSheet } from "@/lib/recruit-ledgers";
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

type ResultFilter = ApplicationResult | "all";

export function JobsExplorer({
  applications,
  postings,
  organizations,
  workers,
  initialReferralFees,
  canEdit,
}: {
  applications: ApplicationWithRefs[];
  postings: PostingWithStats[];
  organizations: Organization[];
  workers: { id: string; name: string }[];
  initialReferralFees: Record<string, ApplicationReferralFee>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState(applications);
  const [error, setError] = useState<string | null>(null);

  // 新規の応募登録（求職一覧から直接記入する）
  const [adding, setAdding] = useState(false);

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

  const stats = useMemo(() => {
    const s = { total: inPeriod.length, 選考中: 0, 採用: 0, 不採用: 0, 辞退: 0 };
    for (const a of inPeriod) s[a.result as ApplicationResult] += 1;
    return s;
  }, [inPeriod]);

  const filtered = useMemo(
    () => (filter === "all" ? inPeriod : inPeriod.filter((a) => a.result === filter)),
    [inPeriod, filter],
  );

  const addApplication = async (values: JobApplicationValues, workerId?: string) => {
    if (!workerId) throw new Error("外国人を選択してください");
    const row = await insertApplication(createClient(), { ...values, worker_id: workerId });
    // 一覧にすぐ出せるよう、選択肢から表示用の名前を組み立てる
    const w = workers.find((x) => x.id === workerId);
    const org = organizations.find((o) => o.id === values.organization_id);
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
      const org = organizations.find((o) => o.id === a.organization_id);
      const items = normalizeSalesItems(org?.intake?.sales_items)[REFERRAL_SALES_KEY] ?? [];
      const fee = parseAmount(items[0]?.amount ?? "") ?? 0;
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
        sales_no: "",
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
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          <StatBox label="応募" value={stats.total} />
          <StatBox label="選考中" value={stats.選考中} />
          <StatBox label="採用" value={stats.採用} />
          <StatBox label="不採用" value={stats.不採用} />
          <StatBox label="辞退" value={stats.辞退} />
        </div>
      </Card>

      {/* ステータス絞り込み */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Chip label="すべて" active={filter === "all"} onClick={() => setFilter("all")} />
        {APPLICATION_RESULTS.map((r) => (
          <Chip key={r} label={r} active={filter === r} onClick={() => setFilter(r)} />
        ))}
      </div>

      <p className="text-sm font-bold text-muted">{filtered.length}件</p>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">該当する応募はありません。</Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((a) => {
            const referral = referralFees[a.id];
            return (
              <Card key={a.id} className="p-3.5">
                <div className="flex items-center gap-3">
                  <Link href={a.workers ? `/workers/${a.workers.id}` : "#"} className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-2">
                      <p className="truncate font-bold">{a.workers?.name ?? "（削除済み）"}</p>
                      <ApplicationResultBadge result={a.result as ApplicationResult} />
                    </div>
                    <p className="truncate text-xs text-muted">
                      {a.job_postings?.display_company || a.organizations?.name || "応募先"}
                    </p>
                    <p className="flex items-center gap-1 text-xs tabular-nums text-muted">
                      <CalendarClock size={12} />
                      応募 {a.applied_on}
                      {a.interview_on && ` ・ 面接 ${a.interview_on}`}
                      {a.result_on && ` ・ 結果 ${a.result_on}`}
                    </p>
                  </Link>
                  <ChevronRight size={16} className="shrink-0 text-muted" />
                </div>

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
                      <button
                        type="button"
                        onClick={() => void addToLedger(a)}
                        disabled={referralBusyId === a.id}
                        className="flex items-center gap-1.5 rounded-lg border border-brand px-3 py-1.5 text-xs font-bold text-brand disabled:opacity-50"
                      >
                        <HandCoins size={14} />
                        {referralBusyId === a.id ? "追加中…" : "紹介手数料台帳に追加"}
                      </button>
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
                      onClick={() => setLedgerFor(a)}
                      className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted"
                      title="求職受付番号や採用後の記載事項（求職管理簿・求人管理簿に出ます）"
                    >
                      <NotebookPen size={12} />
                      帳簿情報
                    </button>
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
          workers={workers}
          onClose={() => setAdding(false)}
          onSubmit={addApplication}
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
            <span className="text-xs font-bold text-muted">受付年月日</span>
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
