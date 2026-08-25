"use client";

import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { LedgerSheet, type LedgerTable } from "@/components/ledgers/LedgerSheet";

// 訪問指導（監査）で出す手数料管理簿の印刷用（A4横）。
// 紹介手数料台帳で選んだ人だけを載せる
export function FeeLedgerPrintView({
  table,
  baseDate,
  names,
  picked,
}: {
  table: LedgerTable;
  baseDate: string;
  // 選んだ人の氏名（見出しに出して、誰の分を出したか分かるようにする）
  names: string[];
  // 台帳で人を選んで出したか（選ばずに表示中の分をそのまま出したか）
  picked: boolean;
}) {
  return (
    <>
      {/* A4横で刷る。1枚に収まるように少し縮める */}
      <style>{"@media print{@page{size:A4 landscape;margin:8mm}}"}</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref="/referrals" />
          <h1 className="flex-1 text-lg font-bold">手数料管理簿（A4横で印刷）</h1>
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
          <span className="text-[11px] leading-relaxed text-muted">
            {picked
              ? `紹介手数料台帳で選んだ${names.length}名分をA4横で出しています。`
              : "紹介手数料台帳で表示していた分をそのままA4横で出しています。"}
            印刷の設定で用紙は「A4」、向きは「横」、拡大縮小は「用紙に合わせる」にしてください。
            PDFで残すときは、印刷先（送信先）を「PDFに保存」にしてください。
          </span>
        </div>
      </div>

      <div className="px-4 pb-6 lg:px-8 print:p-0">
        <LedgerSheet
          title="手数料管理簿"
          retention="[手数料の徴収完了後２年間保存]"
          table={table}
          subtitle={picked && names.length > 0 ? `訪問指導 ${names.join("・")}` : undefined}
          baseDate={baseDate}
          empty="選んだ人の手数料の記録がありません。紹介手数料台帳に戻って選び直してください。"
        />
      </div>
    </>
  );
}
