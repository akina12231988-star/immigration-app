"use client";

import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { rosterJpDate } from "@/lib/roster";
import {
  isPaperHandover,
  onboardingIndexFileName,
  type OnboardingIndexItem,
} from "@/lib/onboarding-index";

// 入社書類の目次（A4縦・1枚）。
// 会社へ紙で渡す資料の束の1枚目に付ける。番号と書類名を並べ、右に確認欄（□）を置く
export function OnboardingIndexSheet({
  workerId,
  workerName,
  workerKana,
  orgName,
  handoverMethod,
  today,
  items,
}: {
  workerId: string;
  workerName: string;
  workerKana: string;
  orgName: string;
  handoverMethod: string;
  today: string;
  items: OnboardingIndexItem[];
}) {
  // 印刷（PDF保存）のとき、保存されるファイル名を「入社書類目次_氏名」にする。
  // ブラウザは画面の題名（document.title）をPDFの既定のファイル名に使う
  const printSheet = () => {
    const original = document.title;
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    document.title = onboardingIndexFileName(workerName);
    window.addEventListener("afterprint", restore);
    window.print();
  };

  const cell = "border border-black px-2 py-[7px] align-middle";

  return (
    <>
      <style>{"@media print{@page{size:A4 portrait;margin:16mm}}"}</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref={`/workers/${workerId}`} />
          <h1 className="flex-1 text-lg font-bold">入社書類の目次（A4縦で印刷）</h1>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3 lg:px-8">
          <p className="text-xs leading-relaxed text-muted">
            所属機関に紙で渡す入社書類の束の1枚目に付ける目次です。書類の並びは入社書類メールと同じで、
            扶養控除等申告書は渡す会社（有限会社國崎青果・BASE株式会社）だけに入り、
            雇用保険の適用事業所でない会社は外国人雇用状況届出書、通貨払いの会社は報酬支払証明書が足されます。
          </p>
          {!orgName && (
            <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs font-bold text-seal">
              所属機関が未登録です。外国人詳細で所属機関を入れてから印刷してください。
            </p>
          )}
          {orgName && !isPaperHandover(handoverMethod) && (
            <p className="rounded-lg bg-status-notice-bg/60 px-2.5 py-1.5 text-xs font-bold text-status-notice-fg">
              この会社の「会社に渡す外国人資料のやりとり方法」は
              {handoverMethod ? `「${handoverMethod}」` : "未登録"}
              です（紙で渡す会社向けの目次ですが、印刷はできます）。
            </p>
          )}
          <div>
            <button
              type="button"
              onClick={printSheet}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground"
            >
              <Printer size={18} />
              印刷・PDF保存（A4縦）
            </button>
          </div>
        </div>
      </div>

      {/* 以下が印刷される部分（1枚） */}
      <div className="mx-auto max-w-[178mm] px-4 pb-10 lg:px-0">
        <section className="text-[11pt] leading-relaxed text-black">
          <h2 className="mb-6 mt-2 text-center text-[18pt] font-bold tracking-[0.4em]">
            入社書類　目次
          </h2>

          <table className="mb-6 w-full border-collapse text-[11pt]">
            <tbody>
              <tr>
                <th className={`${cell} w-[30%] bg-neutral-100 text-left font-bold`}>特定技能所属機関</th>
                <td className={cell}>{orgName || "　"}</td>
              </tr>
              <tr>
                <th className={`${cell} bg-neutral-100 text-left font-bold`}>外国人の氏名</th>
                <td className={cell}>
                  {workerName || "　"}
                  {workerKana && <span className="ml-2 text-[9.5pt]">（{workerKana}）</span>}
                </td>
              </tr>
              <tr>
                <th className={`${cell} bg-neutral-100 text-left font-bold`}>作成日</th>
                <td className={cell}>{rosterJpDate(today)}</td>
              </tr>
            </tbody>
          </table>

          <table className="w-full border-collapse text-[11pt]">
            <thead>
              <tr>
                <th className={`${cell} w-[9%] bg-neutral-100 text-center font-bold`}>No.</th>
                <th className={`${cell} bg-neutral-100 text-left font-bold`}>書類名</th>
                <th className={`${cell} w-[30%] bg-neutral-100 text-left font-bold`}>備考</th>
                <th className={`${cell} w-[10%] bg-neutral-100 text-center font-bold`}>確認</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.key}>
                  <td className={`${cell} text-center tabular-nums`}>{it.num}</td>
                  <td className={cell}>{it.label}</td>
                  <td className={`${cell} text-[9.5pt]`}>{it.note}</td>
                  <td className={`${cell} text-center text-[14pt]`}>□</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-6 text-[9.5pt] leading-relaxed">
            上記の書類を同封しています。不足・不明な点がありましたら、登録支援機関までご連絡ください。
          </p>
        </section>
      </div>
    </>
  );
}
