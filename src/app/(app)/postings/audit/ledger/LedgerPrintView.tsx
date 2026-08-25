"use client";

import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";

interface LedgerTable {
  header: string[];
  rows: string[][];
}

// 訪問指導の当日点検で出す帳簿の印刷用（A4横）。
// 1枚に収まるよう横幅いっぱいの表にし、はみ出す列は折り返して見せる
function LedgerSheet({
  title,
  retention,
  table,
  listNos,
  baseDate,
}: {
  title: string;
  retention: string;
  table: LedgerTable;
  listNos: string;
  baseDate: string;
}) {
  return (
    <section className="ledger-sheet mb-6 border border-border bg-white p-[8mm] text-black print:mb-0 print:border-0">
      <div className="mb-2 flex items-end justify-between gap-4">
        <h2 className="text-base font-black">
          {title}
          {listNos && <span className="ml-2 text-xs font-bold">（当日点検 リストNo.{listNos}）</span>}
        </h2>
        <p className="text-[10px] text-gray-500">
          {retention} ／ 出力日: {baseDate}
        </p>
      </div>
      {table.rows.length === 0 ? (
        <p className="text-xs text-gray-600">対象の記録がありません。</p>
      ) : (
        <table className="w-full table-fixed border-collapse text-[8.5px] leading-tight">
          <thead>
            <tr>
              {table.header.map((h) => (
                <th
                  key={h}
                  className="break-words border border-gray-400 bg-gray-100 px-[2px] py-[3px] text-left font-bold"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {table.header.map((_, j) => (
                  <td key={j} className="break-words border border-gray-400 px-[2px] py-[3px] align-top">
                    {row[j] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function LedgerPrintView({
  listNos,
  baseDate,
  posting,
  seeker,
}: {
  listNos: string;
  baseDate: string;
  posting: LedgerTable;
  seeker: LedgerTable;
}) {
  return (
    <>
      {/* A4横で刷る。1枚に収まるように少し縮める */}
      <style>{
        "@media print{@page{size:A4 landscape;margin:8mm}" +
        ".ledger-sheet{break-after:page}.ledger-sheet:last-of-type{break-after:auto}}"
      }</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref="/postings/form30" />
          <h1 className="flex-1 text-lg font-bold">当日点検の帳簿（A4横で印刷）</h1>
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
            求人管理簿と求職管理簿を、点検に選ばれた分だけA4横で並べています（備考の欄は出していません）。
            印刷の設定で用紙は「A4」、向きは「横」、拡大縮小は「用紙に合わせる」にしてください。
          </span>
        </div>
      </div>

      <div className="px-4 pb-6 lg:px-8 print:p-0">
        <LedgerSheet
          title="求人管理簿"
          retention="[有効期間の終了後２年間保存]"
          table={posting}
          listNos={listNos}
          baseDate={baseDate}
        />
        <LedgerSheet
          title="求職管理簿"
          retention="[有効期間の終了後２年間保存]"
          table={seeker}
          listNos={listNos}
          baseDate={baseDate}
        />
      </div>
    </>
  );
}
