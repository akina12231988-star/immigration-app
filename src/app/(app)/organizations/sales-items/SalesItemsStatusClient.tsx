"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ORG_SALES_STATUS_KINDS, type OrgSalesKindState, type OrgSalesStatus } from "@/lib/org-sales-status";
import { REFERRAL_SALES_KEY } from "@/lib/sales";
import { stampFeePayerLabel } from "@/lib/stamp-fee";

const STATE_LABEL: Record<OrgSalesKindState, string> = {
  custom: "登録済み",
  default: "未登録（既定）",
  empty: "明細なし",
};
const STATE_CLASS: Record<OrgSalesKindState, string> = {
  custom: "bg-status-approved-bg text-status-approved-fg",
  default: "bg-seal/10 text-seal",
  empty: "bg-seal text-white",
};

// 所属機関ごとの売上明細の登録状況の一覧。
// 既定は「未登録がある機関」だけ。支援委託終了の機関は既定では出さない
export function SalesItemsStatusClient({ rows }: { rows: OrgSalesStatus[] }) {
  const [onlyUnregistered, setOnlyUnregistered] = useState(true);
  const [showEnded, setShowEnded] = useState(false);
  const [q, setQ] = useState("");

  const base = useMemo(() => rows.filter((r) => showEnded || !r.supportEnded), [rows, showEnded]);
  const shown = useMemo(() => {
    const needle = q.replace(/\s/g, "").toLowerCase();
    return base
      .filter((r) => !onlyUnregistered || r.unregisteredCount > 0)
      .filter((r) => !needle || r.orgName.replace(/\s/g, "").toLowerCase().includes(needle))
      .sort((a, b) => b.unregisteredCount - a.unregisteredCount || a.orgName.localeCompare(b.orgName, "ja"));
  }, [base, onlyUnregistered, q]);
  const unregisteredOrgs = base.filter((r) => r.unregisteredCount > 0).length;

  return (
    <div className="space-y-3 px-4 py-4 lg:px-8">
      <p className="text-xs leading-relaxed text-muted">
        所属機関の情報 ＞ 決算・売上の「申請種別ごとの売上明細」と「収入印紙代」の登録状況です。
        「未登録（既定）」は、その機関の明細をまだ登録しておらず全所属機関共通の既定の明細を使っている種別です。
        機関名を押すと所属機関の情報が開きます（決算・売上タブで登録してください）。
        申請準備の詳細で一人ひとり直した明細は、ここには影響しません。
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOnlyUnregistered(true)}
          className={`min-h-[40px] rounded-xl border px-3 text-xs font-bold ${onlyUnregistered ? "border-brand bg-brand text-brand-foreground" : "border-border bg-background"}`}
        >
          未登録がある機関 {unregisteredOrgs}
        </button>
        <button
          type="button"
          onClick={() => setOnlyUnregistered(false)}
          className={`min-h-[40px] rounded-xl border px-3 text-xs font-bold ${!onlyUnregistered ? "border-brand bg-brand text-brand-foreground" : "border-border bg-background"}`}
        >
          すべて {base.length}
        </button>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} />
          支援委託終了の機関も出す
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="所属機関名で検索"
          className="min-h-[40px] flex-1 rounded-xl border border-border bg-background px-3 text-sm sm:max-w-xs"
        />
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[900px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-2 py-2 font-bold">所属機関</th>
              {ORG_SALES_STATUS_KINDS.map((k) => (
                <th key={k} className="px-2 py-2 font-bold">
                  {k === REFERRAL_SALES_KEY ? "あっせん" : k}
                </th>
              ))}
              <th className="px-2 py-2 font-bold">収入印紙代（6,000円超）</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={ORG_SALES_STATUS_KINDS.length + 2} className="px-2 py-6 text-center text-muted">
                  {onlyUnregistered ? "未登録の機関はありません" : "所属機関がありません"}
                </td>
              </tr>
            )}
            {shown.map((r) => (
              <tr key={r.orgId} className="border-b border-border/60 align-top">
                <td className="px-2 py-2">
                  <Link href={`/organizations/${r.orgId}`} className="font-bold text-brand underline-offset-2 hover:underline">
                    {r.orgName}
                  </Link>
                  {r.supportEnded && <span className="ml-1 text-[10px] text-muted">支援委託終了</span>}
                  {r.unregisteredCount > 0 && (
                    <span className="mt-0.5 block text-[10px] font-bold text-seal">未登録 {r.unregisteredCount}件</span>
                  )}
                </td>
                {r.kinds.map((k) => (
                  <td key={k.kind} className="px-2 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${STATE_CLASS[k.state]}`}>
                      {STATE_LABEL[k.state]}
                    </span>
                    {k.total > 0 && <span className="mt-0.5 block tabular-nums text-muted">{k.total.toLocaleString()}円</span>}
                  </td>
                ))}
                <td className="px-2 py-2">
                  {r.stampFeePayer ? (
                    <span className="inline-block rounded-full bg-status-approved-bg px-2 py-0.5 text-[10px] font-bold text-status-approved-fg">
                      {stampFeePayerLabel(r.stampFeePayer)}
                    </span>
                  ) : (
                    <span className="inline-block rounded-full bg-seal/10 px-2 py-0.5 text-[10px] font-bold text-seal">未設定</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
