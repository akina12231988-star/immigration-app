"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronRight, HandCoins, Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
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
import { dbErrorMessage } from "@/lib/errors";
import { APPLICATION_RESULTS, type ApplicationResult } from "@/types/recruiting";
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
          {canEdit && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="ml-auto flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-brand-foreground"
            >
              <Plus size={14} />
              応募を登録
            </button>
          )}
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
    </div>
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
