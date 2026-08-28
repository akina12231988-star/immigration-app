"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { formatAmountInput } from "@/lib/amount-format";
import { createClient } from "@/lib/supabase/client";
import {
  GENDER_REQS,
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
import {
  canPickRenewalCriteria,
  contractRenewalText,
  dailyWorkHours,
  emptyPostingAllowance,
  normalizePostingSheet,
  normalizeTimeInput,
  CONTRACT_RENEWAL_CRITERIA,
  CONTRACT_RENEWAL_KINDS,
  CONTRACT_RENEWAL_NONE,
  CONTRACT_TERMS,
} from "@/lib/posting-sheet";
import {
  calcIncomeTaxMonthly,
  calcWageDetail,
  CONSTRUCTION_MIN_WAGE_AVG,
  constructionMinMonthly,
  emptyWageDetail,
  employmentInsuranceAmount,
  formatYen,
  monthlyBaseWage,
  socialInsuranceAmount,
} from "@/lib/wage-calc";
import {
  flexDocsValidUntil,
  normalizeOrganizationIntake,
  parseAmount,
  parseHoursMinutes,
} from "@/lib/organization-intake";
import { prefCityOnly } from "@/lib/posting-grid";
import { postingValidUntil, POSTING_VALID_MONTHS } from "@/lib/posting-validity";
import { todayStr } from "@/lib/ssw/calc";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import { listOrganizationFiles } from "@/lib/supabase/queries/organization-files";
import { getOrgFilePreviewUrl } from "@/app/(app)/organizations/actions";
import type {
  OrgLodging,
  Organization,
  OrganizationFileRow,
  OrganizationIntake,
  WageDetail,
} from "@/types/db";

function toInput(p: JobPosting | null, orgId: string): JobPostingInput {
  return {
    organization_id: p?.organization_id ?? orgId,
    acceptance_no: p?.acceptance_no ?? "",
    received_on: p?.received_on ?? new Date().toISOString().slice(0, 10),
    // 有効期限は受付日から3か月。入っていなければ受付日から自動で入れる（手で直せる）
    valid_until:
      p?.valid_until ??
      (postingValidUntil(p?.received_on ?? new Date().toISOString().slice(0, 10)) || null),
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

// 時給⇔月給換算・手取り計算に使う年間所定労働時間。
// 所属機関の「求人票に記載する内容」→ 年間所定労働時間の列（0082）→ 月平均×12 の順で使う
function orgAnnualHours(org?: Organization): number {
  const intake = org?.intake;
  const annual = parseAmount(intake?.posting_annual_hours ?? "");
  if (annual) return annual;
  if (org?.annual_work_hours) return org.annual_work_hours;
  const monthly = parseHoursMinutes(intake?.posting_monthly_hours ?? "");
  return monthly ? Math.round(monthly * 12) : 0;
}

// 分野名から雇用保険料の事業の種類を出す（農業・漁業は料率が違う）
function employmentKindForField(fieldName: string): string {
  if (fieldName === "農業" || fieldName === "漁業") return "農林水産・清酒製造の事業";
  if (fieldName === "建設") return "建設の事業";
  return "一般の事業";
}

// Facebook掲載用の会社名の自動値（職種＋（就業場所の市まで））。例: 農業（上天草）
function autoDisplayCompany(jobType: string, workLocation: string): string {
  if (!jobType) return "";
  const m = workLocation.match(/^(?:.{2,3}[都道府県])?(.+?)市/);
  const city = m ? m[1] : "";
  return city ? `${jobType}（${city}）` : jobType;
}

// 寮・宿泊物件から居住費を反映したときの説明文（算出根拠）。家賃は1人あたりで登録されている
function lodgingNote(l: OrgLodging): string {
  const rent = parseAmount(l.rent);
  const where = l.name || l.address || "寮";
  if (rent == null) return "";
  const people = parseAmount(l.max_residents);
  return `${where}：1人あたり月額${rent.toLocaleString("ja-JP")}円${people != null ? `（最大${people}名）` : ""}`;
}

// 所属機関の情報に登録された内容（保険・支払方法・締切日/支払日・水道光熱費・通信費・
// 変形労働時間制・居住費・その他条件）を求人票の欄に反映する。登録がある項目だけ上書きする
function sheetFromOrgIntake(intake?: Partial<OrganizationIntake>): Partial<PostingSheet> {
  if (!intake) return {};
  const out: Partial<PostingSheet> = {};
  if (intake.health_insurance) {
    out.social_insurance = intake.health_insurance === "社会保険" ? "適用" : "適用なし";
  }
  if (intake.koyo_covered) {
    out.employment_insurance = intake.koyo_covered === "はい" ? "適用" : "適用なし";
  }
  if (intake.pay_method) out.pay_method = intake.pay_method;
  if (intake.posting_pay_closing) out.pay_closing_day = intake.posting_pay_closing;
  if (intake.posting_pay_day) out.pay_day = intake.posting_pay_day;
  if (intake.posting_other_conditions) out.other_requirements = intake.posting_other_conditions;
  if (intake.posting_utility_cost) out.utility_cost = intake.posting_utility_cost;
  if (intake.posting_utility_kind) out.utility_kind = intake.posting_utility_kind;
  if (intake.posting_comm_cost) out.communication_cost = intake.posting_comm_cost;
  if (intake.flex_hours_kind) {
    out.flexible_hours =
      intake.flex_hours_kind === "なし"
        ? "なし"
        : intake.flex_hours_kind === "1ヶ月単位"
          ? "1ヶ月単位の変形労働時間制"
          : "1年単位の変形労働時間制";
  }
  // 寮が1件だけ登録されているときは居住費も自動で反映する（複数あるときは求人票の欄で選ぶ）
  const lods = (intake.lodgings ?? []).filter((l) => l.kind && l.rent);
  if (lods.length === 1) {
    const per = parseAmount(lods[0].rent);
    if (per != null) {
      out.housing_lodging_id = lods[0].id;
      out.housing_cost = String(per);
      out.housing_kind = lods[0].kind;
      out.housing_note = lodgingNote(lods[0]);
    }
  }
  return out;
}

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
  // この画面から所属機関の「求人票に記載する内容」を登録・修正したときの最新値
  // （保存後すぐ求人票へ反映できるよう、機関ごとに持っておく）
  const [intakeOverrides, setIntakeOverrides] = useState<Record<string, OrganizationIntake>>({});

  const orgIntakeOf = (orgId: string): Partial<OrganizationIntake> | undefined =>
    intakeOverrides[orgId] ?? organizations.find((o) => o.id === orgId)?.intake;

  // 所属機関の情報に登録された内容を求人票の欄に反映する
  const orgSheetOverlay = (orgId: string): Partial<PostingSheet> =>
    sheetFromOrgIntake(orgIntakeOf(orgId));

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
          // 前回の求人が無くても、所属機関の情報の登録内容は反映する
          setForm((f) => ({
            ...f,
            sheet: { ...normalizePostingSheet(f.sheet), ...orgSheetOverlay(orgId) },
          }));
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
          // 求人票（会社に書いてもらう内容）は記入日以外を引き継ぎ、
          // 所属機関の情報に登録がある項目はそちらを優先する
          sheet: {
            ...normalizePostingSheet(prev.sheet),
            ...orgSheetOverlay(orgId),
            filled_on: f.sheet?.filled_on ?? "",
          },
        }));
        setPrefillNotice(
          `この会社の前回の求人（受付日 ${prev.received_on ?? "不明"}）の内容を反映しました。受理番号・受付日・有効期限・記入日は引き継いでいません。源泉所得税・保険・水道光熱費などは所属機関の情報の登録を優先しています。変わった項目だけ直してください。`,
        );
      });
  };

  // 開いた時点の所属機関（先頭の会社）の分も反映しておく。
  // 求人受理番号は「令和年度-連番」（例: 8-1）で、今年度（4月始まり）の
  // 既存の連番の続きを自動で入れる（直すこともできる）
  useEffect(() => {
    if (initial) return;
    applyPrevPosting(form.organization_id);
    void createClient()
      .from("job_postings")
      .select("acceptance_no")
      .then(({ data }) => {
        const now = new Date();
        // 4月始まりの年度に直してから令和年に変換する
        const fiscal = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        const reiwa = fiscal.getFullYear() - 2018;
        let max = 0;
        for (const r of (data as { acceptance_no: string | null }[] | null) ?? []) {
          const m = (r.acceptance_no ?? "").trim().match(new RegExp(`^${reiwa}-(\\d+)$`));
          if (m) max = Math.max(max, Number(m[1]));
        }
        const next = `${reiwa}-${max + 1}`;
        setForm((f) => (f.acceptance_no ? f : { ...f, acceptance_no: next }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof JobPostingInput>(key: K, value: JobPostingInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // 求人票の内容（sheet）の1項目を書き換える
  const sheet = normalizePostingSheet(form.sheet);
  const setSheet = (patch: Partial<PostingSheet>) =>
    setForm((f) => ({ ...f, sheet: { ...normalizePostingSheet(f.sheet), ...patch } }));

  // 始業・終業・休憩を書き換えたら、1日の所定労働時間を自動で計算し直す
  const setSheetTimes = (
    patch: Partial<Pick<PostingSheet, "work_start" | "work_end" | "break_minutes">>,
  ) => {
    const next = { ...sheet, ...patch };
    const daily = dailyWorkHours(next.work_start, next.work_end, next.break_minutes);
    setSheet(daily ? { ...patch, daily_hours: daily } : patch);
  };

  const baseOrg = organizations.find((o) => o.id === form.organization_id);
  // この画面で登録・修正した「求人票に記載する内容」があればそちらを使う
  const selectedOrg: Organization | undefined =
    baseOrg && intakeOverrides[baseOrg.id]
      ? { ...baseOrg, intake: intakeOverrides[baseOrg.id] }
      : baseOrg;
  const orgPostingNote = (selectedOrg?.intake?.posting_note ?? "").trim();

  // 職種・就業場所を入力すると、Facebook掲載用の会社名（職種＋（市まで））と
  // 簡易住所（何県何市まで）を自動で入れる。手で直した値は上書きしない
  const setWithFbAuto = (patch: { job_type?: string; work_location?: string }) =>
    setForm((f) => {
      const next = { ...f, ...patch };
      const prevCompany = autoDisplayCompany(f.job_type, f.work_location);
      const prevAddress = prefCityOnly(f.work_location);
      return {
        ...next,
        display_company:
          !f.display_company || f.display_company === prevCompany
            ? autoDisplayCompany(next.job_type, next.work_location)
            : f.display_company,
        display_address:
          !f.display_address || f.display_address === prevAddress
            ? prefCityOnly(next.work_location)
            : f.display_address,
      };
    });

  // 源泉所得税（扶養0人）を、時給→月給換算（月給ならそのまま）した金額から自動計算する。
  // 社会保険・雇用保険の適用に応じて保険料を引いたあとの金額で計算する（概算）
  const autoIncomeTax = (): number | null => {
    const amount = form.wage_amount ?? 0;
    if (!amount) return null;
    const sh = normalizePostingSheet(form.sheet);
    const base = monthlyBaseWage(form.wage_kind, amount, orgAnnualHours(selectedOrg));
    if (!base) return null;
    const social = socialInsuranceAmount(base, {
      enabled: sh.social_insurance === "適用",
      healthRate: 10.08,
      ageBand: "40歳未満",
    });
    const employment = employmentInsuranceAmount(base, {
      enabled: sh.employment_insurance === "適用",
      kind: employmentKindForField(sh.field_name),
    });
    return calcIncomeTaxMonthly(Math.max(0, base - social - employment), false, 0);
  };

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
      // 源泉所得税（扶養0人）は月給換算からの自動計算値を保存する
      const tax = autoIncomeTax();
      await onSubmit(
        tax != null
          ? {
              ...form,
              sheet: { ...normalizePostingSheet(form.sheet), income_tax: String(tax) },
            }
          : form,
      );
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
        {orgPostingNote && (
          <p className="rounded-xl border border-status-notice-fg/50 bg-status-notice-bg/50 px-3 py-2.5 text-xs font-bold leading-relaxed text-status-notice-fg">
            ⚠ この所属機関の求人必須条件: {orgPostingNote}
          </p>
        )}
        <Field label="求人受理番号（今年度の次の番号を自動で入れます・直せます。求人管理簿・労働局への提出で使用）">
          <input
            value={form.acceptance_no}
            onChange={(e) => set("acceptance_no", e.target.value)}
            placeholder="例: 8-1（年度-連番）"
            className={INPUT_CLASS}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="求人受付日（求人管理簿・様式30の受付年月日）">
            <input
              type="date"
              value={form.received_on}
              onChange={(e) => {
                const received = e.target.value;
                // 有効期限は受付日から3か月。手で直したものはそのまま残し、
                // 自動で入っていたぶんだけ新しい受付日に合わせて入れ直す
                const wasAuto =
                  !form.valid_until || form.valid_until === postingValidUntil(form.received_on);
                setForm((f) => ({
                  ...f,
                  received_on: received,
                  valid_until: wasAuto ? postingValidUntil(received) || null : f.valid_until,
                }));
              }}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label={`有効期限（受付日から${POSTING_VALID_MONTHS}か月。自動で入ります）`}>
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
            onChange={(e) => setWithFbAuto({ job_type: e.target.value })}
            placeholder="惣菜製造"
            className={INPUT_CLASS}
          />
        </Field>
        {/* 特定技能の求人は職種の下で分野も選ぶ（建設は賃金基準のチェックに使う） */}
        <Field label="分野（特定技能）">
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
        <Field label="採用人数（Facebook掲載用の募集人数にも自動で反映）">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={form.openings}
            onChange={(e) => set("openings", Math.max(1, Number(e.target.value) || 1))}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="就業場所">
          <input
            value={form.work_location}
            onChange={(e) => setWithFbAuto({ work_location: e.target.value })}
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
              inputMode="numeric"
              value={formatAmountInput(form.wage_amount)}
              onChange={(e) => {
                // 「,」を落として数値にする（表示は3桁ごとの「,」入り）
                const digits = e.target.value.replace(/[^0-9]/g, "");
                set("wage_amount", digits === "" ? null : Number(digits));
              }}
              placeholder="1,100"
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
        {/* 時給を入れたら月給換算、月給を入れたら時給換算を所定労働時間から自動で出す */}
        {(() => {
          if (!form.wage_amount || (form.wage_kind !== "時給" && form.wage_kind !== "月給")) {
            return null;
          }
          const hours = orgAnnualHours(selectedOrg);
          if (!hours) {
            return (
              <p className="rounded-xl bg-background px-3 py-2 text-[11px] leading-relaxed text-muted">
                所属機関の「求人票に記載する内容」で月平均・年間所定労働時間数を登録すると、時給⇔月給換算がここに表示されます。
              </p>
            );
          }
          const text =
            form.wage_kind === "時給"
              ? `月給換算 約${formatYen((form.wage_amount * hours) / 12)}円（時給 × 年間所定労働時間${hours}時間 ÷ 12ヶ月）`
              : `時給換算 約${formatYen((form.wage_amount * 12) / hours)}円（月給 × 12ヶ月 ÷ 年間所定労働時間${hours}時間）`;
          return (
            <p className="rounded-xl border border-brand/40 bg-brand/5 px-3 py-2 text-xs font-bold text-brand">
              {text}
            </p>
          );
        })()}
        {/* 建設分野は国交省の賃金基準を満たしているかをその場でチェックする */}
        <ConstructionWageCheck
          wageKind={form.wage_kind}
          wageAmount={form.wage_amount}
          sheet={sheet}
          org={selectedOrg}
        />
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

      <Fieldset legend="求人票（会社に書いてもらう内容）">
        <p className="text-[11px] leading-relaxed text-muted">
          特定技能1号の求人票に書いてもらった内容をそのまま入れる欄です。
          職種・就業場所・採用人数・基本給は上の「求人管理簿」の入力を使います。
        </p>
        {/* 所属機関に未登録の「求人票に記載する内容」は、ここから随時登録できる */}
        {baseOrg && (
          <OrgPostingInfoEditor
            key={baseOrg.id}
            org={selectedOrg ?? baseOrg}
            onSaved={(intake) => {
              setIntakeOverrides((m) => ({ ...m, [baseOrg.id]: intake }));
              setSheet(sheetFromOrgIntake(intake));
            }}
          />
        )}
        {/* 分野は上の求人管理簿（職種の下）で選ぶ */}
        <Field label="記入日（自己申告書の右上の年月日）">
          <input
            type="date"
            value={sheet.filled_on}
            onChange={(e) => setSheet({ filled_on: e.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
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
            <select
              value={sheet.contract_term}
              onChange={(e) => setSheet({ contract_term: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">—</option>
              {CONTRACT_TERMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              {/* 前回の求人などで別の書き方が保存されていたら、選択肢に残して消えないようにする */}
              {sheet.contract_term &&
                !CONTRACT_TERMS.includes(sheet.contract_term as (typeof CONTRACT_TERMS)[number]) && (
                  <option value={sheet.contract_term}>{sheet.contract_term}</option>
                )}
            </select>
          </Field>
        </div>
        {/* 契約の更新の有無（雇用条件書「2. 契約の更新の有無」の3つ）。
            「更新する場合があり得る」を選んだときだけ、判断基準を複数選べる */}
        <Field label="契約の更新の有無">
          <select
            value={sheet.contract_renewal_kind}
            onChange={(e) => {
              const kind = e.target.value;
              setSheet({
                contract_renewal_kind: kind,
                // 自動更新・更新しないのときは判断基準を持たない
                ...(canPickRenewalCriteria(kind)
                  ? {}
                  : { contract_renewal_criteria: [], contract_renewal_other: "" }),
              });
            }}
            className={INPUT_CLASS}
          >
            <option value="">—</option>
            {CONTRACT_RENEWAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>

        {canPickRenewalCriteria(sheet.contract_renewal_kind) && (
          <>
            <Field label="更新の判断基準（複数選べます）">
              <div className="flex flex-wrap gap-1.5">
                {CONTRACT_RENEWAL_CRITERIA.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() =>
                      setSheet({
                        contract_renewal_criteria: toggle(sheet.contract_renewal_criteria, c),
                      })
                    }
                    className={`min-h-[36px] rounded-lg border px-3 text-sm font-bold ${
                      sheet.contract_renewal_criteria.includes(c)
                        ? "border-brand bg-brand text-brand-foreground"
                        : "border-border bg-background text-muted"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="更新の判断基準のその他">
              <input
                value={sheet.contract_renewal_other}
                onChange={(e) => setSheet({ contract_renewal_other: e.target.value })}
                placeholder="ほかに基準があれば記入"
                className={INPUT_CLASS}
              />
            </Field>
          </>
        )}

        {/* 求人票に出る文字。選んだ内容がそのまま「契約の更新」の欄に入る */}
        {sheet.contract_renewal_kind && (
          <p className="rounded-lg bg-surface/60 px-2.5 py-1.5 text-xs text-muted">
            求人票の「契約の更新」欄:{" "}
            <b className="text-foreground">{contractRenewalText(sheet)}</b>
            {sheet.contract_renewal_kind === CONTRACT_RENEWAL_NONE &&
              "（契約期間は「期間の定めあり」のままで、更新しない扱いになります）"}
          </p>
        )}

        {/* 更新の有無をまだ選んでいない求人（以前の入力）は、そのままの文字を出して消さない */}
        {!sheet.contract_renewal_kind && sheet.contract_renewal && (
          <p className="rounded-lg bg-surface/60 px-2.5 py-1.5 text-xs text-muted">
            以前の入力: <b className="text-foreground">{sheet.contract_renewal}</b>
            <br />
            上で更新の有無を選ぶと、こちらは置き換わります。
          </p>
        )}

        {/* 時刻は「800」と入れても欄を離れると「8:00」に整い、
            始業・終業・休憩から1日の所定労働時間を自動で計算する */}
        <div className="grid grid-cols-3 gap-2.5">
          <Field label="始業">
            <input
              value={sheet.work_start}
              onChange={(e) => setSheet({ work_start: e.target.value })}
              onBlur={() => setSheetTimes({ work_start: normalizeTimeInput(sheet.work_start) })}
              placeholder="800 → 8:00"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="終業">
            <input
              value={sheet.work_end}
              onChange={(e) => setSheet({ work_end: e.target.value })}
              onBlur={() => setSheetTimes({ work_end: normalizeTimeInput(sheet.work_end) })}
              placeholder="1700 → 17:00"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="休憩（分）">
            <input
              value={sheet.break_minutes}
              onChange={(e) =>
                setSheetTimes({ break_minutes: e.target.value.replace(/[^0-9]/g, "") })
              }
              inputMode="numeric"
              placeholder="60"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <Field label="1日の所定労働時間（始業・終業・休憩から自動計算）">
          <input
            value={sheet.daily_hours}
            readOnly
            placeholder="始業・終業・休憩を入力すると自動で入ります"
            className={`${INPUT_CLASS} bg-border/30`}
          />
        </Field>
        <div className="grid grid-cols-3 gap-2.5">
          <Field label="変形労働時間制">
            <select
              value={sheet.flexible_hours === "" ? "" : sheet.flexible_hours === "なし" ? "なし" : "あり"}
              onChange={(e) => {
                const v = e.target.value;
                // 「あり」を選んだらまず1年単位にしておく（右の欄で直せる）
                setSheet({
                  flexible_hours: v === "あり" ? "1年単位の変形労働時間制" : v,
                });
              }}
              className={INPUT_CLASS}
            >
              <option value="">—</option>
              <option value="なし">なし</option>
              <option value="あり">あり</option>
            </select>
          </Field>
          {sheet.flexible_hours !== "" && sheet.flexible_hours !== "なし" && (
            <Field label="変形労働時間制の単位">
              <select
                value={sheet.flexible_hours}
                onChange={(e) => setSheet({ flexible_hours: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="1ヶ月単位の変形労働時間制">1ヶ月単位</option>
                <option value="1年単位の変形労働時間制">1年単位</option>
                {!["1ヶ月単位の変形労働時間制", "1年単位の変形労働時間制"].includes(
                  sheet.flexible_hours,
                ) && <option value={sheet.flexible_hours}>{sheet.flexible_hours}</option>}
              </select>
            </Field>
          )}
        </div>
        {sheet.flexible_hours.includes("1年") && <FlexYearDocs org={selectedOrg} />}
        <div className="grid grid-cols-2 gap-2.5">
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
          <Field label="固定残業代（あれば・円／月）">
            <input
              value={formatAmountInput(sheet.fixed_overtime)}
              onChange={(e) =>
                setSheet({
                  fixed_overtime: formatAmountInput(e.target.value.replace(/[^0-9,]/g, "")),
                })
              }
              inputMode="numeric"
              placeholder="20,000"
              className={INPUT_CLASS}
            />
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
                          j === i
                            ? {
                                ...x,
                                amount: formatAmountInput(e.target.value.replace(/[^0-9,]/g, "")),
                              }
                            : x,
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

        <div className="grid grid-cols-3 gap-2.5">
          {/* 源泉所得税は月給換算（扶養0人・保険料控除後）から自動計算して保存する */}
          <Field label="源泉所得税（扶養0人・円。給与から自動計算）">
            <input
              value={(() => {
                const tax = autoIncomeTax();
                return tax != null ? String(tax) : sheet.income_tax;
              })()}
              readOnly
              placeholder="給与を入力すると自動で入ります"
              className={`${INPUT_CLASS} bg-border/30`}
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
        {/* 所属機関に登録した寮・宿泊物件から居住費を反映する。
            複数あるときはどの寮かをここで選ぶ（1件だけなら会社を選んだ時点で自動反映） */}
        {(() => {
          const lods = (selectedOrg?.intake?.lodgings ?? []).filter(
            (l) => l.kind && (l.rent || l.name || l.address),
          );
          if (lods.length === 0) return null;
          return (
            <Field label="居住費を所属機関の寮・宿泊物件から反映">
              <select
                value={sheet.housing_lodging_id}
                onChange={(e) => {
                  const l = lods.find((x) => x.id === e.target.value);
                  if (!l) {
                    setSheet({ housing_lodging_id: "" });
                    return;
                  }
                  const per = parseAmount(l.rent);
                  setSheet({
                    housing_lodging_id: l.id,
                    housing_kind: l.kind,
                    ...(per != null ? { housing_cost: String(per) } : {}),
                    ...(lodgingNote(l) ? { housing_note: lodgingNote(l) } : {}),
                  });
                }}
                className={INPUT_CLASS}
              >
                <option value="">—（手入力）</option>
                {lods.map((l) => {
                  const per = parseAmount(l.rent);
                  return (
                    <option key={l.id} value={l.id}>
                      {l.name || l.address || "寮"}
                      {per != null ? `（1人あたり約${per.toLocaleString("ja-JP")}円）` : ""}
                    </option>
                  );
                })}
              </select>
            </Field>
          );
        })()}
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="居住費（円）">
            <input
              value={formatAmountInput(sheet.housing_cost)}
              onChange={(e) =>
                setSheet({ housing_cost: formatAmountInput(e.target.value.replace(/[^0-9,]/g, "")) })
              }
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
              value={formatAmountInput(sheet.utility_cost)}
              onChange={(e) =>
                setSheet({ utility_cost: formatAmountInput(e.target.value.replace(/[^0-9,]/g, "")) })
              }
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
          <Field label="通信費（約・円。徴収しない会社は「無し」）">
            <input
              value={formatAmountInput(sheet.communication_cost)}
              onChange={(e) => setSheet({ communication_cost: formatAmountInput(e.target.value) })}
              placeholder="3000／無し"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        {/* 通信費を徴収しない理由（所属機関の情報に記録があれば表示） */}
        {(selectedOrg?.intake?.posting_comm_reason ?? "").trim() !== "" && (
          <p className="rounded-xl bg-background px-3 py-2 text-[11px] leading-relaxed text-muted">
            通信費を徴収しない理由（所属機関の情報より）: {selectedOrg?.intake?.posting_comm_reason}
          </p>
        )}

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

        {/* 応募条件の入力時に必ず目に入るよう、所属機関の必須条件をここでも注意喚起する
            （例: タツミ工業のタトゥー（刺青）禁止） */}
        {orgPostingNote && (
          <p className="rounded-xl border border-status-notice-fg/50 bg-status-notice-bg/50 px-3 py-2.5 text-xs font-bold leading-relaxed text-status-notice-fg">
            ⚠ この所属機関の求人必須条件を必ず確認: {orgPostingNote}
          </p>
        )}
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

        <NetPayPreview
          wageKind={form.wage_kind}
          wageAmount={form.wage_amount}
          sheet={sheet}
          org={selectedOrg}
        />
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

// 1年単位の変形労働時間制のとき、所属機関に添付した年間カレンダー・労使協定書を
// その場で確認できるようにする（添付は所属機関の情報の画面から。開始日から1年間有効）
function FlexYearDocs({ org }: { org?: Organization }) {
  const orgId = org?.id ?? "";
  const [files, setFiles] = useState<OrganizationFileRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const validUntil = flexDocsValidUntil(org?.intake?.flex_docs_start ?? "");
  const expired = validUntil !== "" && validUntil < todayStr();

  useEffect(() => {
    let cancelled = false;
    const load = orgId
      ? listOrganizationFiles(createClient(), orgId)
      : Promise.resolve([] as OrganizationFileRow[]);
    load
      .then((rows) => {
        if (!cancelled) {
          setFiles(rows.filter((r) => r.kind === "年間カレンダー" || r.kind === "労使協定書"));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const open = async (id: string) => {
    const res = await getOrgFilePreviewUrl(id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  };

  return (
    <div className="rounded-xl border border-dashed border-border p-2.5">
      <p className="text-xs font-bold text-muted">
        1年単位の変形労働時間制の書類（所属機関のデータ）
      </p>
      {validUntil ? (
        <p className={`mt-0.5 text-[11px] font-bold ${expired ? "text-seal" : "text-muted"}`}>
          有効期限: {validUntil} まで
          {expired && "（期限切れです。所属機関の情報で新しい書類と開始日を登録してください）"}
        </p>
      ) : (
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
          有効期間の開始日が未登録です。所属機関の情報の「変形労働時間制」で開始日を登録してください（開始日から1年間有効）。
        </p>
      )}
      {error && <p className="mt-1 text-xs text-seal">{error}</p>}
      {files.length === 0 ? (
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          年間カレンダー・労使協定書がまだ添付されていません。
          {orgId ? (
            <a
              href={`/organizations/${orgId}`}
              target="_blank"
              rel="noopener"
              className="font-bold text-brand underline"
            >
              所属機関の情報
            </a>
          ) : (
            "所属機関の情報"
          )}
          の「変形労働時間制（1年単位）の書類」から添付してください（労使協定書は有効期限内のもの）。
        </p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1">
          {files.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => void open(f.id)}
                className="text-left text-xs font-bold text-brand underline"
              >
                {f.kind}：{f.file_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 所属機関の「求人票に記載する内容」を求人の画面から登録・修正する欄。
// 所属機関に未登録の情報があっても、ここで入力して保存すればそのまま求人票に反映できる
function OrgPostingInfoEditor({
  org,
  onSaved,
}: {
  org: Organization;
  onSaved: (intake: OrganizationIntake) => void;
}) {
  const [draft, setDraft] = useState<OrganizationIntake | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const current = draft ?? normalizeOrganizationIntake(org.intake);
  const set = (patch: Partial<OrganizationIntake>) => setDraft({ ...current, ...patch });

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const { error } = await createClient()
      .from("organizations")
      .update({ intake: current })
      .eq("id", org.id);
    if (error) {
      setMessage({ ok: false, text: `保存に失敗しました: ${error.message}` });
    } else {
      setMessage({ ok: true, text: "所属機関に保存し、下の求人票の欄にも反映しました。" });
      onSaved(current);
    }
    setSaving(false);
  };

  const input = (
    label: string,
    key: keyof OrganizationIntake,
    placeholder?: string,
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-bold text-muted">{label}</span>
      <input
        value={String(current[key] ?? "")}
        onChange={(e) => set({ [key]: e.target.value } as Partial<OrganizationIntake>)}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
    </label>
  );

  // 金額の欄。打ちながら3桁ごとに「,」を入れて桁数がすぐ分かるようにする
  const money = (
    label: string,
    key: keyof OrganizationIntake,
    placeholder?: string,
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-bold text-muted">{label}</span>
      <input
        value={formatAmountInput(String(current[key] ?? ""))}
        onChange={(e) =>
          set({ [key]: formatAmountInput(e.target.value) } as Partial<OrganizationIntake>)
        }
        placeholder={placeholder}
        inputMode="numeric"
        className={INPUT_CLASS}
      />
    </label>
  );

  return (
    <details className="rounded-xl border border-dashed border-border p-2.5">
      <summary className="cursor-pointer text-xs font-bold text-brand">
        {org.name} の「求人票に記載する内容」を登録・修正する（未登録の情報はここから入れられます）
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {message && (
          <p
            className={`rounded-lg px-2.5 py-1.5 text-xs ${
              message.ok ? "bg-brand/10 text-brand" : "bg-seal/10 text-seal"
            }`}
          >
            {message.text}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {money("水道光熱費（約・円）", "posting_utility_cost", "8,000")}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">水道光熱費の徴収</span>
            <select
              value={current.posting_utility_kind}
              onChange={(e) => set({ posting_utility_kind: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">—</option>
              <option value="実費">実費</option>
              <option value="固定">固定</option>
            </select>
          </label>
          {money("通信費（約・円。徴収しない会社は「無し」）", "posting_comm_cost", "3,000／無し")}
          {input("通信費を徴収しない理由", "posting_comm_reason")}
          {input("月平均所定労働時間数", "posting_monthly_hours", "173時間20分／173.3")}
          {input("年間所定労働時間数", "posting_annual_hours", "2080")}
          {input("給与の締切日", "posting_pay_closing", "末日")}
          {input("給与の支払日", "posting_pay_day", "翌月10日")}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">支払方法</span>
            <select
              value={current.pay_method}
              onChange={(e) => set({ pay_method: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">—</option>
              <option value="口座振込">口座振込</option>
              <option value="通貨払い">通貨払い</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">変形労働時間制</span>
            <select
              value={current.flex_hours_kind}
              onChange={(e) => set({ flex_hours_kind: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">—</option>
              <option value="なし">なし</option>
              <option value="1ヶ月単位">1ヶ月単位</option>
              <option value="1年単位">1年単位</option>
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">
            その他（応募条件。タトゥー（刺青）不可など採用の際の注意）
          </span>
          <textarea
            rows={2}
            value={current.posting_other_conditions}
            onChange={(e) => set({ posting_other_conditions: e.target.value })}
            placeholder="例: タトゥー（刺青）のある人は不可 など"
            className={TEXTAREA_CLASS}
          />
        </label>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="self-start rounded-lg bg-brand px-4 py-2 text-xs font-bold text-brand-foreground disabled:opacity-50"
        >
          {saving ? "保存中…" : "所属機関に保存して求人票へ反映"}
        </button>
      </div>
    </details>
  );
}

// 建設分野（国交省）の賃金基準チェック。
// 所定内賃金（基本給＋毎月固定の手当。通勤手当・固定残業代は除く）が
// 「最低賃金の全国平均1,121円 × 1.1 × 年間所定労働時間 ÷ 12」以上でないと認定できない
function ConstructionWageCheck({
  wageKind,
  wageAmount,
  sheet,
  org,
}: {
  wageKind: WageKind;
  wageAmount: number | null;
  sheet: PostingSheet;
  org?: Organization;
}) {
  if (sheet.field_name !== "建設") return null;
  const hours = orgAnnualHours(org);
  if (!hours) {
    return (
      <p className="rounded-xl border border-status-notice-fg/50 bg-status-notice-bg/50 px-3 py-2.5 text-xs leading-relaxed text-status-notice-fg">
        ⚠ 建設分野は国交省の賃金基準のチェックが必要です。所属機関の「求人票に記載する内容」で月平均・年間所定労働時間数を登録すると、ここで自動チェックできます。
      </p>
    );
  }
  const required = constructionMinMonthly(hours);
  if (!wageAmount) {
    return (
      <p className="rounded-xl border border-status-notice-fg/50 bg-status-notice-bg/50 px-3 py-2.5 text-xs leading-relaxed text-status-notice-fg">
        ⚠ 建設分野の国交省基準: 所定内賃金が月額 約{formatYen(required)}円以上
        （{CONSTRUCTION_MIN_WAGE_AVG}円 × 1.1 × 年間{hours}時間 ÷ 12）必要です。給与を入力するとチェックします。
      </p>
    );
  }
  const base = monthlyBaseWage(wageKind, wageAmount, hours);
  // 毎月固定の手当は含める。通勤手当と固定残業代は所定内賃金に入れない
  const fixedAllowances = sheet.allowances
    .filter((a) => !a.name.includes("通勤"))
    .reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const monthly = base + fixedAllowances;
  const ok = monthly >= required;
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${
        ok
          ? "border-brand/40 bg-brand/5 text-brand"
          : "border-seal/50 bg-seal/10 font-bold text-seal"
      }`}
    >
      <p className="font-bold">
        {ok ? "✓ 建設分野の国交省基準をクリアしています" : "⚠ 建設分野の国交省基準を満たしていません（このままでは認定できません）"}
      </p>
      <p className="mt-0.5">
        所定内賃金（基本給の月給換算＋毎月固定の手当。通勤手当・固定残業代を除く）: 約
        {formatYen(monthly)}円 ／ 基準額: {formatYen(required)}円以上（
        {CONSTRUCTION_MIN_WAGE_AVG}円 × 1.1 × 年間{hours}時間 ÷ 12）
        {!ok && ` ／ あと約${formatYen(required - monthly)}円不足`}
      </p>
    </div>
  );
}

// 手取りプレビューの1行（項目名と概算額）
function PreviewRow({ label, value, bold = false }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 ${bold ? "font-bold" : ""}`}>
      <span className="text-muted">{label}</span>
      <span>約{formatYen(value)}円</span>
    </div>
  );
}

// 求人票の入力内容が賃金（1-6号別紙）でどう見えるかのプレビュー。
// 手取りがいくらになるかを、申請準備の賃金入力と同じ計算（概算）で出す
function NetPayPreview({
  wageKind,
  wageAmount,
  sheet,
  org,
}: {
  wageKind: WageKind;
  wageAmount: number | null;
  sheet: PostingSheet;
  org?: Organization;
}) {
  const detail: WageDetail = {
    ...emptyWageDetail(),
    annual_hours: orgAnnualHours(org),
    allowances: sheet.allowances
      .filter((a) => Number(a.amount) > 0)
      .map((a) => ({ type: "その他", name: a.name, amount: Number(a.amount) || 0, method: a.method })),
    fixed_ot_enabled: Number(sheet.fixed_overtime) > 0,
    fixed_ot_amount: Number(sheet.fixed_overtime) || 0,
    social_enabled: sheet.social_insurance === "適用",
    employment_enabled: sheet.employment_insurance === "適用",
    employment_kind: employmentKindForField(sheet.field_name),
    // 金額が入っている控除（居住費・水道光熱費・通信費）を手取りの計算に入れる
    housing_amount: Number(sheet.housing_cost) || 0,
    utility_amount: Number(sheet.utility_cost) || 0,
    others:
      Number(sheet.communication_cost) > 0
        ? [{ name: "通信費", amount: Number(sheet.communication_cost) || 0 }]
        : [],
  };
  const r = calcWageDetail({ kind: wageKind, amount: wageAmount ?? 0 }, detail);
  const needsHours = (wageKind === "時給" || wageKind === "日給") && r.annualHours <= 0;

  // 手取りをいくらにしたいかを入れると、必要な基本給を逆計算する
  // （手当・控除は今の入力のまま。税額が段階的に変わるため二分探索で求める）
  const [targetNet, setTargetNet] = useState("");
  const target = Number(targetNet) || 0;
  let reverse: { monthly: number; hourly: number | null } | null = null;
  if (target > 0) {
    let lo = 0;
    let hi = 10_000_000;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (calcWageDetail({ kind: "月給", amount: mid }, detail).net < target) lo = mid;
      else hi = mid;
    }
    const monthly = Math.ceil(hi);
    reverse = {
      monthly,
      hourly: r.annualHours > 0 ? Math.ceil((monthly * 12) / r.annualHours) : null,
    };
  }

  return (
    <div className="rounded-xl border border-brand/40 bg-brand/5 p-3">
      <p className="text-xs font-bold text-brand">
        賃金（1-6号別紙）でのプレビュー（概算・自動計算）
      </p>
      {needsHours ? (
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          所属機関の「求人票に記載する内容」の月平均・年間所定労働時間数が未登録のため、{wageKind}
          を1か月あたりの金額に換算できません。所属機関の情報で登録すると手取りを計算できます。
        </p>
      ) : (
        <>
          <div className="mt-1.5 flex flex-col gap-1 text-xs">
            <PreviewRow label="1. 基本賃金（1か月あたり）" value={r.base} />
            <PreviewRow label="2. 諸手当（固定残業代を含む）" value={r.allowanceTotal} />
            <PreviewRow label="3. 支払概算額（1＋2）" value={r.gross} bold />
            <PreviewRow label="税金（源泉所得税）" value={r.tax} />
            <PreviewRow label="社会保険料" value={r.social} />
            <PreviewRow label="雇用保険料" value={r.employment} />
            {r.housing > 0 && <PreviewRow label="居住費（社宅）" value={r.housing} />}
            {r.utility > 0 && <PreviewRow label="水道光熱費" value={r.utility} />}
            {r.otherTotal > 0 && <PreviewRow label="通信費など" value={r.otherTotal} />}
            <PreviewRow label="4. 控除額 合計" value={r.deductTotal} bold />
          </div>
          <p className="mt-2 border-t border-brand/30 pt-2 text-sm font-bold text-brand">
            5. 手取り支給額（3－4）　約{formatYen(r.net)}円
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            税・保険は熊本県の令和8年度の率（扶養0人）での概算です。控除は金額が入っている居住費・水道光熱費・通信費を反映しています。実際の1-6号別紙は申請準備の賃金入力で作成します。
          </p>

          {/* 手取りの目標額からの逆計算 */}
          <div className="mt-2 border-t border-brand/30 pt-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">
                手取りをいくらにしたい？からの逆計算（円・月額）
              </span>
              <input
                value={targetNet}
                onChange={(e) => setTargetNet(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                placeholder="例: 180000"
                className={INPUT_CLASS}
              />
            </label>
            {reverse && (
              <p className="mt-1.5 text-xs leading-relaxed">
                手取り 約{formatYen(target)}円にするには、基本給が
                <span className="font-bold"> 月給 約{formatYen(reverse.monthly)}円 </span>
                {reverse.hourly != null && (
                  <>
                    （時給なら
                    <span className="font-bold"> 約{formatYen(reverse.hourly)}円 </span>
                    ）
                  </>
                )}
                必要です（手当・控除は今の入力のままとした概算）。
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
