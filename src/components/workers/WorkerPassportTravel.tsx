"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Home, Loader2, Plane, Plus, Stamp, Trash2, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import {
  deleteWorkerTravel,
  insertWorkerTravel,
  listWorkerPassportFiles,
  listWorkerTravels,
  type WorkerPassportFileRow,
} from "@/lib/supabase/queries/worker-travels";
import {
  createPassportFileTicket,
  deletePassportFile,
  getPassportFilePreviewUrl,
  registerPassportFile,
} from "@/app/(app)/workers/passport-file-actions";
import {
  formatStayDays,
  isStayingInJapan,
  japanStayDays,
  travelSummary,
  type WorkerTravel,
} from "@/lib/worker-travel";
import { dbErrorMessage } from "@/lib/errors";

const INPUT =
  "min-h-[40px] w-full rounded-lg border border-border bg-background px-2.5 text-sm focus:border-brand focus:outline-none";

// 出入国の記録（パスポートのスタンプ）。
// スタンプページのPDF・画像の保存（添付日は自動で残る）と、
// 出入国の日付（母国出国→日本入国→日本出国→母国入国）の記録・流れの図
export function WorkerPassportTravel({
  workerId,
  canEdit,
  today,
}: {
  workerId: string;
  canEdit: boolean;
  today: string;
}) {
  const [error, setError] = useState<string | null>(null);

  // ---- 出入国の記録 ----
  const [travels, setTravels] = useState<WorkerTravel[]>([]);
  const [form, setForm] = useState({
    home_departure_on: "",
    japan_entry_on: "",
    japan_exit_on: "",
    home_entry_on: "",
  });
  const [adding, setAdding] = useState(false);

  const loadTravels = () =>
    listWorkerTravels(createClient(), workerId).then(setTravels).catch(() => undefined);

  useEffect(() => {
    void loadTravels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const hasAnyDate = Object.values(form).some((v) => v);

  const addTravel = async () => {
    if (!hasAnyDate) return;
    setAdding(true);
    setError(null);
    try {
      await insertWorkerTravel(createClient(), workerId, {
        home_departure_on: form.home_departure_on || null,
        japan_entry_on: form.japan_entry_on || null,
        japan_exit_on: form.japan_exit_on || null,
        home_entry_on: form.home_entry_on || null,
        note: "",
      });
      setForm({ home_departure_on: "", japan_entry_on: "", japan_exit_on: "", home_entry_on: "" });
      await loadTravels();
    } catch (err) {
      setError(dbErrorMessage(err, "0097_worker_travels.sql", "出入国の記録に失敗しました"));
    } finally {
      setAdding(false);
    }
  };

  const removeTravel = async (t: WorkerTravel) => {
    if (!window.confirm("この出入国の記録を削除します。よろしいですか？")) return;
    setError(null);
    try {
      await deleteWorkerTravel(createClient(), t.id);
      setTravels((prev) => prev.filter((x) => x.id !== t.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  const summary = travelSummary(travels);

  // ---- スタンプページの添付 ----
  const [files, setFiles] = useState<WorkerPassportFileRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    listWorkerPassportFiles(createClient(), workerId)
      .then((rows) => {
        if (!cancelled) setFiles(rows);
      })
      .catch(() => undefined); // 0096未適用のときは空のまま（登録時に案内を出す）
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        const { blob, mimeType, fileName } = await compressImage(file);
        const ticket = await createPassportFileTicket(workerId, fileName, mimeType);
        if (!ticket.ok) throw new Error(ticket.message);
        const { error: upErr } = await createClient()
          .storage.from("app-files")
          .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
        if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
        const res = await registerPassportFile(
          workerId,
          "スタンプページ",
          ticket.path,
          fileName,
          mimeType,
        );
        if (!res.ok) throw new Error(res.message);
      }
      setFiles(await listWorkerPassportFiles(createClient(), workerId));
    } catch (err) {
      setError(dbErrorMessage(err, "0096_worker_passport_files.sql", "アップロードに失敗しました"));
    } finally {
      setUploading(false);
    }
  }

  async function preview(id: string) {
    const res = await getPassportFilePreviewUrl(id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  }

  async function removeFile(f: WorkerPassportFileRow) {
    if (!window.confirm(`「${f.file_name}」を削除します。よろしいですか？`)) return;
    setError(null);
    const res = await deletePassportFile(f.id);
    if (res.ok) setFiles((prev) => prev.filter((x) => x.id !== f.id));
    else setError(res.message);
  }

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold">
        <Stamp size={16} className="text-brand" />
        出入国の記録（パスポートのスタンプ）
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        パスポートのスタンプの日付を1往復ずつ記録すると、出入国の回数と流れが図で出ます。
        スタンプのページはPDF・画像でそのまま保存できます（添付した日付は自動で残ります）。
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* まとめ（回数と今の居場所） */}
      {travels.length > 0 && (
        <p className="mb-2 text-sm font-bold">
          日本入国 {summary.entries}回
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${
              summary.inJapan ? "bg-brand/10 text-brand" : "bg-background text-muted"
            }`}
          >
            {summary.inJapan ? "現在：日本に滞在中" : "現在：母国（日本出国済み）"}
          </span>
        </p>
      )}

      {/* 出入国の流れ（1往復＝1段） */}
      {travels.length === 0 ? (
        <p className="mb-3 rounded-xl bg-background p-4 text-center text-xs text-muted">
          まだ出入国の記録がありません。スタンプの日付を下から追加してください。
        </p>
      ) : (
        <div className="mb-3 flex flex-col gap-2">
          {travels.map((t, i) => (
            <TripFlow
              key={t.id}
              t={t}
              index={i}
              today={today}
              canEdit={canEdit}
              onRemove={() => void removeTravel(t)}
            />
          ))}
        </div>
      )}

      {/* 追加（スタンプの日付を入れる） */}
      {canEdit && (
        <div className="mb-4 rounded-xl border border-dashed border-border p-3">
          <p className="mb-2 text-[11px] font-bold text-muted">
            出入国を追加（分かる日付だけで構いません。日本にいる間は日本出国日・母国入国日を空のまま）
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">母国出国日</span>
              <input
                type="date"
                value={form.home_departure_on}
                onChange={(e) => set("home_departure_on", e.target.value)}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">日本入国日</span>
              <input
                type="date"
                value={form.japan_entry_on}
                onChange={(e) => set("japan_entry_on", e.target.value)}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">日本出国日</span>
              <input
                type="date"
                value={form.japan_exit_on}
                onChange={(e) => set("japan_exit_on", e.target.value)}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">母国入国日</span>
              <input
                type="date"
                value={form.home_entry_on}
                onChange={(e) => set("home_entry_on", e.target.value)}
                className={INPUT}
              />
            </label>
          </div>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            className="mt-2"
            icon={<Plus size={16} />}
            disabled={!hasAnyDate || adding}
            onClick={() => void addTravel()}
          >
            {adding ? "追加中…" : "出入国の記録を追加"}
          </Button>
        </div>
      )}

      {/* スタンプページの保存（PDF・画像） */}
      <div className="border-t border-border pt-3">
        <p className="mb-1.5 text-[11px] font-bold text-muted">スタンプページの保存（PDF・画像）</p>
        {files.length === 0 && (
          <p className="mb-1.5 text-[11px] text-muted">まだ保存されたページはありません。</p>
        )}
        <div className="flex flex-col gap-1.5">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{f.file_name}</span>
              {/* 添付した日付（自動で記録される） */}
              <span className="shrink-0 text-[10px] tabular-nums text-muted">
                添付 {f.created_at.slice(0, 10)}
              </span>
              <button
                type="button"
                onClick={() => void preview(f.id)}
                aria-label="表示"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted hover:text-brand"
              >
                <Eye size={13} />
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void removeFile(f)}
                  aria-label="削除"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-seal"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-dashed border-brand px-3 py-2 text-xs font-bold text-brand disabled:opacity-50"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploading ? "アップロード中…" : "スタンプページを添付（PDF・画像）"}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>
    </Card>
  );
}

// 1往復ぶんの流れの図: 母国出国 ─✈→ 日本入国 〜 日本出国 ─✈→ 母国入国。
// まだ日本にいるときは「日本滞在中（約◯年◯か月）」で止める
function TripFlow({
  t,
  index,
  today,
  canEdit,
  onRemove,
}: {
  t: WorkerTravel;
  index: number;
  today: string;
  canEdit: boolean;
  onRemove: () => void;
}) {
  const staying = isStayingInJapan(t);
  const days = japanStayDays(t, today);
  return (
    <div
      className={`rounded-xl border p-2.5 ${
        staying ? "border-brand/40 bg-brand/5" : "border-border bg-background"
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-muted">{index + 1}回目</span>
        {canEdit && (
          <button
            type="button"
            aria-label="この出入国を削除"
            onClick={onRemove}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-seal"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <FlowStep icon={<Home size={12} />} label="母国出国" date={t.home_departure_on} />
        <Plane size={13} className="shrink-0 rotate-45 text-muted" />
        <FlowStep icon={<span aria-hidden>🇯🇵</span>} label="日本入国" date={t.japan_entry_on} highlight />
        <span className="text-muted">〜</span>
        {staying ? (
          <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-bold text-brand">
            日本滞在中{days !== null && `（${formatStayDays(days)}）`}
          </span>
        ) : (
          <>
            <FlowStep icon={<span aria-hidden>🇯🇵</span>} label="日本出国" date={t.japan_exit_on} />
            <Plane size={13} className="shrink-0 rotate-45 text-muted" />
            <FlowStep icon={<Home size={12} />} label="母国入国" date={t.home_entry_on} />
            {days !== null && (
              <span className="text-[11px] text-muted">日本滞在 {formatStayDays(days)}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FlowStep({
  icon,
  label,
  date,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  date: string | null;
  highlight?: boolean;
}) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${
        highlight ? "border-brand/40 bg-surface" : "border-border bg-surface"
      }`}
    >
      <span className="text-muted">{icon}</span>
      <span className="flex flex-col leading-tight">
        <span className="text-[10px] font-bold text-muted">{label}</span>
        <span className="font-bold tabular-nums">{date || "—"}</span>
      </span>
    </span>
  );
}
