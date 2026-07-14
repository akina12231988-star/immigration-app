"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileGroup } from "@/components/applications/FileGroup";
import { generateApprovalReport } from "@/lib/line-report";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { ensureOrientationForApplication } from "@/lib/supabase/queries/orientations";
import { orientationDate } from "@/lib/orientation";
import {
  ORG_HONORIFICS,
  type Application,
  type ApplicationFile,
  type ApplicationFileKind,
  type OrgHonorific,
} from "@/types/application";

const INPUT_CLASS =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

// 許可処理（要件⑤）: 「入管から許可がおりた通知あり」→受取情報・許可情報・カード/指定書画像・許可LINE報告文
export function ApprovalSection({
  app,
  files,
  uploading,
  onUpload,
  messengerLink,
  updateApplication,
}: {
  app: Application;
  files: ApplicationFile[];
  uploading: ApplicationFileKind | null;
  onUpload: (kind: ApplicationFileKind, list: FileList | null) => void;
  messengerLink: string;
  updateApplication: (id: string, patch: Partial<Application>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    receiptScheduledOn: app.receiptScheduledOn ?? "",
    receiptReason: app.receiptReason ?? "",
    grantedCardNo: app.grantedCardNo ?? "",
    grantedPermitDate: app.grantedPermitDate ?? "",
    grantedExpiryDate: app.grantedExpiryDate ?? "",
    employmentStartOn: app.employmentStartOn ?? "",
  });
  const [honorific, setHonorific] = useState<OrgHonorific>(app.reportOrgHonorific ?? "御中");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // 「入管から許可がおりた通知あり」: 許可確定
  function markApproved() {
    const today = new Date().toISOString().slice(0, 10);
    void updateApplication(app.id, {
      approved: true,
      approvalDate: today,
      status: "許可済",
      grantedPermitDate: form.grantedPermitDate || today,
    });
  }

  // 許可情報を保存。外国人の在留カード番号・許可日・期限日も自動更新する（⑦）
  async function saveGrantInfo() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateApplication(app.id, {
        receiptScheduledOn: form.receiptScheduledOn || undefined,
        receiptReason: form.receiptReason,
        grantedCardNo: form.grantedCardNo,
        grantedPermitDate: form.grantedPermitDate || undefined,
        grantedExpiryDate: form.grantedExpiryDate || undefined,
        employmentStartOn: form.employmentStartOn || undefined,
        reportOrgHonorific: honorific,
      });
      if (app.workerId) {
        await updateWorker(createClient(), app.workerId, {
          residence_card_no: form.grantedCardNo,
          residence_permit_date: form.grantedPermitDate || null,
          residence_expiry_date: form.grantedExpiryDate || null,
        });
        // 雇用開始日が入ったら、2週間後の日曜を予定日として生活オリエンテーションを自動生成
        if (form.employmentStartOn) {
          await ensureOrientationForApplication(createClient(), {
            applicationId: app.id,
            workerId: app.workerId,
            organizationId: app.organizationId,
            scheduledOn: orientationDate(form.employmentStartOn),
          }).catch(() => undefined);
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const reportText = generateApprovalReport({
    ...app,
    reportOrgHonorific: honorific,
    employmentStartOn: form.employmentStartOn || undefined,
  });

  async function copyReport() {
    await navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-muted">
        <ShieldCheck size={15} />
        許可処理
      </h3>

      <Button
        variant={app.approved ? "secondary" : "seal"}
        icon={<ShieldCheck size={18} />}
        fullWidth
        onClick={markApproved}
        disabled={app.approved}
      >
        {app.approved
          ? `許可通知あり（許可日: ${app.approvalDate}）`
          : "入管から許可がおりた通知あり"}
      </Button>

      {app.approved && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {error && (
            <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
              {error}
            </p>
          )}

          {/* Messengerリンク（外国人情報から取得） */}
          {messengerLink && (
            <a
              href={messengerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-bold text-brand"
            >
              <MessageCircle size={16} />
              外国人Messengerグループを開く
              <ExternalLink size={14} />
            </a>
          )}

          {/* 受取・許可情報 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Labeled label="受取予定日">
              <input type="date" value={form.receiptScheduledOn} onChange={(e) => set("receiptScheduledOn", e.target.value)} className={INPUT_CLASS} />
            </Labeled>
            <Labeled label="受取理由">
              <input value={form.receiptReason} onChange={(e) => set("receiptReason", e.target.value)} placeholder="在留カード受取 など" className={INPUT_CLASS} />
            </Labeled>
            <Labeled label="在留カード番号">
              <input value={form.grantedCardNo} onChange={(e) => set("grantedCardNo", e.target.value)} className={INPUT_CLASS} />
            </Labeled>
            <Labeled label="在留許可日">
              <input type="date" value={form.grantedPermitDate} onChange={(e) => set("grantedPermitDate", e.target.value)} className={INPUT_CLASS} />
            </Labeled>
            <Labeled label="在留期限日">
              <input type="date" value={form.grantedExpiryDate} onChange={(e) => set("grantedExpiryDate", e.target.value)} className={INPUT_CLASS} />
            </Labeled>
            <Labeled label="雇用開始日">
              <input type="date" value={form.employmentStartOn} onChange={(e) => set("employmentStartOn", e.target.value)} className={INPUT_CLASS} />
            </Labeled>
          </div>

          <Button fullWidth onClick={saveGrantInfo} disabled={saving} icon={saved ? <Check size={17} /> : undefined}>
            {saving ? "保存中…" : saved ? "保存しました（外国人情報も更新）" : "許可情報を保存"}
          </Button>

          {/* 在留カード画像・指定書画像 */}
          <div className="space-y-4">
            <FileGroup
              label="在留カード画像（複数枚可）"
              files={files.filter((f) => f.kind === "在留カード")}
              uploading={uploading === "在留カード"}
              multiple
              onSelect={(list) => onUpload("在留カード", list)}
            />
            <FileGroup
              label="指定書画像（複数枚可）"
              files={files.filter((f) => f.kind === "指定書")}
              uploading={uploading === "指定書"}
              multiple
              onSelect={(list) => onUpload("指定書", list)}
            />
          </div>

          {/* 許可のLINE報告文（所属機関名＋御中/様） */}
          <div className="border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-bold text-muted">LINE報告文（許可）</h4>
              <div className="flex rounded-lg border border-border p-0.5">
                {ORG_HONORIFICS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHonorific(h)}
                    className={`rounded-md px-3 py-1 text-xs font-bold ${
                      honorific === h ? "bg-brand text-brand-foreground" : "text-muted"
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
            <pre className="whitespace-pre-wrap rounded-xl bg-background p-3.5 text-sm leading-relaxed">
              {reportText}
            </pre>
            <Button
              variant="secondary"
              fullWidth
              className="mt-3"
              icon={copied ? <Check size={17} /> : <Copy size={17} />}
              onClick={copyReport}
            >
              {copied ? "コピーしました" : "報告文をコピー"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold text-muted">{label}</span>
      {children}
    </label>
  );
}
