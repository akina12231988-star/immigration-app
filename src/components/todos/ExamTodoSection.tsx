"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { AttachedFileButton } from "@/components/ui/AttachedFileButton";
import { CopyButton } from "@/components/ui/CopyButton";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { listTodoFiles } from "@/lib/supabase/queries/todo-files";
import {
  createTodoFileTicket,
  deleteTodoFile,
  getTodoFilePreviewUrl,
  registerTodoFile,
} from "@/app/(app)/todos/file-actions";
import { deleteHistory, insertHistory, updateHistory } from "@/lib/supabase/queries/histories";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { PassportMrzPanel, SavedMrzCopyList } from "@/components/workers/PassportMrzPanel";
import { dbErrorMessage } from "@/lib/errors";
import { todayStr } from "@/lib/ssw/calc";
import {
  canAddExamAttempt,
  emptyExamAttempt,
  EXAM_CONTENT_CHOICES,
  EXAM_RESULTS,
  isSsw2ExamTitle,
  normalizeTodoExam,
  overdueExamAttempts,
  passedExamAttempt,
  ssw2ExamName,
  withExamSummary,
  type ExamResult,
  type TodoExam,
  type TodoExamAttempt,
} from "@/lib/todo";
import { VISA_TYPES } from "@/types/ssw";
import type { TodoRow } from "@/lib/supabase/queries/todos";
import type { TodoFileRow, Worker, WorkHistoryRow } from "@/types/db";

const INPUT =
  "min-h-[36px] rounded-lg border border-border bg-surface px-2 text-xs focus:border-brand focus:outline-none";

// 試験の申込のTODOの詳細。
//
// ２号試験の申込に必要なデータ（名前・生年月日・国籍・住所・パスポート）は
// 外国人詳細の登録から自動で出し、そのままコピーして申込サイトに写せる。
// アカウントの情報（アプリケーションNo.・プロメトリックIDなど）は何回申し込んでも同じなので1つ、
// 申込日・試験日・代金・合否は「何回目」ごとに残す（不合格ならまた申し込むため）。
//
// うっかり書き換わらないよう、ふだんは見るだけで、「編集」を押したときだけ直せる。
export function ExamTodoSection({
  todo,
  canEdit,
  onChangeExam,
}: {
  todo: TodoRow;
  canEdit: boolean;
  onChangeExam: (exam: TodoExam) => void;
}) {
  const saved = normalizeTodoExam(todo.exam);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TodoExam>(saved);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayStr();

  // 見るだけのときは、保存されている内容をそのまま出す
  const exam = editing ? draft : saved;
  const set = (patch: Partial<TodoExam>) => setDraft((d) => ({ ...d, ...patch }));
  const setAttempt = (index: number, patch: Partial<TodoExamAttempt>) =>
    setDraft((d) => ({
      ...d,
      attempts: d.attempts.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }));

  const startEdit = () => {
    setDraft(normalizeTodoExam(todo.exam));
    setNotice(null);
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    const next = withExamSummary(draft);
    onChangeExam(next);
    setEditing(false);
    // 合格していたら、本人の情報に「特定技能2号合格」として残す（外国人詳細でバッジが出る）
    const passed = passedExamAttempt(next);
    if (passed && isSsw2ExamTitle(todo.title) && todo.worker_id) {
      const name = ssw2ExamName(todo.title, next.exam_choice);
      try {
        await updateWorker(createClient(), todo.worker_id, { ssw2_exam: name });
        setNotice(
          `${passed.no}回目が合格だったので、本人の情報に「特定技能2号合格」として登録しました（試験名: ${name}）。違うときは外国人詳細で直せます。`,
        );
      } catch (err) {
        setError(dbErrorMessage(err, "0060_worker_ssw2_exam.sql", "本人の情報に残せませんでした"));
      }
    }
  };

  const overdue = overdueExamAttempts(exam, today);
  const passed = passedExamAttempt(exam);

  return (
    <div className="mt-2 space-y-2 border-t border-dashed border-border pt-2">
      {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
      {notice && (
        <p role="status" className="rounded-lg bg-brand/10 px-2.5 py-1.5 text-[11px] text-brand">
          {notice}
        </p>
      )}

      {/* 合格・試験日過ぎの知らせ */}
      {passed && (
        <p className="rounded-lg border border-status-approved-fg/40 bg-status-approved-bg px-2.5 py-2 text-xs font-bold text-status-approved-fg">
          🎉 {passed.no}回目（{passed.attempt.exam_date || "試験日未登録"}）で合格しています。
          {isSsw2ExamTitle(todo.title) && "本人の情報にも「特定技能2号合格」として残ります。"}
        </p>
      )}
      {overdue.map((a, i) => (
        <p
          key={`overdue-${i}`}
          className="rounded-lg border border-seal/50 bg-seal/10 px-2.5 py-2 text-xs font-bold text-seal"
        >
          ⚠ 試験日（{a.exam_date}）を過ぎています。合否を確認して入れてください。
        </p>
      ))}

      {/* 見るだけ ⇔ 編集 */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => void save()}
                className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-foreground"
              >
                <Check size={13} />
                保存する
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted"
              >
                <X size={13} />
                やめる
              </button>
              <span className="text-[11px] text-muted">
                「保存する」を押すまで、直した内容は残りません。
              </span>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={startEdit}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold"
              >
                <Pencil size={13} />
                編集
              </button>
              <span className="text-[11px] text-muted">
                うっかり書き換わらないよう、「編集」を押したときだけ直せます。
              </span>
            </>
          )}
        </div>
      )}

      {/* 希望する受験内容（２号農業試験申込のとき） */}
      {todo.title === "２号農業試験申込" &&
        (editing ? (
          <label className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-muted">
            希望する受験内容
            <select
              value={exam.exam_choice}
              onChange={(e) => set({ exam_choice: e.target.value })}
              className={INPUT}
            >
              <option value="">選択してください</option>
              {exam.exam_choice && !EXAM_CONTENT_CHOICES.some((c) => c === exam.exam_choice) && (
                <option value={exam.exam_choice}>{exam.exam_choice}</option>
              )}
              {EXAM_CONTENT_CHOICES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <ReadItem label="希望する受験内容" value={exam.exam_choice} />
        ))}

      {/* 申込に使うアカウントの情報（何回申し込んでも同じ。押すとコピーできる） */}
      <div className="rounded-lg border border-border bg-background p-2">
        <p className="mb-1 text-[11px] font-bold text-muted">
          申込に使うアカウント（押すとコピーできます）
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ExamField
            label="アプリケーションNo."
            value={exam.application_no}
            editing={editing}
            placeholder="発行されたら入力"
            onChange={(v) => set({ application_no: v })}
          />
          <ExamField
            label="プロメトリックID"
            value={exam.prometric_id}
            editing={editing}
            onChange={(v) => set({ prometric_id: v })}
          />
          <ExamField
            label="パスワード"
            value={exam.password}
            editing={editing}
            onChange={(v) => set({ password: v })}
          />
          <ExamField
            label="ログイン先のメールアドレス"
            value={exam.login_email}
            editing={editing}
            placeholder="example@mail.com"
            onChange={(v) => set({ login_email: v })}
          />
          {editing ? (
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              メールアドレスを作ったのは
              <select
                value={exam.login_email_owner}
                onChange={(e) => set({ login_email_owner: e.target.value })}
                className={INPUT}
              >
                <option value="">—</option>
                <option value="本人が作成">本人が作成</option>
                <option value="弊社が作成">弊社が作成</option>
              </select>
            </label>
          ) : (
            <ReadItem label="メールアドレスを作ったのは" value={exam.login_email_owner} />
          )}
          {exam.login_email_owner === "弊社が作成" && (
            <ExamField
              label="メールアドレスのパスワード（弊社作成のため記録）"
              value={exam.login_email_password}
              editing={editing}
              onChange={(v) => set({ login_email_password: v })}
            />
          )}
        </div>
      </div>

      {/* 何回目の申込か（不合格ならまた申し込むので、回ごとに残す） */}
      <div className="rounded-lg border border-border bg-background p-2">
        <p className="mb-1 text-[11px] font-bold text-muted">
          申込（{exam.attempts.length}回目まで）
        </p>
        <div className="flex flex-col gap-2">
          {exam.attempts.map((a, i) => (
            <ExamAttemptRow
              key={i}
              no={i + 1}
              attempt={a}
              editing={editing}
              today={today}
              onChange={(patch) => setAttempt(i, patch)}
            />
          ))}
        </div>
        {editing && canAddExamAttempt(exam) && (
          <button
            type="button"
            onClick={() => set({ attempts: [...exam.attempts, emptyExamAttempt()] })}
            className="mt-2 flex items-center gap-1 rounded-lg border border-dashed border-brand px-2.5 py-1.5 text-[11px] font-bold text-brand"
          >
            <Plus size={12} />
            次（{exam.attempts.length + 1}回目）の申込を足す
          </button>
        )}
        {editing && !canAddExamAttempt(exam) && (
          <p className="mt-2 text-[11px] text-muted">
            {passed
              ? "合格しているので、次の申込は要りません。"
              : "最後の回を「不合格」にすると、次の申込を足せます。"}
          </p>
        )}
      </div>

      {/* 発行されたアプリケーションNo.（PDF・画像）の添付 */}
      <div className="rounded-lg bg-background p-2">
        <p className="mb-1 text-[11px] font-bold text-muted">
          発行されたアプリケーションNo.（PDF・画像）
        </p>
        <TodoFileAttachments todoId={todo.id} kind="アプリケーションNo." canEdit={canEdit} />
      </div>

      {/* ２号試験の申込に必要なデータ（外国人詳細から自動反映）＋パスポート＋職歴 */}
      {todo.worker_id && <ExamWorkerInfo workerId={todo.worker_id} canEdit={canEdit} />}
    </div>
  );
}

// 見るだけの1項目（値があれば押してコピーできる）
function ReadItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
      {label}
      <span className="flex min-h-[36px] items-center gap-1 rounded-lg border border-border bg-surface px-2">
        {value ? (
          <>
            <span className="min-w-0 break-all text-xs font-bold text-foreground">{value}</span>
            <CopyButton value={value} label={`${label}をコピー`} size={13} />
          </>
        ) : (
          <span className="text-xs font-normal text-muted">未入力</span>
        )}
      </span>
    </div>
  );
}

// アカウントの1項目。編集中は入力欄、ふだんは見るだけ（コピーできる）
function ExamField({
  label,
  value,
  editing,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  editing: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  if (!editing) return <ReadItem label={label} value={value} />;
  return (
    <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT}
      />
    </label>
  );
}

// 1回ぶんの申込（申込済み・試験日・代金・代金の受け取り・合否）
function ExamAttemptRow({
  no,
  attempt,
  editing,
  today,
  onChange,
}: {
  no: number;
  attempt: TodoExamAttempt;
  editing: boolean;
  today: string;
  onChange: (patch: Partial<TodoExamAttempt>) => void;
}) {
  const resultClass =
    attempt.result === "合格"
      ? "border-status-approved-fg/40 bg-status-approved-bg"
      : attempt.result === "不合格"
        ? "border-seal/40 bg-seal/5"
        : "border-border bg-surface";

  return (
    <div className={`rounded-lg border p-2 ${resultClass}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">
          {no}回目
        </span>
        {/* 申込済みかどうか */}
        {editing ? (
          <label className="flex items-center gap-1 text-[11px] font-bold">
            <input
              type="checkbox"
              checked={attempt.applied}
              onChange={(e) =>
                onChange({
                  applied: e.target.checked,
                  applied_on: e.target.checked ? attempt.applied_on || today : attempt.applied_on,
                })
              }
              className="h-4 w-4"
            />
            申込済み
          </label>
        ) : (
          <span
            className={`text-[11px] font-bold ${attempt.applied ? "text-status-approved-fg" : "text-muted"}`}
          >
            {attempt.applied ? `申込済み（${attempt.applied_on || "日付未登録"}）` : "まだ申し込んでいません"}
          </span>
        )}
        {attempt.result && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
              attempt.result === "合格"
                ? "bg-status-approved-fg/15 text-status-approved-fg"
                : "bg-seal/15 text-seal"
            }`}
          >
            {attempt.result}
            {attempt.result_on && `（${attempt.result_on} 確認）`}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {editing ? (
          <>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              申込日
              <input
                type="date"
                value={attempt.applied_on}
                onChange={(e) => onChange({ applied_on: e.target.value })}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              試験日
              <input
                type="date"
                value={attempt.exam_date}
                onChange={(e) => onChange({ exam_date: e.target.value })}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              代金
              <input
                value={attempt.fee}
                onChange={(e) => onChange({ fee: e.target.value })}
                placeholder="例: 8,000円"
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              合否
              <select
                value={attempt.result}
                onChange={(e) =>
                  onChange({
                    result: e.target.value as ExamResult,
                    result_on: e.target.value ? attempt.result_on || today : "",
                  })
                }
                className={INPUT}
              >
                <option value="">未確認</option>
                {EXAM_RESULTS.filter(Boolean).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted sm:col-span-2">
              メモ（会場・不合格の理由など）
              <input
                value={attempt.note}
                onChange={(e) => onChange({ note: e.target.value })}
                className={INPUT}
              />
            </label>
          </>
        ) : (
          <>
            <ReadItem label="試験日" value={attempt.exam_date} />
            <ReadItem label="代金" value={attempt.fee} />
            {attempt.note && <ReadItem label="メモ" value={attempt.note} />}
          </>
        )}
      </div>

      {/* 代金を本人から受け取ったかの確認。編集中でなくても押せる（そのまま保存する） */}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {attempt.fee_received ? (
          <span className="flex items-center gap-1 text-[11px] font-bold text-status-approved-fg">
            <Check size={12} />
            代金は本人から受け取りました
            {attempt.fee_received_on && `（${attempt.fee_received_on}）`}
          </span>
        ) : (
          <span className="text-[11px] font-bold text-seal">代金はまだ受け取っていません</span>
        )}
        {editing && (
          <button
            type="button"
            onClick={() =>
              onChange({
                fee_received: !attempt.fee_received,
                fee_received_on: attempt.fee_received ? "" : today,
              })
            }
            className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-brand"
          >
            {attempt.fee_received ? "受け取りを取り消す" : "本人から受け取った"}
          </button>
        )}
      </div>
    </div>
  );
}

// TODOへのファイル添付（発行されたアプリケーションNo.など・複数可）。求人の添付と同じ方式
function TodoFileAttachments({
  todoId,
  kind,
  canEdit,
}: {
  todoId: string;
  kind: string;
  canEdit: boolean;
}) {
  const [files, setFiles] = useState<TodoFileRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    listTodoFiles(createClient(), todoId)
      .then((rows) => {
        if (!cancelled) setFiles(rows.filter((r) => r.kind === kind));
      })
      .catch(() => undefined); // 0109未適用のときは空のまま（登録時に案内を出す）
    return () => {
      cancelled = true;
    };
  }, [todoId, kind]);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        const { blob, mimeType, fileName } = await compressImage(file);
        const ticket = await createTodoFileTicket(todoId, fileName, mimeType);
        if (!ticket.ok) throw new Error(ticket.message);
        const { error: upErr } = await createClient()
          .storage.from("app-files")
          .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
        if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
        const res = await registerTodoFile(todoId, kind, ticket.path, fileName, mimeType);
        if (!res.ok) throw new Error(res.message);
      }
      setFiles((await listTodoFiles(createClient(), todoId)).filter((r) => r.kind === kind));
    } catch (err) {
      setError(dbErrorMessage(err, "0109_todo_exam_fields.sql", "アップロードに失敗しました"));
    } finally {
      setBusy(false);
    }
  }

  async function preview(id: string) {
    const res = await getTodoFilePreviewUrl(id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  }

  async function remove(f: TodoFileRow) {
    if (!window.confirm(`「${f.file_name}」を削除します。よろしいですか？`)) return;
    setError(null);
    const res = await deleteTodoFile(f.id);
    if (res.ok) setFiles((prev) => prev.filter((x) => x.id !== f.id));
    else setError(res.message);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
      {files.length === 0 && !canEdit && (
        <p className="text-[11px] text-muted">添付されたファイルはありません。</p>
      )}
      {files.map((f) => (
        <div key={f.id} className="flex items-center gap-1.5">
          <AttachedFileButton
            fileName={f.file_name}
            note={f.created_at.slice(0, 10)}
            onOpen={() => preview(f.id)}
            className="flex-1"
          />
          {canEdit && (
            <button
              type="button"
              onClick={() => remove(f)}
              aria-label="削除"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-seal"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <>
          {/* ボタンからでも、枠にドラッグ＆ドロップでも添付できる */}
          <FileDropArea
            onFiles={(files) => void handleFiles(files)}
            disabled={busy}
            className="flex flex-col gap-1 rounded-lg border border-dashed border-border p-2"
          >
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-1.5 self-start rounded-lg border border-dashed border-brand px-3 py-2 text-xs font-bold text-brand disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {busy ? "アップロード中…" : "発行されたものを添付（PDF・画像）"}
            </button>
            <p className="text-[11px] text-muted">
              PDF・画像をこの枠にドラッグ＆ドロップしても添付できます。
            </p>
          </FileDropArea>
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
  );
}

// ２号試験の申込に必要なデータ。外国人詳細ページの登録内容をそのまま反映して表示し、
// 職歴はこの場で見て編集もできる
function ExamWorkerInfo({ workerId, canEdit }: { workerId: string; canEdit: boolean }) {
  const [data, setData] = useState<{
    worker: Worker;
    histories: WorkHistoryRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    createClient()
      .from("workers")
      .select("*, work_histories(*)")
      .eq("id", workerId)
      .order("start_date", { referencedTable: "work_histories", ascending: true })
      .maybeSingle()
      .then(({ data: row, error: err }) => {
        if (err) {
          setError(err.message);
          return;
        }
        if (row) {
          const { work_histories, ...worker } = row as Worker & {
            work_histories: WorkHistoryRow[];
          };
          setData({ worker, histories: work_histories ?? [] });
        }
      });
  };

  // 開いたときに外国人詳細の登録内容を読み込む
  useEffect(load, [workerId]);

  if (error) {
    return <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>;
  }
  if (!data) {
    return <p className="text-[11px] text-muted">外国人の情報を読み込み中…</p>;
  }
  const w = data.worker;
  // 押すとコピーできる1項目（申込サイトへそのまま写せるように）
  const item = (label: string, value: string | null | undefined) => (
    <p className="flex items-center gap-1 text-[11px] leading-relaxed">
      <span className="text-muted">{label}: </span>
      {value ? (
        <>
          <span className="min-w-0 break-all font-bold">{value}</span>
          <CopyButton value={value} label={`${label}をコピー`} size={12} />
        </>
      ) : (
        <span className="text-seal">未登録</span>
      )}
    </p>
  );

  // パスポートのMRZ（下2行）を保存する。外国人詳細で読み取ったものと同じ場所に入る
  const applyMrz = (fields: Record<string, string>) => {
    setError(null);
    updateWorker(createClient(), workerId, fields as Parameters<typeof updateWorker>[2])
      .then(load)
      .catch((err) =>
        setError(dbErrorMessage(err, "0095_worker_passport_mrz.sql", "保存に失敗しました")),
      );
  };

  return (
    <div className="rounded-lg bg-background p-2">
      <p className="mb-1 flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold text-muted">
        試験の申込に必要なデータ（外国人詳細から自動反映・押すとコピーできます）
        <Link href={`/workers/${workerId}`} className="font-bold text-brand hover:underline">
          外国人詳細で直す →
        </Link>
      </p>
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        {item("名前", w.name)}
        {item("フリガナ", w.kana)}
        {item("生年月日", w.birth)}
        {item("性別", w.gender)}
        {item("国籍", w.nationality)}
        {item("日本での住所", w.address)}
        {item("パスポート番号", w.passport_no)}
        {item("パスポート有効期限", w.passport_expiry_date)}
      </div>

      {/* パスポートの券面（MRZ）から読み取った内容。申込サイトにはローマ字の氏名などが要るため、
          外国人詳細で読み取ったものをここでもそのままコピーできるようにする。
          まだ読み取っていなければ、この画面から入れられる */}
      <div className="mt-2 border-t border-dashed border-border pt-1.5">
        <p className="mb-1 text-[11px] font-bold text-muted">パスポート（MRZ）から読み取った内容</p>
        {w.passport_mrz ? (
          <SavedMrzCopyList mrz={w.passport_mrz} today={todayStr()} />
        ) : canEdit ? (
          <div className="space-y-1">
            <p className="text-[11px] text-muted">
              まだ読み取っていません。パスポートの画像の下2行（MRZ）を入れると、
              ローマ字の氏名・パスポート番号・生年月日などをそのままコピーできるようになります。
              読み取った内容は外国人詳細のパスポートにも入ります。
            </p>
            <PassportMrzPanel today={todayStr()} onApply={applyMrz} />
          </div>
        ) : (
          <p className="text-[11px] text-muted">まだ読み取っていません。</p>
        )}
      </div>

      {/* 職歴（外国人詳細と同じデータ。この場で編集できる） */}
      <div className="mt-2 border-t border-dashed border-border pt-1.5">
        <p className="mb-1 text-[11px] font-bold text-muted">職歴（この場で編集できます）</p>
        <ExamHistoryEditor
          workerId={workerId}
          histories={data.histories}
          canEdit={canEdit}
          onChanged={load}
        />
      </div>
    </div>
  );
}

// 職歴の一覧＋編集（外国人詳細の職歴と同じ work_histories を直接読み書きする）
function ExamHistoryEditor({
  workerId,
  histories,
  canEdit,
  onChanged,
}: {
  workerId: string;
  histories: WorkHistoryRow[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    fn()
      .then(onChanged)
      .catch((err) => setError(err instanceof Error ? err.message : "保存に失敗しました"));
  };

  return (
    <div className="space-y-1.5">
      {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
      {histories.length === 0 && (
        <p className="text-[11px] text-muted">職歴はまだ登録されていません。</p>
      )}
      {histories.map((h) => (
        <ExamHistoryRow
          key={h.id}
          history={h}
          canEdit={canEdit}
          onSave={(patch) => run(() => updateHistory(createClient(), h.id, patch))}
          onDelete={() => {
            if (window.confirm(`職歴「${h.org_name || h.role}」を削除します。よろしいですか？`)) {
              run(() => deleteHistory(createClient(), h.id));
            }
          }}
        />
      ))}
      {canEdit && (
        <button
          type="button"
          onClick={() =>
            run(() =>
              insertHistory(createClient(), {
                worker_id: workerId,
                visa: "技能実習",
                start_date: todayStr(),
                end_date: null,
                org_name: "",
                prefecture: "",
                role: "",
                note: "",
                kept_residence_status: false,
              }),
            )
          }
          className="flex items-center gap-1 rounded-lg border border-dashed border-brand px-2.5 py-1.5 text-[11px] font-bold text-brand"
        >
          <Plus size={12} />
          職歴を追加
        </button>
      )}
    </div>
  );
}

function ExamHistoryRow({
  history,
  canEdit,
  onSave,
  onDelete,
}: {
  history: WorkHistoryRow;
  canEdit: boolean;
  onSave: (patch: Partial<WorkHistoryRow>) => void;
  onDelete: () => void;
}) {
  const [org, setOrg] = useState(history.org_name);
  const [role, setRole] = useState(history.role);

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface p-1.5">
      <select
        value={history.visa}
        disabled={!canEdit}
        onChange={(e) => onSave({ visa: e.target.value as WorkHistoryRow["visa"] })}
        aria-label="在留資格"
        className={INPUT}
      >
        {VISA_TYPES.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={history.start_date}
        disabled={!canEdit}
        onChange={(e) => e.target.value && onSave({ start_date: e.target.value })}
        aria-label="開始日"
        className={INPUT}
      />
      <span className="text-[11px] text-muted">〜</span>
      <input
        type="date"
        value={history.end_date ?? ""}
        disabled={!canEdit}
        onChange={(e) => onSave({ end_date: e.target.value || null })}
        aria-label="終了日（空で継続中）"
        className={INPUT}
      />
      <input
        value={org}
        disabled={!canEdit}
        onChange={(e) => setOrg(e.target.value)}
        onBlur={() => {
          if (org !== history.org_name) onSave({ org_name: org });
        }}
        placeholder="会社・機関名"
        className={`${INPUT} min-w-[8rem] flex-1`}
      />
      <input
        value={role}
        disabled={!canEdit}
        onChange={(e) => setRole(e.target.value)}
        onBlur={() => {
          if (role !== history.role) onSave({ role });
        }}
        placeholder="職種・仕事内容"
        className={`${INPUT} min-w-[6rem] flex-1`}
      />
      {canEdit && (
        <button type="button" aria-label="この職歴を削除" onClick={onDelete} className="text-seal">
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}
