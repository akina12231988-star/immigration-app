"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  FileText,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  Mail,
  Paperclip,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { todayStr } from "@/lib/ssw/calc";
import {
  DOC_REFERENCE_LINKS,
  buildFollowupMail,
  buildOnboardingMail,
  followupMailDocs,
  formatDateSlash,
  isPendingStatus,
  isStartDateCorrectionNeeded,
  onboardingDocDefs,
  onboardingDownloadName,
  onboardingMailNumbers,
  onboardingMailSubject,
  onboardingPdfName,
  pendingDaysElapsed,
  startDateCorrectionReason,
  type FollowupKind,
  type OnboardingDocDef,
} from "@/lib/onboarding";
import {
  deleteOnboardingFollowup,
  getOnboardingRecord,
  insertOnboardingFollowup,
  listOnboardingDocs,
  listOnboardingFollowups,
  upsertOnboardingRecord,
  upsertOnboardingDocStatuses,
} from "@/lib/supabase/queries/onboarding";
import {
  clearOnboardingDocFile,
  createOnboardingDocTicket,
  registerOnboardingDocFile,
  getOnboardingDocPreviewUrl,
  getOnboardingDocDownloadUrl,
} from "./actions";
import { downloadBlob, toPdfBlob } from "@/lib/onboarding-pdf";
import type { WorkerForOnboarding } from "@/lib/supabase/queries/workers";
import type {
  OnboardingDocStatus,
  OnboardingDocumentRow,
  OnboardingFollowupRow,
} from "@/types/db";

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
  dueOn: string; // 後送・未入手: いつまでに送るか
  receivedOn: string; // 後送・未入手: 本人が送ってきた日
  row: OnboardingDocumentRow | null; // 保存済み行（ファイル情報含む）
}

// ファイル未添付の書類は「添付資料」にできないため、初期値は「未入手」
function emptyDocState(): DocState {
  return { status: "未入手", note: "", dueOn: "", receivedOn: "", row: null };
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
  // 前回送信時の雇用開始日（onboarding_records のスナップショット。訂正検知に使う）
  const [recordStartOn, setRecordStartOn] = useState("");

  // 訂正・追送モード: 初回送付後に訂正版・追加資料を送るとき
  const [mode, setMode] = useState<"initial" | "followup">("initial");
  const [fuKinds, setFuKinds] = useState<Record<string, "" | FollowupKind>>({});
  const [fuNotes, setFuNotes] = useState<Record<string, string>>({});
  const [fuReason, setFuReason] = useState("");
  const [fuSentOn, setFuSentOn] = useState(today);
  const [fuSaving, setFuSaving] = useState(false);
  const [followups, setFollowups] = useState<OnboardingFollowupRow[]>([]);

  const [docs, setDocs] = useState<Record<string, DocState>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mail, setMail] = useState("");
  const [copied, setCopied] = useState(false);
  const [downloadingAttachments, setDownloadingAttachments] = useState(false);
  const [showToast, toastNode] = useToast();

  // 外国人の保存内容を読み込む。ファイル添付後の再読み込みでは
  // 入力中の訂正・追送の選択（区分・備考・理由）を消さないよう keepFollowup を渡す
  const loadWorker = useCallback(
    async (id: string, options: { keepFollowup?: boolean } = {}) => {
      const w = workers.find((x) => x.id === id);
      if (!w) return;
      setLoading(true);
      setError(null);
      setMail("");
      try {
        const supabase = createClient();
        const [record, rows, fus] = await Promise.all([
          getOnboardingRecord(supabase, id),
          listOnboardingDocs(supabase, id),
          // onboarding_followups 未作成でも画面自体は使えるように握りつぶす
          listOnboardingFollowups(supabase, id).catch(() => []),
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
        setRecordStartOn(record?.employment_start_on ?? "");
        setFollowups(fus);
        if (!options.keepFollowup) {
          setFuKinds({});
          setFuNotes({});
          setFuReason("");
          setFuSentOn(today);
        }

        const next: Record<string, DocState> = {};
        for (const def of defs) {
          const row = rows.find((r) => r.doc_key === def.key) ?? null;
          next[def.key] = row
            ? {
                // ファイルが無いのに「添付」の行（旧データ）は「未入手」として扱う
                status: row.status === "添付" && !row.storage_path ? "未入手" : row.status,
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
    [workers, organizations, defs, today],
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

  // メール本文・添付ファイル名で使う番号（添付資料→後送→未入手の順の通し番号）
  const mailNums = useMemo(
    () => onboardingMailNumbers(defs.map((def) => (docs[def.key] ?? emptyDocState()).status)),
    [defs, docs],
  );

  // 訂正・追送: 今回送る書類（訂正版→追加の順の通し番号つき）
  const fuSelectedDefs = defs.filter((def) => fuKinds[def.key]);
  const fuMailDocs = followupMailDocs(
    fuSelectedDefs.map((def) => ({
      label: def.label,
      kind: fuKinds[def.key] as FollowupKind,
      note: (fuNotes[def.key] ?? "").trim(),
    })),
  );
  const fuNumByLabel = new Map(fuMailDocs.map((d) => [d.label, d.num]));

  // 雇用開始日の訂正が必要か（初回メール送信後に外国人情報の雇用開始日が変わった）
  const correctionNeeded = worker
    ? isStartDateCorrectionNeeded({
        recordStartOn: recordStartOn || null,
        workerStartOn: worker.employment_start_on,
        mailSentOn: mailSentOn || null,
      })
    : false;

  // 訂正・追送モードに切り替えて、雇用開始日訂正の理由を自動入力する
  const startCorrectionMail = () => {
    if (!worker) return;
    setMode("followup");
    setFuReason(startDateCorrectionReason(recordStartOn || null, worker.employment_start_on));
    setMail("");
  };

  const generate = () => {
    if (!worker) return;
    if (mode === "followup") {
      setMail(
        buildFollowupMail({
          workerName: worker.name,
          orgName,
          honorific,
          reason: fuReason,
          docs: fuSelectedDefs.map((def) => ({
            label: def.label,
            kind: fuKinds[def.key] as FollowupKind,
            note: (fuNotes[def.key] ?? "").trim(),
          })),
          extraNote,
          sender,
        }),
      );
      setCopied(false);
      return;
    }
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
          return { label: def.label, status: d.status, note: d.note };
        }),
      }),
    );
    setCopied(false);
  };

  // メールの件名（外国人を選べばすぐ出す。生成を押さなくてもコピーできる）
  const subject = worker ? onboardingMailSubject(worker.name) : "";
  const [subjectCopied, setSubjectCopied] = useState(false);
  const copySubject = async () => {
    if (!subject) return;
    try {
      await navigator.clipboard.writeText(subject);
      setSubjectCopied(true);
      setTimeout(() => setSubjectCopied(false), 2000);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
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

  // 「添付資料」に選んだ書類のうちファイルがあるもの
  const attachableDocs = defs.filter(
    (def) => docs[def.key]?.status === "添付" && docs[def.key]?.row?.storage_path,
  );

  // 添付資料を画像もPDF化してダウンロードする。
  // ファイル名の番号はメール本文と同じ振り直した通し番号（1始まり）を使う
  const downloadAttachments = async () => {
    if (attachableDocs.length === 0 || !worker) return;
    setDownloadingAttachments(true);
    setError(null);
    try {
      for (const def of attachableDocs) {
        const row = docs[def.key]?.row;
        if (!row) continue;
        const num = mailNums[defs.findIndex((d) => d.key === def.key)] ?? def.num;
        const res = await getOnboardingDocDownloadUrl(row.id);
        if (!res.ok) throw new Error(`${def.label}: ${res.message}`);
        const bytes = await fetch(res.url).then((r) => r.arrayBuffer());
        const { blob, converted } = await toPdfBlob(bytes, res.mimeType);
        downloadBlob(
          blob,
          converted
            ? onboardingPdfName(num, def.label, worker.name)
            : onboardingDownloadName(num, def.label, worker.name, row.file_name),
        );
        // 連続ダウンロードがブラウザにブロックされないよう少し間隔をあける
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ダウンロードに失敗しました");
    } finally {
      setDownloadingAttachments(false);
    }
  };

  // 訂正・追送で送る書類のうちファイルがあるもの（訂正版はアップロードで差し替え済みの想定）
  const fuAttachableDefs = fuSelectedDefs.filter((def) => docs[def.key]?.row?.storage_path);

  // 訂正・追送の添付をPDFでダウンロード（番号は訂正版→追加の通し番号）
  const downloadFollowupAttachments = async () => {
    if (fuAttachableDefs.length === 0 || !worker) return;
    setDownloadingAttachments(true);
    setError(null);
    try {
      for (const def of fuAttachableDefs) {
        const row = docs[def.key]?.row;
        if (!row) continue;
        const num = fuNumByLabel.get(def.label) ?? 1;
        const res = await getOnboardingDocDownloadUrl(row.id);
        if (!res.ok) throw new Error(`${def.label}: ${res.message}`);
        const bytes = await fetch(res.url).then((r) => r.arrayBuffer());
        const { blob, converted } = await toPdfBlob(bytes, res.mimeType);
        downloadBlob(
          blob,
          converted
            ? onboardingPdfName(num, def.label, worker.name)
            : onboardingDownloadName(num, def.label, worker.name, row.file_name),
        );
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ダウンロードに失敗しました");
    } finally {
      setDownloadingAttachments(false);
    }
  };

  // 訂正・追送の送付を履歴に記録する。雇用開始日の訂正なら記録のスナップショットも
  // 現在の値に更新して、訂正アラートを解除する
  const recordFollowup = async () => {
    if (!worker || fuMailDocs.length === 0) return;
    setFuSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const row = await insertOnboardingFollowup(supabase, {
        worker_id: worker.id,
        sent_on: fuSentOn || null,
        reason: fuReason.trim(),
        docs: fuMailDocs.map(({ label, kind, note }) => ({ label, kind, note })),
      });
      setFollowups((prev) => [row, ...prev]);
      // 雇用開始日の訂正を送ったら、送信時スナップショットを現在の値に合わせる
      if (correctionNeeded && worker.employment_start_on) {
        await upsertOnboardingRecord(supabase, {
          worker_id: worker.id,
          org_name: orgName.trim(),
          org_honorific: honorific,
          employment_start_on: worker.employment_start_on,
          permit_on: permitOn || null,
          office: office.trim(),
          residence: residence.trim(),
          sender: sender.trim(),
          extra_note: extraNote.trim(),
          gmail_link: gmailLink.trim(),
          mail_sent_on: mailSentOn || null,
        });
        setRecordStartOn(worker.employment_start_on);
        setStartOn(worker.employment_start_on);
      }
      showToast("訂正・追送を記録しました");
    } catch (err) {
      setError(err instanceof Error ? err.message : "記録に失敗しました");
    } finally {
      setFuSaving(false);
    }
  };

  const removeFollowup = async (row: OnboardingFollowupRow) => {
    if (!window.confirm(`${row.sent_on ?? ""} の訂正・追送の記録を削除します。よろしいですか？`)) return;
    try {
      await deleteOnboardingFollowup(createClient(), row.id);
      setFollowups((prev) => prev.filter((f) => f.id !== row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
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
          const pending = isPendingStatus(d.status);
          return {
            worker_id: worker.id,
            doc_key: def.key,
            label: def.label,
            sort_no: def.num,
            status: d.status,
            note: d.note.trim(),
            due_on: pending ? d.dueOn || null : null,
            received_on: pending ? d.receivedOn || null : null,
            // 後送・未入手にした日。すでに後送・未入手だった場合は起点を引き継ぐ
            pending_since: pending ? (d.row?.pending_since ?? today) : null,
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

  const pendingDocs = defs.filter((d) => isPendingStatus(docs[d.key]?.status ?? "対象外"));

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
        <>
          {/* 雇用開始日の訂正アラート: 初回送信後に外国人情報の雇用開始日が変わった */}
          {correctionNeeded && (
            <div className="rounded-2xl border-2 border-seal bg-seal/10 p-4">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-seal">
                <TriangleAlert size={16} />
                雇用開始日が前回送信時から変わっています
              </p>
              <p className="mb-2 text-xs leading-relaxed text-seal/90">
                前回送信時 {formatDateSlash(recordStartOn || null)} → 現在の外国人情報{" "}
                {formatDateSlash(worker.employment_start_on)}。
                雇用条件書・労働者名簿などの訂正版の送付が必要です。
              </p>
              <button
                type="button"
                onClick={startCorrectionMail}
                className="rounded-lg bg-seal px-3.5 py-2 text-xs font-bold text-seal-foreground"
              >
                訂正・追送メールを作成
              </button>
            </div>
          )}

          {/* モード切替: 初回送付 / 訂正・追送 */}
          <div className="flex items-center gap-2">
            {(
              [
                ["initial", "初回送付"],
                ["followup", `訂正・追送${followups.length > 0 ? `（履歴${followups.length}件）` : ""}`],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setMail("");
                }}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
                  mode === m
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-border bg-surface text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
          {/* 左: 入力 */}
          <div className="space-y-4">
            {mode === "followup" && (
              <>
                <Card className="p-4">
                  <h2 className="mb-3 text-sm font-bold text-muted">宛名・送信者</h2>
                  <div className="grid grid-cols-1 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className={LABEL}>所属機関名（宛名）</span>
                      <div className="flex gap-2">
                        <input
                          value={orgName}
                          onChange={(e) => setOrgName(e.target.value)}
                          className={`${INPUT} min-w-0 flex-1`}
                        />
                        <div className="w-24 shrink-0">
                          <select
                            value={honorific}
                            onChange={(e) => setHonorific(e.target.value as "御中" | "様")}
                            className={INPUT}
                          >
                            <option value="御中">御中</option>
                            <option value="様">様</option>
                          </select>
                        </div>
                      </div>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={LABEL}>送信者名</span>
                      <input value={sender} onChange={(e) => setSender(e.target.value)} className={INPUT} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={LABEL}>訂正・追送の理由（本文に入ります）</span>
                      <input
                        value={fuReason}
                        onChange={(e) => setFuReason(e.target.value)}
                        placeholder="例: 雇用開始年月日の訂正（2026/08/01 → 2026/08/05）"
                        className={INPUT}
                      />
                    </label>
                  </div>
                </Card>

                <Card className="p-4">
                  <h2 className="mb-1 text-sm font-bold text-muted">訂正・追送する書類</h2>
                  <p className="mb-3 text-[11px] leading-relaxed text-muted">
                    今回送る書類の「添付」からファイルを選ぶと、保存データがある書類は「訂正版」、
                    初めての書類は「追加」に自動で切り替わります（手動での変更も可）。
                    添付したファイルは外国人詳細の保存データにも反映されます。番号は「訂正版→追加」の順の通し番号です。
                  </p>
                  <div className="space-y-2">
                    {defs.map((def) => (
                      <FollowupDocRow
                        key={def.key}
                        def={def}
                        num={fuKinds[def.key] ? (fuNumByLabel.get(def.label) ?? null) : null}
                        kind={fuKinds[def.key] ?? ""}
                        note={fuNotes[def.key] ?? ""}
                        state={docs[def.key] ?? emptyDocState()}
                        workerId={worker.id}
                        canEdit={canEdit}
                        onKind={(v) => setFuKinds((prev) => ({ ...prev, [def.key]: v }))}
                        onNote={(v) => setFuNotes((prev) => ({ ...prev, [def.key]: v }))}
                        onUploaded={() => loadWorker(worker.id, { keepFollowup: true })}
                        onError={setError}
                      />
                    ))}
                  </div>
                  {fuAttachableDefs.length > 0 && (
                    <button
                      type="button"
                      onClick={downloadFollowupAttachments}
                      disabled={downloadingAttachments}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-foreground disabled:opacity-40"
                    >
                      {downloadingAttachments ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Download size={15} />
                      )}
                      送る書類をPDFでダウンロード（{fuAttachableDefs.length}件）
                    </button>
                  )}
                </Card>
              </>
            )}

            {mode === "initial" && (
            <>
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
                    <div className="w-24 shrink-0">
                      <select
                        value={honorific}
                        onChange={(e) => setHonorific(e.target.value as "御中" | "様")}
                        className={INPUT}
                      >
                        <option value="御中">御中</option>
                        <option value="様">様</option>
                      </select>
                    </div>
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
                ファイルを添付すると自動で「添付資料」になります。未添付の書類は後送・未入手・対象外から選んでください。
                番号はメール本文と同じ「添付資料→後送→未入手」の順の通し番号です。
                アップロードしたファイルは外国人詳細ページにも保存され、そこから選んでダウンロードできます。
                「添付」を押すほか、書類の行にファイルをドラッグ＆ドロップしても添付できます。
              </p>
              <div className="space-y-2">
                {defs.map((def, i) => (
                  <DocRow
                    key={def.key}
                    def={def}
                    mailNum={mailNums[i]}
                    state={docs[def.key] ?? emptyDocState()}
                    workerId={worker.id}
                    canEdit={canEdit}
                    onChange={(patch) => setDoc(def.key, patch)}
                    onUploaded={() => loadWorker(worker.id)}
                    onError={setError}
                  />
                ))}
              </div>
              {attachableDocs.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={downloadAttachments}
                    disabled={downloadingAttachments}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-foreground disabled:opacity-40"
                  >
                    {downloadingAttachments ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Download size={15} />
                    )}
                    「添付資料」をPDFでダウンロード（{attachableDocs.length}件）
                  </button>
                  <p className="mt-1.5 text-[11px] text-muted">
                    画像もPDFに変換し、ファイル名は「番号＋添付データ名＋外国人の氏名.pdf」で保存されます。
                    メール作成時にこのPDFを添付してください。
                  </p>
                </>
              )}
            </Card>
            </>
            )}

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
            {mode === "initial" && canEdit && (
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
              {/* 件名（Gmailの件名欄にそのまま貼る） */}
              <div className="mb-3">
                <p className="mb-1 text-[11px] font-bold text-muted">件名</p>
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
                    {subject || "外国人を選ぶと出ます"}
                  </p>
                  <button
                    type="button"
                    onClick={copySubject}
                    disabled={!subject}
                    className={`flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-brand-foreground disabled:opacity-40 ${
                      subjectCopied ? "bg-status-approved-fg" : "bg-brand"
                    }`}
                  >
                    {subjectCopied ? <Check size={13} /> : <Copy size={13} />}
                    {subjectCopied ? "コピーしました" : "コピー"}
                  </button>
                </div>
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

            {/* 訂正・追送の記録と履歴 */}
            {mode === "followup" && (
              <Card className="p-4">
                <h2 className="mb-1 text-sm font-bold text-muted">訂正・追送の記録</h2>
                <p className="mb-3 text-[11px] leading-relaxed text-muted">
                  メールを送ったら記録してください。「いつ・何を・どの理由で」送ったかが履歴に残ります。
                </p>
                {canEdit && (
                  <div className="mb-3 flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1">
                      <span className={LABEL}>送った日</span>
                      <input
                        type="date"
                        value={fuSentOn}
                        onChange={(e) => setFuSentOn(e.target.value)}
                        className={INPUT}
                      />
                    </label>
                    <Button
                      icon={<Save size={15} />}
                      disabled={fuSaving || fuMailDocs.length === 0}
                      onClick={recordFollowup}
                    >
                      {fuSaving ? "記録中…" : "訂正・追送を記録"}
                    </Button>
                  </div>
                )}
                {followups.length === 0 ? (
                  <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
                    まだ記録がありません。
                  </p>
                ) : (
                  <div className="space-y-2">
                    {followups.map((f) => (
                      <div key={f.id} className="rounded-xl border border-border bg-background px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold tabular-nums">
                            {f.sent_on ?? "日付未設定"}
                            {f.reason && <span className="ml-2 font-medium">{f.reason}</span>}
                          </p>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => removeFollowup(f)}
                              aria-label="この記録を削除"
                              className="shrink-0 text-seal"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted">
                          {(f.docs ?? [])
                            .map((d) => `${d.label}（${d.kind}）${d.note ? `→${d.note}` : ""}`)
                            .join(" ・ ") || "書類の記録なし"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* 後送・未入手の期日・経過日数・受領 */}
            {mode === "initial" && pendingDocs.length > 0 && (
              <Card className="border-status-notice-fg/40 p-4">
                <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-status-notice-fg">
                  <TriangleAlert size={15} />
                  後送・未入手書類の期日
                </h2>
                <p className="mb-3 text-[11px] leading-relaxed text-muted">
                  保存すると、本人から届くまでホームに「何日経過」のアラートが表示されます。
                  届いたら「本人から受領」にチェックしてください。
                </p>
                <div className="space-y-2">
                  {pendingDocs.map((def) => {
                    const d = docs[def.key] ?? emptyDocState();
                    const elapsed = pendingDaysElapsed(d.row?.pending_since ?? null, today);
                    const overdue = !!d.dueOn && today > d.dueOn;
                    return (
                      <div
                        key={def.key}
                        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-background px-3 py-2.5"
                      >
                        <span className="min-w-0 flex-1 text-sm font-bold">
                          {mailNums[defs.findIndex((x) => x.key === def.key)] ?? "—"}. {def.label}
                          <span className="ml-1.5 text-[11px] font-bold text-status-notice-fg">
                            （{d.status}）
                          </span>
                          {elapsed !== null && !d.receivedOn && (
                            <span
                              className={`ml-1.5 text-[11px] font-bold tabular-nums ${
                                overdue ? "text-seal" : "text-status-notice-fg"
                              }`}
                            >
                              {elapsed}日経過
                            </span>
                          )}
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
        </>
      )}
    </div>
  );
}

// 書類1行: ステータス・備考・ファイルアップロード。
// 番号はメール本文と同じ振り直した通し番号（対象外は番号なし）。
// 「添付資料」はファイルが添付されている書類だけ選べる（添付すると自動でこのステータスになる）。
function DocRow({
  def,
  mailNum,
  state,
  workerId,
  canEdit,
  onChange,
  onUploaded,
  onError,
}: {
  def: OnboardingDocDef;
  mailNum: number | null;
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

  // アプリで作れる書類（扶養控除等申告書・労働者名簿）を、その場で作って添付する
  const generatable: Record<string, string> = {
    fuyokojo: "扶養控除等申告書",
    meibo: "労働者名簿",
  };
  async function createAndAttach() {
    const label = generatable[def.key];
    if (!label) return;
    if (
      !window.confirm(
        `外国人詳細の登録内容で「${label}」を作成し、この書類に添付します。\n` +
          "内容に間違いがなければOKを押してください（添付後も差し替えできます）。",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/onboarding-doc-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workerId, kind: def.key }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `${label}の作成に失敗しました`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
      const fileName = m ? decodeURIComponent(m[1]) : `${label}.pdf`;
      await handleFile(new File([blob], fileName, { type: "application/pdf" }));
    } catch (err) {
      onError(err instanceof Error ? err.message : `${label}の作成に失敗しました`);
      setBusy(false);
    }
  }
  async function openPreview() {
    if (!state.row) return;
    const res = await getOnboardingDocPreviewUrl(state.row.id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else onError(res.message);
  }

  // 間違って添付したファイルの削除。ファイルが無くなるためステータスは「未入手」に戻る
  async function removeFile() {
    const fileName = state.row?.file_name || "ファイル";
    if (!window.confirm(`「${def.label}」の添付データ（${fileName}）を削除します。よろしいですか？`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await clearOnboardingDocFile(workerId, def.key);
      if (!res.ok) throw new Error(res.message);
      onUploaded();
    } catch (err) {
      onError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    // 行のどこにファイルを落としても添付できる
    <FileDropArea
      onFiles={(files) => void handleFile(files[0])}
      disabled={!canEdit || busy}
      className={`rounded-xl border border-border bg-background p-2.5 ${STATUS_BORDER[state.status]}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="min-w-0 flex-1 text-sm">
          <span className="mr-1 text-[11px] font-bold text-muted">
            {mailNum !== null ? `${mailNum}.` : "—"}
          </span>
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
            <option key={o.value} value={o.value} disabled={o.value === "添付" && !uploaded}>
              {o.label}
              {o.value === "添付" && !uploaded ? "（要添付）" : ""}
            </option>
          ))}
        </select>
        {canEdit && generatable[def.key] && (
          <button
            type="button"
            onClick={() => void createAndAttach()}
            disabled={busy}
            title={`登録内容から${generatable[def.key]}を作って添付します`}
            className="flex min-h-[36px] items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-bold text-brand disabled:opacity-50"
          >
            <FileText size={12} />
            {uploaded ? "作り直す" : "作成"}
          </button>
        )}
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
          <span className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={openPreview}
              title="添付データを新しいタブで表示"
              className="flex max-w-[180px] items-center gap-1 text-[11px] font-bold text-brand hover:underline"
            >
              <Eye size={12} className="shrink-0" />
              <span className="truncate">{state.row?.file_name || "ファイルを開く"}</span>
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={removeFile}
                disabled={busy}
                title="間違って添付した場合の削除"
                className="flex items-center gap-0.5 text-[11px] font-bold text-seal hover:underline disabled:opacity-50"
              >
                <Trash2 size={12} />
                削除
              </button>
            )}
          </span>
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
    </FileDropArea>
  );
}

// 訂正・追送する書類の1行: 「訂正版/追加」の選択・備考・ファイルの差し替え。
// 訂正版はここでファイルを添付し直すと保存データが新しい版に置き換わる
function FollowupDocRow({
  def,
  num,
  kind,
  note,
  state,
  workerId,
  canEdit,
  onKind,
  onNote,
  onUploaded,
  onError,
}: {
  def: OnboardingDocDef;
  num: number | null;
  kind: "" | FollowupKind;
  note: string;
  state: DocState;
  workerId: string;
  canEdit: boolean;
  onKind: (v: "" | FollowupKind) => void;
  onNote: (v: string) => void;
  onUploaded: () => void;
  onError: (m: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const uploaded = !!state.row?.storage_path;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const hadFile = uploaded; // 添付前に保存データがあったか（訂正版/追加の自動判定に使う）
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
      // 未選択のまま添付したら、既存ファイルの差し替えは「訂正版」、
      // 初めての添付は「追加」として自動で選ぶ
      if (kind === "") onKind(hadFile ? "訂正版" : "追加");
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

  const active = kind !== "";
  return (
    <FileDropArea
      onFiles={(files) => void handleFile(files[0])}
      disabled={!canEdit || busy}
      className={`rounded-xl border border-border bg-background p-2.5 ${
        active ? "border-l-4 border-l-brand" : "opacity-70"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="min-w-0 flex-1 text-sm">
          <span className="mr-1 text-[11px] font-bold text-muted">
            {num !== null ? `${num}.` : "—"}
          </span>
          {def.label}
        </span>
        <select
          value={kind}
          onChange={(e) => onKind(e.target.value as "" | FollowupKind)}
          disabled={!canEdit}
          className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-xs focus:border-brand focus:outline-none"
        >
          <option value="">— 送らない</option>
          <option value="訂正版">🔁 訂正版</option>
          <option value="追加">➕ 追加</option>
        </select>
        {/* 添付は「訂正版/追加」の選択前でも押せる（添付すると自動で区分が選ばれる） */}
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
                差し替え
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
      {(active || uploaded) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {active && (
            <input
              value={note}
              onChange={(e) => onNote(e.target.value)}
              placeholder="備考（メール本文に「→備考」で載ります）"
              readOnly={!canEdit}
              className="min-h-[34px] min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-xs focus:border-brand focus:outline-none"
            />
          )}
          {uploaded && (
            <button
              type="button"
              onClick={openPreview}
              title="添付データを新しいタブで表示"
              className="flex max-w-[180px] shrink-0 items-center gap-1 text-[11px] font-bold text-brand hover:underline"
            >
              <Eye size={12} className="shrink-0" />
              <span className="truncate">{state.row?.file_name || "ファイルを開く"}</span>
            </button>
          )}
        </div>
      )}
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
    </FileDropArea>
  );
}
