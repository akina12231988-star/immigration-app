"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { employmentStartPatch } from "@/lib/worker-support";
import { normalizeOrgEmploymentStarts } from "@/lib/org-employment";
import { organizationSuggestions } from "@/lib/org-search";
import type { Organization, WorkerInput, WorkerOrgEmploymentStart } from "@/types/db";

// 所属機関別の雇用開始日。転職すると機関ごとに雇用開始日が異なるため、
// 機関ごとに記録・訂正できるようにする。現在の所属機関の分は
// workers.employment_start_on（既存の雇用開始年月日）にも自動で反映する
export function WorkerEmploymentStarts({
  workerId,
  initial,
  currentOrganizationId,
  currentEmploymentStartOn,
  workerStatus = "",
  residenceStatus = "",
  organizations,
  canEdit,
}: {
  workerId: string;
  initial: unknown; // workers.org_employment_starts（jsonb）
  currentOrganizationId: string | null;
  currentEmploymentStartOn: string | null;
  workerStatus?: string; // 状態（申請準備中なら、雇用開始日の登録で在籍中へ自動で進める）
  residenceStatus?: string; // 在留資格（支援区分の自動判別に使う）
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
      // 現在の所属機関の雇用開始日がそろったら、申請準備中の人は在籍中＋支援区分へ自動で進める
      const auto = employmentStartPatch(
        workerStatus,
        residenceStatus,
        !!currentOrganizationId,
        !!current,
      );
      if (auto) {
        payload.status = auto.status;
        payload.support = auto.support;
      }
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
              <OrgSearchInput
                value={r.organization_id}
                organizations={organizations}
                onSelect={(id) => setAt(i, "organization_id", id)}
                disabled={!canEdit}
                inputClass={INPUT}
              />
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

// 所属機関を名前の一部で探して選ぶ入力。
// 「BASE」「井上」のように一部を入力すると下に候補が出て、選ぶとその機関になる
// （法人格の有無・全角半角・異体字の揺れは org-search.ts で吸収する）
function OrgSearchInput({
  value,
  organizations,
  onSelect,
  disabled,
  inputClass,
}: {
  value: string; // 選択中の organizations.id（'' = 未選択）
  organizations: Organization[];
  onSelect: (id: string) => void;
  disabled: boolean;
  inputClass: string;
}) {
  // query が null のときは選択中の機関名を表示、入力中はその文字を表示する
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedName = organizations.find((o) => o.id === value)?.name ?? "";
  const text = query ?? selectedName;
  const suggestions = query ? organizationSuggestions(organizations, query, 8) : [];

  // 外側をクリックしたら候補を閉じ、表示を選択中の機関名に戻す
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          setOpen(true);
          // 全部消したら未選択に戻す
          if (v.trim() === "") onSelect("");
        }}
        onFocus={() => setOpen(true)}
        placeholder="名前の一部を入力して検索（例: BASE / 井上）"
        disabled={disabled}
        autoComplete="off"
        className={inputClass}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-border bg-surface shadow-lg">
          {suggestions.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(o.id);
                  setQuery(null);
                  setOpen(false);
                }}
                className="w-full truncate px-3.5 py-2.5 text-left text-sm font-bold"
              >
                {o.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
