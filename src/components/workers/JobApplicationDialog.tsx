"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { createClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import {
  APPLICATION_RESULTS,
  type ApplicationResult,
} from "@/types/recruiting";
import type { ApplicationWithRefs } from "@/lib/supabase/queries/jobs";
import type { PostingWithStats } from "@/lib/supabase/queries/postings";
import type { Organization } from "@/types/db";
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

export interface NameOption {
  id: string;
  name: string;
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
// workers / organizations を渡すと名前入力のコンボボックスが出て、
// 候補に無ければその場で新規登録できる（求職一覧からの新規登録用。
// 外国人詳細から開くときは本人が決まっているため workers は渡さない）
export function JobApplicationDialog({
  initial,
  postings,
  workers,
  organizations,
  onClose,
  onSubmit,
  onWorkerCreated,
  onOrganizationCreated,
}: {
  initial: ApplicationWithRefs | null;
  postings: PostingWithStats[];
  workers?: NameOption[];
  organizations?: NameOption[];
  onClose: () => void;
  onSubmit: (values: JobApplicationValues, workerId?: string) => Promise<void>;
  onWorkerCreated?: (worker: NameOption) => void;
  onOrganizationCreated?: (organization: Organization) => void;
}) {
  const [form, setForm] = useState<JobApplicationValues>(() => toValues(initial));
  const [workerId, setWorkerId] = useState(initial?.worker_id ?? "");
  // その場で新規登録した外国人・企業も候補に出すための追加分
  const [extraWorkers, setExtraWorkers] = useState<NameOption[]>([]);
  const [extraOrgs, setExtraOrgs] = useState<NameOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workerOptions = useMemo(
    () => [...(workers ?? []), ...extraWorkers],
    [workers, extraWorkers],
  );
  const orgOptions = useMemo(
    () => [...(organizations ?? []), ...extraOrgs],
    [organizations, extraOrgs],
  );

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

  // 企業を選び直したら、別の企業の求人が残らないようにする
  const selectOrganization = (orgId: string) => {
    setForm((f) => {
      const posting = postings.find((p) => p.id === f.job_posting_id);
      const keepPosting = posting && posting.organization_id === orgId;
      return {
        ...f,
        organization_id: orgId,
        job_posting_id: keepPosting ? f.job_posting_id : null,
      };
    });
  };

  // 名前だけで外国人を新規登録する（詳細は外国人詳細であとから入力する）
  const createWorker = async (name: string) => {
    setCreating(true);
    setError(null);
    try {
      const { data, error: err } = await createClient()
        .from("workers")
        .insert({ name })
        .select("id, name")
        .single();
      if (err) throw err;
      const w = data as NameOption;
      setExtraWorkers((prev) => [...prev, w]);
      setWorkerId(w.id);
      onWorkerCreated?.(w);
    } catch (err) {
      setError(dbErrorMessage(err, "0003_core.sql", "外国人の新規登録に失敗しました"));
    } finally {
      setCreating(false);
    }
  };

  // 名前だけで企業（所属機関）を新規登録する
  const createOrganization = async (name: string) => {
    setCreating(true);
    setError(null);
    try {
      const { data, error: err } = await createClient()
        .from("organizations")
        .insert({ name })
        .select("*")
        .single();
      if (err) throw err;
      const o = data as Organization;
      setExtraOrgs((prev) => [...prev, { id: o.id, name: o.name }]);
      selectOrganization(o.id);
      onOrganizationCreated?.(o);
    } catch (err) {
      setError(dbErrorMessage(err, "0003_core.sql", "企業の新規登録に失敗しました"));
    } finally {
      setCreating(false);
    }
  };

  // 選んだ企業の求人だけを候補にする（企業未選択なら全求人）
  const postingOptions = useMemo(
    () =>
      form.organization_id
        ? postings.filter((p) => p.organization_id === form.organization_id)
        : postings,
    [postings, form.organization_id],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (workers && !workerId) {
      setError("外国人を選択してください（名前を入力すると候補、無ければ新規登録が出ます）");
      return;
    }
    if (!form.organization_id) {
      setError(
        organizations
          ? "応募先の企業を選択してください（企業名を入力すると候補、無ければ新規登録が出ます）"
          : "求人を選択してください（応募先の機関が必要です）",
      );
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

        {workers &&
          (initial ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">外国人</span>
              <p className="text-sm font-bold">{initial.workers?.name ?? "（不明）"}</p>
            </div>
          ) : (
            // 名前を入力すると下に候補が出る。候補に無ければ「新規登録」で名前だけ登録する。
            // label の中に入れると候補のクリックが input に取られるため div で包む
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">外国人（必須）</span>
              <Combobox
                options={workerOptions.map((w) => ({ id: w.id, label: w.name }))}
                value={workerId}
                onChange={setWorkerId}
                onCreate={(name) => void createWorker(name)}
                placeholder="名前を入力して検索（無ければ新規登録）"
              />
              <span className="text-[11px] text-muted">
                新規登録した外国人の詳細（国籍・生年月日など）は外国人詳細であとから入力できます
              </span>
            </div>
          ))}

        {organizations && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">応募先の企業（必須）</span>
            <Combobox
              options={orgOptions.map((o) => ({ id: o.id, label: o.name }))}
              value={form.organization_id}
              onChange={selectOrganization}
              onCreate={(name) => void createOrganization(name)}
              placeholder="企業名を入力して検索（無ければ新規登録）"
            />
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">
            応募先の求人{organizations ? "（任意・選ぶと企業も自動で入ります）" : ""}
          </span>
          <select
            value={form.job_posting_id ?? ""}
            onChange={(e) => selectPosting(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">求人を選択</option>
            {postingOptions.map((p) => (
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

        <Button type="submit" fullWidth disabled={busy || creating} className="mt-1">
          {busy ? "保存中…" : creating ? "新規登録中…" : initial ? "更新する" : "登録する"}
        </Button>
      </form>
    </Modal>
  );
}
