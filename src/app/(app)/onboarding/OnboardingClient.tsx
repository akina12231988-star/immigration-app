"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  Paperclip,
  Save,
  TriangleAlert,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { todayStr } from "@/lib/ssw/calc";
import {
  buildOnboardingMail,
  DOC_REFERENCE_LINKS,
  onboardingDocDefs,
  type OnboardingDocDef,
} from "@/lib/onboarding";
import {
  getOnboardingRecord,
  listOnboardingDocs,
  upsertOnboardingRecord,
  upsertOnboardingDocStatuses,
} from "@/lib/supabase/queries/onboarding";
import {
  createOnboardingDocTicket,
  registerOnboardingDocFile,
  getOnboardingDocPreviewUrl,
} from "./actions";
import type { WorkerForOnboarding } from "@/lib/supabase/queries/workers";
import type { OnboardingDocStatus, OnboardingDocumentRow } from "@/types/db";

const INPUT =
  "min-h-[42px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";
const LABEL = "text-xs font-bold text-muted";

const STATUS_OPTIONS: { value: OnboardingDocStatus; label: string }[] = [
  { value: "添付", label: "✅ 添付資料" },
  { value: "後送", label: "⚠️ 後送" },
  { value: "未入手", label: "❌ 未入手" },
  { value: "対象外", label: "— 対象外" },
];

const STATUS_BORDER: Record<OnboardingDocStatus, string> = {
  添付: "border-l-4 border-l-status-approved-fg",
  後送: "border-l-4 border-l-status-notice-fg",
  未入手: "border-l-4 border-l-seal",
  対象外: "border-l-4 border-l-border opacity-60",
};

interface DocState {
  status: OnboardingDocStatus;
  note: string;
  dueOn: string; // 後送: いつまでに送るか
  receivedOn: string; // 後送: 本人が送ってきた日
  row: OnboardingDocumentRow | null; // 保存済み行（ファイル情報含む）
}

function emptyDocState(): DocState {
  return { status: "添付", note: "", dueOn: "", receivedOn: "", row: null };
}

function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const show = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2600);
  };
  const node = msg ? (
    <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-bold text-background shadow-lg">
      {msg}
    </div>
  ) : null;
  return [show, node] as const;
}

export function OnboardingClient({
  workers,
  organizations,
  initialWorkerId,
  canEdit,
}: {
  workers: WorkerForOnboarding[];
  organizations: { id: string; name: string }[];
  initialWorkerId: string;
  canEdit: boolean;
}) {
  const today = todayStr();
  const defs = useMemo(() => onboardingDocDefs(today), [today]);

  const [workerId, setWorkerId] = useState(
    workers.some((w) => w.id === initialWorkerId) ? initialWorkerId : "",
  );
  const worker = workers.find((w) => w.id === workerId) ?? null;

  // 基本情報フォーム
  const [orgName, setOrgName] = useState("");
  const [honorific, setHonorific] = useState<"御中" | "様">("御中");
  const [startOn, setStartOn] = useState("");
  const [permitOn, setPermitOn] = useState("");
  const [office, setOffice] = useState("");
  const [residence, setResidence] = useState("");
  const [sender, setSender] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const [gmailLink, setGmailLink] = useState("");
  const [mailSentOn, setMailSentOn] = useState("");

  const [docs, setDocs] = useState<Record<string, DocState>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mail, setMail] = useState("");
  const [copied, setCopied] = useState(false);
  const [showToast, toastNode] = useToast();

  const loadWorker = useCallback(
    async (id: string) => {
      const w = workers.find((x) => x.id === id);
      if (!w) return;
      setLoading(true);
      setError(null);
      setMail("");
      try {
        const supabase = createClient();
        const [record, rows] = await Promise.all([
          getOnboardingRecord(supabase, id),
          listOnboardingDocs(supabase, id),
        ]);
        // 保存済みがあればそれを、無ければ外国人情報から初期値を入れる
        const orgFromWorker = w.current_organization_id
          ? (organizations.find((o) => o.id === w.current_organization_id)?.name ?? "")
          : "";
        setOrgName(record?.org_name ?? orgFromWorker);
        setHonorific(record?.org_honorific ?? "御中");
        setStartOn(record?.employment_start_on ?? w.employment_start_on ?? "");
        setPermitOn(record?.permit_on ?? w.residence_permit_date ?? "");
        setOffice(record?.office ?? w.assigned_office ?? "");
        setResidence(record?.residence ?? w.residence_note ?? "");
        setSender(record?.sender ?? "");
        setExtraNote(record?.extra_note ?? "");
        setGmailLink(record?.gmail_link ?? "");
        setMailSentOn(record?.mail_sent_on ?? "");

        const next: Record<string, DocState> = {};
        for (const def of defs) {
          const row = rows.find((r) => r.doc_key === def.key) ?? null;
          next[def.key] = row
            ? {
                status: row.status,
                note: row.note,
                dueOn: row.due_on ?? "",
                receivedOn: row.received_on ?? "",
                row,
              }
            : emptyDocState();
        }
        setDocs(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    },
    [workers, organizations, defs],
  );

  useEffect(() => {
    if (!workerId) return;
    // レンダー中の同期setStateを避けるため、読み込みはマイクロタスクで開始する
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) return loadWorker(workerId);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  const setDoc = (key: string, patch: Partial<DocState>) =>
    setDocs((prev) => ({ ...prev, [key]: { ...(prev[key] ?? emptyDocState()), ...patch } }));

  const generate = () => {
    if (!worker) return;
    setMail(
      buildOnboardingMail({
        workerName: worker.name,
        orgName,
        honorific,
        employmentStartOn: startOn || null,
        office,
        residence,
        sender,
        extraNote,
        docs: defs.map((def) => {
          const d = docs[def.key] ?? emptyDocState();
          return { num: def.num, label: def.label, status: d.status, note: d.note };
        }),
      }),
    );
    setCopied(false);
  };

  const copyMail = async () => {
    if (!mail) return;
    try {
      await navigator.clipboard.writeText(mail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };

  const save = async () => {
    if (!worker) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      await upsertOnboardingRecord(supabase, {
        worker_id: worker.id,
        org_name: orgName.trim(),
        org_honorific: honorific,
        employment_start_on: startOn || null,
        permit_on: permitOn || null,
        office: office.trim(),
        residence: residence.trim(),
        sender: sender.trim(),
        extra_note: extraNote.trim(),
        gmail_link: gmailLink.trim(),
        mail_sent_on: mailSentOn || null,
      });
      await upsertOnboardingDocStatuses(
        supabase,
        defs.map((def) => {
          const d = docs[def.key] ?? emptyDocState();
          return {
            worker_id: worker.id,
            doc_key: def.key,
            label: def.label,
            sort_no: def.num,
            status: d.status,
            note: d.note.trim(),
            due_on: d.status === "後送" ? d.dueOn || null : null,
            received_on: d.status === "後送" ? d.receivedOn || null : null,
          };
        }),
      );
      await loadWorker(worker.id);
      showToast("保存しました");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const pendingDocs = defs.filter((d) => docs[d.key]?.status === "後送");

  return (
    <div className="space-y-4">
      {toastNode}
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* 外国人の選択 */}
      <Card className="p-4">
        <p className={`${LABEL} mb-1.5`}>外国人を選択</p>
        <Combobox
          options={workers.map((w) => ({ id: w.id, label: w.name }))}
          value={workerId}
          onChange={setWorkerId}
          placeholder="氏名で検索"
        />
        {loading && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <Loader2 size={13} className="animate-spin" />
            読み込み中…
          </p>
        )}
      </Card>

      {worker && !loading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
          {/* 左: 入力 */}
          <div className="space-y-4">
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-bold text-muted">基本情報</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className={LABEL}>所属機関名（宛名）</span>
                  <div className="flex gap-2">
                    <input
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="例: 有限会社 國崎青果"
                      className={`${INPUT} min-w-0 flex-1`}
                    />
                    <select
                      value={honorific}
                      onChange={(e) => setHonorific(e.target.value as "御中" | "様")}
                      className={`${INPUT} w-24! shrink-0`}
                    >
                      <option value="御中">御中</option>
                      <option value="様">様</option>
                    </select>
                  </div>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={LABEL}>雇用開始年月日</span>
                  <input type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)} className={INPUT} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={LABEL}>在留許可日</span>
                  <input type="date" value={permitOn} onChange={(e) => setPermitOn(e.target.value)} className={INPUT} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={LABEL}>配属先営業所</span>
                  <input value={office} onChange={(e) => setOffice(e.target.value)} placeholder="例: 熊本" className={INPUT} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={LABEL}>居住地</span>
                  <input value={residence} onChange={(e) => setResidence(e.target.value)} placeholder="例: 社宅" className={INPUT} />
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className={LABEL}>送信者名</span>
                  <input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="例: 野口" className={INPUT} />
                </label>
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="mb-1 text-sm font-bold text-muted">書類ステータス</h2>
              <p className="mb-3 text-[11px] text-muted">
                アップロードしたファイルは外国人詳細ページにも保存され、そこから選んでダウンロードできます。
              </p>
              <div className="space-y-2">
                {defs.map((def) => (
                  <DocRow
                    key={def.key}
                    def={def}
                    state={docs[def.key] ?? emptyDocState()}
                    workerId={worker.id}
                    canEdit={canEdit}
                    onChange={(patch) => setDoc(def.key, patch)}
                    onUploaded={() => loadWorker(worker.id)}
                    onError={setError}
                  />
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="mb-2 text-sm font-bold text-muted">追記事項</h2>
              <textarea
                value={extraNote}
                onChange={(e) => setExtraNote(e.target.value)}
                placeholder="例: 在留カード裏面は転入完了後に送付予定です。"
                rows={3}
                className={`${INPUT} min-h-[70px] py-2 leading-relaxed`}
              />
            </Card>

            <Button fullWidth icon={<Mail size={18} />} onClick={generate}>
              メール文を生成
            </Button>
            {canEdit && (
              <Button fullWidth variant="secondary" icon={<Save size={18} />} disabled={saving} onClick={save}>
                {saving ? "保存中…" : "保存する（書類ステータス・Gmailリンク）"}
              </Button>
            )}
          </div>

          {/* 右: 生成結果・Gmailリンク・後送 */}
          <div className="space-y-4">
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-bold text-muted">生成されたメール文</h2>
                <button
                  type="button"
                  onClick={copyMail}
                  disabled={!mail}
                  className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-brand-foreground disabled:opacity-40 ${
                    copied ? "bg-status-approved-fg" : "bg-brand"
                  }`}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "コピーしました" : "コピー"}
                </button>
              </div>
              {mail ? (
                <pre className="whitespace-pre-wrap rounded-xl border border-border bg-background p-4 font-sans text-sm leading-relaxed">
                  {mail}
                </pre>
              ) : (
                <p className="rounded-xl bg-background p-6 text-center text-sm text-muted">
                  左側で情報を入力し「メール文を生成」を押してください。
                </p>
              )}
            </Card>

            {/* Gmailリンク（最初に送ったメール） */}
            <Card className="p-4">
              <h2 className="mb-1 text-sm font-bold text-muted">Gmailリンク</h2>
              <p className="mb-3 text-[11px] leading-relaxed text-muted">
                Gmailで最初に送ったメールのリンクを貼っておくと、後送分を同じスレッドに返信で送れます。
                （Gmailでメールを開き、URLをコピーして貼り付け）
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                <input
                  value={gmailLink}
                  onChange={(e) => setGmailLink(e.target.value)}
                  placeholder="https://mail.google.com/mail/u/0/#sent/..."
                  className={INPUT}
                  readOnly={!canEdit}
                />
                {gmailLink.trim() && (
                  <a
                    href={gmailLink.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground"
                  >
                    <ExternalLink size={14} />
                    Gmailで開く
                  </a>
                )}
              </div>
              <label className="mt-3 flex flex-col gap-1 sm:w-56">
                <span className={LABEL}>最初にメールを送った日</span>
                <input
                  type="date"
                  value={mailSentOn}
                  onChange={(e) => setMailSentOn(e.target.value)}
                  className={INPUT}
                  readOnly={!canEdit}
                />
              </label>
            </Card>

            {/* 後送予定の期日・受領 */}
            {pendingDocs.length > 0 && (
              <Card className="border-status-notice-fg/40 p-4">
                <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-status-notice-fg">
                  <TriangleAlert size={15} />
                  後送予定書類の期日
                </h2>
                <p className="mb-3 text-[11px] leading-relaxed text-muted">
                  期日を設定して保存すると、本人から届くまでホームにアラートが表示されます。
                  届いたら「本人から受領」にチェックしてください。
                </p>
                <div className="space-y-2">
                  {pendingDocs.map((def) => {
                    const d = docs[def.key] ?? emptyDocState();
                    return (
                      <div
                        key={def.key}
                        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-background px-3 py-2.5"
                      >
                        <span className="min-w-0 flex-1 text-sm font-bold">
                          {def.num}. {def.label}
                        </span>
                        <label className="flex items-center gap-1.5 text-xs text-muted">
                          期日
                          <input
                            type="date"
                            value={d.dueOn}
                            onChange={(e) => setDoc(def.key, { dueOn: e.target.value })}
                            disabled={!canEdit}
                            className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-xs focus:border-brand focus:outline-none"
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-xs font-bold">
                          <input
                            type="checkbox"
                            checked={!!d.receivedOn}
                            onChange={(e) => setDoc(def.key, { receivedOn: e.target.checked ? today : "" })}
                            disabled={!canEdit}
                            className="h-4 w-4"
                          />
                          本人から受領
                          {d.receivedOn && <span className="font-medium text-muted">（{d.receivedOn}）</span>}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// 書類1行: ステータス・備考・ファイルアップロード
function DocRow({
  def,
  state,
  workerId,
  canEdit,
  onChange,
  onUploaded,
  onError,
}: {
  def: OnboardingDocDef;
  state: DocState;
  workerId: string;
  canEdit: boolean;
  onChange: (patch: Partial<DocState>) => void;
  onUploaded: () => void;
  onError: (m: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const uploaded = !!state.row?.storage_path;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { blob, mimeType, fileName } = await compressImage(file);
      const ticket = await createOnboardingDocTicket(workerId, def.key, fileName, mimeType);
      if (!ticket.ok) throw new Error(ticket.message);
      const { error } = await createClient()
        .storage.from("app-files")
        .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
      if (error) throw new Error(`アップロードに失敗しました: ${error.message}`);
      const result = await registerOnboardingDocFile(
        workerId,
        def.key,
        def.label,
        def.num,
        ticket.path,
        fileName,
        mimeType,
      );
      if (!result.ok) throw new Error(result.message);
      onUploaded();
    } catch (err) {
      onError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function openPreview() {
    if (!state.row) return;
    const res = await getOnboardingDocPreviewUrl(state.row.id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else onError(res.message);
  }

  return (
    <div className={`rounded-xl border border-border bg-background p-2.5 ${STATUS_BORDER[state.status]}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="min-w-0 flex-1 text-sm">
          <span className="mr-1 text-[11px] font-bold text-muted">{def.num}.</span>
          {def.label}
          {DOC_REFERENCE_LINKS[def.key] && (
            <a
              href={DOC_REFERENCE_LINKS[def.key]}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 inline-flex items-center gap-0.5 align-middle text-[11px] font-bold text-brand hover:underline"
            >
              <ExternalLink size={11} />
              国税庁の様式ページ
            </a>
          )}
        </span>
        <select
          value={state.status}
          onChange={(e) => onChange({ status: e.target.value as OnboardingDocStatus })}
          disabled={!canEdit}
          className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-xs focus:border-brand focus:outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {canEdit && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className={`flex min-h-[36px] items-center gap-1 rounded-lg border px-2.5 text-[11px] font-bold disabled:opacity-50 ${
              uploaded
                ? "border-status-approved-fg text-status-approved-fg"
                : "border-dashed border-brand text-brand"
            }`}
          >
            {busy ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                保存中…
              </>
            ) : uploaded ? (
              <>
                <Check size={12} />
                保存済
              </>
            ) : (
              <>
                <Paperclip size={12} />
                添付
              </>
            )}
          </button>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <input
          value={state.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="備考（メール本文に「→備考」で載ります）"
          readOnly={!canEdit}
          className="min-h-[34px] min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-xs focus:border-brand focus:outline-none"
        />
        {uploaded && (
          <button type="button" onClick={openPreview} className="text-[11px] font-bold text-brand">
            {state.row?.file_name || "ファイルを開く"}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
