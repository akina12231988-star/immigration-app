"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import {
  deleteWorkerAddress,
  insertWorkerAddress,
  listWorkerAddresses,
  updateWorkerAddress,
} from "@/lib/supabase/queries/worker-addresses";
import { updateWorker } from "@/lib/supabase/queries/workers";
import type { WorkerAddress } from "@/lib/worker-address";

const INPUT =
  "min-h-[40px] w-full rounded-lg border border-border bg-background px-2.5 text-sm focus:border-brand focus:outline-none";

// 外国人の住所歴（転入日ごとの住所）。課税・納税証明書の「1月1日時点の住所」判定に使う。
// embedded を付けると、在留カード枠の「住居地」の下などにカード無しで埋め込める
export function WorkerAddressHistory({
  workerId,
  canEdit = false,
  embedded = false,
}: {
  workerId: string;
  canEdit?: boolean;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<WorkerAddress[]>([]);
  const [movedOn, setMovedOn] = useState("");
  const [address, setAddress] = useState("");
  const [kind, setKind] = useState("転入");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 基本情報の住所（労働者名簿・履歴書・扶養控除等申告書はこの値を使う）。
  // 住所歴の最新と食い違っていたら、下の注意書きで直せるようにする
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);
  const fetchCurrentAddress = () =>
    createClient()
      .from("workers")
      .select("address")
      .eq("id", workerId)
      .maybeSingle()
      .then(({ data }) => (data as { address?: string } | null)?.address ?? "");

  const load = async (): Promise<WorkerAddress[]> => {
    const next = await listWorkerAddresses(createClient(), workerId);
    setRows(next);
    return next;
  };

  useEffect(() => {
    listWorkerAddresses(createClient(), workerId).then(setRows).catch(() => undefined);
    fetchCurrentAddress().then(setCurrentAddress, () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  // 住所歴の最新（転入日が最も新しい行）を、外国人の現在の住所（基本情報の住所欄）へ
  // 自動反映する。住所歴が空になった場合は手入力の住所を消さないよう何もしない。
  const syncCurrentAddress = async (next: WorkerAddress[]) => {
    const latest = next[0];
    if (!latest) return;
    await updateWorker(createClient(), workerId, { address: latest.address });
    setCurrentAddress(latest.address);
    router.refresh(); // 基本情報の住所表示を更新する
  };

  // 基本情報の住所と住所歴の最新が食い違っているか
  // （基本情報を直接直した・住所歴に誤字が残っている など）
  const latestRow = rows[0];
  const mismatch =
    currentAddress !== null && !!latestRow && latestRow.address !== currentAddress;

  // 住所歴の最新を基本情報へ反映する（労働者名簿などは基本情報の住所を使う）
  const applyHistoryToWorker = async () => {
    if (!latestRow) return;
    setError(null);
    try {
      await updateWorker(createClient(), workerId, { address: latestRow.address });
      setCurrentAddress(latestRow.address);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "反映に失敗しました");
    }
  };

  // 基本情報の住所で、住所歴の最新の行を直す（誤字を基本情報側で直したとき用）
  const applyWorkerToHistory = async () => {
    if (!latestRow || currentAddress === null) return;
    setError(null);
    try {
      const { error: upErr } = await createClient()
        .from("worker_addresses")
        .update({ address: currentAddress })
        .eq("id", latestRow.id);
      if (upErr) throw upErr;
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "住所歴の修正に失敗しました");
    }
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

  // 行の編集（転入日・区分・住所をあとから直せる）。editing は編集中の行の入力値
  const [editing, setEditing] = useState<{
    id: string;
    movedOn: string;
    address: string;
    kind: string;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const startEdit = (row: WorkerAddress) => {
    setError(null);
    setEditing({ id: row.id, movedOn: row.moved_on, address: row.address, kind: row.kind });
  };

  async function saveEdit() {
    if (!editing || !editing.movedOn || !editing.address.trim()) return;
    setEditSaving(true);
    setError(null);
    try {
      const updated = await updateWorkerAddress(createClient(), editing.id, {
        moved_on: editing.movedOn,
        address: editing.address.trim(),
        kind: editing.kind.trim(),
      });
      if (updated === 0) {
        // 権限（RLS）が足りないと、エラーにならず直らないことがある
        setError(
          "住所歴を修正できませんでした。権限の設定が足りない可能性があります／マイグレーション 0088_worker_address_policies.sql が未適用の可能性があります。Supabase の SQL Editor で適用してください。",
        );
        return;
      }
      setEditing(null);
      // 転入日を変えると最新の行が入れ替わることがあるため、読み直してから基本情報へ反映する
      await syncCurrentAddress(await load());
    } catch (err) {
      setError(err instanceof Error ? err.message : "住所歴の修正に失敗しました");
    } finally {
      setEditSaving(false);
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

  const inner = (
    <>
      <h2 className="mb-1 flex items-center gap-1.5 text-xs font-bold text-muted">
        <MapPin size={13} />
        住所歴（転入日ごと）
      </h2>
      <p className="mb-3 text-[11px] text-muted">
        転入日ごとに住所を記録します。課税・納税証明書の「1月1日時点の住所」判定に使われます。
        最新の住所は、上の「住居地」へ現在の住所として自動反映されます。
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* 基本情報の住所と住所歴の最新が違うときの注意（名簿などは基本情報の住所で作られる） */}
      {mismatch && (
        <div className="mb-3 rounded-xl bg-status-notice-bg p-3 text-xs text-status-notice-fg">
          <p className="font-bold">基本情報の住所と、住所歴の最新が違っています。</p>
          <p className="mt-1">
            基本情報：<span className="font-bold">{currentAddress || "（空欄）"}</span>
            <br />
            住所歴の最新：<span className="font-bold">{latestRow.address}</span>
          </p>
          <p className="mt-1">
            労働者名簿・履歴書・扶養控除等申告書は基本情報の住所で作られます。正しい方を選んでそろえてください。
          </p>
          {canEdit && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void applyHistoryToWorker()}
                className="rounded-lg border border-status-notice-fg/40 bg-surface px-3 py-1.5 font-bold"
              >
                住所歴の最新が正しい（基本情報へ反映）
              </button>
              <button
                type="button"
                onClick={() => void applyWorkerToHistory()}
                className="rounded-lg border border-status-notice-fg/40 bg-surface px-3 py-1.5 font-bold"
              >
                基本情報が正しい（住所歴の最新を直す）
              </button>
            </div>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
          まだ住所歴がありません。
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border">
          {rows.map((r) =>
            editing?.id === r.id ? (
              /* 編集中の行: 転入日・区分・住所をその場で直して保存できる */
              <li
                key={r.id}
                className="flex flex-wrap items-end gap-2 border-b border-border bg-background px-3 py-2.5 text-sm last:border-b-0"
              >
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted">転入日</span>
                  <input
                    type="date"
                    value={editing.movedOn}
                    onChange={(e) => setEditing({ ...editing, movedOn: e.target.value })}
                    className={`${INPUT} w-40`}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted">区分</span>
                  <input
                    value={editing.kind}
                    onChange={(e) => setEditing({ ...editing, kind: e.target.value })}
                    placeholder="例: 国内転入 / 転入"
                    className={`${INPUT} w-32`}
                  />
                </label>
                <label className="flex min-w-[160px] flex-1 flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted">住所</span>
                  <input
                    value={editing.address}
                    onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                    className={INPUT}
                  />
                </label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => void saveEdit()}
                    disabled={!editing.movedOn || !editing.address.trim() || editSaving}
                    className="flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-brand-foreground disabled:opacity-50"
                  >
                    <Check size={13} />
                    {editSaving ? "保存中…" : "保存"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    disabled={editSaving}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted"
                  >
                    <X size={13} />
                    キャンセル
                  </button>
                </div>
              </li>
            ) : (
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
                    aria-label="編集"
                    onClick={() => startEdit(r)}
                    className="shrink-0 rounded-lg border border-border px-2 py-1 text-brand"
                  >
                    <Pencil size={13} />
                  </button>
                )}
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
            ),
          )}
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
    </>
  );

  // 埋め込み時はカードにせず、区切り線だけ引いて上の項目（住居地）とつなげる
  if (embedded) {
    return <div className="mt-1 border-t border-border pt-2">{inner}</div>;
  }
  return <Card className="p-4">{inner}</Card>;
}
