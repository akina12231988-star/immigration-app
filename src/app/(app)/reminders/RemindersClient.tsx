"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BellRing,
  Check,
  ExternalLink,
  ImagePlus,
  Loader2,
  MessageCircle,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { createClient } from "@/lib/supabase/client";
import {
  deleteReminder,
  insertReminder,
  listReminderImages,
  updateReminder,
  updateReminderImageCaption,
  type ReminderWithWorker,
} from "@/lib/supabase/queries/reminders";
import { deleteReminderImage, getReminderImageUrls } from "./actions";
import { uploadReminderImage } from "@/lib/reminder-files";
import {
  REMINDER_BOX_SIZE,
  REMINDER_KINDS,
  REMINDER_STATUSES,
  daysSince,
  formatReminderNo,
  isAwaitingReply,
  isReminderOpen,
  nextReminderNo,
  reminderBoxes,
  reminderCounts,
  reminderStatusPatch,
  sortReminders,
} from "@/lib/reminders";
import { workerNameSuggestions } from "@/lib/worker-search";
import { messengerWebUrl } from "@/lib/messenger-link";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import type { WorkerWithOrg } from "@/lib/supabase/queries/workers";
import type { ReminderImage, ReminderStatus } from "@/types/db";

const MIGRATION = "0144_reminders.sql";

const INPUT =
  "min-h-[40px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

type Filter = "進行中" | "返事待ち" | "完了" | "すべて";

// 進捗の色（返事待ちは赤・未連絡は黄・返事ありは青・完了は灰）
function statusClass(status: string): string {
  if (isAwaitingReply(status)) return "bg-seal/10 text-seal";
  if (status === "未連絡") return "bg-status-notice-bg text-status-notice-fg";
  if (status === "返事あり") return "bg-brand/10 text-brand";
  return "bg-background text-muted";
}

export function RemindersClient({
  initialReminders,
  initialImageCounts,
  workers,
  canWrite,
  today,
  initialWorkerId,
  initialNo,
  loadError,
}: {
  initialReminders: ReminderWithWorker[];
  initialImageCounts: Record<string, number>;
  workers: WorkerWithOrg[];
  canWrite: boolean;
  today: string;
  initialWorkerId: string | null;
  initialNo?: number;
  loadError: string | null;
}) {
  const [reminders, setReminders] = useState(initialReminders);
  const [imageCounts, setImageCounts] = useState(initialImageCounts);
  // 読み込みのエラーはサーバー側で文字にしてある（マイグレーションの案内込み）
  const [error, setError] = useState<string | null>(loadError);
  const [filter, setFilter] = useState<Filter>("進行中");
  const [q, setQ] = useState("");
  // 外国人詳細から来たときは、その人に絞って新規登録の欄を開く
  const initialWorker = initialWorkerId ? (workers.find((w) => w.id === initialWorkerId) ?? null) : null;
  const [onlyWorkerId, setOnlyWorkerId] = useState<string | null>(initialWorker?.id ?? null);
  const [creating, setCreating] = useState(!!initialWorker && canWrite);
  const [selected, setSelected] = useState<ReminderWithWorker | null>(
    initialNo
      ? (initialReminders.find((r) => r.reminder_no === initialNo && isReminderOpen(r.status)) ?? null)
      : null,
  );

  const counts = reminderCounts(reminders);
  const boxes = reminderBoxes(reminders);

  const shown = useMemo(() => {
    const query = q.trim().toUpperCase();
    return sortReminders(reminders).filter((r) => {
      if (onlyWorkerId && r.worker_id !== onlyWorkerId) return false;
      if (filter === "進行中" && !isReminderOpen(r.status)) return false;
      if (filter === "返事待ち" && !isAwaitingReply(r.status)) return false;
      if (filter === "完了" && isReminderOpen(r.status)) return false;
      if (!query) return true;
      return (
        formatReminderNo(r.reminder_no).toUpperCase().includes(query) ||
        (r.workers?.name ?? "").toUpperCase().includes(query) ||
        (r.workers?.kana ?? "").toUpperCase().includes(query) ||
        r.content.toUpperCase().includes(query) ||
        r.kind.toUpperCase().includes(query)
      );
    });
  }, [reminders, filter, q, onlyWorkerId]);

  const replace = (updated: ReminderWithWorker) => {
    setReminders((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setSelected((prev) => (prev && prev.id === updated.id ? updated : prev));
  };

  // 進捗を変える（日付も自動で入れる。完了にすると番号が空きになる）
  const setStatus = async (r: ReminderWithWorker, status: ReminderStatus) => {
    const patch = reminderStatusPatch(r, status, today);
    setError(null);
    try {
      await updateReminder(createClient(), r.id, patch);
      replace({ ...r, ...patch } as ReminderWithWorker);
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, errorMessage(err, "進捗の保存に失敗しました")));
    }
  };

  const patchReminder = async (r: ReminderWithWorker, patch: Partial<ReminderWithWorker>) => {
    setError(null);
    try {
      const { workers: _w, id: _i, ...rest } = patch;
      void _w;
      void _i;
      await updateReminder(createClient(), r.id, rest);
      replace({ ...r, ...patch });
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, errorMessage(err, "保存に失敗しました")));
    }
  };

  const remove = async (r: ReminderWithWorker) => {
    setError(null);
    try {
      await deleteReminder(createClient(), r.id);
      setReminders((prev) => prev.filter((x) => x.id !== r.id));
      setSelected(null);
    } catch (err) {
      setError(errorMessage(err, "削除に失敗しました"));
    }
  };

  const onlyWorker = onlyWorkerId ? workers.find((w) => w.id === onlyWorkerId) : null;

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
        <BellRing size={14} className="mt-0.5 shrink-0" />
        外国人に届いた市役所からの通知・領収書などを本人に知らせ、連絡した → 返事があった → 完了 を追いかける画面です。
        番号は保管ボックスと同じように1〜{REMINDER_BOX_SIZE}番を使い、完了すると空き番号になって次の人に割り当てられます
        （{REMINDER_BOX_SIZE}番まで埋まったときだけ{REMINDER_BOX_SIZE + 1}番以降を使います）。
        Messengerでの会話はスクショをドラッグ＆ドロップで貼り付けて残せます。
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* 件数 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-seal/10 px-3 py-1 text-xs font-bold text-seal">
          返事待ち {counts.awaiting}
        </span>
        <span className="rounded-full bg-status-notice-bg px-3 py-1 text-xs font-bold text-status-notice-fg">
          未連絡 {counts.notContacted}
        </span>
        <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand">
          返事あり（手続き中） {counts.replied}
        </span>
        <span className="rounded-full bg-status-before-bg px-3 py-1 text-xs font-bold text-status-before-fg">
          進行中 合計 {counts.open}
        </span>
      </div>

      {/* 箱（番号の使用状況）。押すとその督促を開く */}
      <Card className="p-3">
        <p className="mb-2 text-[11px] font-bold text-muted">
          番号の箱（1〜{REMINDER_BOX_SIZE}）。空きは灰色、使っている番号は名前が出ます
        </p>
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-6 md:grid-cols-10">
          {boxes.map((b) => (
            <button
              key={b.no}
              type="button"
              disabled={!b.reminder}
              onClick={() => b.reminder && setSelected(b.reminder)}
              title={b.reminder ? `${b.reminder.workers?.name ?? ""}（${b.reminder.status}）` : "空き"}
              className={`flex min-h-[52px] flex-col items-center justify-center rounded-lg border px-1 text-center text-[10px] leading-tight ${
                b.reminder
                  ? `border-transparent font-bold ${statusClass(b.reminder.status)}`
                  : "border-dashed border-border text-muted"
              }`}
            >
              <span className="text-[11px] font-bold tabular-nums">{String(b.no).padStart(2, "0")}</span>
              <span className="line-clamp-2 w-full break-all">
                {b.reminder ? (b.reminder.workers?.name ?? "") : "空き"}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* 操作 */}
      <div className="flex flex-wrap items-center gap-2">
        {canWrite && (
          <Button icon={<Plus size={16} />} onClick={() => setCreating((v) => !v)}>
            督促を登録
          </Button>
        )}
        {onlyWorker && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand">
            {onlyWorker.name} の督促だけ表示
            <button type="button" aria-label="絞り込みを外す" onClick={() => setOnlyWorkerId(null)}>
              <X size={14} />
            </button>
          </span>
        )}
      </div>

      {creating && canWrite && (
        <NewReminderForm
          workers={workers}
          initialWorker={initialWorker}
          activeNos={reminders.filter((r) => isReminderOpen(r.status)).map((r) => r.reminder_no)}
          onCreated={(row) => {
            setReminders((prev) => [...prev, row]);
            setCreating(false);
            setSelected(row);
          }}
          onCancel={() => setCreating(false)}
          onError={setError}
        />
      )}

      {/* 絞り込み・検索 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="番号・氏名・内容で検索"
          className="min-h-[40px] flex-1 rounded-xl border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none"
        />
        <div className="flex flex-wrap gap-1">
          {(["進行中", "返事待ち", "完了", "すべて"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`min-h-[36px] rounded-lg border px-3 text-xs font-bold ${
                filter === f
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border bg-surface text-muted"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* 一覧 */}
      {shown.length === 0 ? (
        <p className="rounded-xl bg-surface p-6 text-center text-sm text-muted">
          該当する督促はありません。
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => {
            const waitDays = isAwaitingReply(r.status) ? daysSince(r.contacted_on, today) : null;
            const images = imageCounts[r.id] ?? 0;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r)}
                className="flex w-full items-start gap-3 rounded-xl border border-border bg-surface p-3 text-left hover:border-brand"
              >
                <span
                  className={`flex h-11 w-14 shrink-0 items-center justify-center rounded-lg text-sm font-black tabular-nums ${statusClass(r.status)}`}
                >
                  {formatReminderNo(r.reminder_no).replace("No.", "")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold">{r.workers?.name ?? "（外国人不明）"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass(r.status)}`}>
                      {r.status}
                      {waitDays !== null && waitDays > 0 && `・${waitDays}日`}
                    </span>
                    {images > 0 && (
                      <span className="text-[10px] text-muted">画像 {images}枚</span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {r.workers?.organizations?.name && `${r.workers.organizations.name} ・ `}
                    {r.kind}
                    {r.content && `：${r.content}`}
                  </span>
                  <span className="block text-[11px] text-muted">
                    {r.contacted_on && `連絡 ${r.contacted_on}`}
                    {r.replied_on && ` ／ 返事 ${r.replied_on}`}
                    {r.completed_on && ` ／ 完了 ${r.completed_on}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <ReminderModal
          reminder={selected}
          today={today}
          canWrite={canWrite}
          onClose={() => setSelected(null)}
          onStatus={(status) => void setStatus(selected, status)}
          onPatch={(patch) => void patchReminder(selected, patch)}
          onDelete={() => void remove(selected)}
          onImagesChanged={(count) =>
            setImageCounts((prev) => ({ ...prev, [selected.id]: count }))
          }
          onError={setError}
        />
      )}
    </div>
  );
}

// ---- 新規登録 ----

function NewReminderForm({
  workers,
  initialWorker,
  activeNos,
  onCreated,
  onCancel,
  onError,
}: {
  workers: WorkerWithOrg[];
  initialWorker: WorkerWithOrg | null;
  activeNos: number[];
  onCreated: (row: ReminderWithWorker) => void;
  onCancel: () => void;
  onError: (message: string | null) => void;
}) {
  const [worker, setWorker] = useState<WorkerWithOrg | null>(initialWorker);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string>(REMINDER_KINDS[0]);
  const [kindOther, setKindOther] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const no = nextReminderNo(activeNos);
  const suggestions = useMemo(() => workerNameSuggestions(workers, query), [workers, query]);

  const save = async () => {
    if (!worker) {
      onError("外国人を選んでください");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      const row = await insertReminder(createClient(), {
        reminder_no: no,
        worker_id: worker.id,
        kind: kind === "その他" ? kindOther.trim() || "その他" : kind,
        content: content.trim(),
        status: "未連絡",
        contacted_on: null,
        replied_on: null,
        completed_on: null,
        note: "",
      });
      onCreated(row);
    } catch (err) {
      onError(dbErrorMessage(err, MIGRATION, errorMessage(err, "登録に失敗しました")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <p className="flex items-center gap-2 text-sm font-bold">
        督促を登録
        <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs text-brand">
          割り当てる番号: {formatReminderNo(no)}
          {no > REMINDER_BOX_SIZE && `（${REMINDER_BOX_SIZE}番まで埋まっているため）`}
        </span>
      </p>

      <div>
        <span className="text-xs font-bold text-muted">外国人</span>
        {worker ? (
          <p className="mt-1 flex items-center gap-2 text-sm">
            <span className="font-bold">{worker.name}</span>
            {worker.organizations?.name && <span className="text-muted">{worker.organizations.name}</span>}
            <button
              type="button"
              className="text-xs font-bold text-brand underline"
              onClick={() => setWorker(null)}
            >
              変える
            </button>
          </p>
        ) : (
          <div className="relative mt-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="氏名を入力して選ぶ（ふりがなでも探せます）"
              className={INPUT}
            />
            {query.trim() && suggestions.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border bg-surface shadow-lg">
                {suggestions.map((w) => (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setWorker(w);
                        setQuery("");
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm"
                    >
                      <span className="min-w-0 truncate font-bold">{w.name}</span>
                      <span className="shrink-0 text-[11px] text-muted">
                        {w.organizations?.name ?? ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">種類</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={INPUT}>
            {REMINDER_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        {kind === "その他" && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">種類（その他の内容）</span>
            <input
              value={kindOther}
              onChange={(e) => setKindOther(e.target.value)}
              placeholder="例: 年金事務所からの書類"
              className={INPUT}
            />
          </label>
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-muted">内容（何を知らせるか・何をしてもらうか）</span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder="例: 住民税の納付書が届いた。9/30までにコンビニで支払ってもらう"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </label>

      <div className="flex gap-2">
        <Button
          icon={busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "登録中…" : "登録する"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          やめる
        </Button>
      </div>
    </Card>
  );
}

// ---- 1件の詳細（進捗・メモ・会話のスクショ） ----

function ReminderModal({
  reminder,
  today,
  canWrite,
  onClose,
  onStatus,
  onPatch,
  onDelete,
  onImagesChanged,
  onError,
}: {
  reminder: ReminderWithWorker;
  today: string;
  canWrite: boolean;
  onClose: () => void;
  onStatus: (status: ReminderStatus) => void;
  onPatch: (patch: Partial<ReminderWithWorker>) => void;
  onDelete: () => void;
  onImagesChanged: (count: number) => void;
  onError: (message: string | null) => void;
}) {
  const [note, setNote] = useState(reminder.note);
  const [content, setContent] = useState(reminder.content);
  const [images, setImages] = useState<ReminderImage[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const w = reminder.workers;

  // 画像の一覧と表示用URL
  const loadImages = () => {
    listReminderImages(createClient(), reminder.id)
      .then(async (rows) => {
        setImages(rows);
        onImagesChanged(rows.length);
        const missing = rows.filter((r) => !urls[r.id]).map((r) => r.id);
        if (missing.length > 0) {
          const got = await getReminderImageUrls(missing);
          setUrls((prev) => ({ ...prev, ...got }));
        }
      })
      .catch(() => setImages([]));
  };
  useEffect(() => {
    loadImages();
    // 開いたときに1回だけ読む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminder.id]);

  const upload = async (files: FileList | File[]) => {
    if (!canWrite) return;
    setUploading(true);
    onError(null);
    try {
      for (const file of Array.from(files)) {
        await uploadReminderImage(reminder.id, file);
      }
      loadImages();
    } catch (err) {
      onError(errorMessage(err, "画像の登録に失敗しました"));
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (img: ReminderImage) => {
    onError(null);
    const res = await deleteReminderImage(img.id);
    if (!res.ok) {
      onError(res.message);
      return;
    }
    loadImages();
  };

  const setCaption = async (img: ReminderImage, caption: string) => {
    if (caption === img.caption) return;
    try {
      await updateReminderImageCaption(createClient(), img.id, caption);
      setImages((prev) => prev?.map((x) => (x.id === img.id ? { ...x, caption } : x)) ?? prev);
    } catch (err) {
      onError(errorMessage(err, "説明の保存に失敗しました"));
    }
  };

  // クリップボードから画像を貼り付け（Ctrl+V）でも登録できる
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length > 0) void upload(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminder.id, canWrite]);

  const waitDays = isAwaitingReply(reminder.status) ? daysSince(reminder.contacted_on, today) : null;

  return (
    <Modal open title={`${formatReminderNo(reminder.reminder_no)} ${w?.name ?? ""}`} onClose={onClose} wide>
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
        {/* 左: 内容・進捗・メモ */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {w && (
              <Link href={`/workers/${w.id}`} className="font-bold text-brand hover:underline">
                外国人詳細を開く
              </Link>
            )}
            {w?.organizations?.name && <span className="text-muted">・{w.organizations.name}</span>}
            {w?.messenger_link && (
              <a
                href={messengerWebUrl(w.messenger_link)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 font-bold text-brand"
              >
                <MessageCircle size={12} />
                Messenger
              </a>
            )}
          </div>

          <div>
            <p className="text-[11px] font-bold text-muted">種類</p>
            <p className="text-sm font-bold">{reminder.kind || "—"}</p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">内容</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={() => content !== reminder.content && onPatch({ content })}
              rows={2}
              disabled={!canWrite}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </label>

          <div>
            <p className="mb-1 text-[11px] font-bold text-muted">進捗（押すとその日付が自動で入ります）</p>
            <div className="flex flex-wrap gap-1.5">
              {REMINDER_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={!canWrite}
                  onClick={() => onStatus(s)}
                  className={`min-h-[36px] rounded-lg border px-3 text-xs font-bold ${
                    reminder.status === s
                      ? "border-brand bg-brand text-brand-foreground"
                      : `border-border ${statusClass(s)}`
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {waitDays !== null && waitDays > 0 && (
              <p className="mt-1 text-xs font-bold text-seal">連絡から{waitDays}日たっています。返事をもらってください。</p>
            )}
            {reminder.status === "完了" && (
              <p className="mt-1 text-xs text-muted">
                完了したので {formatReminderNo(reminder.reminder_no)} は空き番号になりました。
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["contacted_on", "連絡した日"],
                ["replied_on", "返事があった日"],
                ["completed_on", "完了した日"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-muted">{label}</span>
                <input
                  type="date"
                  value={reminder[key] ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => onPatch({ [key]: e.target.value || null })}
                  className="min-h-[36px] rounded-lg border border-border bg-background px-2 text-xs"
                />
              </label>
            ))}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">メモ（返事の内容・引き継ぎ）</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== reminder.note && onPatch({ note })}
              rows={3}
              disabled={!canWrite}
              placeholder="例: 9/8 本人から「明日払う」と返事。9/10 領収書の写真あり"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </label>

          {canWrite && (
            <div>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-seal"
              >
                <Trash2 size={13} />
                この督促を削除
              </button>
            </div>
          )}
        </div>

        {/* 右: 会話のスクショ */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-muted">
            Messengerの会話のスクショ（連絡した画面・返事の画面）
          </p>
          <FileDropArea
            onFiles={(files) => void upload(files)}
            disabled={!canWrite || uploading}
            className="rounded-xl border border-dashed border-border bg-background p-3"
            title="画像をここにドロップすると貼り付けられます"
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={inputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) void upload(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                variant="secondary"
                icon={uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                disabled={!canWrite || uploading}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? "登録中…" : "画像を選ぶ"}
              </Button>
              <span className="text-[11px] text-muted">
                ここにドラッグ＆ドロップ、または Ctrl+V（⌘V）で貼り付けできます
              </span>
            </div>
          </FileDropArea>

          {images === null ? (
            <p className="text-xs text-muted">読み込み中…</p>
          ) : images.length === 0 ? (
            <p className="text-xs text-muted">まだ画像はありません。</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {images.map((img) => (
                <div key={img.id} className="rounded-xl border border-border bg-surface p-1.5">
                  {urls[img.id] ? (
                    img.mime_type.startsWith("image/") ? (
                      <a href={urls[img.id]} target="_blank" rel="noopener noreferrer">
                        {/* 署名付きURLの一時画像なので next/image は使わない */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={urls[img.id]}
                          alt={img.caption || img.file_name}
                          className="max-h-56 w-full rounded-lg object-contain"
                        />
                      </a>
                    ) : (
                      <a
                        href={urls[img.id]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-bold text-brand"
                      >
                        <ExternalLink size={12} />
                        {img.file_name}
                      </a>
                    )
                  ) : (
                    <div className="flex h-24 items-center justify-center text-xs text-muted">読み込み中…</div>
                  )}
                  <div className="mt-1 flex items-center gap-1">
                    <input
                      defaultValue={img.caption}
                      placeholder="説明（例: 9/7 連絡）"
                      disabled={!canWrite}
                      onBlur={(e) => void setCaption(img, e.target.value.trim())}
                      className="min-h-[30px] w-full rounded-lg border border-border bg-background px-2 text-[11px]"
                    />
                    {canWrite && (
                      <button
                        type="button"
                        aria-label="この画像を削除"
                        onClick={() => void removeImage(img)}
                        className="shrink-0 text-muted hover:text-seal"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted">{img.created_at.slice(0, 10)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="この督促を削除しますか？"
        message="貼り付けた画像も一緒に消えます。完了にして残しておく場合は「完了」を押してください。"
        confirmLabel="削除する"
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Modal>
  );
}
