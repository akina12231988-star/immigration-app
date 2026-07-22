"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileGroup } from "@/components/applications/FileGroup";
import { generateApprovalReport } from "@/lib/line-report";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { ensureOrientationForApplication } from "@/lib/supabase/queries/orientations";
import {
  deleteApplicationMemo,
  insertApplicationMemo,
  listApplicationMemos,
} from "@/lib/supabase/queries/memos";
import { orientationDate } from "@/lib/orientation";
import {
  GRANT_VISA_OPTIONS,
  ORG_HONORIFICS,
  ORIENTATION_TARGET_VISA,
  type Application,
  type ApplicationFile,
  type ApplicationFileKind,
  type ApplicationMemo,
  type OrgHonorific,
} from "@/types/application";

const INPUT_CLASS =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

// 許可処理: 「入管から許可がおりた通知あり」→受取情報・メモ履歴・カード/指定書画像・許可LINE報告文・雇用開始日/在留資格
export function ApprovalSection({
  app,
  files,
  uploading,
  onUpload,
  onDeleteFile,
  messengerLink,
  updateApplication,
}: {
  app: Application;
  files: ApplicationFile[];
  uploading: ApplicationFileKind | null;
  onUpload: (kind: ApplicationFileKind, list: FileList | null) => void;
  onDeleteFile: (file: ApplicationFile) => void; // 誤アップロード画像の削除
  messengerLink: string;
  updateApplication: (id: string, patch: Partial<Application>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    receiptScheduledOn: app.receiptScheduledOn ?? "",
    grantedCardNo: app.grantedCardNo ?? "",
    grantedPermitDate: app.grantedPermitDate ?? "",
    grantedExpiryDate: app.grantedExpiryDate ?? "",
  });
  const [honorific, setHonorific] = useState<OrgHonorific>(app.reportOrgHonorific ?? "御中");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 雇用開始日・在留資格（許可報告の下）
  const [employmentStartOn, setEmploymentStartOn] = useState(app.employmentStartOn ?? "");
  const [visaAtGrant, setVisaAtGrant] = useState(app.visaAtGrant ?? "");
  const [visaSaving, setVisaSaving] = useState(false);
  const [visaSaved, setVisaSaved] = useState<string | null>(null);

  // メモ履歴
  const [memos, setMemos] = useState<ApplicationMemo[]>([]);
  const [memoBody, setMemoBody] = useState("");
  const [memoBusy, setMemoBusy] = useState(false);
  const [authorName, setAuthorName] = useState("");

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void listApplicationMemos(supabase, app.id).then((m) => {
      if (!cancelled) setMemos(m);
    });
    // 記入者名（プロフィール表示名 or メール）
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!cancelled && p) {
        const prof = p as { display_name: string; email: string };
        setAuthorName(prof.display_name || prof.email);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [app.id]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function markApproved() {
    const today = new Date().toISOString().slice(0, 10);
    void updateApplication(app.id, {
      approved: true,
      approvalDate: today,
      status: "許可済",
      grantedPermitDate: form.grantedPermitDate || today,
    });
  }

  // 許可情報を保存。外国人の在留カード番号・許可日・期限日も自動更新する
  async function saveGrantInfo() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateApplication(app.id, {
        receiptScheduledOn: form.receiptScheduledOn || undefined,
        grantedCardNo: form.grantedCardNo,
        grantedPermitDate: form.grantedPermitDate || undefined,
        grantedExpiryDate: form.grantedExpiryDate || undefined,
        reportOrgHonorific: honorific,
      });
      if (app.workerId) {
        await updateWorker(createClient(), app.workerId, {
          residence_card_no: form.grantedCardNo,
          residence_permit_date: form.grantedPermitDate || null,
          residence_expiry_date: form.grantedExpiryDate || null,
          // 新しい在留期限が決まったら、申請準備の対応状況をリセットして次の更新サイクルに備える
          ...(form.grantedExpiryDate
            ? {
                residence_renewal_status: "" as const,
                residence_renewal_todo: "",
                application_prep_kind: "",
              }
            : {}),
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  // 雇用開始日・在留資格を保存。特定技能1号なら生活オリエンテーションを自動登録
  async function saveVisaEmployment() {
    setVisaSaving(true);
    setError(null);
    setVisaSaved(null);
    try {
      await updateApplication(app.id, {
        employmentStartOn: employmentStartOn || undefined,
        visaAtGrant: visaAtGrant || "",
      });
      if (
        app.workerId &&
        visaAtGrant === ORIENTATION_TARGET_VISA &&
        employmentStartOn
      ) {
        await ensureOrientationForApplication(createClient(), {
          applicationId: app.id,
          workerId: app.workerId,
          organizationId: app.organizationId,
          scheduledOn: orientationDate(employmentStartOn),
          employmentStartOn,
        });
        setVisaSaved(
          `保存しました。生活オリエンテーション（予定日 ${orientationDate(employmentStartOn)}）を未実施で登録しました。`,
        );
      } else {
        setVisaSaved("保存しました。");
      }
      setTimeout(() => setVisaSaved(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setVisaSaving(false);
    }
  }

  async function addMemo() {
    if (!memoBody.trim()) return;
    setMemoBusy(true);
    try {
      const memo = await insertApplicationMemo(createClient(), {
        applicationId: app.id,
        author: authorName,
        body: memoBody.trim(),
      });
      setMemos((prev) => [memo, ...prev]);
      setMemoBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "メモの保存に失敗しました");
    } finally {
      setMemoBusy(false);
    }
  }

  async function removeMemo(id: string) {
    await deleteApplicationMemo(createClient(), id).catch(() => undefined);
    setMemos((prev) => prev.filter((m) => m.id !== id));
  }

  const reportText = generateApprovalReport({
    ...app,
    reportOrgHonorific: honorific,
    employmentStartOn: employmentStartOn || undefined,
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

          {/* 受取予定日（メモの前に配置） */}
          <Labeled label="受取予定日">
            <input type="date" value={form.receiptScheduledOn} onChange={(e) => set("receiptScheduledOn", e.target.value)} className={INPUT_CLASS} />
          </Labeled>

          {/* 入管許可通知後のメモ（時系列履歴） */}
          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 text-sm font-bold">入管許可通知後のメモ</p>
            <div className="flex gap-2">
              <input
                value={memoBody}
                onChange={(e) => setMemoBody(e.target.value)}
                placeholder="メモを入力（受取までの経過など）"
                className={INPUT_CLASS}
              />
              <Button type="button" variant="secondary" icon={<Plus size={16} />} onClick={addMemo} disabled={memoBusy || !memoBody.trim()}>
                保存
              </Button>
            </div>
            {memos.length > 0 && (
              <ul className="mt-3 space-y-2">
                {memos.map((m) => (
                  <li key={m.id} className="rounded-lg bg-background p-2.5 text-sm">
                    <div className="mb-0.5 flex items-center justify-between text-[11px] text-muted">
                      <span>
                        {new Date(m.createdAt).toLocaleString("ja-JP")}
                        {m.author && ` ・ ${m.author}`}
                      </span>
                      <button type="button" aria-label="削除" onClick={() => removeMemo(m.id)} className="text-seal">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

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

          {/* 許可情報 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Labeled label="在留カード番号">
              <input value={form.grantedCardNo} onChange={(e) => set("grantedCardNo", e.target.value)} className={INPUT_CLASS} />
            </Labeled>
            <Labeled label="在留許可日">
              <input type="date" value={form.grantedPermitDate} onChange={(e) => set("grantedPermitDate", e.target.value)} className={INPUT_CLASS} />
            </Labeled>
            <Labeled label="在留期限日">
              <input type="date" value={form.grantedExpiryDate} onChange={(e) => set("grantedExpiryDate", e.target.value)} className={INPUT_CLASS} />
            </Labeled>
          </div>

          {/* 在留カード画像・指定書画像 */}
          <div className="space-y-4">
            <FileGroup
              label="在留カード画像（複数枚可）"
              files={files.filter((f) => f.kind === "在留カード")}
              uploading={uploading === "在留カード"}
              multiple
              onSelect={(list) => onUpload("在留カード", list)}
              onDelete={onDeleteFile}
            />
            <FileGroup
              label="指定書画像（複数枚可）"
              files={files.filter((f) => f.kind === "指定書")}
              uploading={uploading === "指定書"}
              multiple
              onSelect={(list) => onUpload("指定書", list)}
              onDelete={onDeleteFile}
            />
          </div>

          {/* 許可情報の保存（画像の下に配置） */}
          <Button fullWidth onClick={saveGrantInfo} disabled={saving} icon={saved ? <Check size={17} /> : undefined}>
            {saving ? "保存中…" : saved ? "保存しました（外国人情報も更新）" : "許可情報を保存"}
          </Button>

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

          {/* 雇用開始日・在留資格（特定技能1号で生活オリエンテーション自動登録） */}
          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 text-sm font-bold">雇用開始日・在留資格</p>
            {visaSaved && (
              <p className="mb-2 rounded-lg bg-brand/10 px-3 py-2 text-xs text-brand">{visaSaved}</p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Labeled label="雇用開始日（予定でも可）">
                <input type="date" value={employmentStartOn} onChange={(e) => setEmploymentStartOn(e.target.value)} className={INPUT_CLASS} />
              </Labeled>
              <Labeled label="在留資格情報">
                <select value={visaAtGrant} onChange={(e) => setVisaAtGrant(e.target.value)} className={INPUT_CLASS}>
                  <option value="">選択してください</option>
                  {GRANT_VISA_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Labeled>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              「{ORIENTATION_TARGET_VISA}」を選んで保存すると、雇用開始日から2週間後の日曜を予定日として生活オリエンテーションに未実施で登録します。
            </p>
            <Button fullWidth className="mt-3" onClick={saveVisaEmployment} disabled={visaSaving}>
              {visaSaving ? "保存中…" : "雇用開始日・在留資格を保存"}
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
