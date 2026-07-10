"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  ImagePlus,
  RotateCcw,
  TriangleAlert,
  Building2,
  Mail,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useApplications } from "@/lib/application-store";
import {
  APPLICATION_CONTENT_OPTIONS,
  type ApplicationContent,
  type ApplicationMethod,
} from "@/types/application";

interface FormFields {
  name: string;
  applicationDate: string;
  applicationNumber: string;
  applicationContent: ApplicationContent | "";
  assignee: string;
  emailLink: string;
  emailBody: string;
}

const EMPTY_FIELDS: FormFields = {
  name: "",
  applicationDate: "",
  applicationNumber: "",
  applicationContent: "",
  assignee: "",
  emailLink: "",
  emailBody: "",
};

export function ReceiptRegistrationForm() {
  const router = useRouter();
  const { applications, addApplication } = useApplications();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [method, setMethod] = useState<ApplicationMethod | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
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

  function selectMethod(next: ApplicationMethod) {
    setMethod(next);
    setImagePreview(null);
    setFields(EMPTY_FIELDS);
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
  }

  function retake() {
    setImagePreview(null);
  }

  function updateField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!method || !fields.applicationContent) return;
    setSubmitting(true);
    const now = new Date().toISOString();
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now());

    await addApplication({
      id,
      name: fields.name,
      applicationDate: fields.applicationDate,
      applicationNumber: fields.applicationNumber,
      applicationContent: fields.applicationContent,
      applicationMethod: method,
      emailLink: method === "オンライン申請" ? fields.emailLink : undefined,
      emailBody: method === "オンライン申請" ? fields.emailBody : undefined,
      lineReported: false,
      notionSynced: false,
      approved: false,
      status: "申請済",
      assignee: fields.assignee,
      createdAt: now,
      updatedAt: now,
    });

    router.push(`/applications/${id}`);
  }

  // 窓口申請は受付票の撮影が必須、オンライン申請は不要
  const showFormFields = method === "オンライン申請" || (method === "窓口申請" && imagePreview);

  const canSubmit =
    !submitting &&
    !isDuplicateNumber &&
    !!method &&
    fields.name &&
    fields.applicationNumber &&
    fields.applicationContent &&
    fields.assignee &&
    (method === "窓口申請" ? !!imagePreview : true);

  return (
    <div className="space-y-5 pb-28">
      <section>
        <h2 className="mb-2 text-sm font-bold text-muted">① 申請方法</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => selectMethod("窓口申請")}
            className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-center ${
              method === "窓口申請"
                ? "border-brand bg-brand/10"
                : "border-border bg-surface"
            }`}
          >
            <Building2
              size={22}
              className={method === "窓口申請" ? "text-brand" : "text-muted"}
            />
            <span className="text-sm font-bold">窓口申請</span>
            <span className="text-[11px] text-muted">受付票を撮影</span>
          </button>
          <button
            onClick={() => selectMethod("オンライン申請")}
            className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-center ${
              method === "オンライン申請"
                ? "border-brand bg-brand/10"
                : "border-border bg-surface"
            }`}
          >
            <Mail
              size={22}
              className={method === "オンライン申請" ? "text-brand" : "text-muted"}
            />
            <span className="text-sm font-bold">オンライン申請</span>
            <span className="text-[11px] text-muted">確認メールを転記</span>
          </button>
        </div>
      </section>

      {method === "窓口申請" && (
          <section>
            <h2 className="mb-2 text-sm font-bold text-muted">
              ② 受付票の画像
            </h2>
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
        )}

      {method === "オンライン申請" && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted">
            ② 確認メール情報
          </h2>
          <Card className="space-y-4 p-4">
            <Field
              label="メールのリンク（URL）"
              value={fields.emailLink}
              onChange={(v) => updateField("emailLink", v)}
              placeholder="https://..."
            />
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-muted">
                メール本文
              </span>
              <textarea
                value={fields.emailBody}
                onChange={(e) => updateField("emailBody", e.target.value)}
                placeholder="確認メールの本文をそのまま貼り付けてください"
                rows={6}
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-sm focus:border-brand focus:outline-none"
              />
            </label>
          </Card>
        </section>
      )}

      {showFormFields && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted">
            ③ 申請情報の入力
          </h2>
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
        </section>
      )}

      {showFormFields && (
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
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  warning?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
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
