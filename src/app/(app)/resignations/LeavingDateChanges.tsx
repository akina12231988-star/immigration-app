"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { todayStr } from "@/lib/application-alerts";
import {
  LEAVING_APPROVALS,
  leavingDateLabel,
  unreportedLeavingChanges,
  type LeavingApproval,
  type LeavingDateChange,
} from "@/lib/resignation-plan";

const FIELD =
  "min-h-[40px] rounded-lg border border-border bg-background px-2 text-xs focus:border-brand focus:outline-none";

// 退職日の変更の記録と、会社への報告（報告したか・報告日・了承）。
// 退職日を変えるたびに1行ずつ増える。まだ報告していない変更は赤で目立たせる
export function LeavingDateChanges({
  changes,
  canEdit,
  onSave,
}: {
  changes: LeavingDateChange[];
  canEdit: boolean;
  onSave: (changes: LeavingDateChange[]) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  if (changes.length === 0) return null;
  const unreported = unreportedLeavingChanges(changes);

  const patch = async (id: string, p: Partial<LeavingDateChange>) => {
    setError(null);
    try {
      await onSave(changes.map((c) => (c.id === id ? { ...c, ...p } : c)));
    } catch {
      setError("保存に失敗しました（0173_resignation_plan.sql が未実行かもしれません）");
    }
  };

  return (
    <div className={`mt-2 rounded-xl border p-2.5 ${unreported > 0 ? "border-seal/50" : "border-border"}`}>
      <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
        退職日の変更と会社への報告
        {unreported > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-seal/10 px-2 py-0.5 text-[11px] text-seal">
            <TriangleAlert size={12} />
            会社に報告して！！（{unreported}件）
          </span>
        )}
      </p>
      {error && <p className="mt-1 text-[11px] text-seal">{error}</p>}
      <ul className="mt-1.5 space-y-1.5">
        {[...changes].reverse().map((c) => (
          <li key={c.id} className="rounded-lg bg-background px-2.5 py-2 text-xs">
            <p className="tabular-nums">
              <span className="text-muted">{leavingDateLabel(c.changed_on || null)} 変更</span>{" "}
              <b>
                {leavingDateLabel(c.from)} → {leavingDateLabel(c.to)}
              </b>
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <label className="flex min-h-[40px] items-center gap-1.5 font-bold">
                <input
                  type="checkbox"
                  checked={c.reported}
                  disabled={!canEdit}
                  onChange={(e) =>
                    void patch(c.id, {
                      reported: e.target.checked,
                      // チェックしたときに報告日が空なら今日を入れておく
                      reported_on: e.target.checked ? c.reported_on || todayStr() : c.reported_on,
                    })
                  }
                  className="h-5 w-5 accent-brand"
                />
                会社に報告した
              </label>
              {c.reported && (
                <>
                  <label className="flex items-center gap-1 text-muted">
                    報告日
                    <input
                      type="date"
                      value={c.reported_on}
                      disabled={!canEdit}
                      onChange={(e) => void patch(c.id, { reported_on: e.target.value })}
                      className={FIELD}
                    />
                  </label>
                  <label className="flex items-center gap-1 text-muted">
                    了承
                    <select
                      value={c.approval}
                      disabled={!canEdit}
                      onChange={(e) => void patch(c.id, { approval: e.target.value as LeavingApproval })}
                      className={`${FIELD} ${c.approval === "了承済み" ? "font-bold text-brand" : c.approval === "了承されなかった" ? "font-bold text-seal" : ""}`}
                    >
                      {LEAVING_APPROVALS.map((a) => (
                        <option key={a} value={a}>
                          {a || "未確認"}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
