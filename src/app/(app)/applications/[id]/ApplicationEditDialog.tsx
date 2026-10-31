"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { UnsavedChangesGuard } from "@/components/UnsavedChangesGuard";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import { ONLINE_APP_TYPE_EXAMPLE } from "@/lib/online-receipt";
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

// オンライン申請の受付メールの項目（変えたものだけ保存する）
const RECEIPT_KEYS = [
  "onlineAppType",
  "onlineRefNo",
  "onlineReceivedOn",
  "onlineTempNo",
  "onlineCardNo",
  "onlineMail2Link",
  "onlineMail3Link",
] as const;
type ReceiptKey = (typeof RECEIPT_KEYS)[number];

const initialForm = (app: Application) => ({
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
  onlineAppType: app.onlineAppType ?? "",
  onlineRefNo: app.onlineRefNo ?? "",
  onlineReceivedOn: app.onlineReceivedOn ?? "",
  onlineTempNo: app.onlineTempNo ?? "",
  onlineCardNo: app.onlineCardNo ?? "",
  onlineMail2Link: app.onlineMail2Link ?? "",
  onlineMail3Link: app.onlineMail3Link ?? "",
});

// 申請詳細の「編集」（申請の基本情報と、オンライン申請の受付メールの内容をまとめて直す）。
// 保存しないで閉じる・別の画面へ移ろうとしたら「保存しますか？」を出す
export function ApplicationEditDialog({
  app,
  onClose,
  onSave,
}: {
  app: Application;
  onClose: () => void;
  onSave: (patch: Partial<Application>) => Promise<void>;
}) {
  const [initial] = useState(() => initialForm(app));
  const [form, setForm] = useState(initial);
  // 保存していない変更があるか
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => {
    const a = initial[k];
    const b = form[k];
    return typeof a === "string" && typeof b === "string" ? a.trim() !== b.trim() : a !== b;
  });
  // 保存しないで閉じようとしたときの確認
  const [closeAsk, setCloseAsk] = useState(false);
  const requestClose = () => {
    if (dirty) setCloseAsk(true);
    else onClose();
  };
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

  // 保存できたら true
  const save = async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const patch: Partial<Application> = {
      name: form.name.trim(),
      applicationDate: form.applicationDate,
      applicationNumber: form.applicationNumber.trim(),
      applicationContent: form.applicationContent,
      assignee: form.isSelfApply ? "本人申請" : form.assignee,
      isSelfApply: form.isSelfApply,
      method: form.method,
      emailLink: form.method === "オンライン" ? form.emailLink.trim() : "",
      workerId: form.workerId || null,
      organizationId: form.organizationId || null,
      residenceExpiryAtApply: form.residenceExpiryAtApply || undefined,
    };
    // 受付メールの項目は変えたものだけ送る
    for (const k of RECEIPT_KEYS as readonly ReceiptKey[]) {
      const v = form[k].trim();
      if (v === initial[k].trim()) continue;
      if (k === "onlineReceivedOn") patch.onlineReceivedOn = v || undefined;
      else (patch as Record<string, unknown>)[k] = v;
    }
    try {
      await onSave(patch);
      setBusy(false);
      return true;
    } catch (err) {
      setError(dbErrorMessage(err, "0206_online_application_receipt_mail3.sql", errorMessage(err, "保存に失敗しました")));
      setBusy(false);
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await save()) onClose();
  };

  const online = form.method === "オンライン";
  const field = (label: string, key: ReceiptKey, placeholder?: string, type: "text" | "url" | "date" = "text") => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold text-muted">{label}</span>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
    </label>
  );

  return (
    <>
    <Modal open title="申請情報を編集" onClose={requestClose}>
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
            <span className="text-xs font-bold text-muted">{online ? "申請受付番号（3通目のメール）" : "申請番号"}</span>
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

        {/* オンライン申請の受付メール（1通目と、2通目・3通目） */}
        {online && (
          <div className="mt-1 flex flex-col gap-2.5 rounded-xl border border-border bg-background p-3">
            <p className="text-xs font-bold">1通目 申請受付完了のお知らせ</p>
            {field("申請種別", "onlineAppType", `例: ${ONLINE_APP_TYPE_EXAMPLE}`)}
            {field("整理番号", "onlineRefNo", "例: 650468319129")}
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">1通目のメールのリンク</span>
              <input
                type="url"
                value={form.emailLink}
                onChange={(e) => set("emailLink", e.target.value)}
                placeholder="https://..."
                className={INPUT_CLASS}
              />
            </label>
            <p className="mt-1 text-xs font-bold">2通目・3通目 申請受付番号のお知らせ</p>
            <p className="-mt-1.5 text-[11px] text-muted">申請受付番号は上の「申請受付番号」の欄に入れます。</p>
            <div className="grid grid-cols-2 gap-2.5">
              {field("申請受付日", "onlineReceivedOn", undefined, "date")}
              {field("申請人在留カード等番号", "onlineCardNo", "例: LJ41245695EA")}
            </div>
            {field("申請受付仮番号", "onlineTempNo", "例: 95820260000440638-00")}
            {field("3通目のメールのリンク", "onlineMail3Link", "https://...", "url")}
            {initial.onlineMail2Link && field("2通目のメールのリンク", "onlineMail2Link", "https://...", "url")}
          </div>
        )}

        <Button type="submit" fullWidth disabled={busy} className="mt-1">
          {busy ? "保存中…" : "保存する"}
        </Button>
      </form>

      {/* 保存しないで閉じようとしたとき */}
      {closeAsk && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl">
            <p className="flex items-center gap-2 text-base font-bold">
              <AlertTriangle size={20} className="text-status-notice-fg" />
              保存しますか？
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">編集した内容がまだ保存されていません。</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void save().then((ok) => {
                    setCloseAsk(false);
                    if (ok) onClose();
                  })
                }
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-brand-foreground disabled:opacity-60"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                {busy ? "保存中…" : "保存"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setCloseAsk(false)}
                className="min-h-[44px] rounded-xl border border-border text-sm font-bold disabled:opacity-60"
              >
                キャンセル
              </button>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setCloseAsk(false);
                onClose();
              }}
              className="mt-2 w-full min-h-[36px] text-xs font-bold text-seal disabled:opacity-60"
            >
              保存しないで閉じる
            </button>
          </div>
        </div>
      )}
    </Modal>
    {/* 編集中にメニューなどから別の画面へ移ろうとしたとき・タブを閉じるとき */}
    <UnsavedChangesGuard dirty={dirty} onSave={save} saveLabel="保存する" />
    </>
  );
}
