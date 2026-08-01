"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Coins, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { getOrganization } from "@/lib/supabase/queries/organizations";
import {
  insertSalesEntries,
  listSalesEntriesByWorker,
} from "@/lib/supabase/queries/sales";
import {
  buildResignationEntry,
  formatSalesYen,
  prorateToDate,
  SALES_APP_KINDS,
  supportFeeName,
  type SalesAppKind,
} from "@/lib/sales";
import { digitsOnly, parseAmount } from "@/lib/organization-intake";
import { dbErrorMessage } from "@/lib/errors";
import type { SalesEntryRow } from "@/types/db";

// 退職時の売上精算（freee販売）。退職日までの支援代を日割りで計上し、
// 定期売上の対象期間を退職日で締める作業を促す
export function WorkerSalesResignation({
  workerId,
  workerName,
  organizationId,
  leavingOn,
  residenceStatus,
  canEdit,
}: {
  workerId: string;
  workerName: string;
  organizationId: string | null;
  leavingOn: string | null;
  residenceStatus: string;
  canEdit: boolean;
}) {
  const [appKind, setAppKind] = useState<SalesAppKind>(() =>
    /特定活動/.test(residenceStatus) ? "特定活動申請" : "特定技能申請",
  );
  const [supportFee, setSupportFee] = useState("");
  const [entries, setEntries] = useState<SalesEntryRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      if (organizationId) {
        const org = await getOrganization(supabase, organizationId).catch(() => null);
        if (!cancelled && org) setSupportFee(org.intake?.support_fee ?? "");
      }
      const rows = await listSalesEntriesByWorker(supabase, workerId).catch(() => []);
      if (!cancelled) setEntries(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [workerId, organizationId]);

  if (!leavingOn) return null;

  const done = entries.some((e) => e.kind === "退職精算");
  const recurring = entries.filter((e) => e.kind === "定期売上" && !e.period_to);
  const draft = buildResignationEntry({ workerName, appKind, leavingOn, supportFee });
  const prorated = prorateToDate(parseAmount(supportFee) ?? 0, leavingOn);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const rows = await insertSalesEntries(supabase, [
        {
          worker_id: workerId,
          organization_id: organizationId,
          application_id: null,
          kind: draft.kind,
          item_name: draft.item_name,
          description: draft.description,
          amount: draft.amount,
          taxable: draft.taxable,
          period_from: draft.period_from,
          period_to: draft.period_to,
          status: "未登録" as const,
          freee_no: "",
          registered_on: null,
          note: `定期売上の対象期間を${leavingOn}で締める`,
        },
      ]);
      // 定期売上の対象期間を退職日で締める（freee販売側の変更もこの内容で行う）
      for (const r of recurring) {
        await supabase.from("sales_entries").update({ period_to: leavingOn }).eq("id", r.id);
      }
      setEntries((prev) => [
        ...prev.map((e) =>
          recurring.some((r) => r.id === e.id) ? { ...e, period_to: leavingOn } : e,
        ),
        ...rows,
      ]);
    } catch (err) {
      setError(dbErrorMessage(err, "0061_sales_entries.sql", "保存に失敗しました"));
    } finally {
      setSaving(false);
    }
  };

  const INPUT =
    "min-h-[40px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted">
        <Coins size={15} />
        退職時の売上精算（freee販売）
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        退職日（{leavingOn}）までの{supportFeeName(appKind)}
        を日割りで計上し、定期売上の対象期間を退職日で締めます。
        freee販売側でも定期売上の対象期間を変更して、退職日以降の月に売上が発生しないようにしてください。
      </p>

      {error && <p className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">{error}</p>}

      {done ? (
        <div className="rounded-xl border border-status-approved-fg/40 bg-status-approved-bg/40 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-bold text-status-approved-fg">
            <Check size={13} />
            退職精算の明細は作成済みです
          </p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-muted">
            {entries
              .filter((e) => e.kind === "退職精算")
              .map((e) => (
                <li key={e.id}>
                  {e.description}　{formatSalesYen(e.amount)}
                  <span className="font-bold">{e.status}</span>
                </li>
              ))}
          </ul>
          <Link
            href="/sales"
            className="mt-1.5 inline-block text-[11px] font-bold text-brand hover:underline"
          >
            売上登録の一覧で確認する
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">区分（名称の切り替え）</span>
              <select
                value={appKind}
                onChange={(e) => setAppKind(e.target.value as SalesAppKind)}
                className={INPUT}
              >
                {SALES_APP_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">
                月額の{supportFeeName(appKind)}
              </span>
              <span className="flex items-center gap-2">
                <input
                  value={digitsOnly(supportFee)}
                  onChange={(e) => setSupportFee(digitsOnly(e.target.value))}
                  inputMode="numeric"
                  placeholder="例: 20000"
                  className={`${INPUT} text-right`}
                />
                <span className="shrink-0 text-sm text-muted">円</span>
              </span>
            </label>
          </div>

          {draft && prorated ? (
            <>
              <div className="mt-3 rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
                <p className="font-bold">{draft.description}</p>
                <p className="text-[11px] text-muted">
                  日割り: {formatSalesYen(prorated.monthly)} ÷ {prorated.monthDays}日 ×{" "}
                  {prorated.days}日 = {formatSalesYen(prorated.amount)}（小数点以下切り捨て）
                </p>
                <p className="mt-0.5 text-base font-black tabular-nums">
                  {formatSalesYen(draft.amount)}
                </p>
              </div>
              {recurring.length > 0 && (
                <p className="mt-1.5 flex items-start gap-1 text-[11px] text-status-notice-fg">
                  <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                  定期売上 {recurring.length}件の対象期間を {leavingOn} で締めます。
                </p>
              )}
              {canEdit && (
                <Button fullWidth className="mt-3" disabled={saving} onClick={save}>
                  {saving ? "作成中…" : "退職精算の明細を作成（登録待ちに追加）"}
                </Button>
              )}
            </>
          ) : (
            <p className="mt-3 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
              月額の{supportFeeName(appKind)}が未入力のため日割り計算ができません。
            </p>
          )}
        </>
      )}
    </Card>
  );
}
