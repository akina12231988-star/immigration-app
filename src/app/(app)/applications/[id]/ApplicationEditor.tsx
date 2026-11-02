"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { UnsavedChangesGuard } from "@/components/UnsavedChangesGuard";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import { buildWorkerOptions } from "@/lib/worker-label";
import {
  APPLICATION_CONTENT_OPTIONS,
  APPLICATION_METHODS,
  type Application,
  type ApplicationContent,
  type ApplicationMethod,
} from "@/types/application";

// 申請詳細の「編集」。ポップアップではなく画面の上で直す（入力欄が広く、受付メールの欄も見ながら入れられる）。
// いちばん上の「編集」を押すと、申請の基本情報と「オンライン申請の受付」のカードが入力欄になり、
// 画面の下に出る「保存」でまとめて保存する。保存しないでやめる・別の画面へ移ろうとしたら確認を出す

export const EDIT_INPUT =
  "min-h-[44px] w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none";

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
export type ReceiptKey = (typeof RECEIPT_KEYS)[number];

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
export type EditForm = ReturnType<typeof initialForm>;

export interface ApplicationEdit {
  editing: boolean;
  form: EditForm;
  initial: EditForm;
  set: <K extends keyof EditForm>(key: K, value: EditForm[K]) => void;
  onSelectWorker: (workerId: string) => void;
  workers: WorkerOption[];
  organizations: { id: string; name: string }[];
  dirty: boolean;
  busy: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
  save: () => Promise<boolean>;
}

// 編集中の入力と保存。start で今の申請の内容から入力を作り直す
export function useApplicationEdit(app: Application | null, onSave: (patch: Partial<Application>) => Promise<void>): ApplicationEdit {
  const empty = app ? initialForm(app) : (null as unknown as EditForm);
  const [editing, setEditing] = useState(false);
  const [initial, setInitial] = useState<EditForm>(empty);
  const [form, setForm] = useState<EditForm>(empty);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 外国人・所属機関の選択肢は、編集を始めたときに読み込む
  useEffect(() => {
    if (!editing || workers.length > 0) return;
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
  }, [editing, workers.length]);

  const dirty =
    editing &&
    (Object.keys(initial) as (keyof EditForm)[]).some((k) => {
      const a = initial[k];
      const b = form[k];
      return typeof a === "string" && typeof b === "string" ? a.trim() !== b.trim() : a !== b;
    });

  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  // 外国人を紐づけたら、その人の所属機関と在留期限（申請時点の在留期限）を反映する
  const onSelectWorker = (workerId: string) => {
    const w = workers.find((x) => x.id === workerId);
    setForm((f) => ({
      ...f,
      workerId,
      organizationId: w?.current_organization_id ?? f.organizationId,
      residenceExpiryAtApply: w?.residence_expiry_date ?? f.residenceExpiryAtApply,
    }));
  };

  const start = () => {
    if (!app) return;
    const v = initialForm(app);
    setInitial(v);
    setForm(v);
    setError(null);
    setEditing(true);
  };
  const stop = () => {
    setEditing(false);
    setError(null);
  };

  // 保存できたら true（編集も終える）
  const save = async (): Promise<boolean> => {
    if (!form.name.trim() || !form.applicationDate) {
      setError("氏名と申請日は必ず入れてください");
      return false;
    }
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
    for (const k of RECEIPT_KEYS) {
      const v = form[k].trim();
      if (v === initial[k].trim()) continue;
      if (k === "onlineReceivedOn") patch.onlineReceivedOn = v || undefined;
      else (patch as Record<string, unknown>)[k] = v;
    }
    try {
      await onSave(patch);
      setBusy(false);
      setEditing(false);
      return true;
    } catch (err) {
      setError(dbErrorMessage(err, "0206_online_application_receipt_mail3.sql", errorMessage(err, "保存に失敗しました")));
      setBusy(false);
      return false;
    }
  };

  return { editing, form, initial, set, onSelectWorker, workers, organizations, dirty, busy, error, start, stop, save };
}

// 1つの入力欄（ラベル付き）
export function EditField({
  label,
  children,
  hint,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-bold text-muted">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

// 受付メールの項目の入力欄（「オンライン申請の受付」のカードの中で使う）
export function ReceiptInput({
  edit,
  label,
  field,
  placeholder,
  type = "text",
  className,
}: {
  edit: ApplicationEdit;
  label: string;
  field: ReceiptKey | "applicationNumber" | "emailLink";
  placeholder?: string;
  type?: "text" | "url" | "date";
  className?: string;
}) {
  return (
    <EditField label={label} className={className}>
      <input
        type={type}
        value={edit.form[field]}
        onChange={(e) => edit.set(field, e.target.value)}
        placeholder={placeholder}
        className={`${EDIT_INPUT} ${type === "text" ? "tabular-nums" : ""}`}
      />
    </EditField>
  );
}

// 申請の基本情報の入力欄（「申請の基本情報・画像」の中に出す）。
// オンライン申請の申請受付番号は「オンライン申請の受付」のカードで入れる
export function ApplicationBasicFields({ edit }: { edit: ApplicationEdit }) {
  const { form, set } = edit;
  const online = form.method === "オンライン";
  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-brand/30 bg-brand/5 p-3 sm:grid-cols-2">
      <EditField label="氏名（必須）">
        <input value={form.name} onChange={(e) => set("name", e.target.value)} className={EDIT_INPUT} />
      </EditField>
      <EditField label="外国人と紐づける">
        <select value={form.workerId} onChange={(e) => edit.onSelectWorker(e.target.value)} className={EDIT_INPUT}>
          <option value="">（紐づけない・未登録の人）</option>
          {buildWorkerOptions(edit.workers, edit.organizations).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
          {/* 選択肢の読み込み前でも今の紐づけを消さない */}
          {form.workerId && !edit.workers.some((w) => w.id === form.workerId) && (
            <option value={form.workerId}>（読み込み中…）</option>
          )}
        </select>
      </EditField>
      <EditField label="所属機関">
        <select value={form.organizationId} onChange={(e) => set("organizationId", e.target.value)} className={EDIT_INPUT}>
          <option value="">（未設定）</option>
          {edit.organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          {form.organizationId && !edit.organizations.some((o) => o.id === form.organizationId) && (
            <option value={form.organizationId}>（読み込み中…）</option>
          )}
        </select>
      </EditField>
      <EditField
        label="申請時点の在留期限"
        hint={form.workerId ? "紐づけた外国人の在留期限を反映しています（必要なら直せます）。" : "新規の外国人は、現在の在留期限を入れてください。"}
      >
        <input
          type="date"
          value={form.residenceExpiryAtApply}
          onChange={(e) => set("residenceExpiryAtApply", e.target.value)}
          className={EDIT_INPUT}
        />
      </EditField>
      <EditField label="申請日（必須）">
        <input type="date" value={form.applicationDate} onChange={(e) => set("applicationDate", e.target.value)} className={EDIT_INPUT} />
      </EditField>
      {online ? (
        <EditField label="申請受付番号">
          <p className="flex min-h-[44px] items-center text-xs text-muted">下の「オンライン申請の受付」の 2通目・3通目 のカードで入れます</p>
        </EditField>
      ) : (
        <EditField label="申請番号">
          <input value={form.applicationNumber} onChange={(e) => set("applicationNumber", e.target.value)} className={EDIT_INPUT} />
        </EditField>
      )}
      <EditField label="申請内容">
        <select
          value={form.applicationContent}
          onChange={(e) => set("applicationContent", e.target.value as ApplicationContent)}
          className={EDIT_INPUT}
        >
          {APPLICATION_CONTENT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </EditField>
      <EditField label="申請方法">
        <select value={form.method} onChange={(e) => set("method", e.target.value as ApplicationMethod)} className={EDIT_INPUT}>
          {APPLICATION_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}申請
            </option>
          ))}
        </select>
      </EditField>
      <EditField label="申請取次士">
        <input value={form.assignee} onChange={(e) => set("assignee", e.target.value)} className={EDIT_INPUT} />
      </EditField>
    </div>
  );
}

// 編集中に画面の下に出す「保存」「やめる」と、保存しないでやめるときの確認
export function ApplicationEditBar({ edit }: { edit: ApplicationEdit }) {
  const [ask, setAsk] = useState(false);
  if (!edit.editing) return null;
  const cancel = () => {
    if (edit.dirty) setAsk(true);
    else edit.stop();
  };
  return (
    <>
      <div className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-surface/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur lg:mx-0 lg:rounded-xl lg:border">
        {edit.error && (
          <p role="alert" className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
            {edit.error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted sm:inline">
            {edit.dirty ? "編集した内容がまだ保存されていません" : "編集中です"}
          </span>
          <button
            type="button"
            onClick={cancel}
            disabled={edit.busy}
            className="ml-auto min-h-[44px] rounded-xl border border-border px-4 text-sm font-bold text-muted disabled:opacity-60"
          >
            やめる
          </button>
          <button
            type="button"
            onClick={() => void edit.save()}
            disabled={edit.busy}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand px-6 text-sm font-bold text-brand-foreground disabled:opacity-60"
          >
            {edit.busy && <Loader2 size={16} className="animate-spin" />}
            {edit.busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>

      {/* 保存しないでやめようとしたとき */}
      {ask && (
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
                disabled={edit.busy}
                onClick={() => void edit.save().then(() => setAsk(false))}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-brand-foreground disabled:opacity-60"
              >
                {edit.busy && <Loader2 size={16} className="animate-spin" />}
                {edit.busy ? "保存中…" : "保存"}
              </button>
              <button
                type="button"
                disabled={edit.busy}
                onClick={() => setAsk(false)}
                className="min-h-[44px] rounded-xl border border-border text-sm font-bold disabled:opacity-60"
              >
                キャンセル
              </button>
            </div>
            <button
              type="button"
              disabled={edit.busy}
              onClick={() => {
                setAsk(false);
                edit.stop();
              }}
              className="mt-2 min-h-[36px] w-full text-xs font-bold text-seal disabled:opacity-60"
            >
              保存しないでやめる
            </button>
          </div>
        </div>
      )}

      {/* 編集中にメニューなどから別の画面へ移ろうとしたとき・タブを閉じるとき */}
      <UnsavedChangesGuard dirty={edit.dirty} onSave={edit.save} saveLabel="保存" />
    </>
  );
}
