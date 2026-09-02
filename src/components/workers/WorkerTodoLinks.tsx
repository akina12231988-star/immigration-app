"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { TODO_STAGES, stageOfStatus, type TodoKind } from "@/lib/todo";
import { prepDetailHref } from "@/lib/application-prep";
import {
  listTodoStatusOptions,
  type TodoRow,
} from "@/lib/supabase/queries/todos";
import type { TodoStatusOption } from "@/lib/todo";

// 外国人詳細に出す、この人のTODOへのリンク一覧。
// 申請準備 書類チェックリストの本体は申請準備のTODOに移動したため、
// ここではタイトル・番号・作成年月日を表示して各TODOのページへ飛べるようにする。

// TODOの構成 → 開くページ
const KIND_HREF: Record<TodoKind, string> = {
  申請準備: "/workers/renewals",
  退職の随時報告書: "/resignations",
  試験の申込: "/todos/exams",
};

export function WorkerTodoLinks({ workerId }: { workerId: string }) {
  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [options, setOptions] = useState<TodoStatusOption[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void supabase
      .from("todos")
      .select("*")
      .eq("worker_id", workerId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        // 削除フォルダ（0108）に入っているTODOは出さない
        setTodos((((data as TodoRow[] | null) ?? [])).filter((t) => !t.deleted_at));
        setLoaded(true);
      });
    listTodoStatusOptions(supabase)
      .then((o) => {
        if (!cancelled) setOptions(o);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  const stageBadge = (t: TodoRow) => {
    const stage = stageOfStatus(
      t.status,
      options.filter((o) => o.kind === t.kind),
    );
    const cls =
      stage === TODO_STAGES[2]
        ? "bg-status-approved-bg text-status-approved-fg"
        : stage === TODO_STAGES[1]
          ? "bg-status-applied-bg text-status-applied-fg"
          : "bg-background text-muted ring-1 ring-border";
    return (
      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>
        {stage}
      </span>
    );
  };

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted">
        <ClipboardList size={15} />
        TODO（申請準備・退職の随時報告書・試験の申込）
      </h2>
      <p className="mb-2 text-[11px] leading-relaxed text-muted">
        申請準備の内容（必要な書類・賃金（1-6号別紙）・雇用契約書・日付など）は、申請準備のTODOの「📋
        必要な書類・準備の詳細」で管理します。行を押すとそのTODOのページに移動します。
      </p>
      {!loaded ? null : todos.length === 0 ? (
        <div className="rounded-xl bg-background p-3 text-center text-xs text-muted">
          <p>この人のTODOはまだありません。</p>
          {/* 外国人がひも付いていないTODOはここに出ないので、直し方を書いておく */}
          <p className="mt-1 leading-relaxed">
            TODO一覧で「外国人ひも付けなし」になっているTODOは、ここに出ません。
            <Link href="/todos" className="mx-1 font-bold text-brand hover:underline">
              TODO一覧
            </Link>
            でその人を選んで結び付けてください。
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {todos.map((t) => (
            <Link
              key={t.id}
              // 申請準備はこの人の申請準備の詳細（📋 必要な書類・準備の詳細）のページを開く
              href={
                t.kind === "申請準備"
                  ? prepDetailHref(workerId)
                  : (KIND_HREF[t.kind] ?? "/todos")
              }
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs hover:border-brand"
            >
              <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">
                {t.kind}
              </span>
              <span className="shrink-0 font-bold tabular-nums">No.{t.todo_no || "—"}</span>
              <span className="min-w-0 flex-1 truncate font-bold">
                {t.title || "（内容なし）"}
              </span>
              {stageBadge(t)}
              <span className="shrink-0 text-[10px] tabular-nums text-muted">
                作成 {t.created_at.slice(0, 10)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
