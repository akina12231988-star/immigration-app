"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DetailSection } from "@/components/applications/DetailSection";
import { createClient } from "@/lib/supabase/client";
import { getOrganization } from "@/lib/supabase/queries/organizations";
import { listPrepChecklists } from "@/lib/supabase/queries/application-prep";
import { getAppSetting } from "@/lib/supabase/queries/app-settings";
import { CUSTODIAN_SETTING_KEY, mergeCustodianInfo } from "@/lib/custody";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { buildEstimate, defaultStampFeeBandKey, estimateYen, type Estimate } from "@/lib/estimate";
import { estimateHref, pickEstimateChecklist } from "@/lib/estimate-summary";
import { salesItemsForKind } from "@/lib/sales";
import { salesKindOfPrep } from "@/lib/estimate";
import { effectiveResidencePeriod } from "@/lib/residence-card";
import { todayStr } from "@/lib/ssw/calc";
import type { Application } from "@/types/application";
import type { Organization, Worker } from "@/types/db";

interface Summary {
  estimate: Estimate;
  todoNo: string;
  orgName: string;
}

// 申請準備の詳細で作る見積書（所属機関あて）の内容を、申請詳細でも見られるようにする。
// 申請にはTODO番号が無いので、この外国人の準備リストのうち収入印紙代の負担（本人負担／会社負担）が
// 決まっているいちばん新しいものから作る。負担が決まっていなければ何も出さない
// 申請詳細では折りたたみの1段として出し、閉じていても見出しに負担と合計が出る
export function EstimateSummarySection({ app, open }: { app: Application; open: boolean }) {
  const [summary, setSummary] = useState<Summary | null | undefined>(undefined);

  useEffect(() => {
    // 外国人のひも付けが無ければ何も出さない（下の描画で null にする）
    if (!app.workerId) return;
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      try {
        const { data: w } = await supabase.from("workers").select("*").eq("id", app.workerId as string).maybeSingle();
        const worker = w as Worker | null;
        if (!worker) throw new Error("worker not found");
        // 見積書の宛先はこの申請の所属機関。無ければ申請準備の所属機関 → 現在の所属機関
        const orgId = app.organizationId ?? worker.application_prep_organization_id ?? worker.current_organization_id ?? null;
        const [lists, org, custodianSetting] = await Promise.all([
          listPrepChecklists(supabase, worker.id).catch(() => []),
          orgId ? getOrganization(supabase, orgId).catch(() => null) : Promise.resolve(null as Organization | null),
          getAppSetting<Record<string, unknown>>(supabase, CUSTODIAN_SETTING_KEY).catch(() => null),
        ]);
        if (cancelled) return;
        if (!org) {
          setSummary(null);
          return;
        }
        const picked = pickEstimateChecklist(lists, org.name);
        if (!picked) {
          setSummary(null);
          return;
        }
        const { checklist, payer } = picked;
        const intake = normalizeOrganizationIntake(org.intake);
        const salesItems = salesItemsForKind(intake, salesKindOfPrep(checklist.app_content, checklist.app_type), org.name);
        const estimate = buildEstimate({
          workerName: worker.name,
          orgName: org.name,
          orgAddress: org.address ?? "",
          orgRepName: intake.rep_name,
          appContent: checklist.app_content,
          appType: checklist.app_type,
          stampFeePayer: payer,
          salesItems,
          supportFee: intake.support_fee,
          sswInsuranceBurden: intake.ssw_insurance_burden,
          todoNo: checklist.todo_no,
          today: todayStr(),
          plannedAppOn: checklist.planned_app_on,
          method: "オンライン",
          bandKey: defaultStampFeeBandKey(checklist.app_content, checklist.app_type, effectiveResidencePeriod(worker)),
          custodian: mergeCustodianInfo(custodianSetting),
        });
        setSummary({ estimate, todoNo: checklist.todo_no, orgName: org.name });
      } catch {
        if (!cancelled) setSummary(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app.workerId, app.organizationId]);

  // 読み込み中・負担が未設定・所属機関が無いときは出さない
  if (!summary || !app.workerId) return null;
  const { estimate, todoNo, orgName } = summary;
  const href = estimateHref(app.workerId, todoNo);

  return (
    <DetailSection
      id="section-estimate"
      title="見積書の内容"
      summary={`収入印紙代 ${estimate.stampFee.payer}・合計 ${estimateYen(estimate.total)}円（税込）${todoNo ? `・${todoNo}` : ""}`}
      open={open}
      actions={
        <Link href={href} className="text-xs font-bold text-brand underline">
          見積書を開く
        </Link>
      }
    >
      <p className="mb-2 text-[11px] leading-relaxed text-muted">
        {orgName} あての見積書（{estimate.subject}）。申請準備の詳細で選んだ収入印紙代の負担と、所属機関の売上明細から作っています。
      </p>
      <table className="w-full text-xs">
        <tbody>
          {estimate.items.map((it, i) => (
            <tr key={`${it.name}-${i}`} className="border-t border-border/60">
              <td className="py-1 pr-2">
                {it.name}
                {!it.taxable && <span className="ml-1 text-[10px] text-muted">非課税</span>}
              </td>
              <td className="py-1 text-right tabular-nums">{estimateYen(it.amount)}円</td>
            </tr>
          ))}
          <tr className="border-t border-border">
            <td className="py-1 pr-2 text-muted">10%対象（税抜）</td>
            <td className="py-1 text-right tabular-nums">{estimateYen(estimate.subtotalTaxable)}円</td>
          </tr>
          <tr>
            <td className="py-1 pr-2 text-muted">消費税</td>
            <td className="py-1 text-right tabular-nums">{estimateYen(estimate.tax)}円</td>
          </tr>
          {estimate.taxFree > 0 && (
            <tr>
              <td className="py-1 pr-2 text-muted">非課税（{estimate.taxFreeLabel}）</td>
              <td className="py-1 text-right tabular-nums">{estimateYen(estimate.taxFree)}円</td>
            </tr>
          )}
          <tr className="border-t border-border font-bold">
            <td className="py-1 pr-2">合計（税込）</td>
            <td className="py-1 text-right tabular-nums">{estimateYen(estimate.total)}円</td>
          </tr>
        </tbody>
      </table>
      {estimate.stampFee.applies && !estimate.stampFee.included && (
        <p className="mt-1 text-[11px] text-muted">
          収入印紙代（{estimateYen(estimate.stampFee.amount)}円・{estimate.stampFee.bandKey}）は本人負担のため明細に入れていません。
        </p>
      )}
      {estimate.invalidAmounts.length > 0 && (
        <p className="mt-1 text-[11px] font-bold text-seal">
          金額が読めない明細があります（{estimate.invalidAmounts.join("・")}）。所属機関の情報で直してください。
        </p>
      )}
      <Link
        href={href}
        className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-brand px-4 text-sm font-bold text-brand hover:bg-brand/5"
      >
        🧾 見積書を開く（印刷・明細の編集）
      </Link>
    </DetailSection>
  );
}
