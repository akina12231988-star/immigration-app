"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import {
  buildEstimate,
  estimateDateText,
  estimateYen,
  STAMP_FEE_BANDS,
  STAMP_FEE_METHODS,
  type EstimateInput,
  type StampFeeMethod,
} from "@/lib/estimate";

// 申請準備の見積書のA4縦1枚の印刷用シート。
// 画面上部のツールバー（印刷時は非表示）で、申請方法（窓口/オンライン）と
// 許可の見込みの在留期間を選び直せる。選び直すと明細の収入印紙代と備考の表の強調が変わる
export function EstimateSheet({
  base,
  backHref,
  defaultMethod,
  defaultBandKey,
}: {
  base: Omit<EstimateInput, "method" | "bandKey">;
  backHref: string;
  defaultMethod: StampFeeMethod;
  defaultBandKey: string;
}) {
  const [method, setMethod] = useState<StampFeeMethod>(defaultMethod);
  const [bandKey, setBandKey] = useState(defaultBandKey);
  const est = buildEstimate({ ...base, method, bandKey });

  // 明細の行数は最低8行にして、空行も罫線を出す（手書きの追記ができる）
  const blankRows = Math.max(0, 8 - est.items.length);
  const showStampTable = est.stampFee.applies && est.stampFee.revised && est.stampFee.payer !== "";

  return (
    <>
      {/* 画面用ツールバー（印刷時は非表示） */}
      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref={backHref} />
          <h1 className="flex-1 text-lg font-bold">見積書（{base.orgName}）</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-4 py-4 lg:px-8">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-foreground"
          >
            <Printer size={18} />
            印刷・PDF保存
          </button>
          {est.stampFee.included && (
            <>
              <label className="flex items-center gap-2 text-xs font-bold text-muted">
                申請方法
                <span className="inline-flex overflow-hidden rounded-lg border border-border">
                  {STAMP_FEE_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      aria-pressed={method === m}
                      className={`min-h-[36px] px-3 text-xs font-bold ${
                        method === m ? "bg-brand text-brand-foreground" : "bg-background text-muted hover:bg-surface"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </span>
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-muted">
                許可の見込みの在留期間
                <select
                  value={bandKey}
                  onChange={(e) => setBandKey(e.target.value)}
                  className="min-h-[36px] rounded-lg border border-border bg-background px-2 text-xs font-bold text-foreground"
                >
                  {STAMP_FEE_BANDS.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.key}（{estimateYen(method === "窓口" ? b.counter : b.online)}）
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <p className="w-full text-xs text-muted">
            収入印紙代は<b>{est.stampFee.payer || "未設定"}</b>
            {est.stampFee.included
              ? "。明細に収入印紙代の行を入れ、在留期間ごとの金額の表を備考に印字します。"
              : est.stampFee.payer === "本人負担"
                ? "。収入印紙代は明細に入れず、備考に本人負担である旨と在留期間ごとの金額（参考）を印字します。"
                : "。"}
            明細は所属機関の情報の「申請種別ごとの売上明細」（{est.salesKind}）から作っています。
            {est.insurance.included && "特定技能総合保険が会社負担なので、保険料の行（非課税）も入れています。"}
          </p>
          {est.invalidAmounts.length > 0 && (
            <p role="alert" className="w-full rounded-lg bg-seal/10 px-3 py-2 text-xs font-bold text-seal">
              金額が読めない明細があります（{est.invalidAmounts.join("、")}）。所属機関の情報 ＞ 決算・売上 で数字だけの金額に直してください。
            </p>
          )}
          <p className="w-full text-[11px] text-muted">
            印刷設定は<b>用紙: A4</b>・<b>余白: なし</b>・<b>倍率: 100%</b>にしてください。
          </p>
        </div>
      </div>

      <div className="print-root">
        <div className="estimate-sheet mx-auto mb-6 max-w-[210mm] border border-border bg-white px-[16mm] py-[14mm] text-black print:mb-0 print:border-0">
          {/* 宛先（左）と発行者（右） */}
          <div className="flex items-start justify-between gap-6 text-[11px] leading-relaxed">
            <div className="min-w-0">
              {est.addressee.address && <p>{est.addressee.address}</p>}
              <p className="mt-1 text-base font-bold">{est.addressee.orgLine}</p>
              {est.addressee.repLine && <p className="text-sm font-bold">{est.addressee.repLine}</p>}
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <div className="text-right">
                <p className="font-bold">{est.issuer.name}</p>
                <p>{est.issuer.address}</p>
                <p>TEL {est.issuer.tel}</p>
                <p>登録番号 {est.issuer.registrationNo}</p>
                <p>登録番号（インボイス） {est.issuer.invoiceRegistrationNo}</p>
              </div>
              <div className="estimate-stamp shrink-0">
                {/* 角印（帳票内のため next/image は使わない） */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/azk-stamp.png" alt={`${base.custodian.officeName} 角印`} />
              </div>
            </div>
          </div>

          <h2 className="mt-10 text-center text-2xl font-bold tracking-[0.5em]">見積書</h2>

          {/* 件名・見積金額（左）、見積日・番号（右） */}
          <div className="mt-6 flex items-end justify-between gap-6">
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex items-baseline gap-3 border-b border-black pb-1">
                <span className="shrink-0 text-[11px] text-neutral-600">件名</span>
                <span className="font-bold">{est.subject}</span>
              </div>
              <div className="mt-2 flex items-baseline gap-3 border-b-2 border-black pb-1">
                <span className="shrink-0 text-[11px] text-neutral-600">見積金額</span>
                <span className="text-2xl font-bold">{estimateYen(est.total)}</span>
                <span className="text-[11px] text-neutral-600">（税込）</span>
              </div>
            </div>
            <table className="shrink-0 text-[11px]">
              <tbody>
                <tr>
                  <td className="pr-4 text-neutral-600">見積日</td>
                  <td className="text-right">{estimateDateText(est.issuedOn)}</td>
                </tr>
                {est.number && (
                  <tr>
                    <td className="pr-4 text-neutral-600">見積書番号</td>
                    <td className="text-right">{est.number}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 明細 */}
          <table className="estimate-items mt-5 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-neutral-100">
                <th className="border border-black px-2 py-1.5 text-left font-bold">摘要</th>
                <th className="w-[16mm] border border-black px-2 py-1.5 font-bold">数量</th>
                <th className="w-[26mm] border border-black px-2 py-1.5 font-bold">単価</th>
                <th className="w-[28mm] border border-black px-2 py-1.5 font-bold">明細金額</th>
              </tr>
            </thead>
            <tbody>
              {est.items.map((it, i) => (
                <tr key={i}>
                  <td className="border border-black px-2 py-1.5">
                    {it.name}
                    {!it.taxable && <span className="ml-1 text-[9px] text-neutral-600">（非課税）</span>}
                  </td>
                  <td className="border border-black px-2 py-1.5 text-center">{it.qty}</td>
                  <td className="border border-black px-2 py-1.5 text-right">{it.unitPrice.toLocaleString("ja-JP")}</td>
                  <td className="border border-black px-2 py-1.5 text-right">{it.amount.toLocaleString("ja-JP")}</td>
                </tr>
              ))}
              {Array.from({ length: blankRows }).map((_, i) => (
                <tr key={`blank-${i}`}>
                  <td className="border border-black px-2 py-1.5">&nbsp;</td>
                  <td className="border border-black px-2 py-1.5" />
                  <td className="border border-black px-2 py-1.5" />
                  <td className="border border-black px-2 py-1.5" />
                </tr>
              ))}
            </tbody>
          </table>

          {/* 合計 */}
          <div className="mt-3 flex justify-end">
            <table className="estimate-totals w-[92mm] border-collapse text-[11px]">
              <tbody>
                <tr>
                  <td className="border border-black px-2 py-1">小計</td>
                  <td className="border border-black px-2 py-1 text-right">{estimateYen(est.subtotalTaxable + est.taxFree)}</td>
                </tr>
                <tr>
                  <td className="border border-black px-2 py-1">消費税</td>
                  <td className="border border-black px-2 py-1 text-right">{estimateYen(est.tax)}</td>
                </tr>
                <tr className="font-bold">
                  <td className="border border-black px-2 py-1">合計</td>
                  <td className="border border-black px-2 py-1 text-right">{estimateYen(est.total)}</td>
                </tr>
                <tr>
                  <td className="border border-black px-2 py-1">内訳　10%対象（税抜）</td>
                  <td className="border border-black px-2 py-1 text-right">{estimateYen(est.subtotalTaxable)}</td>
                </tr>
                <tr>
                  <td className="border border-black px-2 py-1 pl-8 text-[10px]">10%消費税</td>
                  <td className="border border-black px-2 py-1 text-right text-[10px]">{estimateYen(est.tax)}</td>
                </tr>
                {est.taxFree > 0 && (
                  <tr>
                    <td className="border border-black px-2 py-1 pl-8 text-[10px]">非課税（{est.taxFreeLabel}）</td>
                    <td className="border border-black px-2 py-1 text-right text-[10px]">{estimateYen(est.taxFree)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 備考（印紙代の説明・在留期間ごとの金額の表・毎月の費用） */}
          <div className="mt-5 border border-black px-3 py-2 text-[10.5px] leading-relaxed">
            <p className="font-bold">備考</p>
            {est.notes.length === 0 && <p className="text-neutral-600">&nbsp;</p>}
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {est.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
            {showStampTable && (
              <div className="mt-2">
                <p className="font-bold">
                  申請手数料（収入印紙代）の額：許可される在留期間ごと（2026年10月1日改定・改正入管法施行令第25条第1項）
                </p>
                <table className="stamp-table mt-1 w-full border-collapse text-center text-[10px]">
                  <thead>
                    <tr className="bg-neutral-100">
                      <th className="border border-black px-1 py-0.5">許可される在留期間</th>
                      {STAMP_FEE_METHODS.map((m) => (
                        <th
                          key={m}
                          className={`border border-black px-1 py-0.5 ${est.stampFee.included && m === method ? "bg-neutral-300" : ""}`}
                        >
                          {m}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {STAMP_FEE_BANDS.map((b) => {
                      const hit = est.stampFee.included && b.key === bandKey;
                      return (
                        <tr key={b.key} className={hit ? "font-bold" : ""}>
                          <td className={`border border-black px-1 py-0.5 ${hit ? "bg-neutral-200" : ""}`}>
                            {b.key}
                            {hit && "（この見積）"}
                          </td>
                          {STAMP_FEE_METHODS.map((m) => (
                            <td
                              key={m}
                              className={`border border-black px-1 py-0.5 ${hit && est.stampFee.included && m === method ? "bg-neutral-300" : ""}`}
                            >
                              {estimateYen(m === "窓口" ? b.counter : b.online)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-1 text-[9.5px] text-neutral-700">
                  ※2026年9月30日までに受け付けた申請は、許可が10月1日以降になっても改定前の手数料（窓口6,000円・オンライン5,500円）です。
                  オンライン申請はコンビニ決済・銀行決済での納付のみで、別途決済手数料がかかります。
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 0;
        }
        .estimate-sheet {
          width: 210mm;
          min-height: 297mm;
          box-sizing: border-box;
        }
        /* 合計の金額は折り返さない（欄は数字の幅に合わせる） */
        .estimate-totals td:last-child {
          white-space: nowrap;
          width: 30mm;
        }
        .estimate-stamp img {
          width: 20mm;
          height: 20mm;
          object-fit: contain;
        }
        @media print {
          .estimate-sheet {
            height: 297mm;
            overflow: hidden;
          }
          .estimate-stamp img,
          .estimate-items th,
          .stamp-table th,
          .stamp-table td {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </>
  );
}
