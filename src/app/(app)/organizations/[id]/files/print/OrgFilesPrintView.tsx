"use client";

import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";

export interface OrgPrintFile {
  id: string;
  fileName: string;
  isImage: boolean;
  url: string; // 署名付きURL（発行できなければ空）
}

export interface OrgPrintSection {
  kind: string; // 農業特定技能加入通知書 / 年間カレンダー / 労使協定書
  uploadedOn: string; // 最新版のアップロード日（無ければ空）
  files: OrgPrintFile[];
}

// 所属機関の添付ファイルの印刷用（A4縦）。画像は1枚ずつ別のページに、
// 用紙いっぱいに収まる大きさで出す。PDF はここには埋め込めないので開くリンクを出す
export function OrgFilesPrintView({
  orgId,
  orgName,
  sections,
}: {
  orgId: string;
  orgName: string;
  sections: OrgPrintSection[];
}) {
  const title = sections.map((s) => s.kind).join("・");
  const images = sections.flatMap((s) =>
    s.files.filter((f) => f.isImage && f.url).map((f) => ({ ...f, kind: s.kind, uploadedOn: s.uploadedOn })),
  );
  const pdfs = sections.flatMap((s) => s.files.filter((f) => !f.isImage).map((f) => ({ ...f, kind: s.kind })));
  const missing = sections.filter((s) => s.files.length === 0);

  // 印刷（PDF保存）のとき、保存されるファイル名を「所属機関名_種類」にする
  const printSheet = () => {
    const original = document.title;
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    document.title = `${orgName}_${title}`;
    window.addEventListener("afterprint", restore);
    window.print();
  };

  return (
    <>
      <style>{"@media print{@page{size:A4 portrait;margin:10mm} body{background:#fff}}"}</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref={`/organizations/${orgId}`} />
          <h1 className="flex-1 text-lg font-bold">
            {orgName} の{title}（A4縦で印刷）
          </h1>
        </div>
        <div className="flex flex-col gap-2 px-4 py-3 lg:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={printSheet}
              disabled={images.length === 0}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground disabled:opacity-50"
            >
              <Printer size={18} />
              印刷・PDF保存（A4縦）
            </button>
            <span className="text-[11px] leading-relaxed text-muted">
              画像 {images.length}枚を1枚ずつA4縦に印刷します。印刷の設定で用紙は「A4」、向きは「縦」、拡大縮小は「用紙に合わせる」にしてください。
            </span>
          </div>
          {missing.map((s) => (
            <p key={s.kind} className="rounded-xl bg-seal/10 px-3 py-2 text-xs font-bold text-seal">
              {s.kind}はまだ添付されていません。所属機関の編集画面からアップロードしてください。
            </p>
          ))}
          {pdfs.length > 0 && (
            <div className="rounded-xl bg-status-notice-bg px-3 py-2 text-xs leading-relaxed text-status-notice-fg">
              <p className="font-bold">PDF のファイルはこのページには出せません。開いてから印刷してください。</p>
              <ul className="mt-1 list-disc pl-5">
                {pdfs.map((f) => (
                  <li key={f.id}>
                    {f.kind}:{" "}
                    {f.url ? (
                      <a href={f.url} target="_blank" rel="noopener" className="font-bold underline">
                        {f.fileName}
                      </a>
                    ) : (
                      f.fileName
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ここから下が印刷される部分。1画像 = 1ページ（A4縦） */}
      <div className="mx-auto max-w-[190mm] px-4 pb-10 lg:px-0 print:max-w-none print:p-0">
        {images.map((f, i) => (
          <section
            key={f.id}
            className={`flex flex-col items-center ${i < images.length - 1 ? "break-after-page" : ""} mb-6 print:mb-0`}
          >
            <p className="mb-1 w-full text-[8pt] text-black">
              {orgName} ／ {f.kind}
              {f.uploadedOn && `（${f.uploadedOn} にアップロード）`} ／ {f.fileName}
            </p>
            {/* 余白（上下10mm）と見出しの分を引いた高さに収める */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={f.url}
              alt={`${f.kind} ${f.fileName}`}
              className="max-h-[260mm] w-auto max-w-full border border-border object-contain print:border-0"
            />
          </section>
        ))}
      </div>
    </>
  );
}
