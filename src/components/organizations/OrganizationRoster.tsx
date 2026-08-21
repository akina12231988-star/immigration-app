"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { insertWorkerWage } from "@/lib/supabase/queries/wages";
import { setOrgEmploymentStart } from "@/lib/supabase/queries/workers";
import { wageText } from "@/lib/wage";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import { WORKER_WAGE_KINDS, type WorkerWageKind } from "@/types/db";
import {
  emptyRosterFill,
  hasRosterFill,
  rosterFillPatch,
  wageAmountOf,
  wageStartedOnOf,
  type RosterFill,
} from "@/lib/org-roster-fill";
import type { OrgRosterWorker } from "@/lib/supabase/queries/organizations";

// 所属機関に今いる人と、過去にいた人の一覧。
// 「誰がいつからいて、誰がいつ辞めて今どこにいるか」をこの機関の画面だけで追えるようにする。
// 雇用開始日・賃金が未登録の人は、外国人詳細を開かなくてもこの表から入力できる
export function OrganizationRoster({
  organizationId,
  current,
  past,
  today,
  error = null,
}: {
  organizationId: string;
  current: OrgRosterWorker[];
  past: OrgRosterWorker[];
  today: string; // 賃金の適用開始日の既定値に使う（サーバ側で決めて食い違わないようにする）
  error?: string | null; // 取得に失敗したとき（0名と区別できるように出す）
}) {
  const router = useRouter();
  // 未登録の欄に入力した内容（外国人ID → 下書き）。保存すると消す
  const [fills, setFills] = useState<Record<string, RosterFill>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const fillOf = (id: string) => fills[id] ?? emptyRosterFill();
  const setFill = (id: string, patch: Partial<RosterFill>) =>
    setFills((prev) => ({ ...prev, [id]: rosterFillPatch(fillOf(id), patch) }));

  // 入力した分だけ保存する（雇用開始日だけ・賃金だけでもよい）
  const save = async (w: OrgRosterWorker) => {
    const fill = fillOf(w.id);
    if (!hasRosterFill(fill)) return;
    setBusyId(w.id);
    setSaveError(null);
    setSaved(null);
    try {
      const supabase = createClient();
      if (fill.startOn) {
        await setOrgEmploymentStart(supabase, w.id, organizationId, fill.startOn);
      }
      const amount = wageAmountOf(fill);
      if (amount > 0) {
        await insertWorkerWage(supabase, {
          worker_id: w.id,
          organization_id: organizationId,
          kind: fill.wageKind as WorkerWageKind,
          amount,
          started_on: wageStartedOnOf(fill, w.startOn, today),
          reason: "採用時",
          note: "",
          detail: {},
        });
      }
      setFills((prev) => {
        const next = { ...prev };
        delete next[w.id];
        return next;
      });
      setSaved(`${w.name} を保存しました`);
      router.refresh();
    } catch (err) {
      setSaveError(
        dbErrorMessage(err, "0074_worker_wages.sql", errorMessage(err, "保存に失敗しました")),
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
        <Users size={16} />
        在籍者・過去の在籍者
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        在籍中は今この機関に紐づいている方、過去に在籍は退職記録・機関別の雇用開始日が残っている方です。
        転職された方は、今どちらにいるかも出します。
        雇用開始日・賃金が未登録の方は、この表の点線の枠に入れて「保存」で登録できます
        （外国人詳細の「所属機関別の雇用開始日」「賃金（時給・月給）」に入ります）。
        登録済みの内容を直すときは、氏名から外国人詳細を開いてください。
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
          在籍者を取得できませんでした（{error}）。0名という意味ではありません。
        </p>
      )}
      {saveError && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
          {saveError}
        </p>
      )}
      {saved && !saveError && (
        <p role="status" className="mb-3 rounded-lg bg-brand/10 px-3 py-2 text-xs text-brand">
          {saved}
        </p>
      )}

      <Section
        title="在籍中"
        countLabel={`${current.length}名`}
        rows={current}
        emptyText="在籍中の方はいません。"
        showLeaving={false}
        today={today}
        fillOf={fillOf}
        setFill={setFill}
        onSave={save}
        busyId={busyId}
      />
      <div className="mt-4">
        <Section
          title="過去に在籍"
          countLabel={`${past.length}名`}
          rows={past}
          emptyText="過去に在籍された方の記録はありません。"
          showLeaving
          today={today}
          fillOf={fillOf}
          setFill={setFill}
          onSave={save}
          busyId={busyId}
        />
      </div>
    </Card>
  );
}

// 未登録の欄に出す入力（点線の枠で「ここに入力できる」ことを示す。外国人詳細と同じ見た目）
const FILL_INPUT =
  "min-h-[32px] rounded-lg border border-dashed border-border bg-background px-2 text-xs focus:border-brand focus:outline-none";

function Section({
  title,
  countLabel,
  rows,
  emptyText,
  showLeaving,
  today,
  fillOf,
  setFill,
  onSave,
  busyId,
}: {
  title: string;
  countLabel: string;
  rows: OrgRosterWorker[];
  emptyText: string;
  showLeaving: boolean;
  today: string;
  fillOf: (id: string) => RosterFill;
  setFill: (id: string, patch: Partial<RosterFill>) => void;
  onSave: (worker: OrgRosterWorker) => void;
  busyId: string | null;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold">
        {title} <span className="text-muted">（{countLabel}）</span>
      </p>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-background p-3 text-xs text-muted">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-1.5 pr-2 font-bold">氏名</th>
                <th className="py-1.5 pr-2 font-bold">国籍</th>
                <th className="py-1.5 pr-2 font-bold">在留資格</th>
                <th className="py-1.5 pr-2 font-bold">雇用開始</th>
                <th className="py-1.5 pr-2 font-bold">賃金</th>
                {showLeaving ? (
                  <>
                    <th className="py-1.5 pr-2 font-bold">退職日</th>
                    <th className="py-1.5 pr-2 font-bold">現在の所属</th>
                  </>
                ) : (
                  <>
                    <th className="py-1.5 pr-2 font-bold">在留期限</th>
                    <th className="py-1.5 pr-2 font-bold">支援区分</th>
                  </>
                )}
                <th className="py-1.5 font-bold" />
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const fill = fillOf(w.id);
                const dirty = hasRosterFill(fill);
                return (
                  <tr key={w.id} className="border-b border-border/60">
                    <td className="py-1.5 pr-2">
                      <Link
                        href={`/workers/${w.id}`}
                        className="font-bold underline-offset-2 hover:text-brand hover:underline"
                      >
                        {w.name}
                      </Link>
                      {w.kana && <span className="block text-[10px] text-muted">{w.kana}</span>}
                    </td>
                    <td className="py-1.5 pr-2 text-muted">{w.nationality || "—"}</td>
                    <td className="py-1.5 pr-2 text-muted">{w.residenceStatus || "—"}</td>
                    <td className="py-1.5 pr-2 tabular-nums">
                      {w.startOn ?? (
                        <input
                          type="date"
                          aria-label={`${w.name} の雇用開始日`}
                          value={fill.startOn}
                          onChange={(e) => setFill(w.id, { startOn: e.target.value })}
                          className={`w-[140px] ${FILL_INPUT}`}
                        />
                      )}
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums">
                      {w.wageAmount ? (
                        <>
                          {wageText(w.wageKind ?? "", w.wageAmount)}
                          {w.wageStartedOn && (
                            <span className="block text-[10px] text-muted">
                              {w.wageStartedOn}から
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="flex flex-col gap-1">
                          <span className="flex items-center gap-1">
                            <select
                              aria-label={`${w.name} の賃金の区分`}
                              value={fill.wageKind}
                              onChange={(e) => setFill(w.id, { wageKind: e.target.value })}
                              className={FILL_INPUT}
                            >
                              {WORKER_WAGE_KINDS.map((k) => (
                                <option key={k} value={k}>
                                  {k}
                                </option>
                              ))}
                            </select>
                            <input
                              inputMode="numeric"
                              aria-label={`${w.name} の賃金の金額`}
                              value={fill.wageAmount}
                              onChange={(e) => setFill(w.id, { wageAmount: e.target.value })}
                              placeholder="例: 1100"
                              className={`w-[88px] ${FILL_INPUT}`}
                            />
                            <span className="text-[10px] text-muted">円</span>
                          </span>
                          {/* 適用開始日。既定はこの機関での雇用開始日（無ければ今日） */}
                          <span className="flex items-center gap-1">
                            <input
                              type="date"
                              aria-label={`${w.name} の賃金の適用開始日`}
                              value={wageStartedOnOf(fill, w.startOn, today)}
                              onChange={(e) => setFill(w.id, { wageStartedOn: e.target.value })}
                              className={`w-[140px] ${FILL_INPUT}`}
                            />
                            <span className="text-[10px] text-muted">から</span>
                          </span>
                        </span>
                      )}
                    </td>
                    {showLeaving ? (
                      <>
                        <td className="py-1.5 pr-2 tabular-nums">{w.leavingOn ?? "—"}</td>
                        <td className="py-1.5 pr-2 text-muted">
                          {w.currentOrgName ?? (w.status === "退職" ? "退職" : "—")}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-1.5 pr-2 tabular-nums">{w.residenceExpiryDate ?? "—"}</td>
                        <td className="py-1.5 pr-2 text-muted">{w.support}</td>
                      </>
                    )}
                    <td className="py-1.5">
                      {dirty && (
                        <button
                          type="button"
                          disabled={busyId === w.id}
                          onClick={() => onSave(w)}
                          className="min-h-[32px] rounded-lg border border-brand px-2.5 text-xs font-bold text-brand disabled:opacity-50"
                        >
                          {busyId === w.id ? "保存中…" : "保存"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
