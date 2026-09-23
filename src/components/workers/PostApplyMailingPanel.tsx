"use client";

import { useState } from "react";
import { Check, Send, Undo2 } from "lucide-react";
import { letterPackTrackingUrl } from "@/lib/application-prep";
import {
  mailingOf,
  newPostApplyMailing,
  prepDocLabel,
  removeDocFromMailings,
  unmailedDocIds,
  type PostApplyMailing,
} from "@/lib/post-apply";
import { todayStr } from "@/lib/ssw/calc";

const FIELD =
  "min-h-[36px] rounded-lg border border-border bg-surface px-2 text-xs focus:border-brand focus:outline-none";

// "2026-09-25" → "2026/9/25"
function dateLabel(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${m[1]}/${Number(m[2])}/${Number(m[3])}` : d || "日付未入力";
}

// 申請後に入管へ郵送する書類と、郵送した記録（投函日・追跡番号）。
// 1件ずつ「入管へ郵送した」で記録するほか、同じ日に同じ追跡番号で送ったものは
// 「まとめて入管へ郵送した」で一度に記録できる。申請準備と申請一覧の両方で使う。
export function PostApplyMailingPanel({
  docIds,
  mailings,
  canEdit,
  onSave,
}: {
  docIds: string[];
  mailings: PostApplyMailing[];
  canEdit: boolean;
  onSave: (mailings: PostApplyMailing[]) => void | Promise<void>;
}) {
  const unmailed = unmailedDocIds(docIds, mailings);
  // 入力欄を開いているときに選んでいる書類（null = 閉じている）
  const [selected, setSelected] = useState<string[] | null>(null);
  const [postedOn, setPostedOn] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);

  const open = (ids: string[]) => {
    setSelected(ids);
    setPostedOn(todayStr());
    setTracking("");
  };
  const save = async () => {
    if (!selected || selected.length === 0 || !postedOn) return;
    setBusy(true);
    try {
      await onSave([...mailings, newPostApplyMailing(selected, postedOn, tracking)]);
      setSelected(null);
    } finally {
      setBusy(false);
    }
  };

  if (docIds.length === 0) return <p className="text-[11px] text-muted">ありません。</p>;

  return (
    <div className="space-y-1">
      {docIds.map((id) => {
        const m = mailingOf(id, mailings);
        return (
          <div
            key={id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
              m ? "bg-status-approved-bg/60" : "bg-surface"
            }`}
          >
            <span className="min-w-0">
              <span className="font-bold">{prepDocLabel(id)}</span>
              {m && (
                <span className="ml-2 text-[11px] text-status-approved-fg">
                  <Check size={11} className="mr-0.5 inline" />
                  入管へ郵送済み（投函 {dateLabel(m.posted_on)}・追跡番号{" "}
                  {m.tracking ? (
                    <a
                      href={letterPackTrackingUrl(m.tracking)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold tabular-nums underline"
                    >
                      {m.tracking}
                    </a>
                  ) : (
                    "未入力"
                  )}
                  ）
                </span>
              )}
            </span>
            {canEdit &&
              (m ? (
                <button
                  type="button"
                  onClick={() => void onSave(removeDocFromMailings(id, mailings))}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-bold text-muted"
                >
                  <Undo2 size={12} />
                  取り消す
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => open([id])}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-bold text-brand"
                >
                  <Send size={12} />
                  入管へ郵送した
                </button>
              ))}
          </div>
        );
      })}

      {canEdit && unmailed.length >= 2 && selected == null && (
        <button
          type="button"
          onClick={() => open(unmailed)}
          className="mt-1 flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-[11px] font-bold text-brand-foreground"
        >
          <Send size={12} />
          まとめて入管へ郵送した（{unmailed.length}件・同じ日・同じ追跡番号）
        </button>
      )}

      {/* 投函日・追跡番号の入力（選んだ書類をまとめて1回の投函として記録） */}
      {canEdit && selected != null && (
        <div className="mt-1 space-y-2 rounded-lg border border-brand/40 bg-surface p-2.5">
          <p className="text-[11px] font-bold">入管へ郵送した書類（同じ封筒で送ったものを選ぶ）</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {unmailed.map((id) => (
              <label key={id} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={selected.includes(id)}
                  onChange={(e) =>
                    setSelected(e.target.checked ? [...selected, id] : selected.filter((x) => x !== id))
                  }
                  className="h-4 w-4"
                />
                {prepDocLabel(id)}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-muted">投函日</span>
              <input type="date" value={postedOn} onChange={(e) => setPostedOn(e.target.value)} className={FIELD} />
            </label>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-0.5">
              <span className="text-[10px] font-bold text-muted">追跡番号（レターパックなど）</span>
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="例：1234-5678-9012"
                inputMode="numeric"
                className={`${FIELD} tabular-nums`}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || selected.length === 0 || !postedOn}
              className="rounded-lg bg-brand px-3 py-2 text-[11px] font-bold text-brand-foreground disabled:opacity-50"
            >
              {busy ? "保存中…" : `入管へ郵送したとして記録（${selected.length}件）`}
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted"
            >
              やめる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
