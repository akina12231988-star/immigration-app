"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, Loader2, Plus, Trash2, Upload } from "lucide-react";
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
import { dbErrorMessage } from "@/lib/errors";
import { todayStr } from "@/lib/ssw/calc";
import {
  EXAM_CONTENT_CHOICES,
  normalizeTodoExam,
  type TodoExam,
} from "@/lib/todo";
import { VISA_TYPES } from "@/types/ssw";
import type { TodoRow } from "@/lib/supabase/queries/todos";
import type { TodoFileRow, Worker, WorkHistoryRow } from "@/types/db";

const INPUT =
  "min-h-[36px] rounded-lg border border-border bg-surface px-2 text-xs focus:border-brand focus:outline-none";

// 試験の申込のTODOの詳細。
// ２号試験の申込に必要なデータ（名前・生年月日・国籍・住所・パスポート・職歴）は
// 外国人詳細ページの登録から自動反映し、申込日・試験日・アプリケーションNo.などを記録する
export function ExamTodoSection({
  todo,
  canEdit,
  onChangeExam,
}: {
  todo: TodoRow;
  canEdit: boolean;
  onChangeExam: (exam: TodoExam) => void;
}) {
  const exam = normalizeTodoExam(todo.exam);
  const set = (patch: Partial<TodoExam>) => onChangeExam({ ...exam, ...patch });

  // 試験日を過ぎて結果が未確認ならアラートを出す
  const overdue =
    exam.exam_date !== "" && exam.exam_date < todayStr() && !exam.result_checked;

  return (
    <div className="mt-2 space-y-2 border-t border-dashed border-border pt-2">
      {overdue && (
        <p className="rounded-lg border border-seal/50 bg-seal/10 px-2.5 py-2 text-xs font-bold text-seal">
          ⚠ 試験日（{exam.exam_date}）を過ぎています。試験結果を確認してください。
        </p>
      )}

      {/* ２号農業試験申込のときは、どちらの試験を希望するかを選ぶ */}
      {todo.title === "２号農業試験申込" && (
        <label className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-muted">
          希望する受験内容
          <select
            value={exam.exam_choice}
            disabled={!canEdit}
            onChange={(e) => set({ exam_choice: e.target.value })}
            className={INPUT}
          >
            <option value="">選択してください</option>
            {exam.exam_choice &&
              !EXAM_CONTENT_CHOICES.some((c) => c === exam.exam_choice) && (
                <option value={exam.exam_choice}>{exam.exam_choice}</option>
              )}
            {EXAM_CONTENT_CHOICES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[11px] font-bold text-muted">
          試験の申込日
          <input
            type="date"
            value={exam.applied_on}
            disabled={!canEdit}
            onChange={(e) => set({ applied_on: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="flex items-center gap-2 text-[11px] font-bold text-muted">
          試験日
          <input
            type="date"
            value={exam.exam_date}
            disabled={!canEdit}
            onChange={(e) => set({ exam_date: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] font-bold">
          <input
            type="checkbox"
            checked={exam.result_checked}
            disabled={!canEdit}
            onChange={(e) => set({ result_checked: e.target.checked })}
            className="h-4 w-4"
          />
          試験結果を確認した
        </label>
      </div>

      {/* アプリケーションNo.・プロメトリックID・パスワード・ログイン先メール */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
          アプリケーションNo.
          <input
            value={exam.application_no}
            disabled={!canEdit}
            onChange={(e) => set({ application_no: e.target.value })}
            placeholder="発行されたら入力"
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
          プロメトリックID
          <input
            value={exam.prometric_id}
            disabled={!canEdit}
            onChange={(e) => set({ prometric_id: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
          パスワード
          <input
            value={exam.password}
            disabled={!canEdit}
            onChange={(e) => set({ password: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
          ログイン先のメールアドレス
          <input
            value={exam.login_email}
            disabled={!canEdit}
            onChange={(e) => set({ login_email: e.target.value })}
            placeholder="example@mail.com"
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
          メールアドレスを作ったのは
          <select
            value={exam.login_email_owner}
            disabled={!canEdit}
            onChange={(e) => set({ login_email_owner: e.target.value })}
            className={INPUT}
          >
            <option value="">—</option>
            <option value="本人が作成">本人が作成</option>
            <option value="弊社が作成">弊社が作成</option>
          </select>
        </label>
        {exam.login_email_owner === "弊社が作成" && (
          <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
            メールアドレスのパスワード（弊社作成のため記録）
            <input
              value={exam.login_email_password}
              disabled={!canEdit}
              onChange={(e) => set({ login_email_password: e.target.value })}
              className={INPUT}
            />
          </label>
        )}
      </div>

      {/* 発行されたアプリケーションNo.（PDF・画像）の添付 */}
      <div className="rounded-lg bg-background p-2">
        <p className="mb-1 text-[11px] font-bold text-muted">
          発行されたアプリケーションNo.（PDF・画像）
        </p>
        <TodoFileAttachments todoId={todo.id} kind="アプリケーションNo." canEdit={canEdit} />
      </div>

      {/* ２号試験の申込に必要なデータ（外国人詳細から自動反映）＋職歴 */}
      {todo.worker_id && <ExamWorkerInfo workerId={todo.worker_id} canEdit={canEdit} />}
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
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{f.file_name}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted">
            {f.created_at.slice(0, 10)}
          </span>
          <button
            type="button"
            onClick={() => preview(f.id)}
            aria-label="表示"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted hover:text-brand"
          >
            <Eye size={13} />
          </button>
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
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 self-start rounded-lg border border-dashed border-brand px-3 py-2 text-xs font-bold text-brand disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {busy ? "アップロード中…" : "発行されたものを添付（PDF・画像）"}
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
  const item = (label: string, value: string | null | undefined) => (
    <p className="text-[11px] leading-relaxed">
      <span className="text-muted">{label}: </span>
      {value ? (
        <span className="font-bold">{value}</span>
      ) : (
        <span className="text-seal">未登録</span>
      )}
    </p>
  );

  return (
    <div className="rounded-lg bg-background p-2">
      <p className="mb-1 flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold text-muted">
        試験の申込に必要なデータ（外国人詳細から自動反映）
        <Link href={`/workers/${workerId}`} className="font-bold text-brand hover:underline">
          外国人詳細で直す →
        </Link>
      </p>
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        {item("名前", w.name)}
        {item("生年月日", w.birth)}
        {item("性別", w.gender)}
        {item("国籍", w.nationality)}
        {item("日本での住所", w.address)}
        {item("パスポート番号", w.passport_no)}
        {item("パスポート有効期限", w.passport_expiry_date)}
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
