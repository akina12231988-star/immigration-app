"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BookMarked,
  Check,
  Copy,
  ExternalLink,
  MessageCircle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { WorkerWithOrg } from "@/lib/supabase/queries/workers";
import { isPassportRenewalTarget, remainingLabel, daysUntil } from "@/lib/worker-alerts";
import { todayStr } from "@/lib/application-alerts";
import { passportGuide } from "@/lib/passport-guides";
import { notionAppUrl } from "@/lib/notion-link";

export function PassportsClient({ workers }: { workers: WorkerWithOrg[] }) {
  const today = todayStr();

  const targets = useMemo(
    () =>
      workers
        .filter((w) => isPassportRenewalTarget(w, today))
        .sort((a, b) =>
          (a.passport_expiry_date ?? "").localeCompare(b.passport_expiry_date ?? ""),
        ),
    [workers, today],
  );

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
        <BookMarked size={14} className="mt-0.5 shrink-0" />
        パスポート有効期限の半年前になった対象者です。国籍に応じた更新案内（日本語＋現地語）をコピーして、LINEやMessengerで本人に送れます。
      </p>

      <p className="text-sm font-bold text-muted">{targets.length}件</p>

      {targets.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">該当者はいません。</Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {targets.map((w) => (
            <PassportRow key={w.id} worker={w} today={today} />
          ))}
        </div>
      )}
    </div>
  );
}

function PassportRow({ worker, today }: { worker: WorkerWithOrg; today: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"" | "both" | "ja" | "local">("");

  const expiry = worker.passport_expiry_date ?? "";
  const days = expiry ? daysUntil(expiry, today) : 0;
  const overdue = days < 0;
  const guide = passportGuide(worker.nationality);

  const combined = `${guide.ja}\n\n---\n\n${guide.local}`;

  const copy = async (text: string, which: "both" | "ja" | "local") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };

  return (
    <Card className={`p-4 ${overdue ? "border-seal" : ""}`}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <Link href={`/workers/${worker.id}`} className="min-w-0">
          <p className="truncate font-bold">{worker.name}</p>
          <p className="truncate text-xs text-muted">
            {worker.organizations?.name ?? "所属機関未設定"}
            {worker.nationality && ` ・ ${worker.nationality}`}
          </p>
        </Link>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ${overdue ? "bg-seal/10 text-seal" : "bg-status-notice-bg text-status-notice-fg"}`}>
          {expiry ? remainingLabel(expiry, today) : "期限未登録"}
        </span>
      </div>

      <p className="text-xs tabular-nums text-muted">パスポート有効期限 {expiry || "未登録"}</p>

      <div className="mt-2 flex flex-wrap gap-3">
        {worker.messenger_link && (
          <a href={worker.messenger_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-brand">
            <MessageCircle size={13} />
            Messengerで送る
          </a>
        )}
        {worker.notion_link && (
          <a href={notionAppUrl(worker.notion_link)} className="flex items-center gap-1 text-xs font-bold text-brand">
            <ExternalLink size={13} />
            Notion
          </a>
        )}
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between text-sm font-bold text-brand"
        >
          <span>更新案内（{guide.nationality} / {guide.localLangLabel}）</span>
          <span className="text-xs">{open ? "閉じる" : "開く"}</span>
        </button>

        {open && (
          <div className="mt-2 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={copied === "both" ? <Check size={15} /> : <Copy size={15} />} onClick={() => copy(combined, "both")}>
                {copied === "both" ? "コピーしました" : "日本語＋現地語をコピー"}
              </Button>
              <Button variant="secondary" icon={copied === "ja" ? <Check size={15} /> : <Copy size={15} />} onClick={() => copy(guide.ja, "ja")}>
                {copied === "ja" ? "コピー" : "日本語のみ"}
              </Button>
              <Button variant="secondary" icon={copied === "local" ? <Check size={15} /> : <Copy size={15} />} onClick={() => copy(guide.local, "local")}>
                {copied === "local" ? "コピー" : `${guide.localLangLabel}のみ`}
              </Button>
            </div>

            <div className="rounded-xl bg-background p-3">
              <p className="mb-1 text-[11px] font-bold text-muted">日本語</p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed">{guide.ja}</p>
            </div>
            <div className="rounded-xl bg-background p-3">
              <p className="mb-1 text-[11px] font-bold text-muted">{guide.localLangLabel}</p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed">{guide.local}</p>
            </div>
            {guide.officialUrl && (
              <a href={guide.officialUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-brand">
                <ExternalLink size={13} />
                {guide.officialName}（公式サイト）
              </a>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
