"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  ImagePlus,
  Keyboard,
  RotateCcw,
  ScanText,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useApplications } from "@/lib/application-store";
import { createClient } from "@/lib/supabase/client";
import {
  APPLICATION_CONTENT_OPTIONS,
  type ApplicationContent,
} from "@/types/application";

interface FormFields {
  name: string;
  applicationDate: string;
  applicationNumber: string;
  applicationContent: ApplicationContent | "";
  assignee: string;
}

const EMPTY_FIELDS: FormFields = {
  name: "",
  applicationDate: "",
  applicationNumber: "",
  applicationContent: "",
  assignee: "",
};

interface WorkerOption {
  id: string;
  name: string;
}

export function ReceiptRegistrationForm() {
  const router = useRouter();
  const { applications, addApplication } = useApplications();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [entryState, setEntryState] = useState<"idle" | "loading" | "editing">(
    "idle"
  );
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [workerId, setWorkerId] = useState<string>("");
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 紐づけ候補の外国人一覧（名前のみ）
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

  const isDuplicateNumber =
    fields.applicationNumber.length > 0 &&
    applications.some((a) => a.applicationNumber === fields.applicationNumber);
  const isDuplicateNameDate =
    fields.name.length > 0 &&
    fields.applicationDate.length > 0 &&
    applications.some(
      (a) =>
        a.name === fields.name && a.applicationDate === fields.applicationDate
    );

  function startEditing() {
    setFields((prev) => ({
      ...prev,
      applicationDate: prev.applicationDate || new Date().toISOString().slice(0, 10),
    }));
    setEntryState("editing");
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    // OCR（Google Vision / /api/ocr）は未実装のため、撮影後は手入力してもらう
    setEntryState("loading");
    setTimeout(startEditing, 400);
  }

  function retake() {
    setImagePreview(null);
    setEntryState("idle");
    setFields(EMPTY_FIELDS);
    setWorkerId("");
  }

  function updateField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  // 外国人を選ぶと氏名を自動入力（手修正も可）
  function selectWorker(id: string) {
    setWorkerId(id);
    const w = workers.find((x) => x.id === id);
    if (w) {
      setFields((prev) => ({ ...prev, name: prev.name || w.name }));
    }
  }

  async function handleSubmit() {
    if (!fields.applicationContent) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await addApplication({
        workerId: workerId || null,
        name: fields.name,
        applicationDate: fields.applicationDate,
        applicationNumber: fields.applicationNumber,
        applicationContent: fields.applicationContent,
        lineReported: false,
        notionSynced: false,
        approved: false,
        status: "申請済",
        assignee: fields.assignee,
      });
      router.push(`/applications/${created.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "登録に失敗しました");
      setSubmitting(false);
    }
  }

  const canSubmit =
    !submitting &&
    !isDuplicateNumber &&
    fields.name &&
    fields.applicationDate &&
    fields.applicationNumber &&
    fields.applicationContent &&
    fields.assignee;

  return (
    <div className="space-y-5 pb-28">
      <section>
        <h2 className="mb-2 text-sm font-bold text-muted">① 受付票の画像</h2>
        {!imagePreview ? (
          <Card className="flex flex-col items-center gap-3 p-6 text-center">
            <p className="text-sm text-muted">
              入管窓口で受け取った受付票を撮影するか、画像を選択してください
            </p>
            <div className="grid w-full grid-cols-2 gap-3">
              <Button
                variant="primary"
                icon={<Camera size={19} />}
                onClick={() => cameraInputRef.current?.click()}
              >
                撮影する
              </Button>
              <Button
                variant="secondary"
                icon={<ImagePlus size={19} />}
                onClick={() => galleryInputRef.current?.click()}
              >
                画像を選択
              </Button>
            </div>
            {entryState === "idle" && (
              <button
                type="button"
                onClick={startEditing}
                className="mt-1 flex items-center gap-1.5 text-sm font-bold text-brand"
              >
                <Keyboard size={16} />
                画像なしで手入力する
              </button>
            )}
          </Card>
        ) : (
          <Card className="overflow-hidden p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="受付票プレビュー"
              className="mb-3 max-h-64 w-full rounded-lg object-contain bg-background"
            />
            <Button
              variant="secondary"
              icon={<RotateCcw size={17} />}
              fullWidth
              onClick={retake}
            >
              撮り直す・選び直す
            </Button>
          </Card>
        )}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </section>

      {entryState !== "idle" && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <ScanText size={16} className="text-brand" />
            <h2 className="text-sm font-bold text-muted">
              ② 申請情報の入力
            </h2>
          </div>

          {entryState === "loading" ? (
            <Card className="flex items-center gap-3 p-5">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              <p className="text-sm text-muted">画像を読み込んでいます…</p>
            </Card>
          ) : (
            <Card className="space-y-4 p-4">
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1 text-xs font-bold text-muted">
                  <UserRound size={13} />
                  外国人と紐づける（任意）
                </span>
                <select
                  value={workerId}
                  onChange={(e) => selectWorker(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-base focus:border-brand focus:outline-none"
                >
                  <option value="">（紐づけない・未登録の人）</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-muted">
                  紐づけると外国人詳細ページから申請受付日・番号を確認できます
                </span>
              </label>

              <Field
                label="氏名"
                value={fields.name}
                onChange={(v) => updateField("name", v)}
              />
              <Field
                label="申請日"
                type="date"
                value={fields.applicationDate}
                onChange={(v) => updateField("applicationDate", v)}
              />
              <Field
                label="申請番号"
                value={fields.applicationNumber}
                onChange={(v) => updateField("applicationNumber", v)}
                warning={
                  isDuplicateNumber
                    ? "この申請番号は既に登録されています"
                    : undefined
                }
              />

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-muted">
                  申請内容
                </span>
                <select
                  value={fields.applicationContent}
                  onChange={(e) =>
                    updateField(
                      "applicationContent",
                      e.target.value as ApplicationContent
                    )
                  }
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-base focus:border-brand focus:outline-none"
                >
                  <option value="" disabled>
                    選択してください
                  </option>
                  {APPLICATION_CONTENT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <Field
                label="担当者"
                value={fields.assignee}
                onChange={(v) => updateField("assignee", v)}
              />

              {isDuplicateNameDate && !isDuplicateNumber && (
                <div className="flex items-start gap-2 rounded-xl bg-status-notice-bg p-3 text-sm text-status-notice-fg">
                  <TriangleAlert size={18} className="mt-0.5 shrink-0" />
                  <p>
                    同じ氏名・申請日の申請が既に登録されています。重複登録でないかご確認ください。
                  </p>
                </div>
              )}
            </Card>
          )}
        </section>
      )}

      {entryState === "editing" && (
        <div className="fixed bottom-[calc(64px+env(safe-area-inset-bottom))] left-0 right-0 z-10 border-t border-border bg-surface p-3">
          <div className="mx-auto max-w-lg">
            {isDuplicateNumber && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-seal/10 px-3 py-2 text-xs font-bold text-seal">
                <TriangleAlert size={15} />
                申請番号が重複しています。内容を確認してください
              </div>
            )}
            {submitError && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-seal/10 px-3 py-2 text-xs font-bold text-seal">
                <TriangleAlert size={15} />
                登録に失敗しました: {submitError}
              </div>
            )}
            <Button fullWidth disabled={!canSubmit} onClick={handleSubmit}>
              {submitting ? "登録しています…" : "登録する"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  warning,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  warning?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl border bg-surface px-3.5 py-3 text-base focus:outline-none ${
          warning
            ? "border-seal focus:border-seal"
            : "border-border focus:border-brand"
        }`}
      />
      {warning && (
        <span className="mt-1 flex items-center gap-1 text-xs font-bold text-seal">
          <TriangleAlert size={13} />
          {warning}
        </span>
      )}
    </label>
  );
}
