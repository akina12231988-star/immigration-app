"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { COUNTED_VISAS, KEEPABLE_VISAS, VISA_TYPES, type VisaType } from "@/types/ssw";
import type { WorkHistoryRow } from "@/types/db";

export interface HistoryFormValues {
  visa: VisaType;
  start_date: string;
  end_date: string | null;
  org_name: string;
  role: string;
  note: string;
  kept_residence_status: boolean;
}

function toValues(row: WorkHistoryRow | null): HistoryFormValues {
  return {
    visa: row?.visa ?? "特定技能1号",
    start_date: row?.start_date ?? "",
    end_date: row?.end_date ?? null,
    org_name: row?.org_name ?? "",
    role: row?.role ?? "",
    note: row?.note ?? "",
    kept_residence_status: row?.kept_residence_status ?? false,
  };
}

const INPUT_CLASS =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

// 職歴の追加・編集ダイアログ（旧HTML版の職歴フォームを踏襲）
export function HistoryFormDialog({
  open,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial: WorkHistoryRow | null;
  onClose: () => void;
  onSubmit: (values: HistoryFormValues) => Promise<void>;
}) {
  // 開くたびにフォームを作り直して編集対象へ同期する（key でリマウント）
  if (!open) return null;
  return (
    <HistoryFormDialogInner
      key={initial?.id ?? "new"}
      initial={initial}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function HistoryFormDialogInner({
  initial,
  onClose,
  onSubmit,
}: {
  initial: WorkHistoryRow | null;
  onClose: () => void;
  onSubmit: (values: HistoryFormValues) => Promise<void>;
}) {
  const [form, setForm] = useState<HistoryFormValues>(() => toValues(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof HistoryFormValues>(key: K, value: HistoryFormValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.end_date && form.end_date < form.start_date) {
      setError("終了日は開始日以降にしてください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 帰国期間以外の区分では在留資格保持フラグを持たせない
      await onSubmit({
        ...form,
        kept_residence_status: KEEPABLE_VISAS.has(form.visa) && form.kept_residence_status,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={initial ? "職歴を編集" : "職歴を追加"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        {error && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">在留資格区分</span>
          <select
            value={form.visa}
            onChange={(e) => set("visa", e.target.value as VisaType)}
            className={INPUT_CLASS}
          >
            {VISA_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
                {COUNTED_VISAS.has(v) ? "（通算対象）" : ""}
              </option>
            ))}
          </select>
        </label>

        {KEEPABLE_VISAS.has(form.visa) && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">帰国中の在留資格</span>
            <select
              value={form.kept_residence_status ? "kept" : "cut"}
              onChange={(e) => set("kept_residence_status", e.target.value === "kept")}
              className={INPUT_CLASS}
            >
              <option value="cut">在留資格を切って帰国（通算にカウントしない）</option>
              <option value="kept">特定技能1号を保持したまま帰国（通算にカウント）</option>
            </select>
            <span className="px-1 text-[11px] leading-relaxed text-muted">
              特定技能1号の在留資格を保持したまま一時帰国していた場合、その期間も通算5年のカウントが続きます。在留資格を切って帰国した場合はカウントされません。
            </span>
          </label>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">開始日（必須）</span>
            <input
              type="date"
              required
              value={form.start_date}
              onChange={(e) => set("start_date", e.target.value)}
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">終了日（空欄=継続中）</span>
            <input
              type="date"
              value={form.end_date ?? ""}
              onChange={(e) => set("end_date", e.target.value || null)}
              className={INPUT_CLASS}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">勤務先・受入機関</span>
          <input
            value={form.org_name}
            onChange={(e) => set("org_name", e.target.value)}
            placeholder="株式会社◯◯食品"
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">職種・仕事内容</span>
          <input
            value={form.role}
            onChange={(e) => set("role", e.target.value)}
            placeholder="惣菜製造"
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">備考（指定書No.・月収など）</span>
          <input
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        <Button type="submit" fullWidth disabled={busy} className="mt-1">
          {busy ? "保存中…" : initial ? "更新する" : "追加する"}
        </Button>
      </form>
    </Modal>
  );
}
