"use client";

import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import {
  listSalesEntriesByWorker,
  setSalesEntryFreeeNo,
} from "@/lib/supabase/queries/sales";
import { formatSalesYen } from "@/lib/sales";
import { errorMessage } from "@/lib/errors";
import type { SalesEntryRow } from "@/types/db";

// 許可売上No.・保険No.（freee販売の伝票番号）。
// 番号の実体は売上明細（sales_entries）なので、ここでの編集はその行を書き換える。
// 申請ごとに明細が残るため、更新のたびに履歴が積み上がる。
export function WorkerPermitSalesNos({
  workerId,
  canEdit,
}: {
  workerId: string;
  canEdit: boolean;
}) {
  const [entries, setEntries] = useState<SalesEntryRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() =>
      listSalesEntriesByWorker(createClient(), workerId)
        .then((rows) => {
          if (cancelled) return;
          // 新しい順（クエリの並び）のまま、許可売上と保険だけ残す
          setEntries(rows.filter((r) => r.kind === "申請" || r.kind === "保険"));
          setLoaded(true);
        })
        .catch(() => {
          if (!cancelled) setLoaded(true);
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  const save = async (id: string, value: string) => {
    setEntries((prev) => prev.map((r) => (r.id === id ? { ...r, freee_no: value } : r)));
    try {
      await setSalesEntryFreeeNo(createClient(), id, value);
    } catch (err) {
      setError(errorMessage(err, "売上No.の保存に失敗しました"));
    }
  };

  const permits = entries.filter((r) => r.kind === "申請");
  const insurances = entries.filter((r) => r.kind === "保険");

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
        <Receipt size={16} />
        許可売上No.・保険No.
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        許可時の売上（申請）と特定技能総合保険をfreee販売に登録したときの伝票番号です。
        月末の請求書作成の名簿にも同じ番号が出ます。申請ごとに1件ずつ残るので、
        更新のたびに下へ積み上がります（一番上が最新）。
      </p>

      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
          {error}
        </p>
      )}

      <Group
        title="許可売上No."
        rows={permits}
        canEdit={canEdit}
        placeholder="許可売上No."
        emptyText="許可時の売上明細がまだありません（在留カード受領後の売上登録で作られます）。"
        onSave={save}
      />
      <div className="mt-3">
        <Group
          title="保険No."
          rows={insurances}
          canEdit={canEdit}
          placeholder="保険No."
          emptyText="特定技能総合保険の売上明細はありません（会社負担の新規申請のときに作られます）。"
          onSave={save}
        />
      </div>

      {!loaded && <p className="mt-2 text-xs text-muted">読み込み中…</p>}
    </Card>
  );
}

function Group({
  title,
  rows,
  canEdit,
  placeholder,
  emptyText,
  onSave,
}: {
  title: string;
  rows: SalesEntryRow[];
  canEdit: boolean;
  placeholder: string;
  emptyText: string;
  onSave: (id: string, value: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-bold text-muted">{title}</p>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-background p-3 text-xs text-muted">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded-xl bg-background p-2.5"
            >
              <span className="min-w-0 flex-1 text-xs">
                <span className="block truncate font-bold">{r.item_name || "（品目未設定）"}</span>
                <span className="block text-[11px] text-muted">
                  {formatSalesYen(r.amount)} ・ {r.status}
                  {r.registered_on && ` ・ ${r.registered_on}登録`}
                </span>
              </span>
              {canEdit ? (
                <input
                  key={`${r.id}-${r.freee_no}`}
                  defaultValue={r.freee_no}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== r.freee_no) onSave(r.id, v);
                  }}
                  placeholder={placeholder}
                  className={`min-h-[36px] w-40 rounded-lg border px-2 text-xs ${
                    r.freee_no ? "border-border bg-surface" : "border-seal/40 bg-seal/5"
                  }`}
                />
              ) : (
                <span className="text-xs font-bold tabular-nums">{r.freee_no || "—"}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
