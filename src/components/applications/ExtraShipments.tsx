"use client";

import { useState } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateExtraRequest } from "@/lib/supabase/queries/extra-requests";
import { letterPackTrackingUrl } from "@/lib/application-prep";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import { todayStr } from "@/lib/application-alerts";
import {
  emptyShipment,
  removeShipmentAt,
  shipmentsOf,
  updateShipmentAt,
  type ExtraShipment,
} from "@/lib/extra-shipments";

const MIGRATION = "0201_extra_request_shipments.sql";

const CELL =
  "rounded-lg border border-border bg-background px-2 py-1 text-xs focus:border-brand focus:outline-none";

// 追加資料の「2回目以降の郵送」の記録（申請詳細と申請一覧の＜入管＞追加資料タブで共通）。
// 追加資料を何回かに分けて送ったとき、「いつ・何を・どの追跡番号で」送ったかを
// 「＋ 郵送を追加」で1行ずつ残す。1回目は従来の「郵送した日・追跡番号」の欄に入れる
export function ExtraShipments({
  requestId,
  value,
  canEdit,
  onSaved,
}: {
  requestId: string; // application_extra_requests.id
  value: unknown; // 保存してある shipments（0201 未適用なら undefined）
  canEdit: boolean;
  onSaved: (next: ExtraShipment[]) => void; // 保存できたら親の行にも反映する
}) {
  const shipments = shipmentsOf(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 列は値を入れるときだけ送る（0201 未適用の環境でも他の保存が止まらないようにする）
  const save = async (next: ExtraShipment[]) => {
    setBusy(true);
    setError(null);
    try {
      await updateExtraRequest(createClient(), requestId, { shipments: next });
      onSaved(next);
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, errorMessage(err, "郵送の記録の保存に失敗しました")));
    } finally {
      setBusy(false);
    }
  };

  if (!canEdit && shipments.length === 0) return null;

  return (
    <div className="mt-2 border-t border-border pt-2">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-muted">
          追加で郵送したもの（2回目以降）
          {shipments.length > 0 && `・${shipments.length}件`}
        </span>
        {canEdit && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save([...shipments, emptyShipment(todayStr())])}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-brand disabled:opacity-50"
          >
            <Plus size={12} />
            郵送を追加
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
          {error}
        </p>
      )}
      {shipments.length === 0 ? (
        <p className="text-[11px] text-muted">
          資料を分けて送ったときは「郵送を追加」で、郵送した日・送った資料・追跡番号を1回ずつ残せます。
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {shipments.map((s, i) => (
            <div
              // 行を消したあとに前の行の入力が残らないよう、位置と内容で作り直す
              key={`${i}-${s.sent_on ?? ""}-${s.tracking_no}-${s.items}`}
              className="flex flex-wrap items-end gap-2 rounded-lg bg-background/60 p-2"
            >
              <span className="min-w-[2.5rem] pb-1.5 text-[11px] font-bold tabular-nums text-muted">
                {i + 2}回目
              </span>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted">郵送した日</span>
                {canEdit ? (
                  <input
                    type="date"
                    value={s.sent_on ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      void save(updateShipmentAt(shipments, i, { sent_on: e.target.value || null }))
                    }
                    className={`${CELL} w-36`}
                  />
                ) : (
                  <span className="text-xs tabular-nums">{s.sent_on ?? "—"}</span>
                )}
              </label>
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
                <span className="text-[11px] text-muted">送った資料</span>
                {canEdit ? (
                  <input
                    defaultValue={s.items}
                    disabled={busy}
                    onBlur={(e) => {
                      if (e.target.value !== s.items)
                        void save(updateShipmentAt(shipments, i, { items: e.target.value }));
                    }}
                    placeholder="例: 令和6年分賃金台帳"
                    className={`${CELL} w-full`}
                  />
                ) : (
                  <span className="text-xs">{s.items || "—"}</span>
                )}
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted">レターパックの追跡番号</span>
                {canEdit ? (
                  <input
                    defaultValue={s.tracking_no}
                    disabled={busy}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== s.tracking_no)
                        void save(updateShipmentAt(shipments, i, { tracking_no: e.target.value.trim() }));
                    }}
                    placeholder="例: 1234 5678 9012"
                    className={`${CELL} w-44 tabular-nums`}
                  />
                ) : (
                  <span className="text-xs tabular-nums">{s.tracking_no || "—"}</span>
                )}
              </label>
              {s.tracking_no && (
                <a
                  href={letterPackTrackingUrl(s.tracking_no)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-brand"
                >
                  <ExternalLink size={12} />
                  配達状況
                </a>
              )}
              {canEdit && (
                <button
                  type="button"
                  disabled={busy}
                  aria-label="この郵送の記録を削除"
                  onClick={() => {
                    if (window.confirm(`${i + 2}回目の郵送の記録を削除します。よろしいですか？`))
                      void save(removeShipmentAt(shipments, i));
                  }}
                  className="pb-1.5 text-seal disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
