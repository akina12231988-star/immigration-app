"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { EmploymentInput } from "@/types/recruiting";
import type { ApplicationWithRefs } from "@/lib/supabase/queries/jobs";

const INPUT_CLASS =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

// 採用記録の登録。保存するとDBトリガーで workers.current_organization_id が自動更新される
export function EmploymentDialog({
  workerId,
  application,
  onClose,
  onSubmit,
}: {
  workerId: string;
  application: ApplicationWithRefs;
  onClose: () => void;
  onSubmit: (input: EmploymentInput) => Promise<void>;
}) {
  const [form, setForm] = useState<EmploymentInput>({
    worker_id: workerId,
    organization_id: application.organization_id,
    job_application_id: application.id,
    hired_on: application.result_on ?? new Date().toISOString().slice(0, 10),
    job_role: application.job_postings?.job_type ?? "",
    industry: "",
    left_on: null,
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof EmploymentInput>(key: K, value: EmploymentInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setBusy(false);
    }
  };

  const orgName = application.organizations?.name ?? "所属機関";

  return (
    <Modal open title="採用記録を登録" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        {error && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}

        <p className="rounded-lg bg-background px-3 py-2 text-sm">
          採用先: <span className="font-bold">{orgName}</span>
        </p>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">採用日</span>
          <input
            type="date"
            required
            value={form.hired_on}
            onChange={(e) => set("hired_on", e.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">職種</span>
            <input
              value={form.job_role}
              onChange={(e) => set("job_role", e.target.value)}
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">業種</span>
            <input
              value={form.industry}
              onChange={(e) => set("industry", e.target.value)}
              className={INPUT_CLASS}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">備考</span>
          <input
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        <p className="rounded-lg bg-brand/10 px-3 py-2 text-xs text-brand">
          登録すると {orgName} が現在の所属機関に設定され、状態が「支援中」になります。
        </p>

        <Button type="submit" fullWidth disabled={busy} className="mt-1">
          {busy ? "登録中…" : "採用を登録する"}
        </Button>
      </form>
    </Modal>
  );
}
