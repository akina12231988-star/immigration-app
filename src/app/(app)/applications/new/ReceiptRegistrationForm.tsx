"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  ImagePlus,
  RotateCcw,
  ScanText,
  TriangleAlert,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useApplications } from "@/lib/application-store";
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

// Stage2はデザイン確認用のためOCR結果を模擬生成する（Stage6でGoogle Vision APIに置き換える）
const MOCK_OCR_NAME_POOL = [
  "グエン・ヴァン・A",
  "チャン・ティ・C",
  "キム・ソヨン",
  "ラム・クアン・D",
];

function generateMockApplicationNumber(existingNumbers: string[]): string {
  let candidate: string;
  do {
    candidate = String(100000 + Math.floor(Math.random() * 900000));
  } while (existingNumbers.includes(candidate));
  return candidate;
}

export function ReceiptRegistrationForm() {
  const router = useRouter();
  const { applications, addApplication } = useApplications();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ocrState, setOcrState] = useState<"idle" | "loading" | "done">(
    "idle"
  );
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [submitting, setSubmitting] = useState(false);

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

  function handleFile(file: File | undefined) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    setOcrState("loading");
    // OCR処理のモック。実装ではここでPOST /api/ocr を呼び出す
    setTimeout(() => {
      const existingNumbers = applications.map((a) => a.applicationNumber);
      setFields({
        name:
          MOCK_OCR_NAME_POOL[
            Math.floor(Math.random() * MOCK_OCR_NAME_POOL.length)
          ],
        applicationDate: new Date().toISOString().slice(0, 10),
        applicationNumber: generateMockApplicationNumber(existingNumbers),
        applicationContent: "",
        assignee: "",
      });
      setOcrState("done");
    }, 1200);
  }

  function retake() {
    setImagePreview(null);
    setOcrState("idle");
    setFields(EMPTY_FIELDS);
  }

  function updateField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    if (!fields.applicationContent) return;
    setSubmitting(true);
    const now = new Date().toISOString();
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now());

    addApplication({
      id,
      name: fields.name,
      applicationDate: fields.applicationDate,
      applicationNumber: fields.applicationNumber,
      applicationContent: fields.applicationContent,
      lineReported: false,
      notionSynced: false,
      approved: false,
      status: "申請済",
      assignee: fields.assignee,
      createdAt: now,
      updatedAt: now,
    });

    setTimeout(() => {
      router.push(`/applications/${id}`);
    }, 400);
  }

  const canSubmit =
    !submitting &&
    !isDuplicateNumber &&
    fields.name &&
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

      {ocrState !== "idle" && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <ScanText size={16} className="text-brand" />
            <h2 className="text-sm font-bold text-muted">
              ② 読み取り結果（間違っていれば修正してください）
            </h2>
          </div>

          {ocrState === "loading" ? (
            <Card className="flex items-center gap-3 p-5">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              <p className="text-sm text-muted">OCRで読み取っています…</p>
            </Card>
          ) : (
            <Card className="space-y-4 p-4">
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

      {ocrState === "done" && (
        <div className="fixed bottom-[calc(64px+env(safe-area-inset-bottom))] left-0 right-0 z-10 border-t border-border bg-surface p-3">
          <div className="mx-auto max-w-lg">
            {isDuplicateNumber && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-seal/10 px-3 py-2 text-xs font-bold text-seal">
                <TriangleAlert size={15} />
                申請番号が重複しています。内容を確認してください
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
