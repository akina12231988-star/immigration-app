"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, ChevronRight, Home, ListTodo, Plus, ShieldPlus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { listWorkerInsuranceCards } from "@/lib/supabase/queries/insurance-cards";
import { getProcedureTodo, saveProcedureSteps } from "@/lib/supabase/queries/procedure-todos";
import { dbErrorMessage } from "@/lib/errors";
import { kokuhoInsuranceHint, type InsuranceHistoryRef, type WorkerInsuranceCardRow } from "@/lib/insurance-card";
import {
  followupsOf,
  patchFollowups,
  type KokuhoFollowup,
  type MovingFollowup,
  type WorkerFollowups as Followups,
} from "@/lib/worker-followups";
import {
  NEW_STEP,
  PROCEDURE_STATUSES,
  PROCEDURE_TITLES,
  isProcedureDone,
  procedureStepsFromFollowups,
  syncFollowupsWithTodos,
  type ProcedureKey,
  type ProcedureStep,
  type ProcedureSteps,
  type ProcedureTodo,
} from "@/lib/procedure-todo";
import { PREP_ISSUE_REQUEST_OPTIONS } from "@/lib/application-prep";
import { todayStr } from "@/lib/ssw/calc";
import { MovingInsuranceFields } from "./WorkerFollowups";

const REQUEST_TO_OPTIONS = ["本人", ...PREP_ISSUE_REQUEST_OPTIONS];
const INPUT =
  "min-h-[34px] w-full rounded-lg border border-border bg-background px-2 text-xs focus:border-brand focus:outline-none disabled:opacity-60";
const MIGRATION = "0219_procedure_todo_steps.sql";

// 住所・保険の手続き（転出・転入・国保の加入・国民年金の加入）。
// 手続きごとにTODOを作り、経過・依頼先・依頼日をここで直せる（TODO ＞ 住所・保険の手続き にも同じものが出る）。
// 転居予定日・転入先の住所・保険証の切り替えなどの詳しい記録は「詳しい記録」を開いて入れる。
export function WorkerProcedureTodos({
  workerId,
  followups: initial,
  canEdit = false,
  histories = [],
}: {
  workerId: string;
  followups: unknown;
  canEdit?: boolean;
  histories?: InsuranceHistoryRef[];
}) {
  const router = useRouter();
  const [f, setF] = useState<Followups>(() => followupsOf({ followups: initial }));
  // この人の住所・保険の手続きのTODO（1人1件）。undefined は読み込み中、null はまだ無い
  const [todo, setTodo] = useState<ProcedureTodo | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openDetail, setOpenDetail] = useState<{ moving: boolean; kokuho: boolean }>({ moving: false, kokuho: false });
  const [currentCard, setCurrentCard] = useState<WorkerInsuranceCardRow | null>(null);
  const migrated = useRef(false);
  const steps: ProcedureSteps = todo?.steps ?? {};

  useEffect(() => {
    listWorkerInsuranceCards(createClient(), workerId)
      .then((rows) => setCurrentCard(rows[0] ?? null))
      .catch(() => undefined);
  }, [workerId]);

  // 詳しい記録（followups）を保存する
  const saveFollowups = useCallback(
    async (next: Followups) => {
      setF(next);
      try {
        await updateWorker(createClient(), workerId, { followups: next });
        router.refresh();
      } catch (err) {
        setError(dbErrorMessage(err, "0119_worker_followups.sql", "保存に失敗しました"));
      }
    },
    [workerId, router],
  );

  // 手続きの経過に合わせて followups の印を直す（外国人一覧の件数・依頼中の一覧のため）
  const syncFollowups = useCallback(
    async (nextSteps: ProcedureSteps, base: Followups) => {
      const next = syncFollowupsWithTodos(base, nextSteps);
      if (next && canEdit) await saveFollowups(next);
      else if (base !== f) await saveFollowups(base);
    },
    [canEdit, saveFollowups, f],
  );

  // 読み込み。これまでのチェック（followups）だけで手続きが無いときは、ここで一度だけTODOに入れる
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        let current = await getProcedureTodo(supabase, workerId);
        const base = followupsOf({ followups: initial });
        if (canEdit && !migrated.current) {
          migrated.current = true;
          const add = procedureStepsFromFollowups(base, current?.steps ?? {});
          if (Object.keys(add).length > 0) {
            current = await saveProcedureSteps(supabase, workerId, current, { ...(current?.steps ?? {}), ...add });
          }
        }
        if (cancelled) return;
        setTodo(current);
        if (current) {
          const next = syncFollowupsWithTodos(base, current.steps);
          if (next && canEdit) await saveFollowups(next);
        }
      } catch (err) {
        if (!cancelled) {
          setTodo(null);
          setError(dbErrorMessage(err, MIGRATION, "住所・保険の手続きのTODOを読めませんでした"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // 初回だけ（initial は親の再描画で変わるが、取り込みは一度でよい）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  // 手続きを保存する（TODOが無ければ作る）。base は一緒に保存する詳しい記録
  const saveSteps = async (nextSteps: ProcedureSteps, base: Followups = f) => {
    setError(null);
    setTodo((t) => (t ? { ...t, steps: nextSteps } : t));
    try {
      const saved = await saveProcedureSteps(createClient(), workerId, todo ?? null, nextSteps);
      setTodo(saved);
      await syncFollowups(nextSteps, base);
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, "保存に失敗しました"));
    }
  };

  const start = async (keys: ProcedureKey[], patch?: { moving?: Partial<MovingFollowup>; kokuho?: Partial<KokuhoFollowup> }) => {
    setBusy(true);
    const next: ProcedureSteps = { ...steps };
    for (const k of keys) {
      if (next[k] && !isProcedureDone(next[k]!.status)) continue;
      next[k] = { ...NEW_STEP };
    }
    await saveSteps(next, patch ? patchFollowups(f, patch) : f);
    setBusy(false);
  };

  const change = async (key: ProcedureKey, patch: Partial<ProcedureStep>) => {
    const cur = steps[key] ?? NEW_STEP;
    // 依頼中にしたら依頼日を今日にしておく（依頼中の一覧で経過日数を出す）
    const extra = patch.status === "依頼中" && !cur.requested_on && patch.requested_on === undefined ? { requested_on: todayStr() } : {};
    const next: ProcedureSteps = { ...steps, [key]: { ...cur, ...patch, ...extra } };
    let base = f;
    // 転出手続きが完了したら、転入手続きを足す（転出証明書が届いた日も入れておく）
    if (key === "moveOut" && patch.status === "完了") {
      if (!next.moveIn || isProcedureDone(next.moveIn.status)) next.moveIn = { ...NEW_STEP };
      if (!f.moving.certificate_received_on) base = patchFollowups(f, { moving: { certificate_received_on: todayStr() } });
    }
    await saveSteps(next, base);
  };

  // 画面の表示用（手続きがあるものだけ）
  const latest = steps;
  const hint = kokuhoInsuranceHint(currentCard, histories);
  const disabled = !canEdit || busy;
  const movingTodos = (["moveOut", "moveIn"] as const).filter((k) => latest[k]);
  const kokuhoTodos = (["kokuho", "nenkin"] as const).filter((k) => latest[k]);
  const movingActive = movingTodos.some((k) => !isProcedureDone(latest[k]!.status));
  const kokuhoActive = kokuhoTodos.some((k) => !isProcedureDone(latest[k]!.status));

  return (
    <section id="followups">
      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted">
          <ListTodo size={14} />
          住所・保険の手続き（TODO）
          {todo && (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">
              {todo.todo_no}・{todo.status}
            </span>
          )}
          <Link href="/todos/procedures" className="ml-auto text-[11px] font-bold text-brand hover:underline">
            TODOの一覧へ
          </Link>
        </h2>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          転出・転入・国保の加入・国民年金の加入を、この人の1つのTODOの中で手続きごとに進めます。手続きの経過を「完了」（やめたときは「キャンセル」）にすると、その手続きは終わりです。全部終わるとTODOも完了になります。
          転出を完了にすると、転入手続きが自動で足されます。
        </p>
        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
            {error}
          </p>
        )}
        {todo === undefined ? (
          <p className="text-xs text-muted">読み込み中…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* 転居（転出 → 転入） */}
            <div className="rounded-xl border border-border p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold">
                <Home size={13} className="shrink-0 text-muted" />
                転居（転出 → 転入）
                {movingTodos.length > 0 && !movingActive && <DoneBadge />}
              </p>
              {movingTodos.length === 0 || (!movingActive && canEdit) ? (
                canEdit && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void start(["moveOut"], { moving: { needed: true } })}
                    className="mb-2 inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-dashed border-brand px-3 text-xs font-bold text-brand disabled:opacity-50"
                  >
                    <Plus size={14} />
                    {movingTodos.length === 0 ? "転居の手続きを始める（転出手続きを足す）" : "もう一度転居の手続きを始める"}
                  </button>
                )
              ) : null}
              <div className="space-y-2">
                {movingTodos.map((k) => (
                  <ProcedureRow key={k} stepKey={k} step={latest[k]!} disabled={disabled} onChange={(p) => void change(k, p)} />
                ))}
                {latest.moveOut && isProcedureDone(latest.moveOut.status) && latest.moveOut.status === "完了" && !latest.moveIn && canEdit && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void start(["moveIn"])}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-dashed border-brand px-3 text-[11px] font-bold text-brand"
                  >
                    <Plus size={13} />
                    転入手続きを足す
                  </button>
                )}
              </div>
              {movingTodos.length > 0 && (
                <DetailToggle open={openDetail.moving} onClick={() => setOpenDetail((o) => ({ ...o, moving: !o.moving }))} label="詳しい記録（転居予定日・転出証明書・転入先・保険証）" />
              )}
              {openDetail.moving && movingTodos.length > 0 && (
                <div className="mt-2 space-y-2 rounded-lg bg-background p-2.5">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <DateField label="転居（予定）年月日" value={f.moving.planned_on} disabled={!canEdit} onChange={(v) => void saveFollowups(patchFollowups(f, { moving: { planned_on: v } }))} />
                    <DateField label="転出証明書を郵送した日" value={f.moving.certificate_sent_on} disabled={!canEdit} onChange={(v) => void saveFollowups(patchFollowups(f, { moving: { certificate_sent_on: v } }))} />
                    <DateField label="転出証明書が届いた日" value={f.moving.certificate_received_on} disabled={!canEdit} onChange={(v) => void saveFollowups(patchFollowups(f, { moving: { certificate_received_on: v } }))} />
                  </div>
                  <label className="block">
                    <span className="mb-0.5 block text-[11px] text-muted">転入先の住所</span>
                    <input
                      value={f.moving.new_address}
                      disabled={!canEdit}
                      onChange={(e) => setF(patchFollowups(f, { moving: { new_address: e.target.value } }))}
                      onBlur={() => void saveFollowups(f)}
                      placeholder="〒　転入先の住所"
                      className={INPUT}
                    />
                  </label>
                  <MovingInsuranceFields
                    moving={f.moving}
                    disabled={!canEdit}
                    currentCardKind={currentCard?.kind ?? ""}
                    onSave={(patch) => void saveFollowups(patchFollowups(f, { moving: patch }))}
                  />
                  <p className="text-[11px] text-muted">転居がすんだら、上の住所歴（転入日ごと）にも登録してください。</p>
                </div>
              )}
            </div>

            {/* 国民健康保険・国民年金の加入 */}
            <div className="rounded-xl border border-border p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold">
                <ShieldPlus size={13} className="shrink-0 text-muted" />
                国民健康保険・国民年金の加入
                {kokuhoTodos.length > 0 && !kokuhoActive && <DoneBadge />}
              </p>
              <p className={`mb-2 rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed ${hint.tone === "ok" ? "bg-status-approved-bg text-status-approved-fg" : hint.tone === "attention" ? "bg-status-notice-bg text-status-notice-fg" : "bg-background text-muted"}`}>
                {hint.text}{" "}
                <a href="#insurance-cards" className="font-bold underline underline-offset-2">
                  保険証の欄へ
                </a>
              </p>
              {canEdit && (kokuhoTodos.length === 0 || !kokuhoActive) && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void start(["kokuho", "nenkin"], { kokuho: { needed: true } })}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-dashed border-brand px-3 text-xs font-bold text-brand disabled:opacity-50"
                  >
                    <Plus size={14} />
                    国保・国民年金の加入を始める
                  </button>
                  <button type="button" disabled={disabled} onClick={() => void start(["kokuho"], { kokuho: { needed: true } })} className="min-h-[36px] rounded-lg border border-border px-2.5 text-[11px] font-bold">
                    国保だけ
                  </button>
                  <button type="button" disabled={disabled} onClick={() => void start(["nenkin"], { kokuho: { needed: true } })} className="min-h-[36px] rounded-lg border border-border px-2.5 text-[11px] font-bold">
                    年金だけ
                  </button>
                </div>
              )}
              <div className="space-y-2">
                {kokuhoTodos.map((k) => (
                  <ProcedureRow key={k} stepKey={k} step={latest[k]!} disabled={disabled} onChange={(p) => void change(k, p)} />
                ))}
              </div>
              {kokuhoTodos.length > 0 && (
                <>
                  <DetailToggle open={openDetail.kokuho} onClick={() => setOpenDetail((o) => ({ ...o, kokuho: !o.kokuho }))} label="詳しい記録（退職の書類の発行日）" />
                  {openDetail.kokuho && (
                    <div className="mt-2 rounded-lg bg-background p-2.5">
                      <DateField
                        label="退職に関わる書類（資格喪失確認書・離職票など）が発行された日"
                        value={f.kokuho.docs_ready_on}
                        disabled={!canEdit}
                        onChange={(v) => void saveFollowups(patchFollowups(f, { kokuho: { docs_ready_on: v } }))}
                      />
                      <p className="mt-1 text-[11px] text-muted">前職が社会保険だと、この書類が出るまで加入手続きができません。</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

function DoneBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-status-approved-bg px-2 py-0.5 text-[10px] font-bold text-status-approved-fg">
      <CheckCircle2 size={11} />
      完了
    </span>
  );
}

function DetailToggle({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="mt-2 inline-flex items-center gap-0.5 text-[11px] font-bold text-brand">
      {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      {label}
    </button>
  );
}

function DateField({ label, value, disabled, onChange }: { label: string; value: string | null; disabled: boolean; onChange: (v: string | null) => void }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] text-muted">{label}</span>
      <input type="date" value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} className={INPUT} />
    </label>
  );
}

// TODOの中の手続き1つの行。経過・依頼先・依頼日・メモをその場で直す
function ProcedureRow({
  stepKey,
  step: todo,
  disabled,
  onChange,
}: {
  stepKey: ProcedureKey;
  step: ProcedureStep;
  disabled: boolean;
  onChange: (patch: Partial<ProcedureStep>) => void;
}) {
  const title = PROCEDURE_TITLES[stepKey];
  const [to, setTo] = useState(todo.requested_to);
  const [note, setNote] = useState(todo.note);
  const done = isProcedureDone(todo.status);
  const tone =
    todo.status === "完了"
      ? "border-status-approved-fg/30 bg-status-approved-bg/60"
      : todo.status === "キャンセル"
        ? "border-border bg-background opacity-70"
        : todo.status === "依頼中"
          ? "border-status-notice-fg/40 bg-status-notice-bg/50"
          : "border-seal/40 bg-seal/5";
  const listId = `req-${stepKey}`;
  return (
    <div className={`rounded-lg border p-2 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold">{title}</span>
        <select
          value={todo.status}
          disabled={disabled}
          onChange={(e) => onChange({ status: e.target.value })}
          aria-label={`${title}の経過`}
          className="ml-auto min-h-[32px] rounded-lg border border-border bg-background px-2 text-xs font-bold"
        >
          {PROCEDURE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {!done && (
        <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_9rem]">
          <input
            list={listId}
            value={to}
            disabled={disabled}
            onChange={(e) => setTo(e.target.value)}
            onBlur={() => to !== todo.requested_to && onChange({ requested_to: to.trim() })}
            placeholder="依頼先（例: 本人 / NGAさん）"
            aria-label={`${title}の依頼先`}
            className={INPUT}
          />
          <datalist id={listId}>
            {REQUEST_TO_OPTIONS.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
          <input
            type="date"
            value={todo.requested_on ?? ""}
            disabled={disabled}
            onChange={(e) => onChange({ requested_on: e.target.value || null })}
            aria-label={`${title}の依頼日`}
            className={INPUT}
          />
          <input
            value={note}
            disabled={disabled}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== todo.note && onChange({ note })}
            placeholder="メモ"
            aria-label={`${title}のメモ`}
            className={`${INPUT} sm:col-span-2`}
          />
        </div>
      )}
      {done && (todo.requested_to || todo.note) && (
        <p className="mt-1 text-[11px] text-muted">
          {todo.requested_to && `依頼先: ${todo.requested_to}`}
          {todo.requested_to && todo.note && "　"}
          {todo.note}
        </p>
      )}
    </div>
  );
}
