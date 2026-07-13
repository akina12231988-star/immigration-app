"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import {
  APPLICATION_CONTENT_OPTIONS,
  APPLICATION_METHODS,
  type Application,
  type ApplicationContent,
  type ApplicationMethod,
} from "@/types/application";

const INPUT_CLASS =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

interface WorkerOption {
  id: string;
  name: string;
}

// 申請の基本情報を修正するダイアログ（誤登録の訂正用）
export function ApplicationEditDialog({
  app,
  onClose,
  onSave,
}: {
  app: Application;
  onClose: () => void;
  onSave: (patch: Partial<Application>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: app.name,
    applicationDate: app.applicationDate,
    applicationNumber: app.applicationNumber,
    applicationContent: app.applicationContent,
    assignee: app.assignee,
    method: app.method,
    emailLink: app.emailLink,
    workerId: app.workerId ?? "",
  });
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("workers")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        if (!cancelled && data) setWorkers(data as WorkerOption[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({
        name: form.name.trim(),
        applicationDate: form.applicationDate,
        applicationNumber: form.applicationNumber.trim(),
        applicationContent: form.applicationContent,
        assignee: form.assignee,
        method: form.method,
        emailLink: form.method === "オンライン" ? form.emailLink : "",
        workerId: form.workerId || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setBusy(false);
    }
  };

  return (
    <Modal open title="申請情報を修正" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        {error && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">氏名（必須）</span>
          <input
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">外国人と紐づける</span>
          <select
            value={form.workerId}
            onChange={(e) => set("workerId", e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">（紐づけない・未登録の人）</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">申請日（必須）</span>
            <input
              type="date"
              required
              value={form.applicationDate}
              onChange={(e) => set("applicationDate", e.target.value)}
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">申請番号</span>
            <input
              value={form.applicationNumber}
              onChange={(e) => set("applicationNumber", e.target.value)}
              className={INPUT_CLASS}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">申請内容</span>
          <select
            value={form.applicationContent}
            onChange={(e) =>
              set("applicationContent", e.target.value as ApplicationContent)
            }
            className={INPUT_CLASS}
          >
            {APPLICATION_CONTENT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">申請方法</span>
            <select
              value={form.method}
              onChange={(e) => set("method", e.target.value as ApplicationMethod)}
              className={INPUT_CLASS}
            >
              {APPLICATION_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}申請
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">申請取次士</span>
            <input
              value={form.assignee}
              onChange={(e) => set("assignee", e.target.value)}
              className={INPUT_CLASS}
            />
          </label>
        </div>

        {form.method === "オンライン" && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">申請受付メールのリンク</span>
            <input
              type="url"
              value={form.emailLink}
              onChange={(e) => set("emailLink", e.target.value)}
              placeholder="https://..."
              className={INPUT_CLASS}
            />
          </label>
        )}

        <Button type="submit" fullWidth disabled={busy} className="mt-1">
          {busy ? "保存中…" : "修正を保存する"}
        </Button>
      </form>
    </Modal>
  );
}
