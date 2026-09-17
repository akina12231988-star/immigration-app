"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { listPrepChecklists } from "@/lib/supabase/queries/application-prep";
import { prepSituationLabel } from "@/lib/worker-situation";

const SELECT =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

interface TodoChoice {
  todoNo: string;
  orgName: string; // 準備中の所属機関（転職先。無ければ現在の所属機関）
  content: string; // 申請の内容（申請準備の準備の内容）
  updatedAt: string;
}

// 外国人に紐づく申請準備のTODO番号を選ぶ（郵送請求などの「TODO番号」欄用）。
// 番号だけでは分かりにくいので、所属機関名と申請内容も一緒に出す。
// 準備リストが無い人や、一覧にない番号を使いたいときは手で打てる
export function PrepTodoPicker({
  workerId,
  value,
  onChange,
  disabled = false,
}: {
  workerId: string; // 空なら候補を出さず、手入力だけ
  value: string;
  onChange: (todoNo: string) => void;
  disabled?: boolean;
}) {
  // null = まだ読み込んでいない（外国人を選び直したら読み直す）
  const [choices, setChoices] = useState<TodoChoice[] | null>(null);
  const [manual, setManual] = useState(false);
  const [prevWorkerId, setPrevWorkerId] = useState(workerId);
  if (workerId !== prevWorkerId) {
    setPrevWorkerId(workerId);
    setChoices(null);
    setManual(false);
  }
  const loading = Boolean(workerId) && choices === null;

  useEffect(() => {
    if (!workerId) return;
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const [lists, { data: w }] = await Promise.all([
        listPrepChecklists(supabase, workerId).catch(() => []),
        supabase
          .from("workers")
          .select("current_organization_id, application_prep_organization_id")
          .eq("id", workerId)
          .maybeSingle(),
      ]);
      const worker = w as { current_organization_id: string | null; application_prep_organization_id: string | null } | null;
      const orgId = worker?.application_prep_organization_id ?? worker?.current_organization_id ?? null;
      let orgName = "";
      if (orgId) {
        const { data: o } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
        orgName = (o as { name: string } | null)?.name ?? "";
      }
      if (cancelled) return;
      const next = lists
        .filter((l) => l.todo_no)
        .map((l) => ({
          todoNo: l.todo_no,
          orgName,
          content: l.app_content ? prepSituationLabel(l.app_content) : "",
          updatedAt: l.updated_at,
        }));
      setChoices(next);
      // 番号が1つだけなら自動で選ぶ（未入力のときだけ）
      if (next.length === 1 && !value) onChange(next[0].todoNo);
    })();
    return () => {
      cancelled = true;
    };
    // value は自動選択の判定にだけ使う（変わるたびに読み直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  const label = (c: TodoChoice) =>
    [c.todoNo, c.orgName || "所属機関未設定", c.content || "申請内容未設定"].join("｜");
  const list = choices ?? [];
  const inList = list.some((c) => c.todoNo === value);

  // 候補が無い（外国人未選択・準備リスト無し）か、手入力に切り替えたときは入力欄
  if (!workerId || (!loading && list.length === 0) || manual) {
    return (
      <div className="flex flex-col gap-1">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={workerId ? "準備リストが無いので番号を入力" : "先に外国人を選ぶと紐づくTODO番号を選べます"}
          className={SELECT}
        />
        {list.length > 0 && (
          <button type="button" onClick={() => setManual(false)} className="self-start text-[11px] font-bold text-brand">
            紐づくTODO番号から選ぶ
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={inList ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || loading}
        className={SELECT}
      >
        <option value="">{loading ? "読み込み中…" : "紐づくTODO番号を選択"}</option>
        {list.map((c) => (
          <option key={c.todoNo} value={c.todoNo}>
            {label(c)}
          </option>
        ))}
      </select>
      {value && !inList && (
        <span className="text-[11px] text-muted">入力済み: {value}（一覧にない番号）</span>
      )}
      <button type="button" onClick={() => setManual(true)} className="self-start text-[11px] font-bold text-brand">
        一覧にない番号を手で入力
      </button>
    </div>
  );
}
