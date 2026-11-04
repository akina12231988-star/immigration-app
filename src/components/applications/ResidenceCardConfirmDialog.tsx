"use client";

import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import {
  cardDate,
  cardGender,
  missingCardItems,
  permissionKind,
  toFullWidth,
  type ResidenceCardConfirmData,
} from "@/lib/residence-card-confirm";

// 許可情報を保存する前の「在留カード情報の最終確認」。
// 在留カード等読取アプリケーションの照合結果に似せた見本のカード（実物の画像ではない）に、
// 外国人詳細の登録内容（氏名・生年月日・性別・国籍・住居地）と、今入力した内容
// （在留資格・満了日・番号・在留期間・許可日）を流し込んで見せる。「この内容で登録する」で保存する
export function ResidenceCardConfirmDialog({
  data,
  busy,
  onBack,
  onConfirm,
}: {
  data: ResidenceCardConfirmData;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const missing = missingCardItems(data);
  const v = (s: string) => s || "未登録";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/55 p-3" role="dialog" aria-modal="true">
      <div className="my-auto w-full max-w-2xl rounded-2xl bg-surface p-4 shadow-xl sm:p-5">
        <p className="flex items-center gap-2 text-base font-bold">
          <AlertTriangle size={20} className="text-status-notice-fg" />
          在留カード情報の最終確認
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted">在留カード情報はこれで合っているか、最終確認をしてください。</p>
        <p className="text-sm font-bold leading-relaxed text-seal">
          この内容で情報を登録します。変更する場合は「戻る」ボタンを押してください。
        </p>
        {missing.length > 0 && (
          <p className="mt-2 rounded-lg bg-seal/10 px-3 py-1.5 text-xs font-bold text-seal">未入力: {missing.join("・")}</p>
        )}

        {/* 見本のカード（照合結果の形をまねたもの） */}
        <div
          className="relative mt-3 overflow-hidden rounded-xl border border-[#e3c4bd] px-3 pb-3 pt-0 text-[12px] text-[#1d2433] sm:px-4"
          style={{ background: "linear-gradient(120deg,#f6d6d0 0%,#f3e1dc 35%,#e6dbe9 60%,#f4d8d2 100%)" }}
        >
          <div className="-mx-3 flex items-center justify-between bg-[#b9d3ec] px-3 py-1 sm:-mx-4 sm:px-4">
            <b>日本国政府</b>
            <span className="text-base font-bold tracking-[0.3em]">在留カード</span>
            <span className="rounded-sm bg-[#a8862b] px-3 text-xs font-bold text-white">ISA</span>
          </div>
          <span className="pointer-events-none absolute right-[34%] top-[38%] -rotate-12 text-5xl font-bold tracking-widest text-seal/20">
            見本
          </span>
          <div className="mt-2 flex gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <CardRow label="氏名" sub="NAME">
                <span className="text-[15px] tracking-[0.15em]">{v(data.name)}</span>
              </CardRow>
              <CardRow label="生年月日" sub="DATE OF BIRTH">
                {v(cardDate(data.birth))}
                <span className="ml-3 font-bold">性別</span> {v(cardGender(data.gender))}
                <span className="ml-3 font-bold">国籍・地域</span> {v(data.nationality)}
              </CardRow>
              <CardRow label="住居地" sub="ADDRESS">
                {v(data.address)}
              </CardRow>
              <p className="ml-16 inline-flex flex-wrap gap-3 bg-[#b9d3ec] px-2 py-1 text-[11px]">
                <b>就労制限の有無</b>
                <span>在留資格に基づく就労活動のみ可</span>
              </p>
              <CardRow label="在留資格" sub="STATUS">
                <span className="text-[15px]">{v(data.residenceStatus)}</span>
              </CardRow>
              <CardRow label="在留期間満了日" sub="EXPIRY DATE">
                <span className="text-[14px] tracking-[0.1em] underline">{data.expiryDate ? toFullWidth(cardDate(data.expiryDate)) : "未登録"}</span>
              </CardRow>
            </div>
            <div className="hidden h-36 w-28 shrink-0 items-center justify-center rounded-md bg-black/10 text-[11px] text-muted sm:flex">
              （写真）
            </div>
          </div>
          <p className="-mx-3 mt-2 bg-[#b9d3ec] px-3 py-1 sm:-mx-4 sm:px-4">
            <b>番号 No.</b>
            <span className="ml-2 text-[15px] tracking-[0.2em]">{data.cardNo ? toFullWidth(data.cardNo.trim()) : "未登録"}</span>
          </p>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Box label="在留期間" value={v(data.period)} />
          <Box
            label="許可"
            value={`${permissionKind(data.applicationContent) || "許可の種類 未登録"}・${data.permitDate ? cardDate(data.permitDate) : "許可日 未登録"}`}
          />
          <div className="sm:col-span-2">
            <Box label="在留期間の注意事項" value={data.periodNote || "（空欄）"} />
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          ※ 在留カード等読取アプリケーションの照合結果の形をまねた見本です（実物のカードの画像ではありません）。
          氏名・生年月日・性別・国籍・住居地は外国人詳細の登録内容、在留資格・満了日・番号・在留期間・許可日は今入力した内容です。
        </p>

        <div className="mt-4 grid grid-cols-[1fr_1.4fr] gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-bold disabled:opacity-60"
          >
            <ArrowLeft size={16} />
            戻る（入力を直す）
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-brand-foreground disabled:opacity-60"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {busy ? "登録中…" : "この内容で登録する"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CardRow({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-[4.5rem] shrink-0 font-bold leading-tight">
        {label}
        <span className="block text-[8px] font-normal text-[#555]">{sub}</span>
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background px-3 py-2">
      <span className="block text-[11px] text-muted">{label}</span>
      <b className="text-sm">{value}</b>
    </div>
  );
}
