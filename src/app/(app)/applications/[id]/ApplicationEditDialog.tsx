"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { buildWorkerOptions } from "@/lib/worker-label";
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
  current_organization_id: string | null;
  residence_expiry_date: string | null;
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
    organizationId: app.organizationId ?? "",
    residenceExpiryAtApply: app.residenceExpiryAtApply ?? "",
    isSelfApply: app.isSelfApply,
  });
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void supabase
      .from("workers")
      .select("id, name, current_organization_id, residence_expiry_date")
      .order("name")
      .then(({ data }) => {
        if (!cancelled && data) setWorkers(data as WorkerOption[]);
      });
    void supabase
      .from("organizations")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        if (!cancelled && data) setOrganizations(data as { id: string; name: string }[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // 外国人を紐づけたら、その人の在留期限を「申請時点の在留期限」に自動反映する。
  // 紐づけを外した（新規の人）ときは手入力のまま。
  const onSelectWorker = (workerId: string) => {
    const w = workers.find((x) => x.id === workerId);
    setForm((f) => ({
      ...f,
      workerId,
      organizationId: w?.current_organization_id ?? f.organizationId,
      residenceExpiryAtApply: w?.residence_expiry_date ?? f.residenceExpiryAtApply,
    }));
  };

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
        assignee: form.isSelfApply ? "本人申請" : form.assignee,
        isSelfApply: form.isSelfApply,
        method: form.method,
        emailLink: form.method === "オンライン" ? form.emailLink : "",
        workerId: form.workerId || null,
        organizationId: form.organizationId || null,
        residenceExpiryAtApply: form.residenceExpiryAtApply || undefined,
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
            onChange={(e) => onSelectWorker(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">（紐づけない・未登録の人）</option>
            {buildWorkerOptions(workers, organizations).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">所属機関</span>
          <select
            value={form.organizationId}
            onChange={(e) => set("organizationId", e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">（未設定）</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">申請時点の在留期限</span>
          <input
            type="date"
            value={form.residenceExpiryAtApply}
            onChange={(e) => set("residenceExpiryAtApply", e.target.value)}
            className={INPUT_CLASS}
          />
          <span className="text-[11px] text-muted">
            {form.workerId
              ? "紐づけた外国人の在留期限を反映しています（必要なら修正できます）。"
              : "新規の外国人は、現在の在留期限を入力してください。"}
          </span>
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
