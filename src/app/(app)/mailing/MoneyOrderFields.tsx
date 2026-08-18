"use client";

import { Plus, Trash2 } from "lucide-react";
import { moneyOrderNo, syncMoneyOrders, type MoneyOrder } from "@/lib/tax-cert";

// 郵送請求に同封する定額小為替の番号入力。
// 証明書1枚につき1枚同封するので、請求する証明書ごとに1行を用意する。
// 番号は「前半の数字 - 後半の数字」で控える。
export function MoneyOrderFields({
  titles,
  orders,
  onChange,
  canEdit = true,
}: {
  titles: string[]; // 郵送請求する証明書（この枚数だけ小為替を同封する）
  orders: MoneyOrder[];
  onChange: (orders: MoneyOrder[]) => void;
  canEdit?: boolean;
}) {
  // 証明書の枚数に合わせて行をそろえる（入力済みの番号は引き継ぐ）
  const rows = syncMoneyOrders(titles, orders);

  const set = (id: string, patch: Partial<MoneyOrder>) =>
    onChange(rows.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  // 追加分のidは既存と重ならない連番にする（並び順も安定する）
  const add = () => {
    let n = rows.length + 1;
    while (rows.some((o) => o.id === `mo-extra-${n}`)) n += 1;
    onChange([...rows, { id: `mo-extra-${n}`, docTitle: "", first: "", second: "" }]);
  };

  const remove = (id: string) => onChange(rows.filter((o) => o.id !== id));

  const NUM =
    "min-h-[40px] w-full rounded-xl border border-border bg-surface px-3 text-sm tabular-nums focus:border-brand focus:outline-none";

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] leading-relaxed text-muted">
        証明書1枚につき定額小為替1枚を同封します。為替証書の番号を、前半と後半に分けて入力してください。
      </p>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-background px-3 py-2 text-[11px] text-muted">
          手数料がかからない請求のため、定額小為替の行はありません。
          同封した場合は下の「定額小為替を追加」で残せます。
        </p>
      ) : (
        rows.map((o) => (
          <div key={o.id} className="rounded-xl border border-border p-2.5">
            <div className="mb-1.5 flex items-start justify-between gap-2">
              {o.docTitle ? (
                <span className="text-[11px] font-bold text-muted">{o.docTitle}</span>
              ) : canEdit ? (
                <input
                  value={o.docTitle}
                  onChange={(e) => set(o.id, { docTitle: e.target.value })}
                  placeholder="何の分か（例: 予備の1枚）"
                  className="min-h-[32px] flex-1 rounded-lg border border-border bg-surface px-2 text-[11px] focus:border-brand focus:outline-none"
                />
              ) : (
                <span className="text-[11px] font-bold text-muted">（証明書名なし）</span>
              )}
              {canEdit && !titles.includes(o.docTitle) && (
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
              <div className="flex items-center gap-2">
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
            ) : (
              <p className="text-sm tabular-nums">{moneyOrderNo(o) || "番号未入力"}</p>
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
          定額小為替を追加（予備・追加分）
        </button>
      )}
    </div>
  );
}
