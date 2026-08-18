"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  MONEY_ORDER_AMOUNTS,
  moneyOrderNo,
  moneyOrdersOf,
  syncMoneyOrders,
  type MoneyOrder,
  type MoneyOrderGroup,
} from "@/lib/tax-cert";

// 郵送請求に同封する定額小為替の番号・金額の入力。
// 証明書1枚につき1枚同封するので、請求する証明書ごとに1行を用意する。
// 2年度分を請求するときなどは「定額小為替を追加」で足し、
// どの証明書に対する分かを選ぶ。
export function MoneyOrderFields({
  titles,
  orders,
  onChange,
  group = "main",
  canEdit = true,
  emptyText = "郵送請求する証明書がありません。",
}: {
  titles: string[]; // この欄で郵送請求する証明書（この枚数だけ小為替を同封する）
  orders: MoneyOrder[]; // 記録が持つ小為替すべて（他の欄の分も含む）
  onChange: (orders: MoneyOrder[]) => void;
  group?: MoneyOrderGroup; // どの欄の分か（課税証明書など / 国民健康保険税）
  canEdit?: boolean;
  emptyText?: string;
}) {
  // この欄の分だけを取り出し、証明書の枚数に合わせて行をそろえる
  const rows = syncMoneyOrders(titles, moneyOrdersOf(orders, group), group);
  const others = orders.filter((o) => (o.group ?? "main") !== group);
  const emit = (next: MoneyOrder[]) => onChange([...others, ...next]);

  const set = (id: string, patch: Partial<MoneyOrder>) =>
    emit(rows.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  // 追加分のidは既存と重ならない連番にする（並び順も安定する）
  const add = () => {
    let n = rows.length + 1;
    while (rows.some((o) => o.id === `mo-${group}-extra-${n}`)) n += 1;
    emit([
      ...rows,
      {
        id: `mo-${group}-extra-${n}`,
        docTitle: titles[0] ?? "",
        first: "",
        second: "",
        group,
        extra: true,
      },
    ]);
  };

  const remove = (id: string) => emit(rows.filter((o) => o.id !== id));

  const NUM =
    "min-h-[40px] w-full rounded-xl border border-border bg-surface px-3 text-sm tabular-nums focus:border-brand focus:outline-none";
  const SELECT =
    "min-h-[36px] w-full rounded-lg border border-border bg-surface px-2 text-xs focus:border-brand focus:outline-none";

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] leading-relaxed text-muted">
        証明書1枚につき定額小為替1枚を同封します。為替証書の番号を前半と後半に分けて入力し、金額も選んでください。
      </p>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-background px-3 py-2 text-[11px] text-muted">{emptyText}</p>
      ) : (
        rows.map((o) => (
          <div key={o.id} className="rounded-xl border border-border p-2.5">
            <div className="mb-1.5 flex items-start justify-between gap-2">
              {o.extra && canEdit ? (
                /* 追加した分は、どの証明書に対する小為替かを選ぶ（2年度分など） */
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[10px] font-bold text-muted">この小為替を付ける証明書</span>
                  <select
                    value={titles.includes(o.docTitle) ? o.docTitle : "__other"}
                    onChange={(e) =>
                      set(o.id, { docTitle: e.target.value === "__other" ? "" : e.target.value })
                    }
                    className={SELECT}
                  >
                    {titles.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                    <option value="__other">その他（自分で書く）</option>
                  </select>
                  {!titles.includes(o.docTitle) && (
                    <input
                      value={o.docTitle}
                      onChange={(e) => set(o.id, { docTitle: e.target.value })}
                      placeholder="例: 課税証明書（新年度分）"
                      className={SELECT}
                    />
                  )}
                </label>
              ) : (
                <span className="text-[11px] font-bold text-muted">
                  {o.docTitle || "（証明書名なし）"}
                </span>
              )}
              {canEdit && o.extra && (
                <button
                  type="button"
                  onClick={() => remove(o.id)}
                  aria-label="この定額小為替を削除"
                  className="shrink-0 text-seal"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {canEdit ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-center gap-2">
                  <input
                    inputMode="numeric"
                    value={o.first}
                    onChange={(e) => set(o.id, { first: e.target.value.replace(/[^0-9]/g, "") })}
                    placeholder="前半の数字"
                    className={NUM}
                  />
                  <span className="shrink-0 text-sm font-bold text-muted">-</span>
                  <input
                    inputMode="numeric"
                    value={o.second}
                    onChange={(e) => set(o.id, { second: e.target.value.replace(/[^0-9]/g, "") })}
                    placeholder="後半の数字"
                    className={NUM}
                  />
                </div>
                <select
                  value={o.amount ?? ""}
                  onChange={(e) => set(o.id, { amount: e.target.value })}
                  aria-label="定額小為替の金額"
                  className="min-h-[40px] shrink-0 rounded-xl border border-border bg-surface px-2 text-sm tabular-nums focus:border-brand focus:outline-none"
                >
                  <option value="">金額</option>
                  {MONEY_ORDER_AMOUNTS.map((a) => (
                    <option key={a} value={a}>
                      {Number(a).toLocaleString("ja-JP")}円
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-sm tabular-nums">
                {moneyOrderNo(o) || "番号未入力"}
                {o.amount ? `　${Number(o.amount).toLocaleString("ja-JP")}円` : ""}
              </p>
            )}
          </div>
        ))
      )}
      {canEdit && (
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 self-start rounded-lg border border-dashed border-brand px-3 py-2 text-xs font-bold text-brand"
        >
          <Plus size={13} />
          定額小為替を追加（2年度分・予備など）
        </button>
      )}
    </div>
  );
}
