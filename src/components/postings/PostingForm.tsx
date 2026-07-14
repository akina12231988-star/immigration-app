"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  GENDER_REQS,
  POSTING_STATUSES,
  WAGE_KINDS,
  type GenderReq,
  type JobPosting,
  type JobPostingInput,
  type PostingStatus,
  type WageKind,
} from "@/types/recruiting";
import type { Organization } from "@/types/db";

function toInput(p: JobPosting | null, orgId: string): JobPostingInput {
  return {
    organization_id: p?.organization_id ?? orgId,
    received_on: p?.received_on ?? new Date().toISOString().slice(0, 10),
    valid_until: p?.valid_until ?? null,
    closed_on: p?.closed_on ?? null,
    openings: p?.openings ?? 1,
    job_type: p?.job_type ?? "",
    work_location: p?.work_location ?? "",
    employment_period: p?.employment_period ?? "",
    wage_kind: p?.wage_kind ?? "時給",
    wage_amount: p?.wage_amount ?? null,
    rent: p?.rent ?? "",
    utilities: p?.utilities ?? "",
    contact: p?.contact ?? "",
    display_company: p?.display_company ?? "",
    display_address: p?.display_address ?? "",
    target_nationality: p?.target_nationality ?? "",
    gender: p?.gender ?? "不問",
    hire_timing: p?.hire_timing ?? "",
    status: p?.status ?? "募集中",
    note: p?.note ?? "",
  };
}

const INPUT_CLASS =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

export function PostingForm({
  initial,
  organizations,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: JobPosting | null;
  organizations: Organization[];
  submitLabel: string;
  onSubmit: (input: JobPostingInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<JobPostingInput>(() =>
    toInput(initial, organizations[0]?.id ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof JobPostingInput>(key: K, value: JobPostingInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.organization_id) {
      setError("所属機関を選択してください（先に会社・機関マスタで登録が必要です）");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      <Fieldset legend="求人管理簿（記録用）">
        <Field label="所属機関（必須）">
          <select
            required
            value={form.organization_id}
            onChange={(e) => set("organization_id", e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">選択してください</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="求人受付日">
            <input
              type="date"
              value={form.received_on}
              onChange={(e) => set("received_on", e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="有効期限">
            <input
              type="date"
              value={form.valid_until ?? ""}
              onChange={(e) => set("valid_until", e.target.value || null)}
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <Field label="職種">
          <input
            value={form.job_type}
            onChange={(e) => set("job_type", e.target.value)}
            placeholder="惣菜製造"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="就業場所">
          <input
            value={form.work_location}
            onChange={(e) => set("work_location", e.target.value)}
            placeholder="福岡県久留米市◯◯工場"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="雇用期間">
          <input
            value={form.employment_period}
            onChange={(e) => set("employment_period", e.target.value)}
            placeholder="期間の定めなし／1年ごと更新 など"
            className={INPUT_CLASS}
          />
        </Field>
        <div className="grid grid-cols-3 gap-2.5">
          <Field label="給与区分">
            <select
              value={form.wage_kind}
              onChange={(e) => set("wage_kind", e.target.value as WageKind)}
              className={INPUT_CLASS}
            >
              {WAGE_KINDS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </Field>
          <Field label="金額（円）">
            <input
              type="number"
              inputMode="numeric"
              value={form.wage_amount ?? ""}
              onChange={(e) =>
                set("wage_amount", e.target.value === "" ? null : Number(e.target.value))
              }
              placeholder="1100"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="連絡先">
            <input
              value={form.contact}
              onChange={(e) => set("contact", e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
        </div>
      </Fieldset>

      <Fieldset legend="Facebook掲載用">
        <Field label="掲載用の会社名">
          <input
            value={form.display_company}
            onChange={(e) => set("display_company", e.target.value)}
            placeholder="食品製造工場（福岡県）"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="掲載用の簡易住所">
          <input
            value={form.display_address}
            onChange={(e) => set("display_address", e.target.value)}
            placeholder="福岡県久留米市"
            className={INPUT_CLASS}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="募集人数">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={form.openings}
              onChange={(e) => set("openings", Math.max(1, Number(e.target.value) || 1))}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="性別">
            <select
              value={form.gender}
              onChange={(e) => set("gender", e.target.value as GenderReq)}
              className={INPUT_CLASS}
            >
              {GENDER_REQS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="対象国籍">
            <input
              value={form.target_nationality}
              onChange={(e) => set("target_nationality", e.target.value)}
              placeholder="ベトナム・不問 など"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="採用予定時期">
            <input
              value={form.hire_timing}
              onChange={(e) => set("hire_timing", e.target.value)}
              placeholder="2026年9月頃"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="家賃（掲載用・Tiền nhà）">
            <input
              value={form.rent}
              onChange={(e) => set("rent", e.target.value)}
              placeholder="約1万円 / 15000円 など"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="光熱費（掲載用・Điện nước ga）">
            <input
              value={form.utilities}
              onChange={(e) => set("utilities", e.target.value)}
              placeholder="自己負担 など"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <Field label="備考（シフト・寮の有無など）">
          <textarea
            rows={2}
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
          />
        </Field>
        <Field label="状態">
          <select
            value={form.status}
            onChange={(e) => set("status", e.target.value as PostingStatus)}
            className={INPUT_CLASS}
          >
            {POSTING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </Fieldset>

      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" fullWidth onClick={onCancel} disabled={busy}>
            キャンセル
          </Button>
        )}
        <Button type="submit" fullWidth disabled={busy}>
          {busy ? "保存中…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-border p-3.5">
      <legend className="px-1 text-xs font-bold text-muted">{legend}</legend>
      <div className="flex flex-col gap-2.5">{children}</div>
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold text-muted">{label}</span>
      {children}
    </label>
  );
}
