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
import { formatAmountInput } from "@/lib/amount-format";
import { notCountedReason, splitCurrentRoster } from "@/lib/org-roster-groups";

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

  // 「在籍中」は状態が在籍中の方だけにする。それ以外は「在籍前・その他」へ回す
  const { active, notYet } = splitCurrentRoster(current);

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
        在籍中は状態が「在籍中」の方、在籍前・その他はこの機関に紐づいているけれど状態がまだ
        「在籍中」ではない方（申請準備中など）、過去に在籍は退職記録・機関別の雇用開始日が
        残っている方です。転職された方は、今どちらにいるかも出します。
        上の支援体制の「在籍（1号特定技能）」は、状態が「在籍中」・支援区分が「支援対象」・
        在留資格が特定技能1号の3つがそろった方だけを数えます。数に入っていない方は、
        表の「状態」「支援区分」の欄に理由を出します。
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
        countLabel={`${active.length}名`}
        rows={active}
        emptyText="状態が「在籍中」の方はいません。"
        showLeaving={false}
        showAddress
        showWhyNotCounted
        today={today}
        fillOf={fillOf}
        setFill={setFill}
        onSave={save}
        busyId={busyId}
      />
      {/* この機関に紐づいているが、状態がまだ「在籍中」ではない方（許可前・申請準備中など） */}
      {notYet.length > 0 && (
        <div className="mt-4">
          <Section
            title="在籍前・その他"
            countLabel={`${notYet.length}名`}
            rows={notYet}
            emptyText=""
            showLeaving={false}
            today={today}
            fillOf={fillOf}
            setFill={setFill}
            onSave={save}
            busyId={busyId}
          />
        </div>
      )}
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
  showAddress = false,
  showWhyNotCounted = false,
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
  // 現在の住所の列を出すか（在籍中の表だけ。機関からの問い合わせに答えられるように）
  showAddress?: boolean;
  // 支援体制の数に入らない人に、その理由を氏名の下に出すか（在籍中の表だけ）
  showWhyNotCounted?: boolean;
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
          <table
            className={`w-full border-collapse text-xs ${
              showAddress ? "min-w-[1320px]" : "min-w-[1120px]"
            }`}
          >
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-1.5 pr-2 font-bold">氏名</th>
                <th className="py-1.5 pr-2 font-bold">国籍</th>
                <th className="py-1.5 pr-2 font-bold">在留資格</th>
                {showAddress && <th className="py-1.5 pr-2 font-bold">現在の住所</th>}
                <th className="py-1.5 pr-2 font-bold">状態</th>
                <th className="py-1.5 pr-2 font-bold">支援区分</th>
                <th className="py-1.5 pr-2 font-bold">雇用開始</th>
                <th className="py-1.5 pr-2 font-bold">賃金</th>
                {showLeaving ? (
                  <>
                    <th className="py-1.5 pr-2 font-bold">退職日</th>
                    <th className="py-1.5 pr-2 font-bold">現在の所属</th>
                  </>
                ) : (
                  <th className="py-1.5 pr-2 font-bold">在留期限</th>
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
                      {showWhyNotCounted && notCountedReason(w) && (
                        <span className="mt-0.5 block text-[10px] leading-relaxed text-seal">
                          支援体制の数に入りません（{notCountedReason(w)}）
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-muted">{w.nationality || "—"}</td>
                    <td className="py-1.5 pr-2 text-muted">{w.residenceStatus || "—"}</td>
                    {showAddress && (
                      <td className="min-w-[200px] max-w-[280px] py-1.5 pr-2 text-muted">
                        <span className="select-text">{w.address || "未登録"}</span>
                      </td>
                    )}
                    {/* 支援体制の「在籍（1号特定技能）」に数えられない人は、その欄を色で示す */}
                    <td
                      className={`py-1.5 pr-2 ${
                        w.status === "在籍中" ? "text-muted" : "font-bold text-seal"
                      }`}
                    >
                      {w.status || "—"}
                    </td>
                    <td
                      className={`py-1.5 pr-2 ${
                        w.support === "支援対象" ? "text-muted" : "font-bold text-seal"
                      }`}
                    >
                      {w.support || "—"}
                    </td>
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
                              value={formatAmountInput(fill.wageAmount)}
                              onChange={(e) =>
                                setFill(w.id, { wageAmount: formatAmountInput(e.target.value) })
                              }
                              placeholder="例: 1,100"
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
                      <td className="py-1.5 pr-2 tabular-nums">{w.residenceExpiryDate ?? "—"}</td>
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
