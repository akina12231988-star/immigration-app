"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Home, Loader2, Pencil, Plane, Plus, Stamp, Trash2, Upload } from "lucide-react";
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
  ENTRY_KINDS,
  buildTrips,
  formatStayDays,
  isTripStayingInJapan,
  tripStayDays,
  tripsSummary,
  type Trip,
  type WorkerTravel,
} from "@/lib/worker-travel";
import { dbErrorMessage } from "@/lib/errors";
import { RESIDENCE_STATUSES } from "@/types/db";

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
    landing_permission: "",
    entry_kind: "",
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
  const hasAnyDate = [
    form.home_departure_on,
    form.japan_entry_on,
    form.japan_exit_on,
    form.home_entry_on,
  ].some((v) => v);

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
        landing_permission: form.entry_kind === "再入国" ? "" : form.landing_permission.trim(),
        entry_kind: form.entry_kind,
        note: "",
      });
      setForm({
        home_departure_on: "",
        japan_entry_on: "",
        japan_exit_on: "",
        home_entry_on: "",
        landing_permission: "",
        entry_kind: "",
      });
      await loadTravels();
    } catch (err) {
      setError(dbErrorMessage(err, "0099_worker_travel_entry_kind.sql", "出入国の記録に失敗しました"));
    } finally {
      setAdding(false);
    }
  };

  // 往復（1回目・2回目…）は表示のたびに日付から自動で組み立てる
  const trips = buildTrips(travels);
  const summary = tripsSummary(trips);

  // 日付の修正。修正後の内容を1行として追加してから、元の記録をまとめて消す
  // （スタンプ1個ずつ入れた往復も、修正すると1行に整理される）
  const saveTrip = async (t: Trip, values: TripEditValues) => {
    setError(null);
    const hasDate = [
      values.home_departure_on,
      values.japan_entry_on,
      values.japan_exit_on,
      values.home_entry_on,
    ].some((v) => v);
    if (!hasDate) {
      setError("日付を1つ以上入れてください（この往復を消したいときはゴミ箱を押してください）。");
      throw new Error("no date");
    }
    try {
      await insertWorkerTravel(createClient(), workerId, {
        home_departure_on: values.home_departure_on || null,
        japan_entry_on: values.japan_entry_on || null,
        japan_exit_on: values.japan_exit_on || null,
        home_entry_on: values.home_entry_on || null,
        landing_permission: values.entry_kind === "再入国" ? "" : values.landing_permission.trim(),
        entry_kind: values.entry_kind,
        note: "",
      });
      for (const id of t.sourceIds) {
        await deleteWorkerTravel(createClient(), id);
      }
    } catch (err) {
      setError(
        dbErrorMessage(err, "0099_worker_travel_entry_kind.sql", "修正の保存に失敗しました"),
      );
      throw err;
    } finally {
      await loadTravels();
    }
  };

  // 往復の削除 = その往復に含まれる記録（スタンプの日付）をまとめて削除
  const removeTrip = async (t: Trip) => {
    if (t.sourceIds.length === 0) return;
    if (
      !window.confirm(
        `この往復に含まれる出入国の記録${t.sourceIds.length}件を削除します。よろしいですか？`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      for (const id of t.sourceIds) {
        await deleteWorkerTravel(createClient(), id);
      }
      await loadTravels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

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
        パスポートのスタンプの日付を入れると、時系列に並べて自動で1往復（1回目・2回目…）に
        まとまります。母国出国〜母国入国が分かればその区切り、母国のスタンプが無ければ
        日本入国〜日本出国で1回と数えます。スタンプ1個ずつ入れても、まとめて入れても構いません。
        パスポートの記録はPDF・画像でそのまま保存できます（添付した日付は自動で残ります）。
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* まとめ（回数と今の居場所） */}
      {trips.length > 0 && (
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

      {/* 出入国の流れ（1往復＝1段。日付から自動でまとめる） */}
      {trips.length === 0 ? (
        <p className="mb-3 rounded-xl bg-background p-4 text-center text-xs text-muted">
          まだ出入国の記録がありません。スタンプの日付を下から追加してください。
        </p>
      ) : (
        <div className="mb-3 flex flex-col gap-2">
          {trips.map((t, i) => (
            <TripFlow
              key={t.sourceIds.join("-") || i}
              t={t}
              index={i}
              isLast={i === trips.length - 1}
              today={today}
              canEdit={canEdit}
              onRemove={() => void removeTrip(t)}
              onSave={(values) => saveTrip(t, values)}
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
          {/* 日本入国が上陸許可（新しい在留資格のシール）か再入国かを記録する */}
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">日本入国の種類</span>
              <select
                value={form.entry_kind}
                onChange={(e) => set("entry_kind", e.target.value)}
                className={INPUT}
              >
                <option value="">未設定</option>
                {ENTRY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k === "再入国" ? "再入国（みなし再入国など・資格はそのまま）" : "上陸許可（新しい在留資格のシール）"}
                  </option>
                ))}
              </select>
            </label>
            {/* 再入国のときは新しい在留資格のシールが無いため、資格の欄は出さない */}
            {form.entry_kind !== "再入国" && (
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-muted">
                  上陸許可の在留資格（シールの資格。分かるときだけ）
                </span>
                <input
                  list="landing-permission-statuses"
                  value={form.landing_permission}
                  onChange={(e) => set("landing_permission", e.target.value)}
                  placeholder="例: 特定技能1号 ／ 技能実習1号ロ ／ 短期滞在"
                  autoComplete="off"
                  className={INPUT}
                />
                <datalist id="landing-permission-statuses">
                  {RESIDENCE_STATUSES.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
            )}
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

      {/* パスポートの記録の保存（PDF・画像） */}
      <div className="border-t border-border pt-3">
        <p className="mb-1.5 text-[11px] font-bold text-muted">パスポートの記録の保存（PDF・画像）</p>
        {files.length === 0 && (
          <p className="mb-1.5 text-[11px] text-muted">まだ保存された記録はありません。</p>
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
              {uploading ? "アップロード中…" : "パスポートの記録を添付（PDF・画像）"}
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

// 1往復ぶんの編集で保存する内容
export interface TripEditValues {
  home_departure_on: string;
  japan_entry_on: string;
  japan_exit_on: string;
  home_entry_on: string;
  landing_permission: string;
  entry_kind: string;
}

// 1往復ぶんの流れの図: 母国出国 ─✈→ 日本入国 〜 日本出国 ─✈→ 母国入国。
// まだ日本にいるとき（いちばん新しい往復のみ）は「日本滞在中（約◯年◯か月）」で止める。
// 鉛筆から日付をその場で直せる（保存すると往復に含まれる記録が1行にまとまる）
function TripFlow({
  t,
  index,
  isLast,
  today,
  canEdit,
  onRemove,
  onSave,
}: {
  t: Trip;
  index: number;
  isLast: boolean;
  today: string;
  canEdit: boolean;
  onRemove: () => void;
  onSave: (values: TripEditValues) => Promise<void>;
}) {
  const staying = isLast && isTripStayingInJapan(t);
  const days = tripStayDays(t, today, isLast);

  // 日付の修正。開いたときの値から直して保存する
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<TripEditValues>({
    home_departure_on: "",
    japan_entry_on: "",
    japan_exit_on: "",
    home_entry_on: "",
    landing_permission: "",
    entry_kind: "",
  });
  const startEdit = () => {
    setForm({
      home_departure_on: t.home_departure_on ?? "",
      japan_entry_on: t.japan_entry_on ?? "",
      japan_exit_on: t.japan_exit_on ?? "",
      home_entry_on: t.home_entry_on ?? "",
      landing_permission: t.landing_permission,
      entry_kind: t.entry_kind,
    });
    setEditing(true);
  };
  const save = async () => {
    setBusy(true);
    try {
      await onSave(form);
      setEditing(false);
    } catch {
      /* エラーはカード上部に表示される。開いたまま直せる */
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    const set = (key: keyof TripEditValues, value: string) =>
      setForm((f) => ({ ...f, [key]: value }));
    const DATE_FIELDS: { key: keyof TripEditValues; label: string }[] = [
      { key: "home_departure_on", label: "母国出国日" },
      { key: "japan_entry_on", label: "日本入国日" },
      { key: "japan_exit_on", label: "日本出国日" },
      { key: "home_entry_on", label: "母国入国日" },
    ];
    return (
      <div className="rounded-xl border border-brand/40 bg-background p-2.5">
        <p className="mb-2 text-[11px] font-bold text-muted">{index + 1}回目の日付を修正</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DATE_FIELDS.map(({ key, label }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">{label}</span>
              <input
                type="date"
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                className={INPUT}
              />
            </label>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">日本入国の種類</span>
            <select
              value={form.entry_kind}
              onChange={(e) => set("entry_kind", e.target.value)}
              className={INPUT}
            >
              <option value="">未設定</option>
              {ENTRY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          {form.entry_kind !== "再入国" && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">上陸許可の在留資格</span>
              <input
                list="landing-permission-statuses"
                value={form.landing_permission}
                onChange={(e) => set("landing_permission", e.target.value)}
                placeholder="例: 特定技能1号"
                autoComplete="off"
                className={INPUT}
              />
            </label>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy}
            className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted"
          >
            やめる
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="flex-1 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-brand-foreground disabled:opacity-50"
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-2.5 ${
        staying ? "border-brand/40 bg-brand/5" : "border-border bg-background"
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-muted">
          {index + 1}回目
          {/* 日本入国の種類（再入国か、上陸許可＋そのときの在留資格か） */}
          {t.entry_kind === "再入国" && (
            <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-bold text-foreground">
              再入国
            </span>
          )}
          {t.entry_kind !== "再入国" && (t.landing_permission || t.entry_kind === "上陸許可") && (
            <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-bold text-foreground">
              上陸許可{t.landing_permission && ` ${t.landing_permission}`}
            </span>
          )}
        </span>
        {canEdit && (
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              aria-label="この出入国の日付を修正"
              onClick={startEdit}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              aria-label="この出入国を削除"
              onClick={onRemove}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-seal"
            >
              <Trash2 size={13} />
            </button>
          </span>
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
