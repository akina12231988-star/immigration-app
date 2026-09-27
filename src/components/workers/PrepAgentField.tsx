"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { listFilingAgents } from "@/lib/supabase/queries/agents";
import { updateTodo, type TodoRow } from "@/lib/supabase/queries/todos";
import { dbErrorMessage } from "@/lib/errors";

// 申請準備の「申請取次士」と「本人申請でする」。申請準備のTODOに保存する（TODO一覧と同じ値）。
// 申請一覧の「申請登録へ進む」で申請登録の画面に転記される（申請当日に変わったらそこで選び直せる）
export function PrepAgentField({
  todo,
  canEdit,
  className = "",
  onChanged,
  onError,
}: {
  todo: TodoRow | null;
  canEdit: boolean;
  className?: string;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [agents, setAgents] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    listFilingAgents(createClient())
      .then((rows) => {
        if (!cancelled) setAgents(rows.map((a) => a.name));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (patch: { agent_name?: string; self_apply?: boolean }) => {
    if (!todo) return;
    onError(null);
    try {
      await updateTodo(createClient(), todo.id, patch);
      onChanged();
    } catch (err) {
      onError(dbErrorMessage(err, "0106_todos_apply_fields.sql", "申請取次士の保存に失敗しました"));
    }
  };

  const agentName = todo?.agent_name ?? "";
  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs font-bold text-muted ${className}`}>
      <label className="flex items-center gap-1.5">
        申請取次士
        <select
          value={agentName}
          disabled={!canEdit || !todo || todo.self_apply}
          onChange={(e) => void save({ agent_name: e.target.value })}
          className="min-h-[40px] rounded-xl border border-border bg-background px-2 text-sm font-bold text-foreground focus:border-brand focus:outline-none disabled:opacity-60"
        >
          <option value="">未定</option>
          {/* 名簿から外れた保存済みの名前も選択肢として残す */}
          {agentName && !agents.includes(agentName) && <option value={agentName}>{agentName}</option>}
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-h-[40px] items-center gap-1.5">
        <input
          type="checkbox"
          checked={todo?.self_apply ?? false}
          disabled={!canEdit || !todo}
          onChange={(e) => void save({ self_apply: e.target.checked })}
          className="h-4 w-4"
        />
        本人申請でする
      </label>
      {!todo && (
        <span className="text-[11px] font-normal">申請準備のTODOが無いため選べません（TODOを作ると選べます）。</span>
      )}
    </div>
  );
}
