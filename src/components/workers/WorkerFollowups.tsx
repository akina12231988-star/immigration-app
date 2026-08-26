"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Home, ShieldPlus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { dbErrorMessage } from "@/lib/errors";
import {
  followupLabels,
  followupsOf,
  MOVING_STATUSES,
  patchFollowups,
  type KokuhoFollowup,
  type MovingFollowup,
  type WorkerFollowups as Followups,
} from "@/lib/worker-followups";

const INPUT =
  "min-h-[36px] w-full rounded-lg border border-border bg-background px-2.5 text-sm focus:border-brand focus:outline-none disabled:opacity-60";

// 忘れ防止の宿題。転居手続きと、国保・国民年金の加入（前職が社保のとき）。
// ここに「必要」を付けた人は、メニューの「外国人」の横に件数が出る。
export function WorkerFollowups({
  workerId,
  followups: initial,
  canEdit = false,
}: {
  workerId: string;
  followups: unknown;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<Followups>(() => followupsOf({ followups: initial }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 画面に出ている片方だけを差し替えて保存する（もう片方は消さない）
  const save = async (patch: {
    moving?: Partial<MovingFollowup>;
    kokuho?: Partial<KokuhoFollowup>;
  }) => {
    const next = patchFollowups(value, patch);
    setValue(next);
    setBusy(true);
    setError(null);
    try {
      await updateWorker(createClient(), workerId, { followups: next });
      router.refresh();
    } catch (err) {
      setError(dbErrorMessage(err, "0119_worker_followups.sql", "保存に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  // 文字入力は打つたびに保存すると重いので、画面だけ先に変えて離れたときに保存する
  const edit = (patch: { moving?: Partial<MovingFollowup>; kokuho?: Partial<KokuhoFollowup> }) =>
    setValue(patchFollowups(value, patch));

  const labels = followupLabels({ followups: value });
  const disabled = !canEdit || busy;

  return (
    <section id="followups">
      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted">
          <BellRing size={14} />
          あとでやる手続き（忘れ防止）
        </h2>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          あとでやる手続きに「必要」を付けると、メニューの「外国人」の横に件数が出ます。
          外国人一覧の「あとでやる手続き」からは、誰の何が残っているかをまとめて見られます。
          終わったら下のとおり印を付けてください。件数から外れます。
        </p>

        {labels.length > 0 && (
          <p className="mb-3 rounded-lg border border-seal/40 bg-seal/10 px-3 py-2 text-xs font-bold leading-relaxed text-seal">
            残っている手続き: {labels.join(" ／ ")}
          </p>
        )}
        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* 転居手続き */}
          <div className="rounded-xl border border-border p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
              <Home size={13} className="shrink-0 text-muted" />
              転居手続きの依頼
            </p>
            <label className="flex items-start gap-2 text-xs font-bold">
              <input
                type="checkbox"
                checked={value.moving.needed}
                disabled={disabled}
                onChange={(e) => save({ moving: { needed: e.target.checked } })}
                className="mt-0.5 size-4 shrink-0"
              />
              転居の必要があり、転居手続きをする
            </label>
            {value.moving.needed && (
              <div className="mt-2.5 space-y-2.5">
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">転居（予定）年月日</span>
                  <input
                    type="date"
                    value={value.moving.planned_on ?? ""}
                    disabled={disabled}
                    onChange={(e) => save({ moving: { planned_on: e.target.value || null } })}
                    className={INPUT}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">依頼の状況</span>
                  <select
                    value={value.moving.status}
                    disabled={disabled}
                    onChange={(e) =>
                      save({ moving: { status: e.target.value as MovingFollowup["status"] } })
                    }
                    className={INPUT}
                  >
                    {MOVING_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">メモ（転居先など）</span>
                  <input
                    value={value.moving.note}
                    disabled={disabled}
                    onChange={(e) => edit({ moving: { note: e.target.value } })}
                    onBlur={() => save({})}
                    className={INPUT}
                  />
                </label>
              </div>
            )}
          </div>

          {/* 国保・国民年金の加入 */}
          <div className="rounded-xl border border-border p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
              <ShieldPlus size={13} className="shrink-0 text-muted" />
              国民健康保険・国民年金の加入
            </p>
            <label className="flex items-start gap-2 text-xs font-bold">
              <input
                type="checkbox"
                checked={value.kokuho.needed}
                disabled={disabled}
                onChange={(e) => save({ kokuho: { needed: e.target.checked } })}
                className="mt-0.5 size-4 shrink-0"
              />
              あとで国保・国民年金の加入が必要
            </label>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              前職が社会保険だと、退職に関わる書類（資格喪失証明書・離職票など）が発行されるまで
              加入手続きができません。書類待ちのあいだも忘れないよう、ここに付けておきます。
            </p>
            {value.kokuho.needed && (
              <div className="mt-2.5 space-y-2.5">
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">
                    退職に関わる書類が発行された年月日（まだなら空のまま）
                  </span>
                  <input
                    type="date"
                    value={value.kokuho.docs_ready_on ?? ""}
                    disabled={disabled}
                    onChange={(e) => save({ kokuho: { docs_ready_on: e.target.value || null } })}
                    className={INPUT}
                  />
                </label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={value.kokuho.kokuho_done}
                      disabled={disabled}
                      onChange={(e) => save({ kokuho: { kokuho_done: e.target.checked } })}
                      className="size-4 shrink-0"
                    />
                    国民健康保険に加入した
                  </label>
                  <label className="flex items-center gap-2 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={value.kokuho.nenkin_done}
                      disabled={disabled}
                      onChange={(e) => save({ kokuho: { nenkin_done: e.target.checked } })}
                      className="size-4 shrink-0"
                    />
                    国民年金に加入した
                  </label>
                </div>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">メモ（前職の会社名など）</span>
                  <input
                    value={value.kokuho.note}
                    disabled={disabled}
                    onChange={(e) => edit({ kokuho: { note: e.target.value } })}
                    onBlur={() => save({})}
                    className={INPUT}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}
