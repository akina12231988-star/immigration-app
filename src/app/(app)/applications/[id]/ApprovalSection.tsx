"use client";

import { messengerWebUrl } from "@/lib/messenger-link";
import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, MapPin, MessageCircle, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileGroup } from "@/components/applications/FileGroup";
import { generateApprovalReport } from "@/lib/line-report";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { advanceSituationOnApproval } from "@/lib/application-approval";
import {
  insertWorkerAddress,
  listWorkerAddresses,
} from "@/lib/supabase/queries/worker-addresses";
import { ensureOrientationForApplication } from "@/lib/supabase/queries/orientations";
import {
  deleteApplicationMemo,
  insertApplicationMemo,
  listApplicationMemos,
} from "@/lib/supabase/queries/memos";
import { orientationBaseDate, orientationDate } from "@/lib/orientation";
import { todayStr } from "@/lib/application-alerts";
import {
  normalizeOrgEmploymentStarts,
  upsertOrgEmploymentStart,
} from "@/lib/org-employment";
import type { WorkerInput, WorkerOrgEmploymentStart } from "@/types/db";
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

  // いまの登録内容（元の在留資格・所属機関・雇用開始日）を自動表示するために取る
  const [workerNow, setWorkerNow] = useState<{
    residence_status: string;
    current_organization_id: string | null;
    employment_start_on: string | null;
    org_employment_starts: WorkerOrgEmploymentStart[];
    orgName: string;
  } | null>(null);
  useEffect(() => {
    if (!app.workerId) return;
    let cancelled = false;
    void createClient()
      .from("workers")
      .select(
        "residence_status, current_organization_id, employment_start_on, org_employment_starts, organizations(name)",
      )
      .eq("id", app.workerId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const d = data as unknown as {
          residence_status: string | null;
          current_organization_id: string | null;
          employment_start_on: string | null;
          org_employment_starts: unknown;
          organizations: { name: string } | null;
        };
        setWorkerNow({
          residence_status: d.residence_status ?? "",
          current_organization_id: d.current_organization_id,
          employment_start_on: d.employment_start_on,
          org_employment_starts: normalizeOrgEmploymentStarts(d.org_employment_starts),
          orgName: d.organizations?.name ?? "",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [app.workerId]);

  // この申請の所属機関での、登録済みの雇用開始日
  const existingStart =
    (app.organizationId &&
      workerNow &&
      (workerNow.org_employment_starts.find((e) => e.organization_id === app.organizationId)
        ?.start_on ||
        (workerNow.current_organization_id === app.organizationId
          ? (workerNow.employment_start_on ?? "")
          : ""))) ||
    "";
  // 同じ所属機関での資格変更（現在の所属機関＝申請の所属機関で、雇用開始日が入力済み）。
  // この場合は雇用開始日の入力は不要（登録済みの日付をそのまま使う）
  const sameOrgChange = Boolean(
    app.organizationId &&
      workerNow?.current_organization_id === app.organizationId &&
      existingStart,
  );
  useEffect(() => {
    if (sameOrgChange && !employmentStartOn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 登録済みの雇用開始日を自動で使う
      setEmploymentStartOn(existingStart);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sameOrgChange, existingStart]);

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
    // 特定技能の更新の許可なら、外国人の只今の状況を「更新」に進める（＜支援委託中＞は残す）
    void advanceSituationOnApproval(createClient(), app.workerId);
  }

  // ---- 許可後の住所変更 ----
  // 許可がおりて在留カードを受け取ると、住所が変わっていることがある。
  // ここで新しい住所を入れると、住所歴（転入）に残り、外国人情報の住所も更新される。
  const [currentAddress, setCurrentAddress] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [movedOn, setMovedOn] = useState("");
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressSaved, setAddressSaved] = useState(false);
  // 画面に出す（＝保存される）転入日。触っていなければ在留許可日、それも無ければ今日
  const movedOnValue = movedOn || form.grantedPermitDate || todayStr();

  useEffect(() => {
    if (!app.workerId) return;
    let cancelled = false;
    void createClient()
      .from("workers")
      .select("address")
      .eq("id", app.workerId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setCurrentAddress((data as { address?: string } | null)?.address ?? "");
      });
    return () => {
      cancelled = true;
    };
  }, [app.workerId]);

  async function saveAddress() {
    if (!app.workerId || !newAddress.trim()) return;
    setAddressSaving(true);
    setError(null);
    setAddressSaved(false);
    try {
      const supabase = createClient();
      const address = newAddress.trim();
      // 住所歴（課税・納税証明書の1月1日時点の住所判定に使う）にも残す
      await insertWorkerAddress(supabase, {
        worker_id: app.workerId,
        moved_on: movedOnValue,
        address,
        kind: "転入",
        note: "在留許可時に変更",
      });
      // 住所歴のいちばん新しい行を現在の住所にする（外国人詳細の住所歴と同じ扱い）
      const rows = await listWorkerAddresses(supabase, app.workerId);
      await updateWorker(supabase, app.workerId, { address: rows[0]?.address ?? address });
      setCurrentAddress(rows[0]?.address ?? address);
      setNewAddress("");
      setMovedOn("");
      setAddressSaved(true);
      setTimeout(() => setAddressSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "住所の更新に失敗しました");
    } finally {
      setAddressSaving(false);
    }
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

  // 雇用開始日・在留資格を保存。紐づく外国人の「現在の在留資格」と
  // 所属機関別の雇用開始日（申請の所属機関の行）も自動更新し、
  // 特定技能1号なら生活オリエンテーションを自動登録
  async function saveVisaEmployment() {
    setVisaSaving(true);
    setError(null);
    setVisaSaved(null);
    try {
      await updateApplication(app.id, {
        employmentStartOn: employmentStartOn || undefined,
        visaAtGrant: visaAtGrant || "",
      });
      const supabase = createClient();
      const patch: Partial<WorkerInput> = {};
      if (visaAtGrant) patch.residence_status = visaAtGrant;
      // 雇用開始日を、申請の所属機関の「雇用開始日（所属機関別）」へ反映。
      // その機関が現在の所属機関なら既存の雇用開始年月日にも反映する
      let startSynced = false;
      if (app.workerId && app.organizationId && employmentStartOn) {
        const { data: w } = await supabase
          .from("workers")
          .select("org_employment_starts, current_organization_id")
          .eq("id", app.workerId)
          .maybeSingle();
        if (w) {
          const row = w as {
            org_employment_starts: unknown;
            current_organization_id: string | null;
          };
          patch.org_employment_starts = upsertOrgEmploymentStart(
            normalizeOrgEmploymentStarts(row.org_employment_starts),
            app.organizationId,
            employmentStartOn,
          );
          if (row.current_organization_id === app.organizationId) {
            patch.employment_start_on = employmentStartOn;
          }
          startSynced = true;
        }
      }
      const workerUpdated = Boolean(app.workerId && Object.keys(patch).length > 0);
      if (app.workerId && workerUpdated) {
        await updateWorker(supabase, app.workerId, patch);
      }
      const updatedParts = [
        visaAtGrant && "在留資格",
        startSynced && "所属機関別の雇用開始日",
      ].filter(Boolean);
      const savedMsg = workerUpdated
        ? `保存しました（外国人情報の${updatedParts.join("・")}も更新）。`
        : "保存しました。";
      if (
        app.workerId &&
        visaAtGrant === ORIENTATION_TARGET_VISA &&
        employmentStartOn
      ) {
        // すでに雇用が始まっている資格変更（雇用開始日＜在留許可日）は、
        // 特定技能としての許可日から予定日を数える
        const orientationBase = orientationBaseDate(
          employmentStartOn,
          form.grantedPermitDate || app.grantedPermitDate,
        );
        await ensureOrientationForApplication(createClient(), {
          applicationId: app.id,
          workerId: app.workerId,
          organizationId: app.organizationId,
          scheduledOn: orientationDate(orientationBase),
          employmentStartOn,
        });
        setVisaSaved(
          `${savedMsg}生活オリエンテーション（予定日 ${orientationDate(orientationBase)}${
            orientationBase !== employmentStartOn ? "・在留許可日から起算" : ""
          }）を未実施で登録しました。`,
        );
      } else {
        setVisaSaved(savedMsg);
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
              href={messengerWebUrl(messengerLink)}
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

          {/* 許可後の住所変更（在留カードの住所が今の登録と違うとき） */}
          {app.workerId && (
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted">
                <MapPin size={14} />
                住所（在留カードの記載と違うとき）
              </p>
              <p className="mb-2 text-xs">
                今の登録：
                <span className="font-bold">{currentAddress || "未登録"}</span>
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted">新しい住所</span>
                  <input
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="例：熊本県八代市◯◯町1-2-3 ◯◯アパート101"
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-muted">転入日（住所歴に残ります）</span>
                  <input
                    type="date"
                    value={movedOnValue}
                    onChange={(e) => setMovedOn(e.target.value)}
                    className={`${INPUT_CLASS} sm:w-44`}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void saveAddress()}
                  disabled={addressSaving || !newAddress.trim()}
                  className="min-h-[44px] shrink-0 rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground disabled:opacity-50"
                >
                  {addressSaving ? "保存中…" : addressSaved ? "更新しました" : "住所を更新"}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted">
                住所歴に「転入」として残り、外国人情報の住所も新しい住所になります。
                転入日は在留許可日を初期表示しています（違うときは直してください）。
              </p>
            </div>
          )}

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

          {/* 雇用開始日・在留資格（特定技能1号で生活オリエンテーション自動登録）。
              元の登録内容を自動表示し、同じ所属機関の資格変更なら雇用開始日の入力を省く */}
          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 text-sm font-bold">雇用開始日・在留資格</p>
            {visaSaved && (
              <p className="mb-2 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{visaSaved}</p>
            )}

            {/* いまの登録内容（元の在留カードの資格・所属機関・そのときの雇用開始日） */}
            {workerNow && (
              <dl className="mb-3 grid grid-cols-1 gap-x-3 gap-y-2 rounded-xl bg-background p-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-bold text-muted">元の在留資格</dt>
                  <dd className="font-bold">{workerNow.residence_status || "未登録"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-muted">現在の所属機関</dt>
                  <dd className="font-bold">{workerNow.orgName || "未所属"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-muted">そのときの雇用開始日</dt>
                  <dd className="font-bold tabular-nums">
                    {existingStart || workerNow.employment_start_on || "未登録"}
                  </dd>
                </div>
              </dl>
            )}

            {/* どう操作すればよいかの案内（同じ所属機関の資格変更かどうかで変わる） */}
            {sameOrgChange ? (
              <div className="mb-3 rounded-xl bg-brand/10 p-3 text-sm leading-relaxed">
                <p className="font-bold text-brand">
                  同じ所属機関（{app.organizationName || workerNow?.orgName}）での資格変更です。
                  雇用開始日の入力は不要です（{existingStart} で登録済み）。
                </p>
                <p className="mt-1">
                  下の在留資格で「{ORIENTATION_TARGET_VISA}」を選んで保存するだけで、
                  生活オリエンテーションの予定日は特定技能としての在留許可日
                  {form.grantedPermitDate || app.grantedPermitDate ? (
                    <>
                      （{form.grantedPermitDate || app.grantedPermitDate}）から2週間後の日曜（
                      <span className="font-bold tabular-nums">
                        {orientationDate(
                          orientationBaseDate(
                            existingStart,
                            form.grantedPermitDate || app.grantedPermitDate,
                          ),
                        )}
                      </span>
                      ）に自動でなります。
                    </>
                  ) : (
                    <>から数えます。先に上の「在留許可日」を入れてください。</>
                  )}
                </p>
              </div>
            ) : (
              <p className="mb-3 rounded-xl bg-background p-3 text-sm leading-relaxed text-muted">
                これから雇用が始まる人は「雇用開始日（予定でも可）」を入れてください。
                「{ORIENTATION_TARGET_VISA}」を選んで保存すると、雇用開始日から2週間後の日曜を
                予定日として生活オリエンテーションに未実施で登録します。
              </p>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* 同じ所属機関の資格変更では雇用開始日は入力済みのため、入力欄を出さない */}
              {!sameOrgChange && (
                <Labeled label="雇用開始日（予定でも可）">
                  <input type="date" value={employmentStartOn} onChange={(e) => setEmploymentStartOn(e.target.value)} className={INPUT_CLASS} />
                </Labeled>
              )}
              <Labeled label="今回の許可の在留資格">
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
            <p className="mt-1.5 text-xs text-muted">
              保存すると、外国人の「現在の在留資格」と所属機関別の雇用開始日も自動で更新されます。
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
