"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { insertWorkerWage } from "@/lib/supabase/queries/wages";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import { formatAmountInput } from "@/lib/amount-format";
import { WAGE_REASON_RAISE, wageText } from "@/lib/wage";
import {
  buildWageRaiseRows,
  parseYen,
  WAGE_RAISE_GROUPS,
  wageRaiseNote,
  wageRaiseSummary,
  type WageRaiseRow,
} from "@/lib/wage-raise";
import { rosterApplicationLabel, type OrgRosterWorker } from "@/lib/supabase/queries/organizations";

const FIELD =
  "min-h-[40px] rounded-lg border border-border bg-surface px-2.5 text-sm focus:border-brand focus:outline-none";

// 時給の一括登録の画面。
// 上で「いつから」「1号の時給」「2号の時給」を入れると、下の表に全員の新しい時給が仮に入る。
// 1人ずつ金額を直したり対象から外したりして、「登録する」で worker_wages に1人1行ずつ入れる
export function WageRaiseSheet({
  organizationId,
  organizationName,
  active,
  notYet,
  applying,
  underReviewIds,
  defaultStartedOn,
  canEdit,
}: {
  organizationId: string;
  organizationName: string;
  active: OrgRosterWorker[];
  notYet: OrgRosterWorker[];
  applying: OrgRosterWorker[];
  underReviewIds: string[];
  defaultStartedOn: string; // 既定の適用開始日（翌月1日）
  canEdit: boolean;
}) {
  const router = useRouter();
  const [startedOn, setStartedOn] = useState(defaultStartedOn);
  const [ssw1Text, setSsw1Text] = useState("");
  const [ssw2Text, setSsw2Text] = useState("");
  // 1人ずつの手直し（外国人ID → 金額の文字・対象にするか）。表を作り直しても残す
  const [amountOverride, setAmountOverride] = useState<Record<string, string>>({});
  const [checkedOverride, setCheckedOverride] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ ok: string[]; failed: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 金額は数値にしてから使う（「1,100」と「1100」で表を作り直さない）
  const ssw1 = parseYen(ssw1Text);
  const ssw2 = parseYen(ssw2Text);
  const amounts = { ssw1, ssw2 };
  const rows = useMemo(
    () =>
      buildWageRaiseRows(active, notYet, applying, new Set(underReviewIds), { ssw1, ssw2 }, startedOn),
    [active, notYet, applying, underReviewIds, ssw1, ssw2, startedOn],
  );

  const amountOf = (r: WageRaiseRow<OrgRosterWorker>): number => {
    const t = amountOverride[r.worker.id];
    return t === undefined ? (r.proposed ?? 0) : parseYen(t);
  };
  const isChecked = (r: WageRaiseRow<OrgRosterWorker>): boolean =>
    checkedOverride[r.worker.id] ?? (r.checked && amountOf(r) > 0);
  const summary = wageRaiseSummary(rows, isChecked);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(startedOn);

  const setAllInGroup = (group: string, value: boolean) =>
    setCheckedOverride((prev) => {
      const next = { ...prev };
      for (const r of rows) if (r.group === group) next[r.worker.id] = value;
      return next;
    });

  const save = async () => {
    const targets = rows.filter((r) => isChecked(r) && amountOf(r) > 0);
    if (targets.length === 0 || !dateOk) return;
    if (
      !window.confirm(
        `${organizationName} の ${targets.length}名に、${startedOn} からの時給を登録します。\n` +
          `（在籍中 ${summary.byGroup["在籍中"]}名・審査中 ${summary.byGroup["審査中・受け取り待ち"]}名・準備中 ${summary.byGroup["準備中"]}名）\n` +
          "登録した時給は外国人詳細の「賃金」に1行ずつ入ります。よろしいですか？",
      )
    )
      return;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: targets.length });
    const ok: string[] = [];
    const failed: string[] = [];
    const supabase = createClient();
    for (const r of targets) {
      try {
        await insertWorkerWage(supabase, {
          worker_id: r.worker.id,
          organization_id: organizationId,
          kind: "時給",
          amount: amountOf(r),
          started_on: startedOn,
          reason: WAGE_REASON_RAISE,
          note: wageRaiseNote(startedOn),
          detail: {},
        });
        ok.push(r.worker.name);
      } catch (err) {
        failed.push(
          `${r.worker.name}: ${dbErrorMessage(err, "0074_worker_wages.sql", errorMessage(err, "保存に失敗しました"))}`,
        );
      }
      setProgress({ done: ok.length + failed.length, total: targets.length });
    }
    setResult({ ok, failed });
    setBusy(false);
    // 登録した人は「登録済み」になって対象から外れる（二重登録を防ぐ）
    setCheckedOverride({});
    setAmountOverride({});
    router.refresh();
  };

  const groups = WAGE_RAISE_GROUPS.map((g) => ({ group: g, rows: rows.filter((r) => r.group === g) }));

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-4 py-4 lg:px-8">
      <p className="text-xs leading-relaxed text-muted">
        「いつから」「特定技能1号の時給」「特定技能2号の時給」を入れると、下の表の全員に新しい時給が仮に入ります。
        在留資格が2号（2号移行準備の特定活動を含む）の人は2号の金額、それ以外は1号の金額です。
        1人ずつ金額を直したり、チェックを外して対象から外したりできます。「登録する」を押すと、
        外国人詳細の「賃金（時給・月給）」に「昇給」として1人1行ずつ入り、所属機関の在籍名簿・請求書作成・最低賃金の案内の「現在の時給」に反映されます。
      </p>

      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[11px] font-bold text-muted">
          いつから（適用開始日）
          <input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold text-muted">
          特定技能1号の時給（円）
          <input
            value={formatAmountInput(ssw1Text)}
            onChange={(e) => setSsw1Text(e.target.value)}
            inputMode="numeric"
            placeholder="例: 1,100"
            className={`${FIELD} tabular-nums`}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold text-muted">
          特定技能2号の時給（円）
          <input
            value={formatAmountInput(ssw2Text)}
            onChange={(e) => setSsw2Text(e.target.value)}
            inputMode="numeric"
            placeholder="例: 1,150"
            className={`${FIELD} tabular-nums`}
          />
        </label>
      </Card>

      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
          {error}
        </p>
      )}
      {result && (
        <div
          role="status"
          className={`rounded-lg px-3 py-2 text-xs ${result.failed.length > 0 ? "bg-seal/10 text-seal" : "bg-brand/10 text-brand"}`}
        >
          <p className="font-bold">
            {result.ok.length}名の時給を登録しました
            {result.failed.length > 0 && `（${result.failed.length}名は登録できませんでした）`}
          </p>
          {result.failed.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {result.failed.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          <p className="mt-1">
            <Link href={`/organizations/${organizationId}`} className="font-bold underline">
              所属機関の在籍名簿に戻る
            </Link>
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          この所属機関に、在籍中・審査中・準備中の人はいません。
        </Card>
      ) : (
        groups
          .filter((g) => g.rows.length > 0)
          .map((g) => (
            <Card key={g.group} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                <h2 className="text-sm font-bold">
                  {g.group}（{g.rows.length}名・対象 {summary.byGroup[g.group]}名）
                </h2>
                {canEdit && (
                  <div className="flex gap-1.5 text-[11px] font-bold">
                    <button type="button" onClick={() => setAllInGroup(g.group, true)} className="rounded-lg border border-border px-2.5 py-1 text-brand">
                      全員を対象に
                    </button>
                    <button type="button" onClick={() => setAllInGroup(g.group, false)} className="rounded-lg border border-border px-2.5 py-1 text-muted">
                      全員を外す
                    </button>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-xs">
                  <thead>
                    <tr className="bg-background text-left text-[11px] text-muted">
                      <th className="w-14 whitespace-nowrap px-3 py-2 font-bold">対象</th>
                      <th className="px-3 py-2 font-bold">氏名</th>
                      <th className="px-3 py-2 font-bold">在留資格</th>
                      <th className="px-3 py-2 font-bold">現在の賃金</th>
                      <th className="w-36 px-3 py-2 font-bold">新しい時給（円）</th>
                      <th className="px-3 py-2 font-bold">確認</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => {
                      const checked = isChecked(r);
                      const amount = amountOf(r);
                      return (
                        <tr key={r.worker.id} className={`border-t border-border ${checked ? "" : "opacity-60"}`}>
                          <td className="px-3 py-1.5 text-center">
                            <input
                              type="checkbox"
                              aria-label={`${r.worker.name} を対象にする`}
                              checked={checked}
                              disabled={!canEdit || busy}
                              onChange={(e) =>
                                setCheckedOverride((prev) => ({ ...prev, [r.worker.id]: e.target.checked }))
                              }
                              className="size-4"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <Link href={`/workers/${r.worker.id}`} className="font-bold text-brand hover:underline">
                              {r.worker.name}
                            </Link>
                            {r.worker.application && (
                              <span className="ml-1 text-[10px] text-muted">{rosterApplicationLabel(r.worker.application)}</span>
                            )}
                            {r.group === "準備中" && (
                              <span className="ml-1 text-[10px] text-muted">状態「{r.worker.status || "未設定"}」</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5">{r.worker.residenceStatus || <span className="text-seal">未登録</span>}</td>
                          <td className="px-3 py-1.5 tabular-nums">
                            {r.worker.wageKind && r.worker.wageAmount
                              ? `${wageText(r.worker.wageKind, r.worker.wageAmount)}${r.worker.wageStartedOn ? `（${r.worker.wageStartedOn}〜）` : ""}`
                              : <span className="text-muted">未登録</span>}
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              value={formatAmountInput(amountOverride[r.worker.id] ?? (r.proposed ? String(r.proposed) : ""))}
                              onChange={(e) =>
                                setAmountOverride((prev) => ({ ...prev, [r.worker.id]: e.target.value }))
                              }
                              inputMode="numeric"
                              aria-label={`${r.worker.name} の新しい時給`}
                              disabled={!canEdit || busy}
                              placeholder="上で金額を入力"
                              className={`${FIELD} w-full text-right tabular-nums ${checked && amount <= 0 ? "border-seal" : ""}`}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-[11px] text-seal">{r.note}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))
      )}

      {canEdit && rows.length > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
          <button
            type="button"
            disabled={busy || summary.total === 0 || !dateOk}
            onClick={() => void save()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {busy && progress
              ? `登録中… ${progress.done}/${progress.total}`
              : `${summary.total}名に ${startedOn || "（日付未入力）"} からの時給を登録する`}
          </button>
          <span className="text-[11px] text-muted">
            在籍中 {summary.byGroup["在籍中"]}名・審査中 {summary.byGroup["審査中・受け取り待ち"]}名・準備中 {summary.byGroup["準備中"]}名
          </span>
          {(amounts.ssw1 === 0 || amounts.ssw2 === 0) && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-seal">
              <TriangleAlert size={13} />
              {amounts.ssw1 === 0 && amounts.ssw2 === 0
                ? "上で1号・2号の時給を入れてください"
                : amounts.ssw1 === 0
                  ? "1号の時給が未入力です（1号の人は対象になりません）"
                  : "2号の時給が未入力です（2号の人は対象になりません）"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
