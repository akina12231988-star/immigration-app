"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { messengerWebUrl } from "@/lib/messenger-link";
import { RESUME_LANGS, type ResumeLang } from "@/lib/resume-tool/i18n";
import { resumeLangForNationality } from "@/lib/resume-tool/share";
import { docRequestMessage } from "@/lib/doc-request-text";
import type { DocumentRequestItem } from "@/lib/org-document-requests";

// チェック表の行の右端の「案内文を表示」で開く、本人への案内文（日本語＋母国語）。
// その人の「案内」を押した書類をまとめて1つの文面にする（外したい書類はチェックを外せる）。
// 母国語は国籍から決め、違えば選び直せる。期限は依頼の提出期限が入るが、本人に伝える日に直せる
export function DocRequestTextDialog({
  open,
  onClose,
  worker,
  organizationName,
  items: informedItems,
  dueOn,
}: {
  open: boolean;
  onClose: () => void;
  worker: { name: string; nationality: string; messengerLink: string };
  organizationName: string;
  items: DocumentRequestItem[]; // その人の「案内」を押した書類（対象外を除く）
  dueOn: string | null; // 依頼の提出期限
}) {
  const [lang, setLang] = useState<ResumeLang>(() => resumeLangForNationality(worker.nationality));
  const [due, setDue] = useState(dueOn ?? "");
  const [copied, setCopied] = useState(false);
  // 文面から外す書類（チェックを外したもの）
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());

  const items = informedItems.filter((i) => !excluded.has(i.id));
  const text = docRequestMessage(lang, {
    workerName: worker.name,
    organizationName,
    dueOn: due || null,
    items: items.map((i) => ({ name: i.name, note: i.note })),
  });

  // 文面をクリップボードへ（使えない環境では文字を選んでコピーしてもらう）
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };

  const toggle = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Modal open={open} title="本人への案内文（日本語＋母国語）" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-muted">
          <span className="font-bold text-foreground">{worker.name}</span>
          {worker.nationality && `（${worker.nationality}）`}さんに、「案内」を押した書類（{informedItems.length}件）をまとめて案内する文面です。コピーして Messenger などに貼ってください。
        </p>
        {/* 文面に入れる書類（「案内」を押したもの。外したいものはチェックを外す） */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {informedItems.map((i) => (
            <label key={i.id} className="flex items-center gap-1 font-bold">
              <input type="checkbox" checked={!excluded.has(i.id)} onChange={() => toggle(i.id)} className="h-3.5 w-3.5" />
              {i.name}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-muted">
          <label className="flex items-center gap-1">
            母国語
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as ResumeLang)}
              className="min-h-[30px] rounded-lg border border-border bg-surface px-1.5 text-xs font-bold text-foreground"
              aria-label="案内文の母国語"
            >
              {RESUME_LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            本人に伝える期限
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="min-h-[30px] rounded-lg border border-border bg-surface px-1.5 text-xs text-foreground"
            />
            {due && (
              <button type="button" onClick={() => setDue("")} className="text-[10px] text-muted underline">
                期限なし
              </button>
            )}
          </label>
        </div>
        <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-background px-3 py-2 text-xs leading-relaxed">
          {text}
        </pre>
        <p className="text-[11px] text-muted">
          日本語のあとに母国語の同じ内容が続きます。よくある書類名（扶養控除等申告書・扶養証明書・送金証明書・源泉徴収票 など）は母国語になり、それ以外の書類は日本語の名前のまま「 」で入ります。
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {worker.messengerLink && (
            <a
              href={messengerWebUrl(worker.messengerLink)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-border px-3 text-xs font-bold text-brand"
            >
              <MessageCircle size={14} />
              Messenger を開く
            </a>
          )}
          <button
            type="button"
            onClick={() => void copy()}
            disabled={items.length === 0}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-brand px-3.5 text-sm font-bold text-brand-foreground disabled:opacity-50"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "コピーしました" : "案内文をコピー"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
