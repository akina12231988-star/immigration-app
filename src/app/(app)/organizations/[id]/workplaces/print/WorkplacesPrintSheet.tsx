"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";

interface Row {
  name: string;
  address: string;
  phone: string;
}

// 就業場所の一覧表（A4縦）。見出しは「会社名（就労場所）」と補足（例: ＊収穫季節に応じて移動して就業する）。
// 番号・事業所名・住所・電話番号の表にする（FAX 番号は載せない）。
// 見出しと補足は印刷前にこの画面で直せる（直した内容はこの印刷にだけ使う）
export function WorkplacesPrintSheet({ orgId, orgName, rows }: { orgId: string; orgName: string; rows: Row[] }) {
  const [title, setTitle] = useState(`${orgName}（就労場所）`);
  const [note, setNote] = useState("");

  const printSheet = () => {
    const original = document.title;
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    document.title = `${orgName}_就労場所一覧`;
    window.addEventListener("afterprint", restore);
    window.print();
  };

  const cell = "border border-black px-2 py-2.5";
  return (
    <>
      <style>{"@media print{@page{size:A4 portrait;margin:15mm 12mm} body{background:#fff}}"}</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref={`/organizations/${orgId}`} />
          <h1 className="flex-1 text-lg font-bold">就業場所の一覧表（A4縦で印刷）</h1>
        </div>
        <div className="flex flex-col gap-3 px-4 py-3 lg:px-8">
          <p className="text-xs leading-relaxed text-muted">
            所属機関の「求人票に記載する内容 ＞ 就業の場所」（変更先の事業所を含む）から作った一覧表です。下のプレビューのとおりA4縦で印刷されます。
            事業所を直すときは所属機関の画面で編集してください。見出しと補足はここで直すとこの印刷にだけ使われます。
          </p>
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-surface p-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-bold text-muted">見出し</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="min-h-[40px] rounded-lg border border-border bg-background px-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-bold text-muted">補足（見出しの後ろに付ける）</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例: ＊収穫季節に応じて移動して就業する"
                className="min-h-[40px] rounded-lg border border-border bg-background px-2 text-sm"
              />
            </label>
          </div>
          <div>
            <button
              type="button"
              onClick={printSheet}
              disabled={rows.length === 0}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground disabled:opacity-50"
            >
              <Printer size={18} />
              印刷・PDF保存（A4縦）
            </button>
          </div>
          <p className="text-xs font-bold text-muted">プレビュー</p>
        </div>
      </div>

      {/* ここから下が印刷される部分 */}
      <div className="mx-auto max-w-[186mm] bg-white px-4 pb-10 text-black print:max-w-none print:p-0 lg:px-6 lg:py-6">
        <p className="mb-3 text-center" style={{ fontSize: "12pt" }}>
          {title}
          {note && <span className="ml-2">{note}</span>}
        </p>
        {rows.length === 0 ? (
          <p className="text-center text-sm">就業の場所が登録されていません。</p>
        ) : (
          <table
            className="w-full border-collapse"
            // 見出し行・番号列の灰色も印刷する（ブラウザは背景色を印刷しないため）
            style={{ fontSize: "10.5pt", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
          >
            <thead>
              <tr className="bg-[#d9d9d9]">
                <th className={`${cell} w-[8%]`} />
                <th className={`${cell} w-[18%]`} />
                <th className={`${cell} font-bold`}>住所</th>
                <th className={`${cell} w-[22%] font-bold`}>電話番号</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className={`${cell} bg-[#f2f2f2] text-center font-bold`}>{i + 1}</td>
                  <td className={`${cell} text-center`}>{r.name}</td>
                  <td className={cell}>{r.address}</td>
                  <td className={`${cell} text-center tabular-nums`}>{r.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
