"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { setWorkerRecurringSalesNo } from "@/lib/supabase/queries/workers";
import { updateOrganization } from "@/lib/supabase/queries/organizations";
import {
  addMonthlySupportRegistration,
  deleteMonthlySupportRegistration,
  listMonthlySupportRegistrations,
} from "@/lib/supabase/queries/sales";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import type { MonthlySupportRegistration } from "@/types/db";
import { dailyFee, formatSalesYen } from "@/lib/sales";
import {
  currentMonth,
  daysText,
  isMonthStr,
  monthLabel,
  periodText,
  summarizeMonthlyBilling,
  type BillingOrg,
  type BillingWorker,
  type MonthlyBillingOrg,
  type MonthlyBillingRow,
} from "@/lib/monthly-billing";
import {
  billingFileName,
  monthlyBillingSheets,
  orgBillingSheets,
} from "@/lib/monthly-billing-sheets";
import { buildXlsx, downloadBlob } from "@/lib/xlsx-export";

// 月末の請求書作成。年月を選ぶと、その月に1日でも在籍していた支援対象者を
// 所属機関ごとに並べ、支援費の請求額（満額・日割り）を出す。
// 所属機関へ在籍名簿をメールで送るため、エクセルで書き出せる。

// 選んだ対象の年月の保存キー（タブ内で保持し、ページを離れて戻っても選択が消えないように）
const MONTH_STORE_KEY = "monthly-billing-month";
export function MonthlyBillingSection({
  workers,
  organizations,
  today,
  canEdit,
}: {
  workers: BillingWorker[];
  organizations: BillingOrg[];
  today: string;
  canEdit: boolean;
}) {
  const [month, setMonth] = useState(() => currentMonth(today));
  const [openOrgId, setOpenOrgId] = useState<string | null>(null);

  // 選んだ年月はタブを閉じるまで保持する（ページを離れて戻っても今月に戻らないように）。
  // 新しいタブ・ブラウザを開き直したときは今月に戻る
  useEffect(() => {
    // レンダー中の同期setStateを避けるため、反映はマイクロタスクで行う
    void Promise.resolve().then(() => {
      const saved = window.sessionStorage.getItem(MONTH_STORE_KEY);
      if (saved && isMonthStr(saved)) setMonth(saved);
    });
  }, []);
  const changeMonth = (value: string) => {
    setMonth(value);
    try {
      window.sessionStorage.setItem(MONTH_STORE_KEY, value);
    } catch {
      /* プライベートブラウズなどで保存できなくても画面は動かす */
    }
  };
  const [salesNos, setSalesNos] = useState<Record<string, string>>({});
  // 定期売上No.の並び順（null=氏名順・asc=昇順・desc=降順）
  const [salesNoSort, setSalesNoSort] = useState<"asc" | "desc" | null>(null);
  // このページで登録した支援代（月額）。organization_id → 数字だけの文字列
  const [orgFees, setOrgFees] = useState<Record<string, string>>({});
  const [feeDraft, setFeeDraft] = useState("");
  const [feeSaving, setFeeSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 定期売上No. は画面で編集した内容を優先して集計に反映する
  const merged = useMemo(
    () =>
      workers.map((w) =>
        salesNos[w.id] === undefined ? w : { ...w, recurring_sales_no: salesNos[w.id] },
      ),
    [workers, salesNos],
  );
  // 支援代（月額）もこのページで登録した内容を優先して集計に反映する
  const mergedOrgs = useMemo(
    () =>
      organizations.map((o) =>
        orgFees[o.id] === undefined
          ? o
          : { ...o, intake: { ...(o.intake ?? {}), support_fee: orgFees[o.id] } },
      ),
    [organizations, orgFees],
  );
  const billing = useMemo(
    () => summarizeMonthlyBilling(merged, mergedOrgs, month),
    [merged, mergedOrgs, month],
  );

  // 定期売上No.でのソート。未登録は常に最後（氏名順のままの集計順は billing 側）
  const sortRows = (rows: MonthlyBillingRow[]): MonthlyBillingRow[] => {
    if (!salesNoSort) return rows;
    return [...rows].sort((a, b) => {
      const av = a.worker.recurring_sales_no || "";
      const bv = b.worker.recurring_sales_no || "";
      if (!av && !bv) return a.worker.name.localeCompare(b.worker.name, "ja");
      if (!av) return 1;
      if (!bv) return -1;
      const cmp = av.localeCompare(bv, "ja");
      return salesNoSort === "asc" ? cmp : -cmp;
    });
  };

  // ◯月分の支援代をfreeeに登録した記録（worker_id → 記録）。対象の年月ごとに読み込む
  const [regs, setRegs] = useState<Record<string, MonthlySupportRegistration>>({});
  const [regBusyId, setRegBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // レンダー中の同期setStateを避けるため、読み込みはマイクロタスクで開始する
    void Promise.resolve().then(() =>
      listMonthlySupportRegistrations(createClient(), month)
        .then((rows) => {
          if (!cancelled) setRegs(Object.fromEntries(rows.map((r) => [r.worker_id, r])));
        })
        .catch(() => {
          // テーブル未作成（マイグレーション未実行）でも画面は使えるようにする
          if (!cancelled) setRegs({});
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [month]);

  // 在留資格が特定活動なら「サポート代」、それ以外は「支援代」
  const feeNameFor = (residenceStatus: string | null | undefined): string =>
    (residenceStatus ?? "").includes("特定活動") ? "サポート代" : "支援代";
  const monthNum = Number(month.slice(5, 7)) || 0;

  // 「freee売上登録」ボタン: ◯月分の支援代を登録した記録を残す
  const registerMonthly = async (workerId: string, residenceStatus: string | null) => {
    setRegBusyId(workerId);
    setError(null);
    try {
      const row = await addMonthlySupportRegistration(createClient(), {
        worker_id: workerId,
        month,
        fee_name: feeNameFor(residenceStatus),
        registered_on: today,
      });
      setRegs((prev) => ({ ...prev, [workerId]: row }));
    } catch (err) {
      setError(
        dbErrorMessage(
          err,
          "0066_monthly_support_registrations.sql",
          errorMessage(err, "登録記録の保存に失敗しました"),
        ),
      );
    } finally {
      setRegBusyId(null);
    }
  };

  const unregisterMonthly = async (workerId: string) => {
    const reg = regs[workerId];
    if (!reg) return;
    setRegBusyId(workerId);
    setError(null);
    try {
      await deleteMonthlySupportRegistration(createClient(), reg.id);
      setRegs((prev) => {
        const next = { ...prev };
        delete next[workerId];
        return next;
      });
    } catch (err) {
      setError(errorMessage(err, "登録記録の取り消しに失敗しました"));
    } finally {
      setRegBusyId(null);
    }
  };

  // 支援代（月額）をこのページから所属機関に登録する（数字だけ）
  const saveOrgFee = async (orgId: string) => {
    const digits = feeDraft.replace(/[^0-9]/g, "");
    if (!digits || Number(digits) <= 0) {
      setError("支援代（月額）は数字だけで入力してください");
      return;
    }
    setFeeSaving(true);
    setError(null);
    try {
      const org = organizations.find((o) => o.id === orgId);
      await updateOrganization(createClient(), orgId, {
        intake: { ...(org?.intake ?? {}), support_fee: digits },
      });
      setOrgFees((prev) => ({ ...prev, [orgId]: digits }));
      setFeeDraft("");
    } catch (err) {
      setError(errorMessage(err, "支援代（月額）の保存に失敗しました"));
    } finally {
      setFeeSaving(false);
    }
  };

  const download = async (org?: MonthlyBillingOrg) => {
    setBusy(true);
    setError(null);
    try {
      const sheets = org ? orgBillingSheets(org, billing) : monthlyBillingSheets(billing);
      const blob = await buildXlsx(sheets);
      downloadBlob(blob, billingFileName(billing, org?.organizationName));
    } catch (err) {
      setError(errorMessage(err, "エクセルの書き出しに失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  const saveSalesNo = async (workerId: string, value: string) => {
    setSalesNos((prev) => ({ ...prev, [workerId]: value }));
    try {
      await setWorkerRecurringSalesNo(createClient(), workerId, value.trim());
    } catch (err) {
      setError(errorMessage(err, "定期売上No.の保存に失敗しました"));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="status" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">対象の年月</span>
            <input
              type="month"
              value={month}
              onChange={(e) => changeMonth(e.target.value)}
              className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm"
            />
          </label>
          <Button
            icon={busy ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            disabled={busy || billing.orgs.length === 0}
            onClick={() => void download()}
          >
            全機関のエクセル
          </Button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-muted">
          {monthLabel(month)}に1日でも在籍していた支援対象の1号特定技能外国人（特定活動（特定技能1号移行準備）を含む）を、
          所属機関ごとに並べています。 支援費は所属機関の「毎月の支援代」から計算し、
          その月に支援が始まった人は在留許可日から、退職した人は退職日までを日割りします（1日あたり＝月額÷その月の日数を小数点以下切り捨てで出してから、日数を掛けます）。
        </p>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-xl bg-background p-3">
            <dt className="text-xs text-muted">基準日</dt>
            <dd className="text-lg font-bold">{billing.monthEndOn}</dd>
          </div>
          <div className="rounded-xl bg-background p-3">
            <dt className="text-xs text-muted">掲載人数</dt>
            <dd className="text-lg font-bold">{billing.totalPeople}名</dd>
          </div>
          <div className="rounded-xl bg-background p-3">
            <dt className="text-xs text-muted">うち当月退職</dt>
            <dd className="text-lg font-bold">{billing.totalLeft}名</dd>
          </div>
          <div className="rounded-xl bg-background p-3">
            <dt className="text-xs text-muted">支援費請求額合計</dt>
            <dd className="text-lg font-bold text-brand">{formatSalesYen(billing.totalAmount)}</dd>
          </div>
        </dl>

        {billing.unpriced.length > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              所属機関に「毎月の支援代」が未登録のため、{billing.unpriced.length}名の請求額が0円になっています（
              {[...new Set(billing.unpriced.map((r) => r.worker.name))].slice(0, 5).join("・")}
              {billing.unpriced.length > 5 && " ほか"}）。 所属機関の情報に支援代を登録してください。
            </span>
          </p>
        )}
      </Card>

      {billing.orgs.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          {monthLabel(month)}に在籍していた支援対象者がいません。
        </Card>
      ) : (
        billing.orgs.map((org) => {
          const open = openOrgId === org.organizationId;
          return (
            <Card key={org.organizationId || "none"} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpenOrgId(open ? null : org.organizationId);
                    setFeeDraft("");
                  }}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  {open ? (
                    <ChevronDown size={16} className="shrink-0 text-muted" />
                  ) : (
                    <ChevronRight size={16} className="shrink-0 text-muted" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{org.organizationName}</span>
                    <span className="block text-xs text-muted">
                      {org.rows.length}名
                      {org.leftCount > 0 && `（うち当月退職 ${org.leftCount}名）`} ・{" "}
                      <span className="font-bold text-brand">{formatSalesYen(org.total)}</span>
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void download(org)}
                  className="flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-bold text-brand disabled:opacity-50"
                >
                  <Download size={14} />
                  この機関のみ
                </button>
              </div>

              {open && canEdit && org.organizationId && (org.rows[0]?.monthlyFee ?? 0) <= 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span className="font-bold">支援代（月額）が未登録です。ここから登録できます:</span>
                  <input
                    value={feeDraft}
                    onChange={(e) => setFeeDraft(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    placeholder="例: 12000"
                    className="min-h-[32px] w-28 rounded-lg border border-border bg-surface px-2 text-xs text-foreground focus:border-brand focus:outline-none"
                  />
                  <span>円</span>
                  <button
                    type="button"
                    disabled={feeSaving || !feeDraft}
                    onClick={() => void saveOrgFee(org.organizationId)}
                    className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-foreground disabled:opacity-50"
                  >
                    {feeSaving ? "保存中…" : "保存"}
                  </button>
                  <span className="text-[10px]">所属機関の「毎月の支援代」に保存され、集計にすぐ反映されます</span>
                </div>
              )}

              {open && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted">
                        <th className="py-1.5 pr-2 font-bold">氏名</th>
                        <th className="py-1.5 pr-2 font-bold">在留資格</th>
                        <th className="py-1.5 pr-2 font-bold">
                          <button
                            type="button"
                            onClick={() =>
                              setSalesNoSort((s) =>
                                s === null ? "asc" : s === "asc" ? "desc" : null,
                              )
                            }
                            title="クリックで 昇順 → 降順 → 氏名順 に切り替え"
                            className="inline-flex items-center gap-1 font-bold hover:text-brand"
                          >
                            定期売上No.
                            {salesNoSort === "asc" ? (
                              <ArrowUp size={12} />
                            ) : salesNoSort === "desc" ? (
                              <ArrowDown size={12} />
                            ) : (
                              <ArrowUpDown size={12} className="opacity-50" />
                            )}
                          </button>
                        </th>
                        <th className="py-1.5 pr-2 text-right font-bold">支援代（月額）</th>
                        <th className="py-1.5 pr-2 font-bold">支援費算定期間</th>
                        <th className="py-1.5 pr-2 font-bold">日数</th>
                        <th className="py-1.5 pr-2 font-bold">区分</th>
                        <th className="py-1.5 pr-2 text-right font-bold">支援費請求額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortRows(org.rows).map((row) => (
                        <tr key={row.worker.id} className="border-b border-border/60">
                          <td className="py-1.5 pr-2">
                            <Link
                              href={`/workers/${row.worker.id}`}
                              className="font-bold underline-offset-2 hover:text-brand hover:underline"
                            >
                              {row.worker.name}
                            </Link>
                            {row.leftThisMonth && (
                              <span className="ml-1 rounded-full bg-seal/10 px-1.5 py-0.5 text-[10px] font-bold text-seal">
                                退職 {row.worker.leaving_on}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-2 text-muted">{row.worker.residence_status}</td>
                          <td className="py-1.5 pr-2">
                            <div className="flex items-center gap-1.5">
                              {canEdit ? (
                                <input
                                  defaultValue={row.worker.recurring_sales_no}
                                  onBlur={(e) => {
                                    const v = e.target.value;
                                    if (v !== row.worker.recurring_sales_no) {
                                      void saveSalesNo(row.worker.id, v);
                                    }
                                  }}
                                  placeholder="SP-…"
                                  className={`w-36 rounded-lg border px-1.5 py-1 text-xs ${
                                    row.worker.recurring_sales_no
                                      ? "border-border bg-background"
                                      : "border-seal/40 bg-seal/5"
                                  }`}
                                />
                              ) : (
                                <span className="text-muted">{row.worker.recurring_sales_no || "—"}</span>
                              )}
                              {/* ◯月分の支援代をfreeeに登録した記録（登録漏れ・二重登録の防止） */}
                              {regs[row.worker.id] ? (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-status-approved-bg px-2 py-0.5 text-[10px] font-bold text-status-approved-fg">
                                  <Check size={11} />
                                  {monthNum}月分の{regs[row.worker.id].fee_name}登録済み
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => void unregisterMonthly(row.worker.id)}
                                      disabled={regBusyId === row.worker.id}
                                      className="ml-0.5 underline"
                                    >
                                      取消
                                    </button>
                                  )}
                                </span>
                              ) : (
                                canEdit && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void registerMonthly(row.worker.id, row.worker.residence_status)
                                    }
                                    disabled={regBusyId === row.worker.id}
                                    title={`freeeに${monthNum}月分の${feeNameFor(row.worker.residence_status)}を登録したら押して記録します`}
                                    className="shrink-0 rounded-lg border border-brand px-2 py-1 text-[10px] font-bold text-brand disabled:opacity-50"
                                  >
                                    freee売上登録
                                  </button>
                                )
                              )}
                            </div>
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">
                            {row.monthlyFee > 0 ? formatSalesYen(row.monthlyFee) : "未登録"}
                          </td>
                          <td className="py-1.5 pr-2 tabular-nums text-muted">{periodText(row)}</td>
                          <td className="py-1.5 pr-2 tabular-nums text-muted">{daysText(row)}</td>
                          <td className="py-1.5 pr-2 text-muted">{row.kind}</td>
                          <td className="py-1.5 pr-2 text-right font-bold tabular-nums">
                            {formatSalesYen(row.amount)}
                            {/* 日割りの行は計算式を添える（退職日まで日割・許可日から日割） */}
                            {row.kind.includes("日割") && row.monthlyFee > 0 && (
                              <span className="block text-[10px] font-normal text-muted">
                                {formatSalesYen(row.monthlyFee)}÷{row.monthDays}日=
                                {formatSalesYen(dailyFee(row.monthlyFee, row.monthDays))}
                                （切り捨て）×{row.days}日
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={7} className="py-1.5 pr-2 text-right font-bold">
                          合計
                        </td>
                        <td className="py-1.5 pr-2 text-right font-bold tabular-nums text-brand">
                          {formatSalesYen(org.total)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
