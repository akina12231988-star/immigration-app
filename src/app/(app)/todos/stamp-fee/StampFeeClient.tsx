"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, Printer, Receipt, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { prepDetailHref } from "@/lib/application-prep";
import {
  STAMP_FEE_NO_ORG_LABEL,
  filterStampFeeByOrg,
  groupStampFeeByOrg,
  stampFeeUnknownText,
  type StampFeeUnknownRow,
} from "@/lib/stamp-fee";

const SELECT =
  "min-h-[36px] rounded-lg border border-border bg-background px-2 text-xs focus:border-brand focus:outline-none";
const BTN =
  "inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-brand px-4 text-sm font-bold text-brand hover:bg-brand/5";

// 収入印紙代の負担が未設定の申請を、所属機関別に出す画面。
// 所属機関で絞れて、テキストでコピー（メッセンジャーに貼るなど）と A4 印刷ができる。
// 直すときは行を押して、その人の申請準備の詳細（申請種別の上のボタン）で選ぶ
export function StampFeeClient({
  rows,
  error,
  today,
}: {
  rows: StampFeeUnknownRow[];
  error: string | null;
  today: string;
}) {
  const [orgId, setOrgId] = useState("");
  const [copied, setCopied] = useState(false);

  const orgOptions = useMemo(() => groupStampFeeByOrg(rows).map((g) => ({ id: g.orgId, name: g.orgName, count: g.rows.length })), [rows]);
  const shown = useMemo(() => filterStampFeeByOrg(rows, orgId), [rows, orgId]);
  const groups = useMemo(() => groupStampFeeByOrg(shown), [shown]);
  const text = useMemo(() => stampFeeUnknownText(groups, today), [groups, today]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* クリップボード非対応時は何もしない（下のテキストを選んでコピーしてもらう） */
    }
  };

  // 印刷（PDF保存）のファイル名
  const printSheet = () => {
    const original = document.title;
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    document.title = `収入印紙代の負担が未設定_${today}`;
    window.addEventListener("afterprint", restore);
    window.print();
  };

  const cell = "border border-black px-2 py-[5px] align-middle";

  return (
    <div className="space-y-4">
      {/* 印刷ではこの画面の見出しバー（AppHeader）も出さず、表だけにする */}
      <style>{"@media print{@page{size:A4 portrait;margin:14mm} header{display:none !important}}"}</style>

      <Card className="p-4 print:hidden">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
          <Receipt size={16} />
          収入印紙代の負担が未設定の申請
        </h2>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          申請準備中（入管へ出す前）の申請のうち、収入印紙代を本人負担にするか会社負担にするかをまだ選んでいないものを、
          所属機関別にまとめています。有限会社國崎青果は自動で本人負担になるので出ません。
          申請準備のTODOの経過（進捗状況）が「完了」の人も出ません。
          直すときは行を押して、その人の申請準備の詳細（申請種別の上のボタン）で選んでください。
        </p>

        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
            取得に失敗しました（{error}）。0件という意味ではありません。
          </p>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="flex items-center gap-1 rounded-lg border border-seal/40 bg-seal/10 px-2.5 py-1 text-seal">
            <TriangleAlert size={13} />
            未設定 {shown.length}件（{groups.length}機関）
          </span>
          <label className="flex items-center gap-1.5 text-muted">
            所属機関
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={SELECT}>
              <option value="">すべて（{rows.length}件）</option>
              {orgOptions.map((o) => (
                <option key={o.id || "none"} value={o.id}>
                  {o.name}（{o.count}件）
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void copy()} disabled={shown.length === 0} className={`${BTN} disabled:opacity-50`}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "コピーしました" : "テキストをコピー"}
          </button>
          <button type="button" onClick={printSheet} disabled={shown.length === 0} className={`${BTN} disabled:opacity-50`}>
            <Printer size={15} />
            A4で印刷
          </button>
        </div>
      </Card>

      {/* 一覧（画面でも印刷でも出す。印刷ではこの表だけ） */}
      <div className="print-root mx-auto max-w-[178mm] print:max-w-none">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-base font-bold print:text-[14pt]">収入印紙代の負担が未設定の申請</h2>
          <p className="text-[11px] text-muted print:text-[9pt] print:text-black">
            {today} 現在 ・ {shown.length}件
            {orgId && orgOptions.find((o) => o.id === orgId) ? ` ・ ${orgOptions.find((o) => o.id === orgId)!.name}` : ""}
          </p>
        </div>
        {shown.length === 0 ? (
          <p className="rounded-xl bg-surface p-6 text-center text-sm text-muted print:hidden">
            未設定の申請はありません。
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.orgId || "none"} className="break-inside-avoid">
                <h3 className="mb-1 text-sm font-bold print:text-[11pt]">
                  ■ {g.orgName}（{g.rows.length}件）
                </h3>
                <table className="w-full border-collapse text-xs print:text-[10pt]">
                  <thead>
                    <tr>
                      <th className={`${cell} w-[16%] bg-neutral-100 text-left font-bold`}>TODO番号</th>
                      <th className={`${cell} bg-neutral-100 text-left font-bold`}>外国人</th>
                      <th className={`${cell} w-[30%] bg-neutral-100 text-left font-bold`}>申請種別</th>
                      <th className={`${cell} w-[12%] bg-neutral-100 text-left font-bold`}>担当</th>
                      <th className={`${cell} w-[18%] bg-neutral-100 text-center font-bold`}>本人／会社</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={`${r.workerId}|${r.todoNo}`}>
                        <td className={`${cell} tabular-nums`}>{r.todoNo || "　"}</td>
                        <td className={cell}>
                          <Link href={prepDetailHref(r.workerId)} className="font-bold text-brand hover:underline print:text-black print:no-underline">
                            {r.workerName}
                          </Link>
                        </td>
                        <td className={cell}>{r.appContent || "　"}</td>
                        <td className={cell}>{r.tantou || "　"}</td>
                        <td className={`${cell} whitespace-nowrap text-center text-[12pt]`}>□ 本人　□ 会社</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}
        {shown.length > 0 && (
          <p className="mt-3 text-[10px] text-muted print:text-[9pt] print:text-black">
            {STAMP_FEE_NO_ORG_LABEL}の人は、外国人詳細で所属機関を登録してください。
          </p>
        )}
      </div>

      {/* コピーされる文字（確認用。印刷には出さない） */}
      {shown.length > 0 && (
        <Card className="p-4 print:hidden">
          <p className="mb-1 text-xs font-bold text-muted">コピーされる文字</p>
          <pre className="whitespace-pre-wrap rounded-lg bg-surface p-3 text-xs leading-relaxed">{text}</pre>
        </Card>
      )}
    </div>
  );
}
