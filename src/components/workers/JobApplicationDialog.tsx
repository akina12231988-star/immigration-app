"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  APPLICATION_RESULTS,
  type ApplicationResult,
} from "@/types/recruiting";
import type { ApplicationWithRefs } from "@/lib/supabase/queries/jobs";
import type { PostingWithStats } from "@/lib/supabase/queries/postings";
import { postingDisplayName } from "@/lib/posting-output";

export interface JobApplicationValues {
  job_posting_id: string | null;
  organization_id: string;
  applied_on: string;
  interview_on: string | null;
  result_on: string | null;
  result: ApplicationResult;
  note: string;
}

const INPUT_CLASS =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

function toValues(a: ApplicationWithRefs | null): JobApplicationValues {
  return {
    job_posting_id: a?.job_posting_id ?? "",
    organization_id: a?.organization_id ?? "",
    applied_on: a?.applied_on ?? new Date().toISOString().slice(0, 10),
    interview_on: a?.interview_on ?? null,
    result_on: a?.result_on ?? null,
    result: (a?.result as ApplicationResult) ?? "選考中",
    note: a?.note ?? "",
  };
}

// 応募の追加・編集。求人を選ぶと所属機関が自動で決まる。
// workers を渡すと外国人の選択欄が出る（求職一覧からの新規登録用。
// 外国人詳細から開くときは本人が決まっているため渡さない）
export function JobApplicationDialog({
  initial,
  postings,
  workers,
  onClose,
  onSubmit,
}: {
  initial: ApplicationWithRefs | null;
  postings: PostingWithStats[];
  workers?: { id: string; name: string }[];
  onClose: () => void;
  onSubmit: (values: JobApplicationValues, workerId?: string) => Promise<void>;
}) {
  const [form, setForm] = useState<JobApplicationValues>(() => toValues(initial));
  const [workerId, setWorkerId] = useState(initial?.worker_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof JobApplicationValues>(key: K, value: JobApplicationValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const selectPosting = (postingId: string) => {
    const posting = postings.find((p) => p.id === postingId);
    setForm((f) => ({
      ...f,
      job_posting_id: postingId || null,
      organization_id: posting?.organization_id ?? f.organization_id,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (workers && !workerId) {
      setError("外国人を選択してください");
      return;
    }
    if (!form.organization_id) {
      setError("求人を選択してください（応募先の機関が必要です）");
      return;
    }
    // 結果が選考中以外なら結果日を必須にする（DB制約と一致）
    if (form.result !== "選考中" && !form.result_on) {
      setError("結果が確定した場合は結果日を入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(form, workerId || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setBusy(false);
    }
  };

  return (
    <Modal open title={initial ? "応募を編集" : "応募を登録"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        {error && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}

        {workers && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">外国人</span>
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              disabled={Boolean(initial)}
              className={`${INPUT_CLASS} disabled:opacity-60`}
            >
              <option value="">選択してください</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">応募先の求人</span>
          <select
            value={form.job_posting_id ?? ""}
            onChange={(e) => selectPosting(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">求人を選択</option>
            {postings.map((p) => (
              <option key={p.id} value={p.id}>
                {postingDisplayName(p, p.organizations?.name)}
                {p.job_type ? `（${p.job_type}）` : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">応募日</span>
            <input
              type="date"
              required
              value={form.applied_on}
              onChange={(e) => set("applied_on", e.target.value)}
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">面接日</span>
            <input
              type="date"
              value={form.interview_on ?? ""}
              onChange={(e) => set("interview_on", e.target.value || null)}
              className={INPUT_CLASS}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">結果</span>
            <select
              value={form.result}
              onChange={(e) => set("result", e.target.value as ApplicationResult)}
              className={INPUT_CLASS}
            >
              {APPLICATION_RESULTS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">結果日</span>
            <input
              type="date"
              value={form.result_on ?? ""}
              onChange={(e) => set("result_on", e.target.value || null)}
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

        {form.result === "採用" && (
          <p className="rounded-lg bg-brand/10 px-3 py-2 text-xs text-brand">
            保存後、続けて「採用記録」を登録すると現在の所属機関が自動更新されます。
          </p>
        )}

        <Button type="submit" fullWidth disabled={busy} className="mt-1">
          {busy ? "保存中…" : initial ? "更新する" : "登録する"}
        </Button>
      </form>
    </Modal>
  );
}
