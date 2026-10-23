"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Image as ImageIcon } from "lucide-react";
import {
  BANK_ACCOUNT_GUIDES,
  DEFAULT_BANK_ACCOUNT_GUIDE,
  EXAM_FEE_ACCOUNT,
  bankAccountGuideForNationality,
  type BankAccountGuide,
} from "@/lib/exam-fee-account";

// 本人に送る振込先の口座案内（画像）。本人の国籍に合わせた母国語の画像を選び、
// その場でクリップボードにコピーして Messenger に貼れるようにする。
//
// 画像のコピーはブラウザが対応していれば（Chrome・Safari・Edge）画像として入る。
// 対応していないときは「画像を開く」から保存して送ってもらう。

const COPY_UNSUPPORTED = "この環境では画像をコピーできません。「画像を開く」から保存して送ってください。";

// 画像をクリップボードに入れる（失敗したら例外）
export async function copyBankAccountGuideImage(guide: BankAccountGuide): Promise<void> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("unsupported");
  }
  const res = await fetch(guide.imagePath);
  const blob = await res.blob();
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

// 本人の国籍に合う画像を先頭にした並び
function orderedGuides(matched: BankAccountGuide | null): BankAccountGuide[] {
  if (!matched) return [...BANK_ACCOUNT_GUIDES];
  return [matched, ...BANK_ACCOUNT_GUIDES.filter((g) => g.key !== matched.key)];
}

const BTN =
  "inline-flex min-h-[32px] items-center gap-1 rounded-lg border px-2.5 text-[11px] font-bold";
const BTN_PLAIN = `${BTN} border-border bg-surface text-brand hover:bg-brand/5`;
const BTN_MATCHED = `${BTN} border-brand bg-brand text-brand-foreground`;

// 口座案内のカード。国籍別の画像のコピー・画像を開く・（任意で）文章のコピーができる
export function BankAccountGuideCard({
  nationality,
  title = "振込先の口座案内",
  text,
  textLabel = "文章をコピー",
  compact = false,
}: {
  nationality?: string | null; // 本人の国籍（合う画像を先頭に出す）
  title?: string;
  text?: string; // 口座の文章（渡したときだけ「文章をコピー」を出す）
  textLabel?: string;
  compact?: boolean; // 画像のプレビューを出さない
}) {
  const matched = bankAccountGuideForNationality(nationality);
  const [selected, setSelected] = useState<BankAccountGuide>(matched ?? DEFAULT_BANK_ACCOUNT_GUIDE);
  const [copied, setCopied] = useState<string | null>(null); // 画像のキー or "text"
  const [error, setError] = useState<string | null>(null);

  const flash = (key: string) => {
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };

  const copyImage = async (g: BankAccountGuide) => {
    setError(null);
    setSelected(g);
    try {
      await copyBankAccountGuideImage(g);
      flash(g.key);
    } catch {
      setError(COPY_UNSUPPORTED);
    }
  };

  const copyText = async () => {
    if (!text) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      flash("text");
    } catch {
      setError("文章をコピーできませんでした。");
    }
  };

  return (
    <div className={`rounded-lg border border-border bg-background ${compact ? "px-2.5 py-2" : "p-2.5"}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[11px] font-bold text-muted">
          {title}（{EXAM_FEE_ACCOUNT.bank}・名義 {EXAM_FEE_ACCOUNT.holder}）
        </span>
        {matched ? (
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">
            本人の国籍: {nationality} → {matched.label}の画像
          </span>
        ) : (
          <span className="rounded-full bg-status-notice-bg px-2 py-0.5 text-[10px] font-bold text-status-notice-fg">
            {(nationality ?? "").trim() ? `国籍「${nationality}」の画像は無いので日本語の画像` : "国籍が未登録のため日本語の画像"}
          </span>
        )}
      </div>
      {/* 国籍別の画像をコピーするボタン（本人の国籍に合うものを先頭に、色を変えて出す） */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {orderedGuides(matched).map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => void copyImage(g)}
            title={`${g.label}の口座案内の画像をコピーします`}
            className={matched?.key === g.key ? BTN_MATCHED : BTN_PLAIN}
          >
            {copied === g.key ? <Check size={12} /> : <ImageIcon size={12} />}
            {copied === g.key ? "コピーしました" : `${g.short}の画像をコピー`}
          </button>
        ))}
        {text && (
          <button type="button" onClick={() => void copyText()} className={BTN_PLAIN}>
            {copied === "text" ? <Check size={12} /> : <Copy size={12} />}
            {copied === "text" ? "文章をコピーしました" : textLabel}
          </button>
        )}
        <a href={selected.imagePath} target="_blank" rel="noopener noreferrer" className={BTN_PLAIN}>
          <ExternalLink size={12} />
          画像を開く（{selected.short}）
        </a>
      </div>
      {error && <p className="mt-1 text-[11px] text-seal">{error}</p>}
      {!compact && (
        <a href={selected.imagePath} target="_blank" rel="noopener noreferrer" className="mt-2 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected.imagePath}
            alt={`振込先の口座案内（${selected.label}）`}
            className="max-h-48 w-auto rounded-lg border border-border bg-surface"
          />
        </a>
      )}
    </div>
  );
}

// 一覧の行などに置く小さなボタン。本人の国籍に合う画像（無ければ日本語）を1回でコピーする
export function BankAccountGuideCopyButton({
  nationality,
  className = "",
}: {
  nationality?: string | null;
  className?: string;
}) {
  const guide = bankAccountGuideForNationality(nationality) ?? DEFAULT_BANK_ACCOUNT_GUIDE;
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const copy = async () => {
    try {
      await copyBankAccountGuideImage(guide);
      setState("done");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 1800);
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={state === "error" ? COPY_UNSUPPORTED : `${guide.label}の口座案内の画像をコピーします`}
      className={`inline-flex min-h-[26px] items-center gap-1 rounded-lg border border-border bg-surface px-2 text-[11px] font-bold text-brand hover:bg-brand/5 ${className}`}
    >
      {state === "done" ? <Check size={11} /> : <ImageIcon size={11} />}
      {state === "done" ? "コピーしました" : state === "error" ? "コピーできません" : `口座案内（${guide.short}）をコピー`}
    </button>
  );
}
