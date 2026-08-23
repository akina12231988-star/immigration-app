"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { createClient } from "@/lib/supabase/client";
import {
  GENDER_REQS,
  POSTING_DEDUCTION_ITEMS,
  POSTING_FIELDS,
  POSTING_INSURANCES,
  POSTING_SMOKING_OPTIONS,
  POSTING_STATUSES,
  POSTING_WEEKDAYS,
  WAGE_KINDS,
  type GenderReq,
  type JobPosting,
  type JobPostingInput,
  type PostingSheet,
  type PostingStatus,
  type WageKind,
} from "@/types/recruiting";
import { emptyPostingAllowance, normalizePostingSheet } from "@/lib/posting-sheet";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import type { Organization } from "@/types/db";

function toInput(p: JobPosting | null, orgId: string): JobPostingInput {
  return {
    organization_id: p?.organization_id ?? orgId,
    acceptance_no: p?.acceptance_no ?? "",
    received_on: p?.received_on ?? new Date().toISOString().slice(0, 10),
    valid_until: p?.valid_until ?? null,
    closed_on: p?.closed_on ?? null,
    openings: p?.openings ?? 1,
    job_type: p?.job_type ?? "",
    work_location: p?.work_location ?? "",
    employment_period: p?.employment_period ?? "",
    wage_kind: p?.wage_kind ?? "時給",
    wage_amount: p?.wage_amount ?? null,
    rent: p?.rent ?? "",
    utilities: p?.utilities ?? "",
    contact: p?.contact ?? "",
    display_company: p?.display_company ?? "",
    display_address: p?.display_address ?? "",
    target_nationality: p?.target_nationality ?? "",
    gender: p?.gender ?? "不問",
    hire_timing: p?.hire_timing ?? "",
    status: p?.status ?? "募集中",
    note: p?.note ?? "",
    // 求人票（会社に書いてもらう内容）
    sheet: normalizePostingSheet(p?.sheet),
  };
}

const INPUT_CLASS =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

const TEXTAREA_CLASS =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none";

export function PostingForm({
  initial,
  organizations,
  submitLabel,
  onSubmit,
  onCancel,
  simple = false,
}: {
  initial: JobPosting | null;
  organizations: Organization[];
  submitLabel: string;
  onSubmit: (input: JobPostingInput) => Promise<void>;
  onCancel?: () => void;
  // true: 求人管理簿だけで一旦登録できる（求人票・Facebook掲載用は詳細ページの編集で入力）
  simple?: boolean;
}) {
  const [form, setForm] = useState<JobPostingInput>(() =>
    toInput(initial, organizations[0]?.id ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 前回の求人の内容を反映したときのお知らせ
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null);

  // 新規登録のとき: 所属機関を選ぶと、その会社の直近の求人から毎回同じような項目
  // （職種・就業場所・給与・求人票の内容など）を自動で反映する。
  // 受理番号・受付日・有効期限・採用人数・記入日・状態は引き継がない
  const applyPrevPosting = (orgId: string) => {
    if (initial || !orgId) return;
    void createClient()
      .from("job_postings")
      .select("*")
      .eq("organization_id", orgId)
      .order("received_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const prev = ((data as JobPosting[] | null) ?? [])[0];
        if (!prev) {
          setPrefillNotice(null);
          return;
        }
        setForm((f) => ({
          ...f,
          organization_id: orgId,
          job_type: prev.job_type ?? "",
          work_location: prev.work_location ?? "",
          employment_period: prev.employment_period ?? "",
          wage_kind: prev.wage_kind ?? "時給",
          wage_amount: prev.wage_amount ?? null,
          rent: prev.rent ?? "",
          utilities: prev.utilities ?? "",
          contact: prev.contact ?? "",
          display_company: prev.display_company ?? "",
          display_address: prev.display_address ?? "",
          target_nationality: prev.target_nationality ?? "",
          gender: prev.gender ?? "不問",
          hire_timing: prev.hire_timing ?? "",
          // 求人票（会社に書いてもらう内容）は記入日以外を引き継ぐ
          sheet: { ...normalizePostingSheet(prev.sheet), filled_on: f.sheet?.filled_on ?? "" },
        }));
        setPrefillNotice(
          `この会社の前回の求人（受付日 ${prev.received_on ?? "不明"}）の内容を反映しました。受理番号・受付日・有効期限・記入日は引き継いでいません。変わった項目だけ直してください。`,
        );
      });
  };

  // 開いた時点の所属機関（先頭の会社）の分も反映しておく
  useEffect(() => {
    if (!initial) applyPrevPosting(form.organization_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof JobPostingInput>(key: K, value: JobPostingInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // 求人票の内容（sheet）の1項目を書き換える
  const sheet = normalizePostingSheet(form.sheet);
  const setSheet = (patch: Partial<PostingSheet>) =>
    setForm((f) => ({ ...f, sheet: { ...normalizePostingSheet(f.sheet), ...patch } }));

  // チェックボックス（休日・加入保険）の付け外し
  const toggle = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.organization_id) {
      setError("所属機関を選択してください（先に会社・機関マスタで登録が必要です）");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(
        dbErrorMessage(err, "0090_job_posting_sheet.sql", errorMessage(err, "保存に失敗しました")),
      );
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      <Fieldset legend="求人管理簿（記録用）">
        <Field label="所属機関（必須）">
          {/* 会社名の一部を入力すると候補が出る。選ぶと前回の求人の内容を反映する */}
          <Combobox
            options={organizations.map((o) => ({ id: o.id, label: o.name }))}
            value={form.organization_id}
            onChange={(id) => {
              set("organization_id", id);
              applyPrevPosting(id);
            }}
            placeholder="会社名の一部を入力して検索"
          />
        </Field>
        {prefillNotice && (
          <p className="rounded-xl border border-brand/40 bg-brand/5 px-3 py-2.5 text-xs leading-relaxed text-brand">
            {prefillNotice}
          </p>
        )}
        {/* 所属機関が求人で必須としている他条件（所属機関の情報で登録）を注意喚起 */}
        {(() => {
          const org = organizations.find((o) => o.id === form.organization_id);
          const note = (org?.intake?.posting_note ?? "").trim();
          if (!note) return null;
          return (
            <p className="rounded-xl border border-status-notice-fg/50 bg-status-notice-bg/50 px-3 py-2.5 text-xs font-bold leading-relaxed text-status-notice-fg">
              ⚠ この所属機関の求人必須条件: {note}
            </p>
          );
        })()}
        <Field label="求人受理番号（求人管理簿・労働局への提出で使用）">
          <input
            value={form.acceptance_no}
            onChange={(e) => set("acceptance_no", e.target.value)}
            placeholder="例: 8-1（年度-連番）"
            className={INPUT_CLASS}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="求人受付日">
            <input
              type="date"
              value={form.received_on}
              onChange={(e) => set("received_on", e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="有効期限">
            <input
              type="date"
              value={form.valid_until ?? ""}
              onChange={(e) => set("valid_until", e.target.value || null)}
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <Field label="職種">
          <input
            value={form.job_type}
            onChange={(e) => set("job_type", e.target.value)}
            placeholder="惣菜製造"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="就業場所">
          <input
            value={form.work_location}
            onChange={(e) => set("work_location", e.target.value)}
            placeholder="福岡県久留米市◯◯工場"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="雇用期間">
          <input
            value={form.employment_period}
            onChange={(e) => set("employment_period", e.target.value)}
            placeholder="期間の定めなし／1年ごと更新 など"
            className={INPUT_CLASS}
          />
        </Field>
        <div className="grid grid-cols-3 gap-2.5">
          <Field label="給与区分">
            <select
              value={form.wage_kind}
              onChange={(e) => set("wage_kind", e.target.value as WageKind)}
              className={INPUT_CLASS}
            >
              {WAGE_KINDS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </Field>
          <Field label="金額（円）">
            <input
              type="number"
              inputMode="numeric"
              value={form.wage_amount ?? ""}
              onChange={(e) =>
                set("wage_amount", e.target.value === "" ? null : Number(e.target.value))
              }
              placeholder="1100"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="連絡先">
            <input
              value={form.contact}
              onChange={(e) => set("contact", e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
        </div>
      </Fieldset>

      {/* 新規登録はまず求人管理簿だけで受付できる。求人票などの詳細は
          会社に書いてもらったあと、求人の詳細ページの編集から入力する */}
      {simple && (
        <p className="rounded-xl border border-border bg-background px-3 py-2.5 text-xs leading-relaxed text-muted">
          まずはここまでで登録して求人を受付できます。会社に求人票を記載してもらったら、求人の詳細ページの「編集」から求人票・Facebook掲載用の内容を入力してください。
        </p>
      )}

      {!simple && (
      <>
      <Fieldset legend="求人票（会社に書いてもらう内容）">
        <p className="text-[11px] leading-relaxed text-muted">
          特定技能1号の求人票に書いてもらった内容をそのまま入れる欄です。
          職種・就業場所・採用人数・基本給は上の「求人管理簿」の入力を使います。
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="記入日">
            <input
              type="date"
              value={sheet.filled_on}
              onChange={(e) => setSheet({ filled_on: e.target.value })}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="分野名">
            <select
              value={sheet.field_name}
              onChange={(e) => setSheet({ field_name: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">選択してください</option>
              {POSTING_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="勤務地の変更の可能性">
          <input
            value={sheet.work_location_change}
            onChange={(e) => setSheet({ work_location_change: e.target.value })}
            placeholder="変更なし／◯◯工場へ変更の可能性あり など"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="仕事内容">
          <textarea
            rows={3}
            value={sheet.job_description}
            onChange={(e) => setSheet({ job_description: e.target.value })}
            placeholder="いちごの収穫・選別・パック詰め など"
            className={TEXTAREA_CLASS}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="契約期間">
            <select
              value={sheet.contract_term_kind}
              onChange={(e) => setSheet({ contract_term_kind: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="期間の定めなし">期間の定めなし</option>
              <option value="期間の定めあり">期間の定めあり</option>
            </select>
          </Field>
          <Field label="雇用契約期間（定めありの場合）">
            <input
              value={sheet.contract_term}
              onChange={(e) => setSheet({ contract_term: e.target.value })}
              placeholder="1年（2026/9/1〜2027/8/31）"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <Field label="契約の更新">
          <input
            value={sheet.contract_renewal}
            onChange={(e) => setSheet({ contract_renewal: e.target.value })}
            placeholder="有：勤務成績・会社の経営状況により判断 ／ 無"
            className={INPUT_CLASS}
          />
        </Field>

        <div className="grid grid-cols-3 gap-2.5">
          <Field label="始業">
            <input
              value={sheet.work_start}
              onChange={(e) => setSheet({ work_start: e.target.value })}
              placeholder="8:00"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="終業">
            <input
              value={sheet.work_end}
              onChange={(e) => setSheet({ work_end: e.target.value })}
              placeholder="17:00"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="1日の所定労働時間">
            <input
              value={sheet.daily_hours}
              onChange={(e) => setSheet({ daily_hours: e.target.value })}
              placeholder="8時間"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <Field label="変形労働制">
            <input
              value={sheet.flexible_hours}
              onChange={(e) => setSheet({ flexible_hours: e.target.value })}
              placeholder="なし／1年単位 など"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="休憩（分）">
            <input
              value={sheet.break_minutes}
              onChange={(e) => setSheet({ break_minutes: e.target.value.replace(/[^0-9]/g, "") })}
              inputMode="numeric"
              placeholder="60"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="残業">
            <select
              value={sheet.overtime}
              onChange={(e) => setSheet({ overtime: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">—</option>
              <option value="有">有</option>
              <option value="無">無</option>
            </select>
          </Field>
        </div>
        <Field label="休日">
          <div className="flex flex-wrap gap-1.5">
            {POSTING_WEEKDAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSheet({ holidays: toggle(sheet.holidays, d) })}
                className={`min-h-[36px] rounded-lg border px-3 text-sm font-bold ${
                  sheet.holidays.includes(d)
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-border bg-background text-muted"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </Field>
        <Field label="休日のその他（年間休日・シフトなど）">
          <input
            value={sheet.holiday_note}
            onChange={(e) => setSheet({ holiday_note: e.target.value })}
            placeholder="年間休日105日／シフト制 など"
            className={INPUT_CLASS}
          />
        </Field>

        {/* 手当 */}
        <Field label="手当（基本給とは別に支給されるもの）">
          <div className="flex flex-col gap-2">
            {sheet.allowances.map((a, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-1.5 rounded-xl border border-dashed border-border p-2">
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    value={a.name}
                    onChange={(e) =>
                      setSheet({
                        allowances: sheet.allowances.map((x, j) =>
                          j === i ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                    placeholder="手当名（例: 皆勤手当）"
                    className={INPUT_CLASS}
                  />
                  <input
                    value={a.amount}
                    onChange={(e) =>
                      setSheet({
                        allowances: sheet.allowances.map((x, j) =>
                          j === i ? { ...x, amount: e.target.value.replace(/[^0-9]/g, "") } : x,
                        ),
                      })
                    }
                    inputMode="numeric"
                    placeholder="金額（円）"
                    className={INPUT_CLASS}
                  />
                  <textarea
                    rows={2}
                    value={a.method}
                    onChange={(e) =>
                      setSheet({
                        allowances: sheet.allowances.map((x, j) =>
                          j === i ? { ...x, method: e.target.value } : x,
                        ),
                      })
                    }
                    placeholder="計算方法（例: 欠勤がない月に定額支給）"
                    className={`${TEXTAREA_CLASS} col-span-2`}
                  />
                </div>
                <button
                  type="button"
                  aria-label="この手当を削除"
                  onClick={() =>
                    setSheet({ allowances: sheet.allowances.filter((_, j) => j !== i) })
                  }
                  className="self-start px-2 py-2 text-xs font-bold text-muted"
                >
                  削除
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setSheet({ allowances: [...sheet.allowances, emptyPostingAllowance()] })
              }
              className="self-start rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold"
            >
              ＋ 手当を追加
            </button>
          </div>
        </Field>

        {/* 控除内容 */}
        <Field label="控除項目（給与から引くもの）">
          <div className="flex flex-wrap gap-1.5">
            {POSTING_DEDUCTION_ITEMS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSheet({ deduction_items: toggle(sheet.deduction_items, d) })}
                className={`min-h-[36px] rounded-lg border px-3 text-sm font-bold ${
                  sheet.deduction_items.includes(d)
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-border bg-background text-muted"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-3 gap-2.5">
          <Field label="源泉所得税（扶養0人・円）">
            <input
              value={sheet.income_tax}
              onChange={(e) => setSheet({ income_tax: e.target.value.replace(/[^0-9]/g, "") })}
              inputMode="numeric"
              placeholder="3000"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="社会保険料">
            <select
              value={sheet.social_insurance}
              onChange={(e) => setSheet({ social_insurance: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="適用">適用</option>
              <option value="適用なし">適用なし</option>
            </select>
          </Field>
          <Field label="雇用保険料">
            <select
              value={sheet.employment_insurance}
              onChange={(e) => setSheet({ employment_insurance: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="適用">適用</option>
              <option value="適用なし">適用なし</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="居住費（円）">
            <input
              value={sheet.housing_cost}
              onChange={(e) => setSheet({ housing_cost: e.target.value.replace(/[^0-9]/g, "") })}
              inputMode="numeric"
              placeholder="20000"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="物件の区分">
            <select
              value={sheet.housing_kind}
              onChange={(e) => setSheet({ housing_kind: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">—</option>
              <option value="自己所有物件">自己所有物件</option>
              <option value="賃貸物件">賃貸物件</option>
            </select>
          </Field>
        </div>
        <Field label="居住費の説明（算出根拠）">
          <textarea
            rows={2}
            value={sheet.housing_note}
            onChange={(e) => setSheet({ housing_note: e.target.value })}
            placeholder="家賃60,000円を3名で按分 など"
            className={TEXTAREA_CLASS}
          />
        </Field>
        <div className="grid grid-cols-3 gap-2.5">
          <Field label="水道光熱費（約・円）">
            <input
              value={sheet.utility_cost}
              onChange={(e) => setSheet({ utility_cost: e.target.value.replace(/[^0-9]/g, "") })}
              inputMode="numeric"
              placeholder="8000"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="水道光熱費の徴収">
            <select
              value={sheet.utility_kind}
              onChange={(e) => setSheet({ utility_kind: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">—</option>
              <option value="実費">実費</option>
              <option value="固定">固定</option>
            </select>
          </Field>
          <Field label="通信費（約・円）">
            <input
              value={sheet.communication_cost}
              onChange={(e) =>
                setSheet({ communication_cost: e.target.value.replace(/[^0-9]/g, "") })
              }
              inputMode="numeric"
              placeholder="3000"
              className={INPUT_CLASS}
            />
          </Field>
        </div>

        {/* 昇給・賞与・支払 */}
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="昇給">
            <select
              value={sheet.raise}
              onChange={(e) => setSheet({ raise: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">—</option>
              <option value="有">有</option>
              <option value="無">無</option>
            </select>
          </Field>
          <Field label="昇給の支払時期・内容">
            <input
              value={sheet.raise_note}
              onChange={(e) => setSheet({ raise_note: e.target.value })}
              placeholder="毎年4月・時給20円〜 など"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="賞与">
            <select
              value={sheet.bonus}
              onChange={(e) => setSheet({ bonus: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">—</option>
              <option value="有">有</option>
              <option value="無">無</option>
            </select>
          </Field>
          <Field label="賞与の支払時期・内容">
            <input
              value={sheet.bonus_note}
              onChange={(e) => setSheet({ bonus_note: e.target.value })}
              placeholder="年2回（7月・12月）・業績による など"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <Field label="給与の締切日">
            <input
              value={sheet.pay_closing_day}
              onChange={(e) => setSheet({ pay_closing_day: e.target.value })}
              placeholder="末日"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="給与の支払日">
            <input
              value={sheet.pay_day}
              onChange={(e) => setSheet({ pay_day: e.target.value })}
              placeholder="翌月25日"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="支払方法">
            <select
              value={sheet.pay_method}
              onChange={(e) => setSheet({ pay_method: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="口座振込">口座振込</option>
              <option value="通貨払い">通貨払い</option>
            </select>
          </Field>
        </div>

        <Field label="加入保険">
          <div className="flex flex-wrap gap-1.5">
            {POSTING_INSURANCES.map((ins) => (
              <button
                key={ins}
                type="button"
                onClick={() => setSheet({ insurances: toggle(sheet.insurances, ins) })}
                className={`min-h-[36px] rounded-lg border px-3 text-sm font-bold ${
                  sheet.insurances.includes(ins)
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-border bg-background text-muted"
                }`}
              >
                {ins}
              </button>
            ))}
          </div>
        </Field>
        <Field label="加入保険のその他">
          <input
            value={sheet.insurance_other}
            onChange={(e) => setSheet({ insurance_other: e.target.value })}
            className={INPUT_CLASS}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="受動喫煙防止措置の状況">
            <select
              value={sheet.smoking}
              onChange={(e) => setSheet({ smoking: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">—</option>
              {POSTING_SMOKING_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
          <Field label="受動喫煙防止措置の補足">
            <input
              value={sheet.smoking_note}
              onChange={(e) => setSheet({ smoking_note: e.target.value })}
              className={INPUT_CLASS}
            />
          </Field>
        </div>

        <Field label="経験の有無（応募に必要とされる事項）">
          <input
            value={sheet.experience}
            onChange={(e) => setSheet({ experience: e.target.value })}
            placeholder="不問／農業経験1年以上 など"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="必要条件">
          <input
            value={sheet.requirements}
            onChange={(e) => setSheet({ requirements: e.target.value })}
            placeholder="N4・技能実習の専門級合格書 など"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="その他（応募条件）">
          <textarea
            rows={2}
            value={sheet.other_requirements}
            onChange={(e) => setSheet({ other_requirements: e.target.value })}
            className={TEXTAREA_CLASS}
          />
        </Field>
      </Fieldset>

      <Fieldset legend="Facebook掲載用">
        <Field label="掲載用の会社名">
          <input
            value={form.display_company}
            onChange={(e) => set("display_company", e.target.value)}
            placeholder="食品製造工場（福岡県）"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="掲載用の簡易住所">
          <input
            value={form.display_address}
            onChange={(e) => set("display_address", e.target.value)}
            placeholder="福岡県久留米市"
            className={INPUT_CLASS}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="募集人数">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={form.openings}
              onChange={(e) => set("openings", Math.max(1, Number(e.target.value) || 1))}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="性別">
            <select
              value={form.gender}
              onChange={(e) => set("gender", e.target.value as GenderReq)}
              className={INPUT_CLASS}
            >
              {GENDER_REQS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="対象国籍">
            <input
              value={form.target_nationality}
              onChange={(e) => set("target_nationality", e.target.value)}
              placeholder="ベトナム・不問 など"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="採用予定時期">
            <input
              value={form.hire_timing}
              onChange={(e) => set("hire_timing", e.target.value)}
              placeholder="2026年9月頃"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="家賃（掲載用・Tiền nhà）">
            <input
              value={form.rent}
              onChange={(e) => set("rent", e.target.value)}
              placeholder="約1万円 / 15000円 など"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="光熱費（掲載用・Điện nước ga）">
            <input
              value={form.utilities}
              onChange={(e) => set("utilities", e.target.value)}
              placeholder="自己負担 など"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <Field label="備考（シフト・寮の有無など）">
          <textarea
            rows={2}
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
          />
        </Field>
        <Field label="状態">
          <select
            value={form.status}
            onChange={(e) => set("status", e.target.value as PostingStatus)}
            className={INPUT_CLASS}
          >
            {POSTING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </Fieldset>
      </>
      )}

      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" fullWidth onClick={onCancel} disabled={busy}>
            キャンセル
          </Button>
        )}
        <Button type="submit" fullWidth disabled={busy}>
          {busy ? "保存中…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-border p-3.5">
      <legend className="px-1 text-xs font-bold text-muted">{legend}</legend>
      <div className="flex flex-col gap-2.5">{children}</div>
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold text-muted">{label}</span>
      {children}
    </label>
  );
}
