"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus, Settings2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { createClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import {
  TODO_CHECK_KIND,
  TODO_KINDS,
  TODO_STAGES,
  isCheckingStatus,
  stageOfStatus,
  type TodoKind,
  type TodoStage,
  type TodoStatusOption,
} from "@/lib/todo";
import {
  deleteTodo,
  deleteTodoStatusOption,
  insertTodo,
  insertTodoStatusOption,
  listTodoStatusOptions,
  listTodos,
  renameTodoStatusOption,
  updateTodo,
  type TodoRow,
} from "@/lib/supabase/queries/todos";

const INPUT =
  "min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

// TODO（NotionのTODOデータベースの置き換え）。
// 申請準備・退職の随時報告書・試験の申込の3つの構成で、番号は通しで自動採番。
// ステータス（経過）の選択肢は「選択肢の編集」から随時追加・変更・削除して運用できる
export function TodosClient({ canEdit }: { canEdit: boolean }) {
  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [options, setOptions] = useState<TodoStatusOption[]>([]);
  const [workers, setWorkers] = useState<{ id: string; label: string }[]>([]);
  const [kind, setKind] = useState<TodoKind>("申請準備");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 追加フォーム
  const [newWorkerId, setNewWorkerId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newNo, setNewNo] = useState("");
  const [adding, setAdding] = useState(false);

  const load = () => {
    const supabase = createClient();
    return Promise.all([listTodos(supabase), listTodoStatusOptions(supabase)])
      .then(([t, o]) => {
        setTodos(t);
        setOptions(o);
        setError(null);
      })
      .catch((err) => setError(dbErrorMessage(err, "0102_todos.sql", "TODOの読み込みに失敗しました")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
    // 追加フォームの外国人の候補
    void createClient()
      .from("workers")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        setWorkers(
          ((data as { id: string; name: string }[] | null) ?? []).map((w) => ({
            id: w.id,
            label: w.name,
          })),
        );
      });
  }, []);

  const kindOptions = useMemo(() => options.filter((o) => o.kind === kind), [options, kind]);
  const checkOptions = useMemo(
    () => options.filter((o) => o.kind === TODO_CHECK_KIND),
    [options],
  );
  const kindTodos = useMemo(() => todos.filter((t) => t.kind === kind), [todos, kind]);

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
      await load();
    } catch (err) {
      setError(dbErrorMessage(err, "0102_todos.sql", "保存に失敗しました"));
    }
  };

  const add = () =>
    run(async () => {
      setAdding(true);
      try {
        await insertTodo(createClient(), {
          kind,
          worker_id: newWorkerId || null,
          title: newTitle.trim(),
          todo_no: newNo.trim() || undefined,
        });
        setNewWorkerId("");
        setNewTitle("");
        setNewNo("");
      } finally {
        setAdding(false);
      }
    });

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
        <ClipboardList size={14} className="mt-0.5 shrink-0" />
        NotionのTODOの置き換えです。番号は通しで自動採番されます（申請準備からTODO番号を発行したときもここに入ります）。ステータス（経過）の選択肢は「選択肢の編集」からいつでも追加・変更できます。
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* 3つの構成の切り替え */}
      <div className="flex flex-wrap gap-2">
        {TODO_KINDS.map((k) => {
          const active = kind === k;
          const count = todos.filter(
            (t) => t.kind === k && stageOfStatus(t.status, options.filter((o) => o.kind === k)) !== "完了",
          ).length;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-xl border px-3 py-2 text-sm font-bold ${
                active ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface text-muted"
              }`}
            >
              {k}（残{count}）
            </button>
          );
        })}
      </div>

      {/* 追加 */}
      {canEdit && (
        <Card className="flex flex-wrap items-end gap-2 p-4">
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">外国人（任意）</span>
            <Combobox
              options={workers}
              value={newWorkerId}
              onChange={setNewWorkerId}
              placeholder="氏名で検索して選択"
            />
          </label>
          <label className="flex min-w-[12rem] flex-[2] flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">内容（任意）</span>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={`例: ${kind}のTODO`}
              className={INPUT}
            />
          </label>
          <label className="flex w-28 flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">番号（空で自動）</span>
            <input
              value={newNo}
              onChange={(e) => setNewNo(e.target.value)}
              placeholder="自動"
              className={`${INPUT} text-right tabular-nums`}
            />
          </label>
          <Button icon={<Plus size={15} />} disabled={adding} onClick={() => void add()}>
            {adding ? "追加中…" : "TODOを追加"}
          </Button>
        </Card>
      )}

      {/* 未着手 → 進行中 → 完了 の順に表示 */}
      {loading ? (
        <Card className="p-6 text-center text-sm text-muted">読み込み中…</Card>
      ) : (
        TODO_STAGES.map((stage) => {
          const rows = kindTodos.filter((t) => stageOfStatus(t.status, kindOptions) === stage);
          return (
            <Card key={stage} className="p-4">
              <h2 className="mb-2 text-sm font-bold text-muted">
                {stage}（{rows.length}件）
              </h2>
              {rows.length === 0 ? (
                <p className="rounded-xl bg-background p-3 text-center text-xs text-muted">
                  {stage}のTODOはありません。
                </p>
              ) : (
                <div className="space-y-2">
                  {rows.map((t) => (
                    <TodoItem
                      key={t.id}
                      todo={t}
                      statusOptions={kindOptions}
                      checkOptions={checkOptions}
                      canEdit={canEdit}
                      onChange={(patch) => run(() => updateTodo(createClient(), t.id, patch))}
                      onDelete={() => {
                        if (
                          window.confirm(
                            `TODO No.${t.todo_no}（${t.worker_name ?? (t.title || "内容なし")}）を削除します。よろしいですか？`,
                          )
                        ) {
                          void run(() => deleteTodo(createClient(), t.id));
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </Card>
          );
        })
      )}

      {/* ステータス（経過）の選択肢の編集。状況に応じて随時変更してそのまま運用できる */}
      {canEdit && !loading && (
        <details className="rounded-2xl border border-border bg-surface p-4">
          <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-bold text-muted">
            <Settings2 size={15} />
            選択肢の編集（{kind}・チェック）
          </summary>
          <div className="mt-3 space-y-4">
            <OptionsEditor
              label={`${kind}のステータス（経過）`}
              kind={kind}
              options={kindOptions}
              onChanged={load}
              onError={setError}
            />
            <OptionsEditor
              label="チェックのステータス（経過が「〜チェック中」のときの確認）"
              kind={TODO_CHECK_KIND}
              options={checkOptions}
              onChanged={load}
              onError={setError}
            />
          </div>
        </details>
      )}
    </div>
  );
}

function TodoItem({
  todo,
  statusOptions,
  checkOptions,
  canEdit,
  onChange,
  onDelete,
}: {
  todo: TodoRow;
  statusOptions: TodoStatusOption[];
  checkOptions: TodoStatusOption[];
  canEdit: boolean;
  onChange: (patch: Partial<Pick<TodoRow, "todo_no" | "title" | "status" | "check_status">>) => void;
  onDelete: () => void;
}) {
  const [no, setNo] = useState(todo.todo_no);
  const [title, setTitle] = useState(todo.title);

  const selectFor = (
    value: string,
    opts: TodoStatusOption[],
    onSelect: (v: string) => void,
    extraEmptyLabel?: string,
  ) => (
    <select
      value={value}
      onChange={(e) => onSelect(e.target.value)}
      disabled={!canEdit}
      className={`${INPUT} min-w-0`}
    >
      {extraEmptyLabel !== undefined && <option value="">{extraEmptyLabel}</option>}
      {/* 選択肢から消された（または自由入力の）値もそのまま残す */}
      {value && !opts.some((o) => o.name === value) && <option value={value}>{value}</option>}
      {TODO_STAGES.map((stage) => {
        const group = opts.filter((o) => o.stage === stage);
        return group.length > 0 ? (
          <optgroup key={stage} label={stage}>
            {group.map((o) => (
              <option key={o.id} value={o.name}>
                {o.name}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </select>
  );

  return (
    <div className="rounded-xl border border-border bg-background p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* 番号（編集可） */}
        <input
          value={no}
          onChange={(e) => setNo(e.target.value)}
          onBlur={() => {
            if (no.trim() && no.trim() !== todo.todo_no) onChange({ todo_no: no.trim() });
            else setNo(todo.todo_no);
          }}
          disabled={!canEdit}
          aria-label="TODO番号"
          className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-center text-sm font-bold tabular-nums"
        />
        <span className="min-w-0 flex-1">
          {todo.worker_id ? (
            <Link href={`/workers/${todo.worker_id}`} className="truncate font-bold text-brand hover:underline">
              {todo.worker_name ?? "（外国人）"}
            </Link>
          ) : (
            <span className="text-xs text-muted">外国人ひも付けなし</span>
          )}
        </span>
        {canEdit && (
          <button type="button" aria-label="削除" onClick={onDelete} className="shrink-0 text-seal">
            <Trash2 size={15} />
          </button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title !== todo.title) onChange({ title });
          }}
          disabled={!canEdit}
          placeholder="内容"
          className={`${INPUT} min-w-0`}
        />
        {selectFor(todo.status, statusOptions, (v) => onChange({ status: v }))}
      </div>
      {/* 経過が「〜チェック中」のときは確認ステータスも出す */}
      {isCheckingStatus(todo.status) && (
        <div className="mt-2 flex items-center gap-2">
          <span className="shrink-0 text-[11px] font-bold text-muted">チェック</span>
          {selectFor(todo.check_status ?? "", checkOptions, (v) => onChange({ check_status: v }), "未選択")}
        </div>
      )}
    </div>
  );
}

// ステータス（経過）の選択肢の編集。名前を書き換えて欄の外を押すと保存、×で削除、追加もできる
function OptionsEditor({
  label,
  kind,
  options,
  onChanged,
  onError,
}: {
  label: string;
  kind: TodoStatusOption["kind"];
  options: TodoStatusOption[];
  onChanged: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newStage, setNewStage] = useState<TodoStage>("進行中");

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
      await onChanged();
    } catch (err) {
      onError(dbErrorMessage(err, "0102_todos.sql", "選択肢の保存に失敗しました"));
    }
  };

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="mb-2 text-xs font-bold text-muted">{label}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TODO_STAGES.map((stage) => (
          <div key={stage}>
            <p className="mb-1 text-[11px] font-bold text-muted">{stage}</p>
            <div className="space-y-1">
              {options
                .filter((o) => o.stage === stage)
                .map((o) => (
                  <OptionRow
                    key={o.id}
                    option={o}
                    onRename={(name) => run(() => renameTodoStatusOption(createClient(), o.id, name))}
                    onDelete={() => {
                      if (window.confirm(`選択肢「${o.name}」を削除します。よろしいですか？（この選択肢が入っているTODOの表示はそのまま残ります）`)) {
                        void run(() => deleteTodoStatusOption(createClient(), o.id));
                      }
                    }}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={newStage}
          onChange={(e) => setNewStage(e.target.value as TodoStage)}
          className={`${INPUT} w-28`}
        >
          {TODO_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新しい選択肢の名前"
          className={`${INPUT} min-w-0 flex-1`}
        />
        <button
          type="button"
          disabled={!newName.trim()}
          onClick={() => {
            const name = newName.trim();
            void run(async () => {
              await insertTodoStatusOption(createClient(), {
                kind,
                stage: newStage,
                name,
                sort_no: options.filter((o) => o.stage === newStage).length + 1,
              });
              setNewName("");
            });
          }}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-bold text-brand disabled:opacity-50"
        >
          <Plus size={13} />
          追加
        </button>
      </div>
    </div>
  );
}

function OptionRow({
  option,
  onRename,
  onDelete,
}: {
  option: TodoStatusOption;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(option.name);
  return (
    <div className="flex items-center gap-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const v = name.trim();
          if (v && v !== option.name) onRename(v);
          else setName(option.name);
        }}
        className="min-h-[34px] w-full min-w-0 rounded-lg border border-border bg-surface px-2 text-xs"
      />
      <button type="button" aria-label="この選択肢を削除" onClick={onDelete} className="shrink-0 text-seal">
        <Trash2 size={13} />
      </button>
    </div>
  );
}
