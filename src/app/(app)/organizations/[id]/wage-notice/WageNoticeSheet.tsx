"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { rosterJpDate } from "@/lib/roster";
import type { OrgRosterWorker } from "@/lib/supabase/queries/organizations";
import {
  belowNewMinimum,
  currentWageCell,
  defaultWageNoticeValues,
  monthDayText,
  wageNoticeFileName,
  warekiDateWithDow,
  yenText,
  type WageNoticeValues,
} from "@/lib/wage-notice";

const FIELD =
  "min-h-[36px] rounded-lg border border-border bg-surface px-2 text-sm focus:border-brand focus:outline-none";

// 最低賃金の改定に伴う「時給のご確認」のお願い（A4横1枚）。
// 上がFAX送付状、真ん中が改定内容、下が在籍名簿（改定後の時給を書いてもらう欄つき）。
// 金額・適用日・都道府県・返信期限・担当者・FAX番号は印刷の前にここで変えられる
export function WageNoticeSheet({
  organizationId,
  organizationName,
  workers,
  today,
  staffName,
  fax,
  office,
}: {
  organizationId: string;
  organizationName: string;
  workers: OrgRosterWorker[];
  today: string;
  staffName: string;
  fax: string;
  office: { name: string; registrationNo: string; address: string; tel: string };
}) {
  const [v, setV] = useState<WageNoticeValues>(() => defaultWageNoticeValues(today, staffName, fax));
  const set = (patch: Partial<WageNoticeValues>) => setV((cur) => ({ ...cur, ...patch }));
  const hourly = Number(v.hourly.replace(/[^0-9]/g, "")) || 0;
  const hourlyText = yenText(hourly);

  // 印刷（PDF保存）のファイル名を「最低賃金の案内_機関名」にする
  const printSheet = () => {
    const original = document.title;
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    document.title = wageNoticeFileName(organizationName);
    window.addEventListener("afterprint", restore);
    window.print();
  };

  const cell = "border border-black px-2 py-[4px] align-middle";

  return (
    <>
      <style>{"@media print{@page{size:A4 landscape;margin:9mm 12mm} body{background:#fff}}"}</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref={`/organizations/${organizationId}`} />
          <h1 className="flex-1 text-lg font-bold">最低賃金の案内（A4横で印刷・FAX用）</h1>
        </div>
        <div className="flex flex-col gap-3 px-4 py-3 lg:px-8">
          <p className="text-xs leading-relaxed text-muted">
            所属機関にFAXで送る「時給のご確認」のお願いです。在籍中の人を名簿にして、改定後の時給を書いてもらう欄を付けています。
            金額・適用日・返信期限などは下で変えてから印刷してください。印刷の設定で用紙は「A4」、向きは「横」にしてください。
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              都道府県（最低賃金）
              <input value={v.prefecture} onChange={(e) => set({ prefecture: e.target.value })} className={FIELD} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              改定後の最低賃金（円）
              <input value={v.hourly} onChange={(e) => set({ hourly: e.target.value })} inputMode="numeric" className={`${FIELD} tabular-nums`} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              適用日
              <input type="date" value={v.effectiveOn} onChange={(e) => set({ effectiveOn: e.target.value })} className={FIELD} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              返信期限
              <input type="date" value={v.replyBy} onChange={(e) => set({ replyBy: e.target.value })} className={FIELD} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              送信日
              <input type="date" value={v.sentOn} onChange={(e) => set({ sentOn: e.target.value })} className={FIELD} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              送信枚数
              <input value={v.pages} onChange={(e) => set({ pages: e.target.value })} inputMode="numeric" className={`${FIELD} tabular-nums`} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              担当者
              <input value={v.staff} onChange={(e) => set({ staff: e.target.value })} className={FIELD} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              返信先のFAX番号
              <input value={v.fax} onChange={(e) => set({ fax: e.target.value })} className={`${FIELD} tabular-nums`} />
            </label>
          </div>
          <div>
            <button
              type="button"
              onClick={printSheet}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground"
            >
              <Printer size={18} />
              印刷・PDF保存（A4横）
            </button>
          </div>
          {workers.length === 0 && (
            <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs font-bold text-seal">
              状態が「在籍中」の方がいないため、名簿は空です。
            </p>
          )}
        </div>
      </div>

      {/* 以下が印刷される部分（A4横1枚） */}
      <div className="mx-auto max-w-[273mm] px-4 pb-10 text-black lg:px-0 print:max-w-none print:p-0">
        <section className="text-[10pt] leading-[1.4]">
          <div className="flex items-start justify-between gap-8">
            <div>
              <span className="inline-block border-[1.5px] border-black px-3 py-0.5 font-bold tracking-[0.2em]">FAX</span>
              <p className="mt-1.5 min-w-[90mm] border-b-2 border-black pb-1 text-[14pt] font-bold">
                {organizationName}　御中
                <span className="mt-0.5 block text-[9.5pt] font-normal">ご担当者様（特定技能外国人の受入れご担当）</span>
              </p>
            </div>
            <div className="text-[9.5pt] leading-[1.45]">
              <p>
                送信日：{warekiDateWithDow(v.sentOn)}　　送信枚数：{v.pages || "1"}枚（本紙含む）
              </p>
              <p>
                <span className="text-[11pt] font-bold">登録支援機関　{office.name}</span>（登録番号 {office.registrationNo}）
              </p>
              <p>{office.address}</p>
              <p>
                TEL {office.tel}　／　担当：{v.staff}
              </p>
            </div>
          </div>

          <h2 className="my-3 text-center text-[14pt] font-bold tracking-[0.05em]">
            最低賃金の改定に伴う「時給のご確認」のお願い
          </h2>
          <p className="mb-2">
            平素より大変お世話になっております。{v.prefecture}の最低賃金が下記のとおり改定されます。
            貴社に在籍中の特定技能外国人について、<b>{warekiDateWithDow(v.effectiveOn)}以降の時給</b>を下の名簿にご記入のうえ、
            <b>{warekiDateWithDow(v.replyBy)}まで</b>に、本紙をFAX（{v.fax}）またはLINEの写真でお送りくださいますようお願いいたします。
          </p>
          <div className="mb-2 flex items-center gap-8 border-[1.5px] border-black px-4 py-1.5">
            <p className="text-[20pt] font-black">時給 {hourlyText}円</p>
            <p>
              {v.prefecture}最低賃金　<b>{warekiDateWithDow(v.effectiveOn)}から</b>適用
              <br />
              （現在の時給が{hourlyText}円未満の方は、{monthDayText(v.effectiveOn)}以降の時給を{hourlyText}円以上に改定する必要があります）
            </p>
          </div>

          <table className="w-full border-collapse text-[10.5pt]">
            <thead>
              <tr>
                <th className={`${cell} w-[8mm] bg-neutral-100 text-center text-[10pt]`}>No.</th>
                <th className={`${cell} bg-neutral-100 text-center text-[10pt]`}>氏名</th>
                <th className={`${cell} w-[34mm] bg-neutral-100 text-center text-[10pt]`}>在留資格</th>
                <th className={`${cell} w-[24mm] bg-neutral-100 text-center text-[10pt]`}>雇用開始日</th>
                <th className={`${cell} w-[30mm] bg-neutral-100 text-center text-[10pt]`}>
                  現在の時給
                  <br />
                  <span className="text-[8.5pt] font-normal">（当方の登録内容）</span>
                </th>
                <th className={`${cell} w-[44mm] bg-neutral-100 text-center text-[10pt]`}>
                  {monthDayText(v.effectiveOn)}からの時給
                  <br />
                  <span className="text-[8.5pt] font-normal">ご記入ください</span>
                </th>
                <th className={`${cell} bg-neutral-100 text-center text-[10pt]`}>備考（変更なし・昇給時期など）</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w, i) => (
                <tr key={w.id}>
                  <td className={`${cell} text-center`}>{i + 1}</td>
                  <td className={cell}>{w.name}</td>
                  <td className={`${cell} ${w.residenceStatus.length > 8 ? "text-[9pt]" : ""}`}>{w.residenceStatus}</td>
                  <td className={`${cell} text-center`}>{rosterJpDate(w.startOn)}</td>
                  <td className={`${cell} text-right tabular-nums ${belowNewMinimum(w.wageKind, w.wageAmount, hourly) ? "font-bold" : ""}`}>
                    {currentWageCell(w.wageKind, w.wageAmount)}
                  </td>
                  <td className={`${cell} h-[7.5mm] text-right text-[12pt]`}>　　　　　　円</td>
                  <td className={cell}></td>
                </tr>
              ))}
              {workers.length === 0 && (
                <tr>
                  <td className={`${cell} text-center text-muted`} colSpan={7}>
                    在籍中の方はいません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-1 text-center text-[9pt] text-neutral-600">
            ※ 現在の時給は当方に登録のある最新の賃金です。違っている場合は、正しい時給を備考にご記入ください。
          </p>
        </section>
      </div>
    </>
  );
}
