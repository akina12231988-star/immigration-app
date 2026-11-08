"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createProcedureTodo,
  listAllProcedureTodos,
  listWorkersWithFollowups,
} from "@/lib/supabase/queries/procedure-todos";
import { followupsOf } from "@/lib/worker-followups";
import { latestProcedureTodos, procedureDraftsFromFollowups, type ProcedureTodoDraft } from "@/lib/procedure-todo";
import { dbErrorMessage } from "@/lib/errors";

// これまで外国人詳細の「あとでやる手続き」のチェックで管理していた人を、まとめてTODOにする。
// （外国人詳細を開いたときにもその人の分は自動でTODOになる）
export function ProcedureImportBanner() {
  const [plan, setPlan] = useState<{ workerId: string; name: string; drafts: ProcedureTodoDraft[] }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const supabase = createClient();
    const [workers, todos] = await Promise.all([listWorkersWithFollowups(supabase), listAllProcedureTodos(supabase)]);
    const out: { workerId: string; name: string; drafts: ProcedureTodoDraft[] }[] = [];
    for (const w of workers) {
      const mine = todos.filter((t) => t.worker_id === w.id);
      const drafts = procedureDraftsFromFollowups(followupsOf({ followups: w.followups }), latestProcedureTodos(mine));
      if (drafts.length) out.push({ workerId: w.id, name: w.name, drafts });
    }
    setPlan(out);
  };

  useEffect(() => {
    void Promise.resolve()
      .then(load)
      .catch((err) => setMessage(dbErrorMessage(err, "0217_procedure_todos.sql", "読み込みに失敗しました")));
    // 開いたときに一度だけ読む
  }, []);

  if (!plan || (plan.length === 0 && !message)) return null;
  const count = plan.reduce((n, p) => n + p.drafts.length, 0);

  return (
    <div className="mx-4 mt-3 rounded-xl border border-status-notice-fg/40 bg-status-notice-bg p-3 text-xs lg:mx-8">
      {plan.length > 0 && (
        <>
          <p className="font-bold text-status-notice-fg">
            外国人詳細の「転居」「国保・国民年金」のチェックだけでTODOになっていない人が {plan.length}名（{count}件）います
          </p>
          <p className="mt-0.5 text-[11px]">{plan.map((p) => p.name).join("、")}</p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMessage(null);
              try {
                const supabase = createClient();
                for (const p of plan) for (const d of p.drafts) await createProcedureTodo(supabase, p.workerId, d.key, d);
                setMessage(`${count}件のTODOを作りました。画面を再読み込みすると一覧に出ます。`);
                await load();
              } catch (err) {
                setMessage(dbErrorMessage(err, "0217_procedure_todos.sql", "TODOを作れませんでした"));
              } finally {
                setBusy(false);
              }
            }}
            className="mt-2 min-h-[36px] rounded-lg bg-brand px-3 font-bold text-brand-foreground disabled:opacity-50"
          >
            {busy ? "作成中…" : "まとめてTODOにする"}
          </button>
        </>
      )}
      {message && <p className="mt-1.5 font-bold">{message}</p>}
    </div>
  );
}
