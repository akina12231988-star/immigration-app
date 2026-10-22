"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { insertFilingAgent, listFilingAgents } from "@/lib/supabase/queries/agents";
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

  // 名簿に無い取次士をここから足す（申請登録の画面の「名簿に追加」と同じ filing_agents に入る）
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const addAgent = async () => {
    const name = newName.trim();
    if (!name || !todo) return;
    setAddBusy(true);
    onError(null);
    try {
      // すでに同じ名前（空白の違いは無視）があれば足さずにそれを選ぶ
      const key = name.replace(/[\s　]/g, "");
      const exists = agents.find((a) => a.replace(/[\s　]/g, "") === key);
      const agentName = exists ?? (await insertFilingAgent(createClient(), name)).name;
      if (!exists) setAgents((prev) => [...prev, agentName].sort((a, b) => a.localeCompare(b, "ja")));
      await updateTodo(createClient(), todo.id, { agent_name: agentName });
      setNewName("");
      setAdding(false);
      onChanged();
    } catch (err) {
      onError(dbErrorMessage(err, "0018_filing_agents.sql", "申請取次士の名簿への追加に失敗しました"));
    } finally {
      setAddBusy(false);
    }
  };

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
      {canEdit && todo && !todo.self_apply && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-brand hover:border-brand"
          title="名簿に無い申請取次士を足して、この申請準備に設定します"
        >
          ＋ 名簿に追加
        </button>
      )}
      {adding && (
        <span className="flex items-center gap-1.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addAgent();
            }}
            placeholder="例: 大元　麗奈"
            aria-label="名簿に追加する申請取次士の氏名"
            className="min-h-[36px] w-40 rounded-lg border border-border bg-background px-2 text-sm font-bold text-foreground focus:border-brand focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void addAgent()}
            disabled={!newName.trim() || addBusy}
            className="rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-bold text-brand-foreground disabled:opacity-50"
          >
            {addBusy ? "追加中…" : "追加して選ぶ"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewName("");
            }}
            className="text-[11px] font-bold text-muted underline"
          >
            やめる
          </button>
        </span>
      )}
      {!todo && (
        <span className="text-[11px] font-normal">申請準備のTODOが無いため選べません（TODOを作ると選べます）。</span>
      )}
    </div>
  );
}
