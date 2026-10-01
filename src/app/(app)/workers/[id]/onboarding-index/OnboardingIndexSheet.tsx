"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Printer, RotateCcw, X } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { rosterJpDate } from "@/lib/roster";
import {
  addIndexItem,
  isPaperHandover,
  moveIndexItem,
  onboardingIndexFileName,
  removeIndexItem,
  updateIndexItem,
  type OnboardingIndexItem,
} from "@/lib/onboarding-index";

// 入社書類の目次（A4縦・1枚）。
// 会社へ紙で渡す資料の束の1枚目に付ける。番号と書類名を並べ、右に確認欄（□）を置く。
// 行は印刷の前にその場で足し引き・並べ替え・書き換えができる（この画面の中だけ。保存はしない）
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

  // 目次の行（自動の内容から始めて、この画面で足し引きする）
  const [rows, setRows] = useState<OnboardingIndexItem[]>(items);
  const edited = rows !== items;
  const inputCls =
    "min-h-[36px] rounded-lg border border-border bg-background px-2 text-sm focus:border-brand focus:outline-none";
  const iconBtn =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted hover:text-foreground disabled:opacity-30";

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

          {/* 目次の項目の編集（印刷されない）。足す・消す・上下・書類名と備考の書き換え */}
          <div className="rounded-xl border border-border bg-surface/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-muted">目次の項目（印刷の前にここで足し引きできます。保存はされません）</p>
              {edited && (
                <button
                  type="button"
                  onClick={() => setRows(items)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-brand underline"
                >
                  <RotateCcw size={13} />
                  自動の内容に戻す
                </button>
              )}
            </div>
            <ul className="mt-2 space-y-1.5">
              {rows.map((r, i) => (
                <li key={r.key} className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
                  <span className="w-7 shrink-0 text-center text-sm font-bold tabular-nums text-muted">{r.num}</span>
                  <input
                    value={r.label}
                    onChange={(e) => setRows((cur) => updateIndexItem(cur, r.key, { label: e.target.value }))}
                    aria-label={`${r.num}番の書類名`}
                    placeholder="書類名"
                    className={`${inputCls} min-w-0 flex-1 basis-[12rem]`}
                  />
                  <input
                    value={r.note}
                    onChange={(e) => setRows((cur) => updateIndexItem(cur, r.key, { note: e.target.value }))}
                    aria-label={`${r.num}番の備考`}
                    placeholder="備考"
                    className={`${inputCls} min-w-0 flex-1 basis-[8rem] sm:max-w-[14rem]`}
                  />
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setRows((cur) => moveIndexItem(cur, r.key, -1))}
                      disabled={i === 0}
                      aria-label={`${r.num}番を上へ`}
                      className={iconBtn}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRows((cur) => moveIndexItem(cur, r.key, 1))}
                      disabled={i === rows.length - 1}
                      aria-label={`${r.num}番を下へ`}
                      className={iconBtn}
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRows((cur) => removeIndexItem(cur, r.key))}
                      aria-label={`${r.num}番を消す`}
                      className={`${iconBtn} hover:text-seal`}
                    >
                      <X size={16} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setRows((cur) => addIndexItem(cur))}
              className="mt-2 inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-brand px-3 text-xs font-bold text-brand"
            >
              <Plus size={14} />
              項目を追加
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
              {rows.map((it) => (
                <tr key={it.key}>
                  <td className={`${cell} text-center tabular-nums`}>{it.num}</td>
                  <td className={cell}>{it.label || "　"}</td>
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
