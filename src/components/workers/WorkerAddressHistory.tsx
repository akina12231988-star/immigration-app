"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import {
  deleteWorkerAddress,
  insertWorkerAddress,
  listWorkerAddresses,
} from "@/lib/supabase/queries/worker-addresses";
import { updateWorker } from "@/lib/supabase/queries/workers";
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
  const router = useRouter();
  const [rows, setRows] = useState<WorkerAddress[]>([]);
  const [movedOn, setMovedOn] = useState("");
  const [address, setAddress] = useState("");
  const [kind, setKind] = useState("転入");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<WorkerAddress[]> => {
    const next = await listWorkerAddresses(createClient(), workerId);
    setRows(next);
    return next;
  };

  useEffect(() => {
    listWorkerAddresses(createClient(), workerId).then(setRows).catch(() => undefined);
  }, [workerId]);

  // 住所歴の最新（転入日が最も新しい行）を、外国人の現在の住所（基本情報の住所欄）へ
  // 自動反映する。住所歴が空になった場合は手入力の住所を消さないよう何もしない。
  const syncCurrentAddress = async (next: WorkerAddress[]) => {
    const latest = next[0];
    if (!latest) return;
    await updateWorker(createClient(), workerId, { address: latest.address });
    router.refresh(); // 基本情報の住所表示を更新する
  };

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
      await syncCurrentAddress(await load());
    } catch (err) {
      setError(err instanceof Error ? err.message : "住所歴の登録に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: WorkerAddress) {
    if (!window.confirm(`${row.moved_on}「${row.address}」の住所歴を削除します。よろしいですか？`)) {
      return;
    }
    setError(null);
    try {
      const deleted = await deleteWorkerAddress(createClient(), row.id);
      if (deleted === 0) {
        // 権限（RLS）が足りないと、エラーにならず消えないことがある
        setError(
          "住所歴を削除できませんでした。権限の設定が足りない可能性があります／マイグレーション 0088_worker_address_policies.sql が未適用の可能性があります。Supabase の SQL Editor で適用してください。",
        );
        return;
      }
      // 消えたことが分かるよう、先に一覧から外す
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      try {
        await syncCurrentAddress(await load());
      } catch {
        // 削除自体は済んでいるので、基本情報への反映だけ失敗したことを伝える
        setError("削除しました。基本情報の住所への反映に失敗したので、画面を開き直してください。");
      }
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
        最新の住所は、基本情報の「住所」欄へ現在の住所として自動反映されます。
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
                  onClick={() => void remove(r)}
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
