"use client";

import { useState } from "react";
import { Printer, RotateCcw } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import type { CustodianInfo } from "@/lib/custody";
import { rosterJpDate } from "@/lib/roster";
import { supportSystemPrintFileName, type PrintPerson, type SupportSystemPrintPeople } from "@/lib/support-system-print";

export interface ListingImage {
  id: string;
  fileName: string;
  isImage: boolean;
  url: string;
  uploadedOn: string;
}

// 「支援業務を行う体制についての説明」（A4縦）。説明文・登録支援機関名・支援責任者・支援担当者一覧を載せる。
// 印刷する前に、載せる支援責任者・支援担当者をチェックで選び、説明文もその場で直せる
// （直した内容はこの印刷にだけ使う。文章そのものを直すときは登録支援機関の画面で編集する）。
export function SupportSystemPrintSheet({
  info,
  people,
  orgId,
  orgName,
  listingImages,
  printedOn,
}: {
  info: CustodianInfo;
  people: SupportSystemPrintPeople;
  orgId: string;
  orgName: string;
  listingImages: ListingImage[];
  printedOn: string;
}) {
  const [note, setNote] = useState(info.supportSystemNote);
  const [managers, setManagers] = useState(people.managers);
  const [staff, setStaff] = useState(people.staff);
  const [withListing, setWithListing] = useState(listingImages.some((f) => f.isImage && f.url));

  const reset = () => {
    setNote(info.supportSystemNote);
    setManagers(people.managers);
    setStaff(people.staff);
  };

  const toggle = (setter: React.Dispatch<React.SetStateAction<PrintPerson[]>>, id: string) =>
    setter((prev) => prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)));

  const printSheet = () => {
    const original = document.title;
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    document.title = supportSystemPrintFileName(orgName);
    window.addEventListener("afterprint", restore);
    window.print();
  };

  const selectedManagers = managers.filter((p) => p.selected);
  const selectedStaff = staff.filter((p) => p.selected);
  const images = withListing ? listingImages.filter((f) => f.isImage && f.url) : [];

  const personList = (
    title: string,
    list: PrintPerson[],
    setter: React.Dispatch<React.SetStateAction<PrintPerson[]>>,
  ) => (
    <div className="rounded-lg border border-border bg-background p-2">
      <p className="mb-1 text-[11px] font-bold text-muted">{title}</p>
      {list.length === 0 ? (
        <p className="text-[11px] text-muted">該当する従業員がいません（登録支援機関 ＞ 支援体制（従業員）で役割を付けてください）。</p>
      ) : (
        <div className="flex flex-col gap-1">
          {list.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={p.selected} onChange={() => toggle(setter, p.id)} className="h-4 w-4" />
              <span className="font-bold">{p.name}</span>
              {p.office && <span className="text-muted">{p.office}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <style>{"@media print{@page{size:A4 portrait;margin:15mm} body{background:#fff}}"}</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref={orgId ? `/organizations/${orgId}` : "/support-org"} />
          <h1 className="flex-1 text-lg font-bold">支援業務を行う体制についての説明（A4縦で印刷）</h1>
        </div>
        <div className="flex flex-col gap-3 px-4 py-3 lg:px-8">
          <p className="text-xs leading-relaxed text-muted">
            下の内容がA4縦で印刷されます。載せる支援責任者・支援担当者はチェックで選べます
            {orgName && `（${orgName} に選任されている人を最初から選んでいます）`}。
            文章はここで直すとこの印刷にだけ使われます。文章そのものを直すときは「登録支援機関」の画面で編集してください。
          </p>
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="mb-2 text-xs font-bold text-muted">印刷前の確認・選択</p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-bold text-muted">説明文</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={5}
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs leading-relaxed"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={withListing}
                    disabled={!listingImages.some((f) => f.isImage && f.url)}
                    onChange={(e) => setWithListing(e.target.checked)}
                    className="h-4 w-4"
                  />
                  人材サービス総合サイトの掲載画面（最新版の画像 {listingImages.filter((f) => f.isImage && f.url).length}枚）を別ページで印刷する
                </label>
                {listingImages.some((f) => !f.isImage) && (
                  <p className="text-[11px] text-muted">
                    PDF で添付した掲載画面はここには出せません。登録支援機関の画面の「添付済み」ボタンから開いて印刷してください。
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {personList("支援責任者", managers, setManagers)}
                {personList("支援担当者", staff, setStaff)}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={printSheet}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground"
            >
              <Printer size={18} />
              印刷・PDF保存（A4縦）
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold text-muted"
            >
              <RotateCcw size={16} />
              選択を元に戻す
            </button>
          </div>
        </div>
      </div>

      {/* ここから下が印刷される部分 */}
      <div className="mx-auto max-w-[180mm] px-4 pb-10 lg:px-0 print:max-w-none print:p-0">
        <section className={`text-[11pt] leading-relaxed text-black ${images.length > 0 ? "break-after-page" : ""}`}>
          <h1 className="mb-6 text-center text-[16pt] font-bold tracking-wide">支援業務を行う体制についての説明</h1>
          <p className="mb-6 whitespace-pre-wrap text-justify indent-[1em]">{note}</p>

          <p className="mb-4">
            登録支援機関　<span className="font-bold">{info.officeName}</span>
            {info.registrationNo && <span className="ml-3 text-[10pt]">（登録番号 {info.registrationNo}）</span>}
          </p>
          {orgName && (
            <p className="mb-4 text-[10pt]">
              特定技能所属機関　<span className="font-bold">{orgName}</span>
            </p>
          )}

          <div className="mb-4">
            <p className="mb-1 font-bold">＜支援責任者＞</p>
            <ul className="ml-6 list-none space-y-0.5">
              {selectedManagers.map((p) => (
                <li key={p.id}>
                  {p.name}
                  {p.office && <span className="ml-3 text-[9.5pt]">{p.office}</span>}
                </li>
              ))}
              {selectedManagers.length === 0 && <li className="text-[9.5pt]">（未選択）</li>}
            </ul>
          </div>
          <div className="mb-4">
            <p className="mb-1 font-bold">＜支援担当者一覧＞</p>
            <ul className="ml-6 list-none space-y-0.5">
              {selectedStaff.map((p) => (
                <li key={p.id}>
                  {p.name}
                  {p.office && <span className="ml-3 text-[9.5pt]">{p.office}</span>}
                </li>
              ))}
              {selectedStaff.length === 0 && <li className="text-[9.5pt]">（未選択）</li>}
            </ul>
          </div>

          <p className="mt-8 text-right text-[10pt]">{rosterJpDate(printedOn)}</p>
        </section>

        {/* 人材サービス総合サイトの掲載画面（1画像 = 1ページ） */}
        {images.map((f, i) => (
          <section
            key={f.id}
            className={`flex flex-col items-center ${i < images.length - 1 ? "break-after-page" : ""} mt-6 print:mt-0`}
          >
            <p className="mb-1 w-full text-[9pt] text-black">
              人材サービス総合サイトの掲載画面（{f.uploadedOn} 時点）／ {f.fileName}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={f.url}
              alt={`人材サービス総合サイト ${f.fileName}`}
              className="max-h-[250mm] w-auto max-w-full border border-border object-contain print:border-0"
            />
          </section>
        ))}
      </div>
    </>
  );
}
