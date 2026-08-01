"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronRight, Download, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { setWorkerRecurringSalesNo } from "@/lib/supabase/queries/workers";
import { errorMessage } from "@/lib/errors";
import { formatSalesYen } from "@/lib/sales";
import {
  currentMonth,
  daysText,
  monthLabel,
  periodText,
  summarizeMonthlyBilling,
  type BillingOrg,
  type BillingWorker,
  type MonthlyBillingOrg,
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
  const [salesNos, setSalesNos] = useState<Record<string, string>>({});
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
  const billing = useMemo(
    () => summarizeMonthlyBilling(merged, organizations, month),
    [merged, organizations, month],
  );

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
              onChange={(e) => setMonth(e.target.value)}
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
          その月に支援が始まった人は在留許可日から、退職した人は退職日までを日割りします（小数点以下は切り捨て）。
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
                  onClick={() => setOpenOrgId(open ? null : org.organizationId)}
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

              {open && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted">
                        <th className="py-1.5 pr-2 font-bold">氏名</th>
                        <th className="py-1.5 pr-2 font-bold">在留資格</th>
                        <th className="py-1.5 pr-2 font-bold">定期売上No.</th>
                        <th className="py-1.5 pr-2 text-right font-bold">支援代（月額）</th>
                        <th className="py-1.5 pr-2 font-bold">支援費算定期間</th>
                        <th className="py-1.5 pr-2 font-bold">日数</th>
                        <th className="py-1.5 pr-2 font-bold">区分</th>
                        <th className="py-1.5 pr-2 text-right font-bold">支援費請求額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {org.rows.map((row) => (
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
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">
                            {row.monthlyFee > 0 ? formatSalesYen(row.monthlyFee) : "未登録"}
                          </td>
                          <td className="py-1.5 pr-2 tabular-nums text-muted">{periodText(row)}</td>
                          <td className="py-1.5 pr-2 tabular-nums text-muted">{daysText(row)}</td>
                          <td className="py-1.5 pr-2 text-muted">{row.kind}</td>
                          <td className="py-1.5 pr-2 text-right font-bold tabular-nums">
                            {formatSalesYen(row.amount)}
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
