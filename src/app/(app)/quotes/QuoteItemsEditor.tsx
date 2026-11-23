"use client";

import { ArrowDown, ArrowUp, Plus, Trash2, Type } from "lucide-react";
import { parseAmount } from "@/lib/organization-intake";
import { newQuoteItemRow, newQuoteTextRow, QUOTE_UNITS, type QuoteItem } from "@/lib/quote";

const input = "min-h-[40px] rounded-lg border border-border bg-background px-2 text-sm";

// 見積書の項目の編集（新しく作るときと、作ったあとの両方で使う）。
// すべての項目を1行ずつ見せ、左のチェックで「見積書に入れる／入れない」を選ぶ。
// 項目名・金額（税抜）・単位・補足はその場で直せる。文字だけの行（見出し・説明）も足せる
export function QuoteItemsEditor({ items, onChange }: { items: QuoteItem[]; onChange: (items: QuoteItem[]) => void }) {
  const patchItem = (i: number, p: Partial<QuoteItem>) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const onCount = items.filter((i) => i.on).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span>
          左のチェックが付いた行だけ見積書に入ります（{onCount}/{items.length}行）。金額を空欄にすると「—」と印字します（実費・ご相談など）。
        </span>
        <button type="button" onClick={() => onChange(items.map((i) => ({ ...i, on: true })))} className="font-bold text-brand">
          全部入れる
        </button>
        <button type="button" onClick={() => onChange(items.map((i) => ({ ...i, on: false })))} className="font-bold text-brand">
          全部外す
        </button>
      </div>
      {items.map((it, i) => (
        <div
          key={i}
          className={`flex flex-col gap-1.5 rounded-xl border p-2 ${it.on ? "border-brand/40 bg-background" : "border-border bg-surface opacity-60"}`}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="flex min-h-[40px] items-center gap-1 pr-1 text-xs font-bold">
              <input
                type="checkbox"
                checked={it.on}
                onChange={(e) => patchItem(i, { on: e.target.checked })}
                aria-label={`${it.name || `行${i + 1}`}を見積書に入れる`}
                className="h-5 w-5"
              />
              {it.kind === "text" && <Type size={14} className="text-muted" aria-label="文字の行" />}
            </label>
            <input
              value={it.name}
              onChange={(e) => patchItem(i, { name: e.target.value })}
              placeholder={
                it.kind === "text" ? "表に入れる文字（例: ■ 特定技能への変更のとき／■ 許可後、毎月かかる費用）" : "項目"
              }
              aria-label={it.kind === "text" ? `行${i + 1}の文字` : `行${i + 1}の項目名`}
              className={`${input} min-w-[200px] flex-1`}
            />
            <button type="button" onClick={() => move(i, -1)} aria-label={`行${i + 1}を上へ`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface">
              <ArrowUp size={14} />
            </button>
            <button type="button" onClick={() => move(i, 1)} aria-label={`行${i + 1}を下へ`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface">
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              aria-label={`行${i + 1}を削除`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-seal hover:bg-seal/10"
            >
              <Trash2 size={14} />
            </button>
          </div>
          {it.kind === "item" && (
            <div className="flex flex-wrap items-center gap-1.5 pl-7">
              <input
                value={it.price == null ? "" : String(it.price)}
                onChange={(e) =>
                  patchItem(i, { price: e.target.value.trim() === "" ? null : (parseAmount(e.target.value) ?? 0) })
                }
                inputMode="numeric"
                placeholder="金額（税抜）"
                aria-label={`行${i + 1}の金額`}
                className={`${input} w-28 text-right tabular-nums`}
              />
              <span className="text-xs text-muted">円</span>
              <input
                value={it.unit}
                onChange={(e) => patchItem(i, { unit: e.target.value })}
                list="quote-units"
                placeholder="単位"
                aria-label={`行${i + 1}の単位`}
                className={`${input} w-28`}
              />
              <label className="flex items-center gap-1 text-[11px] text-muted">
                <input type="checkbox" checked={it.taxFree} onChange={(e) => patchItem(i, { taxFree: e.target.checked })} />
                非課税
              </label>
              <input
                value={it.note}
                onChange={(e) => patchItem(i, { note: e.target.value })}
                placeholder="備考（この行の説明。例: 変更申請のとき）"
                aria-label={`行${i + 1}の備考`}
                className={`${input} min-w-[200px] flex-1 text-xs`}
              />
            </div>
          )}
        </div>
      ))}
      <datalist id="quote-units">
        {QUOTE_UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange([...items, newQuoteItemRow()])}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-brand bg-background px-3 text-xs font-bold text-brand hover:bg-brand/5"
        >
          <Plus size={14} />
          項目の行を追加
        </button>
        <button
          type="button"
          onClick={() => onChange([...items, newQuoteTextRow()])}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-brand bg-background px-3 text-xs font-bold text-brand hover:bg-brand/5"
        >
          <Type size={14} />
          文字の行を追加
        </button>
      </div>
    </div>
  );
}
