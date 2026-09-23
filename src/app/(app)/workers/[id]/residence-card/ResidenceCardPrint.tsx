"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Printer, Upload } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { uploadWorkerDoc } from "@/lib/worker-docs";
import type { CurrentResidenceCard } from "../../actions";

// 現在の在留カードをA4縦で印刷する。
// 画像はこの画面で印刷し、PDFはブラウザのPDF表示で開いて印刷する。
// 登録が無いとき（または新しくなったとき）は、ここで最新の在留カードを添付する
// （外国人詳細の「在留カード・指定書」にも登録される）。
export function ResidenceCardPrint({
  workerId,
  workerName,
  card,
  canEdit,
}: {
  workerId: string;
  workerName: string;
  card: CurrentResidenceCard | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadWorkerDoc(workerId, "在留カード", file);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添付に失敗しました");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  // 印刷（PDF保存）のファイル名を「在留カード_氏名」にする
  const printCard = () => {
    const original = document.title;
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    document.title = `在留カード_${workerName.replace(/[\\/:*?"<>|]/g, "-").trim()}`;
    window.addEventListener("afterprint", restore);
    window.print();
  };

  const uploadArea = canEdit && (
    <FileDropArea onFiles={(f) => void upload(f)} disabled={busy} className="rounded-xl">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-bold text-brand disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        {busy ? "添付中…" : card ? "新しい在留カードを添付する" : "最新の在留カードを添付する（画像・PDF）"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => void upload(e.target.files)}
      />
    </FileDropArea>
  );

  return (
    <>
      {/* 余白を0にしてブラウザのヘッダー・フッター（URL・日時など）を出さない */}
      <style>{"@media print{@page{size:A4 portrait;margin:0}}"}</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref={`/workers/${workerId}`} />
          <h1 className="flex-1 text-lg font-bold">在留カードの印刷（{workerName}）</h1>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3 lg:px-8">
          {error && (
            <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
              {error}
            </p>
          )}
          {card ? (
            <>
              <p className="text-xs leading-relaxed text-muted">
                いちばん新しく登録された在留カードです（{new Date(card.createdAt).toLocaleDateString("ja-JP")}
                {card.fromApplication ? "・申請のときに登録したもの" : ""}）。
                在留カードが更新されている場合は、新しい在留カードを添付してから印刷してください。
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {card.isPdf ? (
                  <a
                    href={card.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground"
                  >
                    <ExternalLink size={18} />
                    PDFを開いて印刷する
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={printCard}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground"
                  >
                    <Printer size={18} />
                    印刷・PDF保存（A4縦）
                  </button>
                )}
                {uploadArea}
              </div>
              {card.isPdf && (
                <p className="text-[11px] text-muted">PDFで登録されているので、新しいタブで開いてブラウザの印刷から印刷してください。</p>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-seal/40 bg-seal/10 p-3">
              <p className="mb-2 text-sm font-bold text-seal">在留カードが登録されていません。</p>
              <p className="mb-3 text-xs leading-relaxed">
                最新の在留カード（表・裏）の画像かPDFを添付すると、この画面で印刷できます。
                添付した在留カードは外国人詳細の「在留カード・指定書」にも登録されます。
              </p>
              {canEdit ? uploadArea : <p className="text-xs text-muted">閲覧のみの権限のため添付できません。</p>}
            </div>
          )}
        </div>
      </div>

      {/* 印刷される部分（画像のとき） */}
      {card && !card.isPdf && (
        <div className="flex justify-center px-4 pb-10 print:p-[14mm]">
          {/* eslint-disable-next-line @next/next/no-img-element -- 署名付きURLの画像をそのまま印刷する */}
          <img
            src={card.url}
            alt={`${workerName}の在留カード`}
            className="max-h-[260mm] w-auto max-w-full border border-border object-contain print:max-w-[182mm] print:border-0"
          />
        </div>
      )}
    </>
  );
}
