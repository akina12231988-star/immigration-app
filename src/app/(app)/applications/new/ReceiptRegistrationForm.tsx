"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  ImagePlus,
  Keyboard,
  Link2,
  RotateCcw,
  ScanText,
  TriangleAlert,
  UserPlus,
  UserRound,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useApplications } from "@/lib/application-store";
import { createClient } from "@/lib/supabase/client";
import { insertWorker } from "@/lib/supabase/queries/workers";
import { blankWorkerInput } from "@/lib/worker-defaults";
import { buildWorkerOptions } from "@/lib/worker-label";
import { uploadApplicationFile } from "@/lib/application-files";
import {
  APPLICATION_CONTENT_OPTIONS,
  type ApplicationContent,
  type ApplicationMethod,
} from "@/types/application";
import type { Organization } from "@/types/db";

interface FormFields {
  applicationDate: string;
  applicationNumber: string;
  residenceExpiryAtApply: string;
  applicationContent: ApplicationContent | "";
  assignee: string;
  isSelfApply: boolean;
  emailLink: string;
}

const EMPTY_FIELDS: FormFields = {
  applicationDate: "",
  applicationNumber: "",
  residenceExpiryAtApply: "",
  applicationContent: "",
  assignee: "",
  isSelfApply: false,
  emailLink: "",
};

interface WorkerOption {
  id: string;
  name: string;
  current_organization_id: string | null;
}

const INPUT_CLASS =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-base focus:border-brand focus:outline-none";

export function ReceiptRegistrationForm({ method }: { method: ApplicationMethod }) {
  const router = useRouter();
  const isOnline = method === "オンライン";
  const { applications, addApplication } = useApplications();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [entryState, setEntryState] = useState<"idle" | "loading" | "editing">(
    isOnline ? "editing" : "idle"
  );
  const [fields, setFields] = useState<FormFields>(() => ({
    ...EMPTY_FIELDS,
    applicationDate: isOnline ? new Date().toISOString().slice(0, 10) : "",
  }));

  // 外国人・所属機関
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [workerId, setWorkerId] = useState<string>("");
  const [orgId, setOrgId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [creatingWorker, setCreatingWorker] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void supabase
      .from("workers")
      .select("id, name, current_organization_id")
      .order("name")
      .then(({ data }) => {
        if (!cancelled && data) setWorkers(data as WorkerOption[]);
      });
    void supabase
      .from("organizations")
      .select("*")
      .order("name")
      .then(({ data }) => {
        if (!cancelled && data) setOrganizations(data as Organization[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedWorker = workers.find((w) => w.id === workerId) ?? null;
  const workerOptions = buildWorkerOptions(workers, organizations);

  const isDuplicateNumber =
    fields.applicationNumber.length > 0 &&
    applications.some((a) => a.applicationNumber === fields.applicationNumber);

  function startEditing() {
    setFields((prev) => ({
      ...prev,
      applicationDate: prev.applicationDate || new Date().toISOString().slice(0, 10),
    }));
    setEntryState("editing");
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setEntryState("loading");
    setTimeout(startEditing, 400);
  }

  function retake() {
    setImagePreview(null);
    setImageFile(null);
    setEntryState("idle");
  }

  const set = <K extends keyof FormFields>(key: K, value: FormFields[K]) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  // 外国人選択に該当者がない場合、氏名だけで新規登録して紐づける
  async function createWorkerByName() {
    const name = newName.trim();
    if (!name) return;
    setCreatingWorker(true);
    setNotice(null);
    try {
      const worker = await insertWorker(createClient(), blankWorkerInput(name, orgId || null));
      setWorkers((prev) => [
        ...prev,
        { id: worker.id, name: worker.name, current_organization_id: orgId || null },
      ]);
      setWorkerId(worker.id);
      setNewName("");
      setNotice(
        `外国人「${name}」を登録しました。国籍・在留カード番号などの詳細は、あとで外国人管理から入力できます。`,
      );
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "外国人の登録に失敗しました");
    } finally {
      setCreatingWorker(false);
    }
  }

  async function handleSubmit() {
    if (!fields.applicationContent) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await addApplication({
        workerId: workerId || null,
        organizationId: orgId || null,
        name: selectedWorker?.name ?? newName.trim(),
        applicationDate: fields.applicationDate,
        applicationNumber: fields.applicationNumber,
        applicationContent: fields.applicationContent,
        method,
        emailLink: isOnline ? fields.emailLink : "",
        residenceExpiryAtApply: fields.residenceExpiryAtApply || undefined,
        isSelfApply: fields.isSelfApply,
        reportOrgHonorific: "御中",
        lineReported: false,
        notionSynced: false,
        approved: false,
        approvalReported: false,
        status: "申請済",
        assignee: fields.isSelfApply ? "本人申請" : fields.assignee,
      });
      if (imageFile) {
        await uploadApplicationFile(created.id, "受付票", imageFile).catch(() => undefined);
      }
      router.push(`/applications/${created.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "登録に失敗しました");
      setSubmitting(false);
    }
  }

  const hasSubject = Boolean(selectedWorker);
  const canSubmit =
    !submitting &&
    !isDuplicateNumber &&
    hasSubject &&
    orgId &&
    fields.applicationDate &&
    fields.applicationNumber &&
    fields.applicationContent &&
    (fields.isSelfApply || fields.assignee) &&
    (!isOnline || fields.emailLink);

  return (
    <div className="space-y-5 pb-28">
      {!isOnline && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted">① 受付票の画像</h2>
          {!imagePreview ? (
            <Card className="flex flex-col items-center gap-3 p-6 text-center">
              <p className="text-sm text-muted">
                入管窓口で受け取った受付票を撮影するか、画像を選択してください
              </p>
              <div className="grid w-full max-w-md grid-cols-2 gap-3">
                <Button variant="primary" icon={<Camera size={19} />} onClick={() => cameraInputRef.current?.click()}>
                  撮影する
                </Button>
                <Button variant="secondary" icon={<ImagePlus size={19} />} onClick={() => galleryInputRef.current?.click()}>
                  画像を選択
                </Button>
              </div>
              {entryState === "idle" && (
                <button type="button" onClick={startEditing} className="mt-1 flex items-center gap-1.5 text-sm font-bold text-brand">
                  <Keyboard size={16} />
                  画像なしで手入力する
                </button>
              )}
            </Card>
          ) : (
            <Card className="overflow-hidden p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="受付票プレビュー" className="mb-3 max-h-64 w-full rounded-lg bg-background object-contain" />
              <Button variant="secondary" icon={<RotateCcw size={17} />} fullWidth onClick={retake}>
                撮り直す・選び直す
              </Button>
            </Card>
          )}
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        </section>
      )}

      {entryState !== "idle" && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <ScanText size={16} className="text-brand" />
            <h2 className="text-sm font-bold text-muted">{isOnline ? "申請情報の入力" : "② 申請情報の入力"}</h2>
          </div>

          {entryState === "loading" ? (
            <Card className="flex items-center gap-3 p-5">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              <p className="text-sm text-muted">画像を読み込んでいます…</p>
            </Card>
          ) : (
            <Card className="space-y-4 p-4">
              {notice && (
                <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{notice}</p>
              )}

              {/* 1. 外国人氏名（該当者がなければ氏名だけで新規登録） */}
              <div>
                <span className="mb-1.5 flex items-center gap-1 text-xs font-bold text-muted">
                  <UserRound size={13} />
                  外国人氏名（必須）
                </span>
                <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className={INPUT_CLASS}>
                  <option value="">選択してください</option>
                  {workerOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {!selectedWorker && (
                  <div className="mt-2 rounded-xl border border-dashed border-border p-3">
                    <p className="mb-1.5 text-xs font-bold text-muted">
                      一覧にいない場合は、氏名だけで先に登録できます
                    </p>
                    <div className="flex gap-2">
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="氏名を入力"
                        className={INPUT_CLASS}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        icon={<UserPlus size={17} />}
                        onClick={createWorkerByName}
                        disabled={!newName.trim() || creatingWorker}
                      >
                        {creatingWorker ? "登録中…" : "登録"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. 所属機関 */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-muted">所属機関（必須）</span>
                <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={INPUT_CLASS}>
                  <option value="">選択してください</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>

              {isOnline && (
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1 text-xs font-bold text-muted">
                    <Link2 size={13} />
                    申請受付メールのリンク
                  </span>
                  <input type="url" value={fields.emailLink} onChange={(e) => set("emailLink", e.target.value)} placeholder="https://..." className={INPUT_CLASS} />
                </label>
              )}

              {/* 3. 申請日 4. 申請番号 */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="申請日（必須）" type="date" value={fields.applicationDate} onChange={(v) => set("applicationDate", v)} />
                <Field
                  label="申請番号（必須）"
                  value={fields.applicationNumber}
                  onChange={(v) => set("applicationNumber", v)}
                  warning={isDuplicateNumber ? "この申請番号は既に登録されています" : undefined}
                />
              </div>

              {/* 申請時点の在留期限 */}
              <Field label="申請時点の在留期限" type="date" value={fields.residenceExpiryAtApply} onChange={(v) => set("residenceExpiryAtApply", v)} />

              {/* 5. 申請内容 */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-muted">申請内容（必須）</span>
                <select
                  value={fields.applicationContent}
                  onChange={(e) => set("applicationContent", e.target.value as ApplicationContent)}
                  className={INPUT_CLASS}
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

              {/* 6. 申請取次士（本人申請の場合はチェック） */}
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <input type="checkbox" checked={fields.isSelfApply} onChange={(e) => set("isSelfApply", e.target.checked)} className="h-4 w-4" />
                  本人申請（申請取次士を介さない）
                </label>
                {!fields.isSelfApply && (
                  <Field label="申請取次士（必須）" value={fields.assignee} onChange={(v) => set("assignee", v)} />
                )}
              </div>
            </Card>
          )}
        </section>
      )}

      {entryState === "editing" && (
        <div className="fixed bottom-[calc(64px+env(safe-area-inset-bottom))] left-0 right-0 z-10 border-t border-border bg-surface p-3 lg:bottom-0 lg:pl-64">
          <div className="mx-auto max-w-2xl">
            {isDuplicateNumber && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-seal/10 px-3 py-2 text-xs font-bold text-seal">
                <TriangleAlert size={15} />
                申請番号が重複しています。内容を確認してください
              </div>
            )}
            {submitError && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-seal/10 px-3 py-2 text-xs font-bold text-seal">
                <TriangleAlert size={15} />
                {submitError}
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
      <span className="mb-1.5 block text-xs font-bold text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl border bg-surface px-3.5 py-3 text-base focus:outline-none ${
          warning ? "border-seal focus:border-seal" : "border-border focus:border-brand"
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
