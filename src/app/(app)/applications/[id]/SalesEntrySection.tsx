"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Coins, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { getOrganization } from "@/lib/supabase/queries/organizations";
import {
  insertSalesEntries,
  listSalesEntriesByWorker,
} from "@/lib/supabase/queries/sales";
import {
  buildSalesEntries,
  formatSalesYen,
  guessAppKind,
  prorateFromDate,
  SALES_APP_KINDS,
  type SalesAppKind,
} from "@/lib/sales";
import { parseAmount } from "@/lib/organization-intake";
import type { Application } from "@/types/application";
import type { SalesEntryRow } from "@/types/db";

// 在留カード受領後の売上登録（freee販売）。申請種別・特定技能総合保険・
// 許可日からの支援代の日割り・定期売上の明細を作って「登録待ち」に入れる。
export function SalesEntrySection({ app }: { app: Application }) {
  const permitDate = app.grantedPermitDate ?? app.approvalDate ?? "";
  const [appKind, setAppKind] = useState<SalesAppKind>(() =>
    guessAppKind(app.visaAtGrant ?? "", app.applicationContent ?? ""),
  );
  const [applicationFee, setApplicationFee] = useState("");
  const [supportFee, setSupportFee] = useState("");
  const [insuranceByCompany, setInsuranceByCompany] = useState(false);
  const [existing, setExisting] = useState<SalesEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 所属機関の支援代・保険の負担区分を初期値に入れる
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      try {
        if (app.organizationId) {
          const org = await getOrganization(supabase, app.organizationId);
          if (!cancelled && org) {
            setSupportFee(org.intake?.support_fee ?? "");
            setInsuranceByCompany(org.intake?.ssw_insurance_burden === "会社負担");
          }
        }
        if (app.workerId) {
          // sales_entries 未作成でも画面は使えるように握りつぶす
          const rows = await listSalesEntriesByWorker(supabase, app.workerId).catch(() => []);
          if (!cancelled) setExisting(rows.filter((r) => r.application_id === app.id));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app.organizationId, app.workerId, app.id]);

  const drafts = permitDate
    ? buildSalesEntries({
        workerName: app.name,
        appKind,
        permitDate,
        supportFee,
        insuranceByCompany,
        applicationFee,
      })
    : [];
  const prorated = prorateFromDate(parseAmount(supportFee) ?? 0, permitDate);
  const total = drafts.reduce((sum, d) => sum + d.amount, 0);

  const save = async () => {
    if (!app.workerId || drafts.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const rows = await insertSalesEntries(
        createClient(),
        drafts.map((d) => ({
          worker_id: app.workerId as string,
          organization_id: app.organizationId ?? null,
          application_id: app.id,
          kind: d.kind,
          item_name: d.item_name,
          description: d.description,
          amount: d.amount,
          taxable: d.taxable,
          period_from: d.period_from,
          period_to: d.period_to,
          status: "未登録" as const,
          freee_no: "",
          registered_on: null,
          note: "",
        })),
      );
      setExisting((prev) => [...prev, ...rows]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message}（テーブル未作成の場合はマイグレーション0061を適用してください）`
          : "保存に失敗しました",
      );
    } finally {
      setSaving(false);
    }
  };

  const INPUT =
    "min-h-[40px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

  return (
    <Card className="p-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted">
        <Coins size={15} />
        売上登録（freee販売）
      </h3>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        在留カード受領後の売上明細を作ります。所属機関ごとの案件に、申請・特定技能総合保険（会社負担のみ）・
        許可日からの日割り・定期売上を登録してください。作成した明細は
        <Link href="/sales" className="mx-1 font-bold text-brand hover:underline">
          売上登録
        </Link>
        の登録待ちに入ります。
      </p>

      {error && <p className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">{error}</p>}

      {loading ? (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Loader2 size={13} className="animate-spin" />
          読み込み中…
        </p>
      ) : existing.length > 0 ? (
        <div className="rounded-xl border border-status-approved-fg/40 bg-status-approved-bg/40 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-bold text-status-approved-fg">
            <Check size={13} />
            この申請の売上明細は作成済みです（{existing.length}件）
          </p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-muted">
            {existing.map((r) => (
              <li key={r.id}>
                {r.description}　{formatSalesYen(r.amount)}
                {!r.taxable && "（非課税）"}　<span className="font-bold">{r.status}</span>
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
              <span className="text-[11px] font-bold text-muted">申請種別</span>
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
              <span className="text-[11px] font-bold text-muted">申請の売上金額</span>
              <input
                value={applicationFee}
                onChange={(e) => setApplicationFee(e.target.value)}
                placeholder="例: 150,000円"
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">
                月額の{appKind.startsWith("特定活動") ? "サポート代" : "支援代"}（所属機関の登録値）
              </span>
              <input
                value={supportFee}
                onChange={(e) => setSupportFee(e.target.value)}
                placeholder="例: 20,000円/人"
                className={INPUT}
              />
            </label>
            <label className="flex items-center gap-2 pt-5 text-xs font-bold">
              <input
                type="checkbox"
                checked={insuranceByCompany}
                onChange={(e) => setInsuranceByCompany(e.target.checked)}
                className="h-4 w-4"
              />
              特定技能総合保険が会社負担
            </label>
          </div>

          {!permitDate ? (
            <p className="mt-3 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
              許可日が未登録のため日割り計算ができません。「許可情報」で在留許可日を入力してください。
            </p>
          ) : (
            <>
              <div className="mt-3 overflow-hidden rounded-xl border border-border">
                {drafts.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 border-b border-border bg-background px-3 py-2 text-sm last:border-b-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{d.description}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {d.kind} ・ 品目 {d.item_name}
                        {d.period_from && ` ・ ${d.period_from}〜${d.period_to ?? "（継続）"}`}
                        {!d.taxable && " ・ 非課税"}
                      </span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">
                      {formatSalesYen(d.amount)}
                    </span>
                  </div>
                ))}
              </div>
              {prorated && (
                <p className="mt-1.5 text-[11px] text-muted">
                  日割り: {formatSalesYen(prorated.monthly)} ÷ {prorated.monthDays}日 ×{" "}
                  {prorated.days}日 = {formatSalesYen(prorated.amount)}（小数点以下切り捨て）
                </p>
              )}
              <p className="mt-1 text-sm font-bold">合計 {formatSalesYen(total)}</p>
              <Button
                fullWidth
                className="mt-3"
                disabled={saving || drafts.length === 0 || !app.workerId}
                onClick={save}
              >
                {saving ? "作成中…" : saved ? "作成しました" : "売上明細を作成（登録待ちに追加）"}
              </Button>
              {!app.workerId && (
                <p className="mt-1 text-[11px] text-seal">
                  外国人と紐づいていない申請では作成できません。
                </p>
              )}
            </>
          )}
        </>
      )}
    </Card>
  );
}
