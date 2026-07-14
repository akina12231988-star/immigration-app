"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  SUPPORT_SCOPES,
  WORKER_STATUSES,
  type Organization,
  type SupportScope,
  type Worker,
  type WorkerInput,
  type WorkerStatus,
} from "@/types/db";

function toInput(w: Worker | null): WorkerInput {
  return {
    name: w?.name ?? "",
    kana: w?.kana ?? "",
    nationality: w?.nationality ?? "",
    birth: w?.birth ?? null,
    residence_card_no: w?.residence_card_no ?? "",
    field: w?.field ?? "",
    support: w?.support ?? "支援対象",
    status: w?.status ?? "支援中",
    health_note: w?.health_note ?? "",
    family_note: w?.family_note ?? "",
    current_organization_id: w?.current_organization_id ?? null,
    residence_status: w?.residence_status ?? "",
    residence_permit_date: w?.residence_permit_date ?? null,
    residence_expiry_date: w?.residence_expiry_date ?? null,
    photo_path: w?.photo_path ?? null,
    messenger_link: w?.messenger_link ?? "",
    specialty_grade: w?.specialty_grade ?? "",
    other_qualifications: w?.other_qualifications ?? "",
    note: w?.note ?? "",
  };
}

const INPUT_CLASS =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";
const TEXTAREA_CLASS =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none";

// 外国人の基本情報フォーム（新規登録・編集で共用）
export function WorkerForm({
  initial,
  organizations,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Worker | null;
  organizations: Organization[];
  submitLabel: string;
  onSubmit: (input: WorkerInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<WorkerInput>(() => toInput(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof WorkerInput>(key: K, value: WorkerInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // date input は空文字を返すため null へ正規化する
  const setDate = (key: "birth" | "residence_permit_date" | "residence_expiry_date") =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      set(key, e.target.value || null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ ...form, name: form.name.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          保存に失敗しました: {error}
        </p>
      )}

      <Fieldset legend="基本情報">
        <Field label="氏名（必須）">
          <input
            required
            maxLength={100}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="GUEN VAN A"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="フリガナ">
          <input
            value={form.kana}
            onChange={(e) => set("kana", e.target.value)}
            placeholder="グエン バン アー"
            className={INPUT_CLASS}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="国籍">
            <input
              value={form.nationality}
              onChange={(e) => set("nationality", e.target.value)}
              placeholder="ベトナム"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="生年月日">
            <input type="date" value={form.birth ?? ""} onChange={setDate("birth")} className={INPUT_CLASS} />
          </Field>
        </div>
        <Field label="特定産業分野・職種">
          <input
            value={form.field}
            onChange={(e) => set("field", e.target.value)}
            placeholder="飲食料品製造業"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="専門級の合格名">
          <input
            value={form.specialty_grade}
            onChange={(e) => set("specialty_grade", e.target.value)}
            placeholder="例: 介護福祉士 専門級 合格"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="その他の資格・合格名">
          <input
            value={form.other_qualifications}
            onChange={(e) => set("other_qualifications", e.target.value)}
            placeholder="例: 日本語能力試験N3 合格"
            className={INPUT_CLASS}
          />
        </Field>
      </Fieldset>

      <Fieldset legend="支援・状態">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="支援区分">
            <select
              value={form.support}
              onChange={(e) => set("support", e.target.value as SupportScope)}
              className={INPUT_CLASS}
            >
              {SUPPORT_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="状態">
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value as WorkerStatus)}
              className={INPUT_CLASS}
            >
              {WORKER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="現在の所属機関">
          <select
            value={form.current_organization_id ?? ""}
            onChange={(e) => set("current_organization_id", e.target.value || null)}
            className={INPUT_CLASS}
          >
            <option value="">（未所属・未設定）</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Messenger グループ/個人リンク">
          <input
            type="url"
            value={form.messenger_link}
            onChange={(e) => set("messenger_link", e.target.value)}
            placeholder="https://m.me/... または https://www.messenger.com/..."
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="健康状態">
          <textarea
            rows={2}
            value={form.health_note}
            onChange={(e) => set("health_note", e.target.value)}
            placeholder="持病・通院状況など"
            className={TEXTAREA_CLASS}
          />
        </Field>
        <Field label="家族構成">
          <textarea
            rows={2}
            value={form.family_note}
            onChange={(e) => set("family_note", e.target.value)}
            placeholder="配偶者・子どもの有無、同居状況など"
            className={TEXTAREA_CLASS}
          />
        </Field>
      </Fieldset>

      <Fieldset legend="在留情報">
        <Field label="現在の在留資格">
          <input
            value={form.residence_status}
            onChange={(e) => set("residence_status", e.target.value)}
            placeholder="特定技能1号"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="在留カード番号">
          <input
            value={form.residence_card_no}
            onChange={(e) => set("residence_card_no", e.target.value)}
            placeholder="AB12345678CD"
            className={INPUT_CLASS}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="許可日">
            <input
              type="date"
              value={form.residence_permit_date ?? ""}
              onChange={setDate("residence_permit_date")}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="在留期限">
            <input
              type="date"
              value={form.residence_expiry_date ?? ""}
              onChange={setDate("residence_expiry_date")}
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <Field label="備考">
          <textarea
            rows={2}
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            className={TEXTAREA_CLASS}
          />
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
