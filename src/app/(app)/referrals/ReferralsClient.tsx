"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import {
  deleteReferralFee,
  insertReferralFee,
  listReferralFees,
  updateReferralFee,
  type ReferralFeeWithRefs,
} from "@/lib/supabase/queries/referrals";
import { formatSalesYen, REFERRAL_SALES_KEY } from "@/lib/sales";
import { normalizeSalesItems, parseAmount } from "@/lib/organization-intake";
import { isMonthStr, monthLabel } from "@/lib/monthly-billing";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import type { Organization } from "@/types/db";

export interface ReferralWorkerOption {
  id: string;
  name: string;
  current_organization_id: string | null;
  residence_permit_date: string | null;
  residence_status: string;
}

const TABS = ["すべて", "未請求", "請求済み・未入金", "入金済み"] as const;
type Tab = (typeof TABS)[number];

// 紹介手数料台帳: 全所属機関のあっせん（人材紹介）手数料をまとめて管理し、
// 請求年月日・入金年月日を記録する。対象の年月は在留許可日の月で絞り込む
// （毎月の台帳＝その月に許可が下りた人。全期間表示もできる）
export function ReferralsClient({
  canEdit,
  workers,
  organizations,
  today,
}: {
  canEdit: boolean;
  workers: ReferralWorkerOption[];
  organizations: Organization[];
  today: string;
}) {
  const [rows, setRows] = useState<ReferralFeeWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("すべて");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [allMonths, setAllMonths] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 追加フォーム
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workerId, setWorkerId] = useState("");
  const [domestic, setDomestic] = useState("国内");
  const [jobseekerNo, setJobseekerNo] = useState("");
  const [employerName, setEmployerName] = useState("");
  const [referredOn, setReferredOn] = useState("");
  const [hiredOn, setHiredOn] = useState("");
  const [fee, setFee] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    // レンダー中の同期setStateを避けるため、読み込みはマイクロタスクで開始する
    void Promise.resolve().then(() =>
      listReferralFees(createClient())
        .then((data) => {
          if (!cancelled) setRows(data);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(dbErrorMessage(err, "0067_referral_fees.sql", "読み込みに失敗しました"));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // 外国人を選んだら、所属機関・求人者・手数料（所属機関マスタのあっせん明細）を自動で入れる
  const selectWorker = (id: string) => {
    setWorkerId(id);
    const w = workers.find((x) => x.id === id);
    if (!w) return;
    const org = organizations.find((o) => o.id === w.current_organization_id);
    if (org) {
      setEmployerName((prev) => prev || org.name);
      const items = normalizeSalesItems(org.intake?.sales_items)[REFERRAL_SALES_KEY] ?? [];
      const amount = parseAmount(items[0]?.amount ?? "");
      if (amount && !fee) setFee(String(amount));
    }
  };

  const add = async () => {
    if (!workerId) return;
    const w = workers.find((x) => x.id === workerId);
    setSaving(true);
    setError(null);
    try {
      const row = await insertReferralFee(createClient(), {
        worker_id: workerId,
        organization_id: w?.current_organization_id ?? null,
        worker_name: w?.name ?? "",
        domestic,
        jobseeker_no: jobseekerNo.trim(),
        employer_name: employerName.trim(),
        referred_on: referredOn || null,
        hired_on: hiredOn || null,
        fee: Number(fee.replace(/[^0-9]/g, "")) || 0,
        sales_no: "",
        billed_on: null,
        paid_on: null,
        note: note.trim(),
      });
      // 一覧表示用に外国人・機関情報を合わせて持たせる
      const org = organizations.find((o) => o.id === w?.current_organization_id);
      setRows((prev) => [
        {
          ...row,
          workers: w
            ? {
                name: w.name,
                residence_permit_date: w.residence_permit_date,
                residence_status: w.residence_status,
              }
            : null,
          organizations: org ? { name: org.name } : null,
        },
        ...prev,
      ]);
      setWorkerId("");
      setJobseekerNo("");
      setEmployerName("");
      setReferredOn("");
      setHiredOn("");
      setFee("");
      setNote("");
      setAdding(false);
    } catch (err) {
      setError(dbErrorMessage(err, "0067_referral_fees.sql", errorMessage(err, "追加に失敗しました")));
    } finally {
      setSaving(false);
    }
  };

  // 行の一部（請求年月日・入金年月日・紹介売上No.・手数料など）をその場で保存する
  const patchRow = async (
    id: string,
    patch: Partial<Pick<ReferralFeeWithRefs, "billed_on" | "paid_on" | "sales_no" | "fee" | "note">>,
  ) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    try {
      await updateReferralFee(createClient(), id, patch);
    } catch (err) {
      setError(errorMessage(err, "保存に失敗しました"));
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("この台帳の行を削除します。よろしいですか？")) return;
    setBusyId(id);
    try {
      await deleteReferralFee(createClient(), id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(errorMessage(err, "削除に失敗しました"));
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (!allMonths && isMonthStr(month)) {
          const permit = r.workers?.residence_permit_date ?? "";
          if (!permit.startsWith(month)) return false;
        }
        if (tab === "未請求") return !r.billed_on;
        if (tab === "請求済み・未入金") return Boolean(r.billed_on) && !r.paid_on;
        if (tab === "入金済み") return Boolean(r.paid_on);
        return true;
      }),
    [rows, tab, month, allMonths],
  );
  const total = filtered.reduce((sum, r) => sum + r.fee, 0);

  const INPUT =
    "min-h-[40px] rounded-xl border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none";
  const CELL_INPUT =
    "rounded-lg border border-border bg-background px-1.5 py-1 text-xs focus:border-brand focus:outline-none";

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-muted">
        全所属機関のあっせん（人材紹介）手数料をまとめて管理する台帳です。freee販売に登録したら紹介売上No.を、
        請求書を発行したら請求年月日を、入金を確認したら入金年月日を記録してください。
        手数料は税抜で入力します。対象の年月は在留許可日の月で絞り込みます。
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">対象の年月（在留許可日）</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={allMonths}
            className={`${INPUT} disabled:opacity-50`}
          />
        </label>
        <label className="flex min-h-[40px] items-center gap-1.5 text-xs font-bold">
          <input
            type="checkbox"
            checked={allMonths}
            onChange={(e) => setAllMonths(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          全期間を表示
        </label>
        {canEdit && (
          <Button icon={<Plus size={16} />} className="ml-auto" onClick={() => setAdding((v) => !v)}>
            台帳に追加
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
              tab === t
                ? "border-brand bg-brand text-brand-foreground"
                : "border-border bg-surface text-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {canEdit && adding && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-bold">台帳に追加</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">外国人</span>
              <select value={workerId} onChange={(e) => selectWorker(e.target.value)} className={INPUT}>
                <option value="">選択してください</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-muted">
                所属機関・求人者・手数料（所属機関のあっせん明細）を自動で入れます
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">国内・国外</span>
              <select value={domestic} onChange={(e) => setDomestic(e.target.value)} className={INPUT}>
                <option value="国内">国内</option>
                <option value="国外">国外</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">求職受付番号</span>
              <input
                value={jobseekerNo}
                onChange={(e) => setJobseekerNo(e.target.value)}
                placeholder="例: R8KS-2"
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">求人者（求職簿）</span>
              <input
                value={employerName}
                onChange={(e) => setEmployerName(e.target.value)}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">紹介年月日</span>
              <input
                type="date"
                value={referredOn}
                onChange={(e) => setReferredOn(e.target.value)}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">採用年月日</span>
              <input
                type="date"
                value={hiredOn}
                onChange={(e) => setHiredOn(e.target.value)}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">手数料（円・税抜）</span>
              <input
                value={fee}
                onChange={(e) => setFee(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                placeholder="例: 30000"
                className={`${INPUT} text-right`}
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[11px] font-bold text-muted">備考</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} />
            </label>
          </div>
          <Button
            fullWidth
            className="mt-3"
            disabled={saving || !workerId}
            onClick={() => void add()}
          >
            {saving ? "追加中…" : "台帳に追加する"}
          </Button>
        </Card>
      )}

      <p className="text-sm font-bold text-muted">
        {allMonths ? "全期間" : monthLabel(month)} ・ {filtered.length}件 ・ 手数料合計{" "}
        {formatSalesYen(total)}
      </p>

      {loading ? (
        <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" />
          読み込み中…
        </p>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">該当する行はありません。</Card>
      ) : (
        <Card className="p-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1250px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-1.5 pr-2 font-bold">氏名</th>
                  <th className="py-1.5 pr-2 font-bold">所属機関</th>
                  <th className="py-1.5 pr-2 font-bold">国内・国外</th>
                  <th className="py-1.5 pr-2 font-bold">求職受付番号</th>
                  <th className="py-1.5 pr-2 font-bold">求人者</th>
                  <th className="py-1.5 pr-2 font-bold">紹介日</th>
                  <th className="py-1.5 pr-2 font-bold">採用日</th>
                  <th className="py-1.5 pr-2 font-bold">在留許可日</th>
                  <th className="py-1.5 pr-2 font-bold">在留資格</th>
                  <th className="py-1.5 pr-2 text-right font-bold">手数料（税抜）</th>
                  <th className="py-1.5 pr-2 font-bold">紹介売上No.</th>
                  <th className="py-1.5 pr-2 font-bold">請求年月日</th>
                  <th className="py-1.5 pr-2 font-bold">入金年月日</th>
                  <th className="py-1.5 pr-2 font-bold">備考</th>
                  {canEdit && <th className="py-1.5 font-bold" />}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="py-1.5 pr-2">
                      {r.worker_id ? (
                        <Link
                          href={`/workers/${r.worker_id}`}
                          className="font-bold underline-offset-2 hover:text-brand hover:underline"
                        >
                          {r.workers?.name ?? r.worker_name}
                        </Link>
                      ) : (
                        <span className="font-bold">{r.worker_name}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-muted">{r.organizations?.name ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-muted">{r.domestic}</td>
                    <td className="py-1.5 pr-2 text-muted">{r.jobseeker_no || "—"}</td>
                    <td className="py-1.5 pr-2 text-muted">{r.employer_name || "—"}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-muted">{r.referred_on ?? "—"}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-muted">{r.hired_on ?? "—"}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-muted">
                      {r.workers?.residence_permit_date ?? "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-muted">{r.workers?.residence_status || "—"}</td>
                    <td className="py-1.5 pr-2 text-right">
                      {canEdit ? (
                        <input
                          defaultValue={r.fee ? String(r.fee) : ""}
                          onBlur={(e) => {
                            const v = Number(e.target.value.replace(/[^0-9]/g, "")) || 0;
                            if (v !== r.fee) void patchRow(r.id, { fee: v });
                          }}
                          inputMode="numeric"
                          className={`${CELL_INPUT} w-24 text-right tabular-nums`}
                        />
                      ) : (
                        <span className="font-bold tabular-nums">{formatSalesYen(r.fee)}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      {canEdit ? (
                        <input
                          defaultValue={r.sales_no}
                          onBlur={(e) => {
                            if (e.target.value !== r.sales_no)
                              void patchRow(r.id, { sales_no: e.target.value.trim() });
                          }}
                          placeholder="S-…"
                          className={`${CELL_INPUT} w-32`}
                        />
                      ) : (
                        <span className="text-muted">{r.sales_no || "—"}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      {canEdit ? (
                        <input
                          type="date"
                          value={r.billed_on ?? ""}
                          onChange={(e) => void patchRow(r.id, { billed_on: e.target.value || null })}
                          className={`${CELL_INPUT} ${r.billed_on ? "" : "border-seal/40 bg-seal/5"}`}
                        />
                      ) : (
                        <span className="tabular-nums text-muted">{r.billed_on ?? "未請求"}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      {canEdit ? (
                        <input
                          type="date"
                          value={r.paid_on ?? ""}
                          onChange={(e) => void patchRow(r.id, { paid_on: e.target.value || null })}
                          className={`${CELL_INPUT} ${r.paid_on ? "" : "border-seal/40 bg-seal/5"}`}
                        />
                      ) : (
                        <span className="tabular-nums text-muted">{r.paid_on ?? "未入金"}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      {canEdit ? (
                        <input
                          defaultValue={r.note}
                          onBlur={(e) => {
                            if (e.target.value !== r.note)
                              void patchRow(r.id, { note: e.target.value });
                          }}
                          className={`${CELL_INPUT} w-28`}
                        />
                      ) : (
                        <span className="text-muted">{r.note || "—"}</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => void remove(r.id)}
                          disabled={busyId === r.id}
                          aria-label="この行を削除"
                          className="text-seal disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                <tr>
                  <td colSpan={9} className="py-1.5 pr-2 text-right font-bold">
                    手数料合計
                  </td>
                  <td className="py-1.5 pr-2 text-right font-bold tabular-nums text-brand">
                    {formatSalesYen(total)}
                  </td>
                  <td colSpan={canEdit ? 5 : 4} />
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
