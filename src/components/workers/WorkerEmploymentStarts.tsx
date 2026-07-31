"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { normalizeOrgEmploymentStarts } from "@/lib/org-employment";
import type { Organization, WorkerInput, WorkerOrgEmploymentStart } from "@/types/db";

// 所属機関別の雇用開始日。転職すると機関ごとに雇用開始日が異なるため、
// 機関ごとに記録・訂正できるようにする。現在の所属機関の分は
// workers.employment_start_on（既存の雇用開始年月日）にも自動で反映する
export function WorkerEmploymentStarts({
  workerId,
  initial,
  currentOrganizationId,
  currentEmploymentStartOn,
  organizations,
  canEdit,
}: {
  workerId: string;
  initial: unknown; // workers.org_employment_starts（jsonb）
  currentOrganizationId: string | null;
  currentEmploymentStartOn: string | null;
  organizations: Organization[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<WorkerOrgEmploymentStart[]>(() => {
    const saved = normalizeOrgEmploymentStarts(initial);
    if (saved.length > 0) return saved;
    // 未登録なら、既存の雇用開始年月日を現在の所属機関の1行目として提示する
    if (currentOrganizationId && currentEmploymentStartOn) {
      return [{ organization_id: currentOrganizationId, start_on: currentEmploymentStartOn }];
    }
    return [];
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setAt = (i: number, key: keyof WorkerOrgEmploymentStart, value: string) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload: Partial<WorkerInput> = { org_employment_starts: rows };
      // 現在の所属機関の分は既存の雇用開始年月日にも反映する（労働者名簿・印刷などで使用）
      const current = rows.find(
        (r) => r.organization_id === currentOrganizationId && r.start_on,
      );
      if (current) payload.employment_start_on = current.start_on;
      await updateWorker(createClient(), workerId, payload);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const INPUT =
    "min-h-[40px] w-full rounded-lg border border-border bg-surface px-2.5 text-sm focus:border-brand focus:outline-none disabled:opacity-60";

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
        <CalendarDays size={16} />
        雇用開始日（所属機関別）
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        転職すると機関ごとに雇用開始日が異なるため、所属機関別に記録・訂正できます。
        現在の所属機関の分は基本情報の「雇用開始年月日」にも自動で反映され、労働者名簿の入社日にも使われます。
      </p>
      {error && <p className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">{error}</p>}

      {rows.length === 0 && (
        <p className="rounded-xl bg-background p-4 text-center text-sm text-muted">
          雇用開始日がまだ登録されていません。
        </p>
      )}

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">
                所属機関{r.organization_id === currentOrganizationId ? "（現在）" : ""}
              </span>
              <select
                value={r.organization_id}
                onChange={(e) => setAt(i, "organization_id", e.target.value)}
                disabled={!canEdit}
                className={INPUT}
              >
                <option value="">選択してください</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-[160px] shrink-0 flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">雇用開始日</span>
              <input
                type="date"
                value={r.start_on}
                onChange={(e) => setAt(i, "start_on", e.target.value)}
                disabled={!canEdit}
                className={INPUT}
              />
            </label>
            {canEdit && (
              <button
                type="button"
                aria-label="この行を削除"
                onClick={() => {
                  setRows((rs) => rs.filter((_, idx) => idx !== i));
                  setSaved(false);
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-seal"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="mt-3 flex flex-col gap-2">
          <Button
            variant="secondary"
            fullWidth
            icon={<Plus size={16} />}
            onClick={() => {
              setRows((rs) => [...rs, { organization_id: "", start_on: "" }]);
              setSaved(false);
            }}
          >
            所属機関の雇用開始日を追加
          </Button>
          {!saved && (
            <Button fullWidth disabled={busy} onClick={save}>
              {busy ? "保存中…" : "雇用開始日を保存"}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
