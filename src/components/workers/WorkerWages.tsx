"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import {
  deleteWorkerWage,
  insertWorkerWage,
  listWorkerWages,
  updateWorkerWage,
} from "@/lib/supabase/queries/wages";
import { currentWage, hourlyFromMonthly, wageConversionText, wageRaise, wageText } from "@/lib/wage";
import {
  MINIMUM_WAGE_NOTE,
  checkMinimumWage,
  prefectureFromAddress,
} from "@/lib/minimum-wage";
import { updateOrganization } from "@/lib/supabase/queries/organizations";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import { WORKER_WAGE_KINDS, type Organization, type WorkerWage, type WorkerWageKind } from "@/types/db";

// 賃金（時給・月給など）の記録。
// 採用時の賃金を1行目に入れ、昇給のたびに行を足す。
// 適用開始日がいちばん新しい行が「現在の賃金」になり、過去の分もそのまま残る。
export function WorkerWages({
  workerId,
  currentOrganizationId,
  employmentStartOn,
  organizations,
  today,
  canEdit,
}: {
  workerId: string;
  currentOrganizationId: string | null;
  employmentStartOn: string | null; // 採用時の行を足すときの初期値
  organizations: Organization[];
  today: string;
  canEdit: boolean;
}) {
  const [wages, setWages] = useState<WorkerWage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 追加フォーム
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<WorkerWageKind>("時給");
  const [amount, setAmount] = useState("");
  const [startedOn, setStartedOn] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() =>
      listWorkerWages(createClient(), workerId)
        .then((rows) => {
          if (cancelled) return;
          setWages(rows);
          setLoaded(true);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          // テーブル未作成（マイグレーション未実行）でも詳細ページは開けるようにする
          setError(dbErrorMessage(err, "0074_worker_wages.sql", errorMessage(err, "")));
          setLoaded(true);
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  const orgName = (id: string | null) =>
    id ? (organizations.find((o) => o.id === id)?.name ?? "") : "";

  const now = currentWage(wages, today);

  // 時給⇔月給の換算に使う年間所定労働時間（会社ごと。所属機関に登録する）。
  // 賃金の行に機関が入っていればその会社、無ければ現在の所属機関のものを使う
  const orgHours = (id: string | null): number =>
    organizations.find((o) => o.id === id)?.annual_work_hours ?? 0;
  const conversionOrgId = now?.organization_id ?? currentOrganizationId;
  const [hoursInput, setHoursInput] = useState<string>("");
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursByOrg, setHoursByOrg] = useState<Record<string, number>>({});
  const annualHours = (id: string | null): number =>
    (id && hoursByOrg[id]) || orgHours(id);

  // 最低賃金と比べる時給（時給ならその額、月給なら換算した額）
  const hourlyOf = (w: WorkerWage): number | null => {
    if (w.kind === "時給") return w.amount || null;
    if (w.kind === "月給") return hourlyFromMonthly(w.amount, annualHours(w.organization_id));
    return null;
  };

  // 就業場所の都道府県（会社の作業する住所→会社の住所の順に見る）
  const prefectureOf = (orgId: string | null): string | null => {
    const org = organizations.find((o) => o.id === orgId);
    if (!org) return null;
    return (
      prefectureFromAddress(org.intake?.work_address) ??
      prefectureFromAddress(org.address)
    );
  };

  const minCheckOf = (w: WorkerWage) =>
    checkMinimumWage(hourlyOf(w), prefectureOf(w.organization_id));

  // 年間所定労働時間を所属機関に保存する（この会社の全員の換算に使われる）
  const saveHours = async () => {
    if (!conversionOrgId) return;
    const hours = Number(hoursInput.replace(/[^0-9]/g, "")) || 0;
    setHoursSaving(true);
    setError(null);
    try {
      await updateOrganization(createClient(), conversionOrgId, {
        annual_work_hours: hours,
      } as never);
      setHoursByOrg((prev) => ({ ...prev, [conversionOrgId]: hours }));
      setHoursInput("");
    } catch (err) {
      setError(
        dbErrorMessage(
          err,
          "0082_organization_annual_work_hours.sql",
          errorMessage(err, "年間所定労働時間の保存に失敗しました"),
        ),
      );
    } finally {
      setHoursSaving(false);
    }
  };

  const openForm = (asHire: boolean) => {
    setKind(now?.kind ?? "時給");
    setAmount("");
    // 採用時なら雇用開始日、昇給なら今日を初期値にする
    setStartedOn(asHire ? (employmentStartOn ?? "") : today);
    setReason(asHire ? "採用時" : "昇給");
    setOpen(true);
  };

  const add = async () => {
    if (!startedOn) {
      setError("適用開始日を入れてください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const row = await insertWorkerWage(createClient(), {
        worker_id: workerId,
        organization_id: currentOrganizationId,
        kind,
        amount: Number(amount) || 0,
        started_on: startedOn,
        reason: reason.trim(),
        note: "",
      });
      setWages((prev) => [row, ...prev]);
      setOpen(false);
    } catch (err) {
      setError(dbErrorMessage(err, "0074_worker_wages.sql", errorMessage(err, "賃金の保存に失敗しました")));
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, p: Partial<WorkerWage>) => {
    setWages((prev) => prev.map((w) => (w.id === id ? { ...w, ...p } : w)));
    try {
      await updateWorkerWage(createClient(), id, p);
    } catch (err) {
      setError(errorMessage(err, "賃金の保存に失敗しました"));
    }
  };

  const remove = async (id: string) => {
    setWages((prev) => prev.filter((w) => w.id !== id));
    try {
      await deleteWorkerWage(createClient(), id);
    } catch (err) {
      setError(errorMessage(err, "賃金の削除に失敗しました"));
    }
  };

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
        <Banknote size={16} />
        賃金（時給・月給）
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        採用時の賃金を入れ、昇給のたびに行を足してください。
        適用開始日がいちばん新しいものが現在の賃金になり、過去の賃金もそのまま残ります。
        所属機関の在籍者一覧にも現在の賃金が出ます。
      </p>

      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
          {error}
        </p>
      )}

      {/* 現在の賃金 */}
      <div className="rounded-xl bg-background p-3">
        <p className="text-xs text-muted">現在の賃金</p>
        <p className="text-2xl font-black">
          {now ? (
            wageText(now.kind, now.amount)
          ) : (
            <span className="text-sm font-bold text-seal">未登録</span>
          )}
        </p>
        {now && wageConversionText(now.kind, now.amount, annualHours(now.organization_id)) && (
          <p className="text-sm font-bold text-brand">
            ＝ {wageConversionText(now.kind, now.amount, annualHours(now.organization_id))}
            <span className="ml-1 text-[11px] font-medium text-muted">
              （年間所定労働時間 {annualHours(now.organization_id).toLocaleString("ja-JP")}時間で計算）
            </span>
          </p>
        )}
        {now && minCheckOf(now) && (
          <p
            className={`mt-1 flex items-center gap-1 text-xs font-bold ${
              minCheckOf(now)!.ok ? "text-status-approved-fg" : "text-seal"
            }`}
          >
            {minCheckOf(now)!.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {minCheckOf(now)!.ok
              ? `最低賃金クリア（${minCheckOf(now)!.prefecture} ${minCheckOf(now)!.minimum.toLocaleString("ja-JP")}円 ＋${minCheckOf(now)!.diff.toLocaleString("ja-JP")}円）`
              : `最低賃金を下回っています（${minCheckOf(now)!.prefecture} ${minCheckOf(now)!.minimum.toLocaleString("ja-JP")}円 に ${Math.abs(minCheckOf(now)!.diff).toLocaleString("ja-JP")}円 不足）`}
            <span className="font-medium text-muted">・{MINIMUM_WAGE_NOTE}</span>
          </p>
        )}
        {now && (
          <p className="text-[11px] text-muted">
            {now.started_on}から
            {now.reason && ` ・ ${now.reason}`}
            {orgName(now.organization_id) && ` ・ ${orgName(now.organization_id)}`}
          </p>
        )}
        {!now && loaded && (
          <p className="text-[11px] text-muted">
            採用時の賃金がまだ入っていません。下の「賃金を追加」から入れてください。
          </p>
        )}
      </div>

      {/* 換算に使う年間所定労働時間（会社ごとに登録。雇用条件書の値を入れる） */}
      {conversionOrgId && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-muted">
            年間所定労働時間（{orgName(conversionOrgId) || "所属機関"}）:
          </span>
          {annualHours(conversionOrgId) > 0 && hoursInput === "" ? (
            <span className="font-bold tabular-nums">
              {annualHours(conversionOrgId).toLocaleString("ja-JP")}時間
            </span>
          ) : null}
          {canEdit && (
            <>
              <input
                value={hoursInput}
                onChange={(e) => setHoursInput(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                placeholder={
                  annualHours(conversionOrgId) > 0
                    ? String(annualHours(conversionOrgId))
                    : "例: 2000"
                }
                className="w-24 rounded-lg border border-border bg-surface px-2 py-1 text-right tabular-nums"
              />
              <button
                type="button"
                onClick={() => void saveHours()}
                disabled={hoursSaving || hoursInput === ""}
                className="rounded-lg border border-border px-2 py-1 font-bold text-brand disabled:opacity-50"
              >
                {hoursSaving ? "保存中…" : "この会社に登録"}
              </button>
            </>
          )}
          {annualHours(conversionOrgId) === 0 && (
            <span className="text-muted">
              登録すると時給⇔月給の換算が出ます（雇用条件書の年間所定労働時間）
            </span>
          )}
        </div>
      )}

      {canEdit && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openForm(wages.length === 0)}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold"
          >
            <Plus size={13} />
            {wages.length === 0 ? "採用時の賃金を入れる" : "昇給を記録する"}
          </button>
        </div>
      )}

      {open && canEdit && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-muted">区分</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as WorkerWageKind)}
              className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-xs"
            >
              {WORKER_WAGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-muted">金額（円）</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              placeholder="1100"
              className="min-h-[36px] w-28 rounded-lg border border-border bg-surface px-2 text-right text-xs tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-muted">適用開始日</span>
            <input
              type="date"
              value={startedOn}
              onChange={(e) => setStartedOn(e.target.value)}
              className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-xs"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-muted">理由</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="採用時 / 昇給"
              className="min-h-[36px] w-28 rounded-lg border border-border bg-surface px-2 text-xs"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void add()}
            className="min-h-[36px] rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-50"
          >
            {busy ? "保存中…" : "保存"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="min-h-[36px] px-2 text-xs font-bold text-muted"
          >
            やめる
          </button>
        </div>
      )}

      {/* これまでの記録（新しい順） */}
      {wages.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-1.5 pr-2 font-bold">適用開始日</th>
                <th className="py-1.5 pr-2 font-bold">区分</th>
                <th className="py-1.5 pr-2 text-right font-bold">金額</th>
                <th className="py-1.5 pr-2 text-right font-bold">前回比</th>
                <th className="py-1.5 pr-2 font-bold">理由</th>
                <th className="py-1.5 pr-2 font-bold">所属機関</th>
                {canEdit && <th className="py-1.5 font-bold" />}
              </tr>
            </thead>
            <tbody>
              {wages.map((w) => {
                const raise = wageRaise(wages, w);
                return (
                  <tr key={w.id} className="border-b border-border/60">
                    <td className="py-1.5 pr-2 tabular-nums">
                      {w.id === now?.id ? <b>{w.started_on}</b> : w.started_on}
                      {w.id === now?.id && (
                        <span className="ml-1 rounded-full bg-status-approved-bg px-1.5 py-0.5 text-[10px] font-bold text-status-approved-fg">
                          現在
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      {w.kind}
                      {wageConversionText(w.kind, w.amount, annualHours(w.organization_id)) && (
                        <span className="block text-[10px] text-muted">
                          {wageConversionText(w.kind, w.amount, annualHours(w.organization_id))}
                        </span>
                      )}
                      {minCheckOf(w) && !minCheckOf(w)!.ok && (
                        <span className="block text-[10px] font-bold text-seal">
                          最低賃金に{Math.abs(minCheckOf(w)!.diff).toLocaleString("ja-JP")}円不足
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {canEdit ? (
                        <input
                          key={`${w.id}-${w.amount}`}
                          defaultValue={String(w.amount)}
                          onBlur={(e) => {
                            const v = Number(e.target.value.replace(/[^0-9]/g, "")) || 0;
                            if (v !== w.amount) void patch(w.id, { amount: v });
                          }}
                          inputMode="numeric"
                          className="w-24 rounded-lg border border-border bg-background px-1.5 py-1 text-right text-xs tabular-nums"
                        />
                      ) : (
                        w.amount.toLocaleString("ja-JP")
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {raise === null ? (
                        "—"
                      ) : raise > 0 ? (
                        <span className="font-bold text-status-approved-fg">
                          +{raise.toLocaleString("ja-JP")}
                        </span>
                      ) : raise < 0 ? (
                        <span className="font-bold text-seal">{raise.toLocaleString("ja-JP")}</span>
                      ) : (
                        "±0"
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-muted">{w.reason || "—"}</td>
                    <td className="py-1.5 pr-2 text-muted">{orgName(w.organization_id) || "—"}</td>
                    {canEdit && (
                      <td className="py-1.5 text-right">
                        <button
                          type="button"
                          aria-label="この記録を削除"
                          onClick={() => void remove(w.id)}
                          className="text-muted hover:text-seal"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
