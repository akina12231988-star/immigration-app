"use client";

import { useState } from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import {
  formatYenInput,
  formatYenLabel,
  needsSswRefundSalesNo,
  parseYenDigits,
  slashDate,
  sumSswRefunds,
  type SswInsuranceWorker,
} from "@/lib/ssw-insurance";
import type { SswInsurancePatch } from "@/lib/supabase/queries/ssw-insurance";

// 「解約済み・返戻金」タブ。解約した人の返戻金（返戻保険料）・振込日・解約売上No.を1人ずつ残す。
// 金額と振込日は、国際研修サービスから届く「中途解約返戻金明細のご案内」に書いてある。
// 解約売上No.は、返戻金を freee販売に登録したときの売上No.（振り込まれたあとに入れることが多い）。

export interface SswRefundRow {
  worker: SswInsuranceWorker;
  orgName: string;
  cancelDone: boolean; // 解約手続きのTODOが完了しているか
}

const TH = "border border-[#9fd3e0] bg-[#d7eef4] px-2 py-2 text-[11px] font-bold text-foreground";
const TD = "border border-border px-2 py-1.5 align-middle";
const CELL_INPUT =
  "min-h-[32px] w-full min-w-0 rounded-lg border border-border bg-background px-2 text-xs focus:border-brand focus:outline-none disabled:opacity-60";

export function SswRefundTable({
  rows,
  canEdit,
  onSave,
}: {
  rows: SswRefundRow[];
  canEdit: boolean;
  // 1人ぶんの返戻金・振込日・解約売上No.を保存する
  onSave: (workerId: string, patch: SswInsurancePatch) => Promise<void>;
}) {
  const [onlyMissing, setOnlyMissing] = useState(false);
  const missing = rows.filter((r) => needsSswRefundSalesNo(r.worker));
  const shown = onlyMissing ? missing : rows;
  const total = sumSswRefunds(shown.map((r) => r.worker));

  // 振込日ごとの合計（明細の合計と照らし合わせる）
  const byPaidOn = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    const d = r.worker.ssw_insurance_refund_paid_on;
    if (!d) continue;
    const cur = byPaidOn.get(d) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += r.worker.ssw_insurance_refund_amount ?? 0;
    byPaidOn.set(d, cur);
  }
  const paidOnSummary = [...byPaidOn.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-black">解約済みの人の返戻金（振込日・解約売上No.）</p>
      <p className="text-[11px] leading-relaxed text-muted">
        解約手続きが済んだ人と、返戻金を入れた人を出しています。返戻金と振込日は「中途解約返戻金明細のご案内」を見て入れます
        （「解約手続き」のタブで、チェックした人の返戻金をまとめて入れることもできます）。返戻金を freee販売に登録したら、解約売上No.を入れてください。
        返戻金が1円以上で解約売上No.が空の人は赤く出ます。
      </p>
      {paidOnSummary.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {paidOnSummary.map(([d, s]) => (
            <span key={d} className="rounded-full border border-border bg-background px-2.5 py-1 tabular-nums">
              振込日 {slashDate(d)}：{s.count}人・{formatYenLabel(s.total)}
            </span>
          ))}
        </div>
      )}
      <label className="flex items-center gap-1.5 text-[11px] font-bold">
        <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="h-4 w-4" />
        解約売上No.がまだの人だけ（{missing.length}人）
      </label>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-border bg-background p-4 text-center text-[11px] text-muted">該当する人はいません。</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#9fd3e0] bg-surface">
          <table className="w-full min-w-[56rem] border-collapse text-xs">
            <thead>
              <tr>
                <th className={`${TH} text-left`}>被保険者名</th>
                <th className={`${TH} text-left`}>所属機関名</th>
                <th className={TH}>退職日</th>
                <th className={TH}>被保険者証</th>
                <th className={TH}>解約書類の投函日</th>
                <th className={`${TH} w-32`}>返戻金（円）</th>
                <th className={`${TH} w-36`}>振込日</th>
                <th className={`${TH} w-44`}>解約売上No.</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <SswRefundTr key={r.worker.id} row={r} canEdit={canEdit} onSave={onSave} />
              ))}
              <tr>
                <td className={`${TD} text-right font-bold`} colSpan={5}>
                  合計 {shown.length}人
                </td>
                <td className={`${TD} text-right font-black tabular-nums`}>{formatYenLabel(total)}</td>
                <td className={TD} colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SswRefundTr({
  row,
  canEdit,
  onSave,
}: {
  row: SswRefundRow;
  canEdit: boolean;
  onSave: (workerId: string, patch: SswInsurancePatch) => Promise<void>;
}) {
  const w = row.worker;
  const [amountText, setAmountText] = useState(formatYenInput(w.ssw_insurance_refund_amount ?? null));
  const [salesNo, setSalesNo] = useState(w.ssw_insurance_refund_sales_no ?? "");
  const needSalesNo = needsSswRefundSalesNo(w);

  const commitAmount = () => {
    const n = parseYenDigits(amountText);
    setAmountText(formatYenInput(n));
    if (n !== (w.ssw_insurance_refund_amount ?? null)) void onSave(w.id, { ssw_insurance_refund_amount: n });
  };
  const commitSalesNo = () => {
    const v = salesNo.trim();
    setSalesNo(v);
    if (v !== (w.ssw_insurance_refund_sales_no ?? "")) void onSave(w.id, { ssw_insurance_refund_sales_no: v });
  };

  return (
    <tr className={needSalesNo ? "bg-seal/5" : ""}>
      <td className={TD}>
        <span className="flex items-center gap-1">
          <Link href={`/workers/${w.id}`} className="font-bold text-brand hover:underline">
            {w.name}
          </Link>
          <CopyButton value={w.name} label={`${w.name}の氏名をコピー`} size={12} className="inline-flex" />
        </span>
        {!row.cancelDone && <span className="text-[10px] font-bold text-muted">解約手続き中</span>}
      </td>
      <td className={TD}>{row.orgName}</td>
      <td className={`${TD} text-center`}>{w.leaving_on ? slashDate(w.leaving_on) : "―"}</td>
      <td className={`${TD} text-center tabular-nums`}>{w.ssw_insurance_no}</td>
      <td className={`${TD} text-center tabular-nums`}>
        {w.ssw_insurance_cancel_mailed_on ? slashDate(w.ssw_insurance_cancel_mailed_on) : "―"}
      </td>
      <td className={TD}>
        <input
          inputMode="numeric"
          value={amountText}
          disabled={!canEdit}
          onChange={(e) => setAmountText(e.target.value.normalize("NFKC").replace(/[^\d,]/g, ""))}
          onBlur={commitAmount}
          placeholder="未入力"
          aria-label={`${w.name}の返戻金`}
          className={`${CELL_INPUT} text-right tabular-nums`}
        />
      </td>
      <td className={TD}>
        <input
          type="date"
          value={w.ssw_insurance_refund_paid_on ?? ""}
          disabled={!canEdit}
          onChange={(e) => void onSave(w.id, { ssw_insurance_refund_paid_on: e.target.value || null })}
          aria-label={`${w.name}の返戻金の振込日`}
          className={CELL_INPUT}
        />
      </td>
      <td className={TD}>
        <span className="flex items-center gap-1">
          <input
            value={salesNo}
            disabled={!canEdit}
            onChange={(e) => setSalesNo(e.target.value)}
            onBlur={commitSalesNo}
            placeholder={needSalesNo ? "未入力" : ""}
            aria-label={`${w.name}の解約売上No.`}
            className={`${CELL_INPUT} tabular-nums ${needSalesNo ? "border-seal/60" : ""}`}
          />
          {salesNo && <CopyButton value={salesNo} label="解約売上No.をコピー" size={12} />}
          {!salesNo && needSalesNo && <Receipt size={13} className="shrink-0 text-seal" aria-hidden />}
        </span>
      </td>
    </tr>
  );
}
