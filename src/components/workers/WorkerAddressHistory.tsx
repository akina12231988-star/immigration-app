"use client";

import { useEffect, useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import {
  deleteWorkerAddress,
  insertWorkerAddress,
  listWorkerAddresses,
} from "@/lib/supabase/queries/worker-addresses";
import type { WorkerAddress } from "@/lib/worker-address";

const INPUT =
  "min-h-[40px] w-full rounded-lg border border-border bg-background px-2.5 text-sm focus:border-brand focus:outline-none";

// 外国人の住所歴（転入日ごとの住所）。課税・納税証明書の「1月1日時点の住所」判定に使う。
export function WorkerAddressHistory({
  workerId,
  canEdit = false,
}: {
  workerId: string;
  canEdit?: boolean;
}) {
  const [rows, setRows] = useState<WorkerAddress[]>([]);
  const [movedOn, setMovedOn] = useState("");
  const [address, setAddress] = useState("");
  const [kind, setKind] = useState("転入");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    listWorkerAddresses(createClient(), workerId).then(setRows).catch(() => undefined);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  async function add() {
    if (!movedOn || !address.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await insertWorkerAddress(createClient(), {
        worker_id: workerId,
        moved_on: movedOn,
        address: address.trim(),
        kind: kind.trim(),
        note: "",
      });
      setMovedOn("");
      setAddress("");
      setKind("転入");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "住所歴の登録に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("この住所歴を削除します。よろしいですか？")) return;
    setError(null);
    try {
      await deleteWorkerAddress(createClient(), id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  }

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted">
        <MapPin size={15} />
        住所歴
      </h2>
      <p className="mb-3 text-[11px] text-muted">
        転入日ごとに住所を記録します。課税・納税証明書の「1月1日時点の住所」判定に使われます。
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
          まだ住所歴がありません。
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2.5 border-b border-border bg-background px-3 py-2.5 text-sm last:border-b-0"
            >
              <span className="shrink-0 tabular-nums text-muted">{r.moved_on}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{r.address}</span>
                {r.kind && <span className="block text-[11px] text-muted">{r.kind}</span>}
              </span>
              {canEdit && (
                <button
                  type="button"
                  aria-label="削除"
                  onClick={() => remove(r.id)}
                  className="shrink-0 rounded-lg border border-border px-2 py-1 text-seal"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">転入日</span>
            <input
              type="date"
              value={movedOn}
              onChange={(e) => setMovedOn(e.target.value)}
              className={`${INPUT} w-40`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">区分</span>
            <input
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              placeholder="例: 国内転入 / 転入"
              className={`${INPUT} w-32`}
            />
          </label>
          <label className="flex min-w-[160px] flex-1 flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">住所</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="例: 熊本県熊本市中央区◯◯1-2-3"
              className={INPUT}
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            icon={<Plus size={16} />}
            onClick={add}
            disabled={!movedOn || !address.trim() || busy}
          >
            {busy ? "登録中…" : "追加"}
          </Button>
        </div>
      )}
    </Card>
  );
}
