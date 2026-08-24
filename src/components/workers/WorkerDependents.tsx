"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FileText, Plus, TriangleAlert, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import {
  dependentAge,
  dependentCategoryLabels,
  emptyDependent,
  formatYenAmount,
  isRemittanceAchieved,
  normalizeDependents,
  remittanceTarget,
  remittanceTotal,
  remittanceYears,
  warekiDate,
  warekiYear,
  REMITTANCE_HIGH_TARGET,
} from "@/lib/dependents";
import { todayStr } from "@/lib/ssw/calc";
import { formatAmountInput } from "@/lib/amount-format";
import type { WorkerDependent } from "@/types/db";

const RELATION_OPTIONS = [
  "配偶者",
  "父",
  "母",
  "子",
  "兄",
  "姉",
  "弟",
  "妹",
  "祖父",
  "祖母",
];

// 扶養家族（扶養親族証明書の内容）の記録と控除区分の自動判定。
// 生年月日は西暦で入力すると和暦と現時点の年齢を表示し、
// 配偶者控除・老人扶養親族・特定扶養親族などの該当区分をバッジで示す
export function WorkerDependents({
  workerId,
  initial,
  canEdit,
}: {
  workerId: string;
  initial: unknown; // workers.dependents（jsonb）
  canEdit: boolean;
}) {
  const router = useRouter();
  const today = todayStr();
  const [rows, setRows] = useState<WorkerDependent[]>(() => normalizeDependents(initial));
  // 送金の対象年（西暦）。年末調整は年ごとに行うため、この年の送金だけを入力・判定する
  const [targetYear, setTargetYear] = useState(today.slice(0, 4));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 対象年の送金で目標を達成している人数（申告書はこの達成者のみで発行できる）
  const achievedCount = rows.filter((r) => isRemittanceAchieved(r, today, targetYear)).length;

  const setAt = (i: number, key: keyof WorkerDependent, value: string) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
    setSaved(false);
  };

  // 対象年の送金明細を差し替える（他の年の記録はそのまま残す）
  const setRemittances = (i: number, amounts: string[]) => {
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === i
          ? {
              ...r,
              remittances: [
                ...r.remittances.filter((e) => e.year !== targetYear),
                ...amounts.map((amount) => ({ year: targetYear, amount })),
              ],
            }
          : r,
      ),
    );
    setSaved(false);
  };

  // 対象年が未設定の古い記録を、いまの対象年に振り分ける
  const assignYear = (i: number) => {
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === i
          ? {
              ...r,
              remittances: r.remittances.map((e) =>
                e.year === "" ? { ...e, year: targetYear } : e,
              ),
            }
          : r,
      ),
    );
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      // 金額が空の行は保存しない
      const cleaned = rows.map((r) => ({
        ...r,
        remittances: r.remittances.filter((e) => e.amount.trim() !== ""),
      }));
      await updateWorker(createClient(), workerId, { dependents: cleaned });
      setRows(cleaned);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const INPUT =
    "min-h-[40px] w-full rounded-lg border border-border bg-surface px-2.5 text-sm focus:border-brand focus:outline-none disabled:opacity-60";

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Users size={16} />
          扶養家族（{rows.length}人）
        </h2>
        <Link
          href={`/workers/${workerId}/dependents-form`}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold text-brand"
        >
          <FileText size={14} />
          扶養控除等申告書を作成
        </Link>
      </div>
      <p className="mb-2 text-[11px] leading-relaxed text-muted">
        扶養親族証明書の内容を記録します。生年月日（西暦）を入力すると和暦と現時点の年齢、
        該当する控除区分（配偶者控除・老人扶養親族・特定扶養親族など）を自動で表示します。
        年末の国際送金は明細書の各行の金額を入力すると、合計が目標額に達したかを自動で判定します。
      </p>
      {rows.length > 0 && (
        <>
          <label className="mb-2 flex flex-wrap items-center gap-2 text-xs font-bold text-muted">
            送金の対象年（西暦）
            <input
              type="number"
              min={2000}
              max={2100}
              value={targetYear}
              onChange={(e) => setTargetYear(e.target.value)}
              className="min-h-[36px] w-24 rounded-lg border border-border bg-surface px-2 text-sm tabular-nums focus:border-brand focus:outline-none"
            />
            <span className="font-medium">
              {warekiYear(targetYear) ? `（${warekiYear(targetYear)}）` : ""}
            </span>
            <span className="font-medium text-muted">
              の送金を入力・判定します（年末調整は年ごと）
            </span>
          </label>
          <p
            className={`mb-3 rounded-lg px-3 py-2 text-xs font-bold ${
              achievedCount === rows.length
                ? "bg-status-approved-bg text-status-approved-fg"
                : "bg-seal/10 text-seal"
            }`}
          >
            {targetYear}年
            {warekiYear(targetYear) && `（${warekiYear(targetYear)}）`}の送金の目標達成{" "}
            {achievedCount}/{rows.length}人
            {achievedCount < rows.length &&
              `（未達成: ${rows
                .filter((r) => !isRemittanceAchieved(r, today, targetYear))
                .map((r) => r.name || "氏名未入力")
                .join("・")}）`}
          </p>
        </>
      )}
      {error && <p className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">{error}</p>}

      {rows.length === 0 && (
        <p className="rounded-xl bg-background p-4 text-center text-sm text-muted">
          扶養家族がまだ登録されていません。
        </p>
      )}

      <div className="space-y-3">
        {rows.map((r, i) => {
          const age = r.birth ? dependentAge(r.birth, today) : null;
          const wareki = warekiDate(r.birth);
          const labels = dependentCategoryLabels(r, today);
          return (
            <div key={i} className="rounded-xl bg-background p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-muted">
                  扶養家族 {i + 1}
                  {age != null && (
                    <span className="ml-2 tabular-nums">
                      {wareki && `${wareki}生まれ ・ `}
                      {age}歳（現時点）
                    </span>
                  )}
                </p>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setRows((rs) => rs.filter((_, idx) => idx !== i));
                      setSaved(false);
                    }}
                    className="text-xs font-bold text-seal"
                  >
                    削除
                  </button>
                )}
              </div>
              {labels.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {labels.map((l) => (
                    <span
                      key={l}
                      className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="氏名">
                  <input
                    value={r.name}
                    onChange={(e) => setAt(i, "name", e.target.value)}
                    placeholder="PORY PHANNA"
                    disabled={!canEdit}
                    className={INPUT}
                  />
                </Field>
                <Field label="フリガナ">
                  <input
                    value={r.kana}
                    onChange={(e) => setAt(i, "kana", e.target.value)}
                    placeholder="ポーイ パンナー"
                    disabled={!canEdit}
                    className={INPUT}
                  />
                </Field>
                <Field label="続柄">
                  <>
                    <input
                      value={r.relation}
                      onChange={(e) => setAt(i, "relation", e.target.value)}
                      placeholder="父・母・妹・配偶者 など"
                      disabled={!canEdit}
                      list="dependent-relations"
                      className={INPUT}
                    />
                    <datalist id="dependent-relations">
                      {RELATION_OPTIONS.map((o) => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                  </>
                </Field>
                <Field label="生年月日（西暦）">
                  <input
                    type="date"
                    value={r.birth}
                    onChange={(e) => setAt(i, "birth", e.target.value)}
                    disabled={!canEdit}
                    className={INPUT}
                  />
                </Field>
                <Field label="住所（母国住所など）" wide>
                  <input
                    value={r.address}
                    onChange={(e) => setAt(i, "address", e.target.value)}
                    placeholder="POR SANGKAE VILLAGE, KOMNOB COMMUNE, ..."
                    disabled={!canEdit}
                    className={INPUT}
                  />
                </Field>
                <Field label="職業及び年収">
                  <input
                    value={r.occupation}
                    onChange={(e) => setAt(i, "occupation", e.target.value)}
                    placeholder="FARMER"
                    disabled={!canEdit}
                    className={INPUT}
                  />
                </Field>
                <Field label="所得の見積額メモ">
                  <input
                    value={formatAmountInput(r.income)}
                    onChange={(e) => setAt(i, "income", formatAmountInput(e.target.value))}
                    placeholder="例: 0円"
                    disabled={!canEdit}
                    className={INPUT}
                  />
                </Field>
              </div>

              {/* 年末の国際送金（送金関係書類）の明細と目標達成チェック（対象年ごと） */}
              <RemittanceRows
                amounts={r.remittances
                  .filter((e) => e.year === targetYear)
                  .map((e) => e.amount)}
                target={remittanceTarget(r, today)}
                year={targetYear}
                canEdit={canEdit}
                onChange={(v) => setRemittances(i, v)}
                otherYears={remittanceYears(r.remittances)
                  .filter((y) => y !== targetYear)
                  .map((y) => ({
                    year: y,
                    total: remittanceTotal(r.remittances, y),
                  }))}
                onAssignYear={canEdit ? () => assignYear(i) : undefined}
              />
            </div>
          );
        })}
      </div>

      {canEdit && (
        <div className="mt-3 flex flex-col gap-2">
          <Button
            variant="secondary"
            fullWidth
            icon={<Plus size={16} />}
            onClick={() => {
              setRows((rs) => [...rs, emptyDependent()]);
              setSaved(false);
            }}
          >
            扶養家族を追加
          </Button>
          {!saved && (
            <Button fullWidth disabled={busy} onClick={save}>
              {busy ? "保存中…" : "扶養家族を保存"}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

// 年末の国際送金（送金関係書類）の明細入力。送金明細書の各行の金額を続けて入力でき、
// Enterキーで次の行へ進む（最終行なら行を追加して移動）。合計が目標に達したかを表示する
function RemittanceRows({
  amounts,
  target,
  year,
  canEdit,
  onChange,
  otherYears,
  onAssignYear,
}: {
  amounts: string[];
  target: number;
  year: string; // 対象年（西暦）
  canEdit: boolean;
  onChange: (v: string[]) => void;
  otherYears: { year: string; total: number }[]; // 他の年の記録（表示のみ）
  onAssignYear?: () => void; // 対象年が未設定の古い記録を対象年に振り分ける
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const rows = amounts.length > 0 ? amounts : [""];
  const total = remittanceTotal(rows.map((amount) => ({ year, amount })));
  const achieved = total >= target && total > 0;
  const highTarget = target >= REMITTANCE_HIGH_TARGET;

  const setAt = (i: number, value: string) =>
    onChange(rows.map((v, idx) => (idx === i ? value : v)));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (i < rows.length - 1) {
      refs.current[i + 1]?.focus();
      return;
    }
    // 最終行でEnter: 行を1つ増やして、描画後にその行へ移動する
    onChange([...rows, ""]);
    setTimeout(() => refs.current[i + 1]?.focus(), 0);
  };

  return (
    <div className="mt-2 rounded-xl border border-border bg-surface p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] font-bold text-muted">
          {year}年{warekiYear(year) && `（${warekiYear(year)}）`}の国際送金（送金明細書の各行）
          <span className="ml-1.5 font-medium">
            目標 {highTarget ? `${formatYenAmount(target)}以上` : "1円以上（送金関係書類が必要）"}
          </span>
        </p>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
            achieved
              ? "bg-status-approved-bg text-status-approved-fg"
              : "bg-seal/10 text-seal"
          }`}
        >
          {achieved ? <Check size={12} /> : <TriangleAlert size={12} />}
          合計 {formatYenAmount(total)}
          {achieved
            ? " ・達成"
            : highTarget
              ? ` ・あと${formatYenAmount(Math.max(0, target - total))}`
              : " ・未送金"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {rows.map((v, i) => (
          <label key={i} className="flex items-center gap-1">
            <span className="w-5 shrink-0 text-right text-[10px] text-muted">{i + 1}</span>
            <input
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={formatAmountInput(v)}
              onChange={(e) => setAt(i, formatAmountInput(e.target.value))}
              onKeyDown={(e) => handleKeyDown(e, i)}
              inputMode="numeric"
              placeholder="0"
              disabled={!canEdit}
              className="min-h-[34px] w-full rounded-lg border border-border bg-background px-2 text-right text-sm tabular-nums focus:border-brand focus:outline-none disabled:opacity-60"
            />
          </label>
        ))}
      </div>
      {canEdit && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={() => {
              onChange([...rows, ""]);
              setTimeout(() => refs.current[rows.length]?.focus(), 0);
            }}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-brand"
          >
            <Plus size={12} />
            行を追加
          </button>
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(rows.slice(0, -1))}
              className="text-[11px] font-bold text-muted"
            >
              最後の行を削除
            </button>
          )}
          <span className="text-[10px] text-muted">
            Enterキーで次の行へ進みます（最終行なら行が増えます）
          </span>
        </div>
      )}
      {/* 他の年の記録（対象年を切り替えると入力できます） */}
      {otherYears.length > 0 && (
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
          他の年の送金:{" "}
          {otherYears
            .map((o) =>
              o.year
                ? `${o.year}年${warekiYear(o.year) ? `（${warekiYear(o.year)}）` : ""} ${formatYenAmount(o.total)}`
                : `年未設定 ${formatYenAmount(o.total)}`,
            )
            .join(" ・ ")}
          {otherYears.some((o) => !o.year) && onAssignYear && (
            <button
              type="button"
              onClick={onAssignYear}
              className="ml-1.5 font-bold text-brand underline"
            >
              年未設定を{year}年にする
            </button>
          )}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-[11px] font-bold text-muted">{label}</span>
      {children}
    </label>
  );
}
