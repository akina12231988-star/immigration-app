"use client";

import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { LedgerSheet, type LedgerTable } from "@/components/ledgers/LedgerSheet";

export type LedgerKind = "posting" | "seeker" | "fee";

export const LEDGER_TITLES: Record<LedgerKind, string> = {
  posting: "求人管理簿",
  seeker: "求職管理簿",
  fee: "手数料管理簿",
};

// 当日点検（選んだリストNo.の分）と、全件の一覧・印刷の両方で使う。
// only を渡すとその帳簿だけを出す（求人管理簿の画面の「◯◯を見る・印刷」から）
export function LedgerPrintView({
  listNos,
  baseDate,
  posting,
  seeker,
  fee,
  only,
  heading,
  lead,
  backHref = "/postings/form30",
  extraActions,
}: {
  listNos: string;
  baseDate: string;
  posting: LedgerTable;
  seeker: LedgerTable;
  fee: LedgerTable;
  only?: LedgerKind;
  heading?: string;
  lead?: string;
  backHref?: string;
  extraActions?: React.ReactNode; // 印刷ボタンの横に置くもの（備考の切り替えなど）
}) {
  const subtitle = listNos ? `当日点検 リストNo.${listNos}` : undefined;
  const show = (kind: LedgerKind) => !only || only === kind;
  return (
    <>
      {/* A4横で刷る。1枚に収まるように少し縮める */}
      <style>{
        "@media print{@page{size:A4 landscape;margin:8mm}" +
        ".ledger-sheet{break-after:page}.ledger-sheet:last-of-type{break-after:auto}}"
      }</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref={backHref} />
          <h1 className="flex-1 text-lg font-bold">{heading ?? "当日点検の帳簿（A4横で印刷）"}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 lg:px-8">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground"
          >
            <Printer size={18} />
            印刷・PDF保存（A4横）
          </button>
          {extraActions}
          <span className="text-[11px] leading-relaxed text-muted">
            {lead ??
              "求人管理簿・求職管理簿・手数料管理簿を、点検に選ばれた分だけA4横で並べています（求人・求職管理簿の備考の欄は出していません）。"}
            印刷の設定で用紙は「A4」、向きは「横」、拡大縮小は「用紙に合わせる」にしてください。
          </span>
        </div>
      </div>

      <div className="px-4 pb-6 lg:px-8 print:p-0">
        {show("posting") && (
          <LedgerSheet
            title="求人管理簿"
            retention="[有効期間の終了後２年間保存]"
            table={posting}
            subtitle={subtitle}
            baseDate={baseDate}
          />
        )}
        {show("seeker") && (
          <LedgerSheet
            title="求職管理簿"
            retention="[有効期間の終了後２年間保存]"
            table={seeker}
            subtitle={subtitle}
            baseDate={baseDate}
          />
        )}
        {show("fee") && (
          <LedgerSheet
            title="手数料管理簿"
            retention="[手数料の徴収完了後２年間保存]"
            table={fee}
            subtitle={subtitle}
            baseDate={baseDate}
          />
        )}
      </div>
    </>
  );
}
