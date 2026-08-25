"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ClipboardList,
  Megaphone,
  Pencil,
  Printer,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PostingForm } from "@/components/postings/PostingForm";
import { PostingStatusBadge } from "@/components/postings/PostingStatusBadge";
import { PostingOutputDialog } from "@/components/postings/PostingOutputDialog";
import { ApplicationResultBadge } from "@/components/postings/ApplicationResultBadge";
import { PostingFileAttachments } from "@/components/postings/PostingFileAttachments";
import { JikoShinkokuSection } from "@/components/postings/JikoShinkokuSection";
import { createClient } from "@/lib/supabase/client";
import { deletePosting, updatePosting } from "@/lib/supabase/queries/postings";
import { postingDisplayName } from "@/lib/posting-output";
import {
  contractText,
  holidayText,
  insurancesText,
  normalizePostingSheet,
  smokingText,
  workHoursText,
} from "@/lib/posting-sheet";
import { errorMessage } from "@/lib/errors";
import {
  formatWage,
  GENDER_REQS,
  POSTING_FIELDS,
  POSTING_INSURANCES,
  POSTING_SMOKING_OPTIONS,
  POSTING_WEEKDAYS,
  WAGE_KINDS,
  type ApplicationResult,
  type GenderReq,
  type JobPostingInput,
  type PostingAllowance,
  type PostingSheet,
  type WageKind,
} from "@/types/recruiting";
import type { Organization } from "@/types/db";
import type { PostingWithStats } from "@/lib/supabase/queries/postings";
import type { ApplicationWithRefs } from "@/lib/supabase/queries/jobs";

export function PostingDetail({
  posting,
  organizations,
  applicants,
  canEdit,
}: {
  posting: PostingWithStats;
  organizations: Organization[];
  applicants: ApplicationWithRefs[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orgName = posting.organizations?.name;

  // 求人票（会社に書いてもらった内容）
  const sheet = normalizePostingSheet(posting.sheet);

  const hired = applicants.filter((a) => a.result === "採用").length;
  // 所属機関が求人で必須としている他条件（所属機関の情報で登録）
  const postingOrg = organizations.find((o) => o.id === posting.organization_id);
  const orgPostingNote = (postingOrg?.intake?.posting_note ?? "").trim();

  // 画面の欄をその場で直したときの保存（直した欄だけ書き戻す）
  const savePosting = async (patch: Partial<JobPostingInput>) => {
    await updatePosting(createClient(), posting.id, patch);
    router.refresh();
  };
  const saveSheet = (patch: Partial<PostingSheet>) => savePosting({ sheet: { ...sheet, ...patch } });

  const handleUpdate = async (input: JobPostingInput) => {
    await updatePosting(createClient(), posting.id, input);
    setEditOpen(false);
    router.refresh();
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePosting(createClient(), posting.id);
      router.push("/postings");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {orgPostingNote && (
        <p className="rounded-xl border border-status-notice-fg/50 bg-status-notice-bg/50 px-3 py-2.5 text-xs font-bold leading-relaxed text-status-notice-fg">
          ⚠ この所属機関の求人必須条件: {orgPostingNote}
        </p>
      )}

      {/* 欄はこの画面でそのまま直せる。鉛筆はまとめて直したいとき（賃金の計算や
          所属機関の登録内容の反映が付いた入力フォーム）に使う */}
      {editOpen ? (
        <Card className="p-4">
          <p className="mb-2 text-sm font-bold text-muted">
            求人をまとめて編集（内容を直して「更新する」を押してください）
          </p>
          <PostingForm
            initial={posting}
            organizations={organizations}
            submitLabel="更新する"
            onSubmit={handleUpdate}
            onCancel={() => setEditOpen(false)}
          />
        </Card>
      ) : (
        <>
      <Card className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-lg font-black">{postingDisplayName(posting, orgName)}</p>
            {orgName && posting.display_company && (
              <p className="text-xs text-muted">機関: {orgName}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <PostingStatusBadge status={posting.status} />
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                aria-label="まとめて編集"
                title="まとめて編集（賃金の計算・所属機関の内容の反映つき）"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted"
              >
                <Pencil size={15} />
              </button>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <Field
            label="職種"
            value={posting.job_type}
            canEdit={canEdit}
            draft={() => ({ job_type: posting.job_type ?? "" })}
            onSave={savePosting}
          >
            {(d, set) => <TextIn value={d.job_type} onChange={(v) => set({ job_type: v })} />}
          </Field>
          <Field
            label="給与"
            value={formatWage(posting.wage_kind, posting.wage_amount)}
            canEdit={canEdit}
            draft={() => ({
              wage_kind: (posting.wage_kind ?? "時給") as WageKind,
              wage_amount: posting.wage_amount != null ? String(posting.wage_amount) : "",
            })}
            onSave={(d) =>
              savePosting({ wage_kind: d.wage_kind, wage_amount: numOrNull(d.wage_amount) })
            }
          >
            {(d, set) => (
              <>
                <SelectIn
                  value={d.wage_kind}
                  options={WAGE_KINDS}
                  onChange={(v) => set({ wage_kind: v as WageKind })}
                />
                <TextIn
                  value={d.wage_amount}
                  onChange={(v) => set({ wage_amount: digits(v) })}
                  placeholder="円"
                />
              </>
            )}
          </Field>
          <Field
            label="募集人数"
            value={`${posting.openings}名（採用${hired}名）`}
            canEdit={canEdit}
            draft={() => ({ openings: String(posting.openings ?? "") })}
            onSave={(d) => savePosting({ openings: Number(digits(d.openings)) || 0 })}
          >
            {(d, set) => (
              <TextIn value={d.openings} onChange={(v) => set({ openings: digits(v) })} />
            )}
          </Field>
          <Field
            label="性別"
            value={posting.gender}
            canEdit={canEdit}
            draft={() => ({ gender: (posting.gender ?? "不問") as GenderReq })}
            onSave={savePosting}
          >
            {(d, set) => (
              <SelectIn
                value={d.gender}
                options={GENDER_REQS}
                onChange={(v) => set({ gender: v as GenderReq })}
              />
            )}
          </Field>
          <Field
            label="就業場所"
            value={posting.work_location}
            canEdit={canEdit}
            draft={() => ({ work_location: posting.work_location ?? "" })}
            onSave={savePosting}
          >
            {(d, set) => (
              <TextIn value={d.work_location} onChange={(v) => set({ work_location: v })} />
            )}
          </Field>
          <Field
            label="掲載用住所"
            value={posting.display_address}
            canEdit={canEdit}
            draft={() => ({ display_address: posting.display_address ?? "" })}
            onSave={savePosting}
          >
            {(d, set) => (
              <TextIn value={d.display_address} onChange={(v) => set({ display_address: v })} />
            )}
          </Field>
          <Field
            label="対象国籍"
            value={posting.target_nationality}
            canEdit={canEdit}
            draft={() => ({ target_nationality: posting.target_nationality ?? "" })}
            onSave={savePosting}
          >
            {(d, set) => (
              <TextIn
                value={d.target_nationality}
                onChange={(v) => set({ target_nationality: v })}
              />
            )}
          </Field>
          <Field
            label="採用予定"
            value={posting.hire_timing}
            canEdit={canEdit}
            draft={() => ({ hire_timing: posting.hire_timing ?? "" })}
            onSave={savePosting}
          >
            {(d, set) => <TextIn value={d.hire_timing} onChange={(v) => set({ hire_timing: v })} />}
          </Field>
          <Field
            label="雇用期間"
            value={posting.employment_period}
            canEdit={canEdit}
            draft={() => ({ employment_period: posting.employment_period ?? "" })}
            onSave={savePosting}
          >
            {(d, set) => (
              <TextIn
                value={d.employment_period}
                onChange={(v) => set({ employment_period: v })}
                placeholder="有期 / 無期"
              />
            )}
          </Field>
          <Field
            label="連絡先"
            value={posting.contact}
            canEdit={canEdit}
            draft={() => ({ contact: posting.contact ?? "" })}
            onSave={savePosting}
          >
            {(d, set) => <TextIn value={d.contact} onChange={(v) => set({ contact: v })} />}
          </Field>
          <Field
            label="受付日"
            value={posting.received_on}
            canEdit={canEdit}
            draft={() => ({ received_on: posting.received_on ?? "" })}
            onSave={savePosting}
          >
            {(d, set) => (
              <TextIn type="date" value={d.received_on} onChange={(v) => set({ received_on: v })} />
            )}
          </Field>
          <Field
            label="有効期限"
            value={posting.valid_until}
            canEdit={canEdit}
            draft={() => ({ valid_until: posting.valid_until ?? "" })}
            onSave={(d) => savePosting({ valid_until: d.valid_until || null })}
          >
            {(d, set) => (
              <TextIn type="date" value={d.valid_until} onChange={(v) => set({ valid_until: v })} />
            )}
          </Field>
          <Field
            label="備考"
            value={posting.note}
            wide
            canEdit={canEdit}
            draft={() => ({ note: posting.note ?? "" })}
            onSave={savePosting}
          >
            {(d, set) => <TextAreaIn value={d.note} onChange={(v) => set({ note: v })} />}
          </Field>
        </dl>
        {canEdit && (
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            直したい欄をそのまま押すと、この画面で書き換えて「保存」できます。
            賃金の計算や所属機関の登録内容の反映を使いたいときは、右上の鉛筆マークからまとめて編集してください。
          </p>
        )}
      </Card>

      {/* 求人票（会社に書いてもらう内容）。欄を押せばその場で直せる */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <ClipboardList size={15} className="text-brand" />
            求人票（特定技能1号）
          </h2>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <Field
            label="分野名"
            value={sheet.field_name}
            canEdit={canEdit}
            draft={() => ({ field_name: sheet.field_name })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <SelectIn
                value={d.field_name}
                options={POSTING_FIELDS}
                allowEmpty
                onChange={(v) => set({ field_name: v })}
              />
            )}
          </Field>
          <Field
            label="記入日"
            value={sheet.filled_on}
            canEdit={canEdit}
            draft={() => ({ filled_on: sheet.filled_on })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <TextIn type="date" value={d.filled_on} onChange={(v) => set({ filled_on: v })} />
            )}
          </Field>
          <Field
            label="勤務地の変更の可能性"
            value={sheet.work_location_change}
            canEdit={canEdit}
            draft={() => ({ work_location_change: sheet.work_location_change })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <TextIn
                value={d.work_location_change}
                onChange={(v) => set({ work_location_change: v })}
                placeholder="変更なし / 変更の可能性の内容"
              />
            )}
          </Field>
          <Field
            label="契約期間"
            value={contractText(sheet)}
            canEdit={canEdit}
            draft={() => ({
              contract_term_kind: sheet.contract_term_kind,
              contract_term: sheet.contract_term,
              contract_renewal: sheet.contract_renewal,
            })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <>
                <SelectIn
                  value={d.contract_term_kind}
                  options={["期間の定めなし", "期間の定めあり"]}
                  allowEmpty
                  onChange={(v) => set({ contract_term_kind: v })}
                />
                <TextIn
                  value={d.contract_term}
                  onChange={(v) => set({ contract_term: v })}
                  placeholder="雇用契約期間（例: 1年）"
                />
                <TextIn
                  value={d.contract_renewal}
                  onChange={(v) => set({ contract_renewal: v })}
                  placeholder="契約の更新（無 / 有：条件）"
                />
              </>
            )}
          </Field>
          <Field
            label="仕事内容"
            value={sheet.job_description}
            wide
            canEdit={canEdit}
            draft={() => ({ job_description: sheet.job_description })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <TextAreaIn value={d.job_description} onChange={(v) => set({ job_description: v })} />
            )}
          </Field>
          <Field
            label="勤務時間"
            value={workHoursText(sheet)}
            canEdit={canEdit}
            draft={() => ({
              work_start: sheet.work_start,
              work_end: sheet.work_end,
              daily_hours: sheet.daily_hours,
            })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <>
                <TextIn
                  value={d.work_start}
                  onChange={(v) => set({ work_start: v })}
                  placeholder="始業（例: 8:00）"
                />
                <TextIn
                  value={d.work_end}
                  onChange={(v) => set({ work_end: v })}
                  placeholder="終業（例: 17:00）"
                />
                <TextIn
                  value={d.daily_hours}
                  onChange={(v) => set({ daily_hours: v })}
                  placeholder="1日の所定労働時間"
                />
              </>
            )}
          </Field>
          <Field
            label="変形労働制"
            value={sheet.flexible_hours}
            canEdit={canEdit}
            draft={() => ({ flexible_hours: sheet.flexible_hours })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <TextIn
                value={d.flexible_hours}
                onChange={(v) => set({ flexible_hours: v })}
                placeholder="なし / 1ヶ月単位の変形労働時間制"
              />
            )}
          </Field>
          <Field
            label="休憩"
            value={sheet.break_minutes ? `${sheet.break_minutes}分` : ""}
            canEdit={canEdit}
            draft={() => ({ break_minutes: sheet.break_minutes })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <TextIn
                value={d.break_minutes}
                onChange={(v) => set({ break_minutes: digits(v) })}
                placeholder="分"
              />
            )}
          </Field>
          <Field
            label="残業"
            value={sheet.overtime}
            canEdit={canEdit}
            draft={() => ({ overtime: sheet.overtime })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <SelectIn
                value={d.overtime}
                options={["有", "無"]}
                allowEmpty
                onChange={(v) => set({ overtime: v })}
              />
            )}
          </Field>
          <Field
            label="休日"
            value={holidayText(sheet)}
            wide
            canEdit={canEdit}
            draft={() => ({ holidays: sheet.holidays, holiday_note: sheet.holiday_note })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <>
                <ChipsIn
                  values={d.holidays}
                  options={POSTING_WEEKDAYS}
                  onChange={(v) => set({ holidays: v })}
                />
                <TextIn
                  value={d.holiday_note}
                  onChange={(v) => set({ holiday_note: v })}
                  placeholder="その他（例: 7〜8日）"
                />
              </>
            )}
          </Field>
          <Field
            label="手当"
            value={allowanceText(sheet)}
            wide
            canEdit={canEdit}
            draft={() => ({ allowances: allowanceRows(sheet) })}
            onSave={(d) =>
              saveSheet({
                allowances: d.allowances.filter((a) => a.name || a.amount || a.method),
              })
            }
          >
            {(d, set) => (
              <>
                {d.allowances.map((a, i) => (
                  <div key={i} className="flex gap-1.5">
                    <TextIn
                      value={a.name}
                      onChange={(v) => set({ allowances: patchRow(d.allowances, i, { name: v }) })}
                      placeholder={`手当${i + 1}の名前`}
                    />
                    <TextIn
                      value={a.amount}
                      onChange={(v) =>
                        set({ allowances: patchRow(d.allowances, i, { amount: digits(v) }) })
                      }
                      placeholder="円"
                    />
                    <TextIn
                      value={a.method}
                      onChange={(v) => set({ allowances: patchRow(d.allowances, i, { method: v }) })}
                      placeholder="計算方法"
                    />
                  </div>
                ))}
              </>
            )}
          </Field>
          <Field
            label="源泉所得税（扶養0人）"
            value={yenText(sheet.income_tax)}
            canEdit={canEdit}
            draft={() => ({ income_tax: sheet.income_tax })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <TextIn
                value={d.income_tax}
                onChange={(v) => set({ income_tax: digits(v) })}
                placeholder="円"
              />
            )}
          </Field>
          <Field
            label="社会保険料・雇用保険料"
            value={
              sheet.social_insurance || sheet.employment_insurance
                ? `社保 ${sheet.social_insurance || "—"} ／ 雇用 ${sheet.employment_insurance || "—"}`
                : ""
            }
            canEdit={canEdit}
            draft={() => ({
              social_insurance: sheet.social_insurance,
              employment_insurance: sheet.employment_insurance,
            })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <>
                <SelectIn
                  label="社会保険料"
                  value={d.social_insurance}
                  options={["適用", "適用なし"]}
                  allowEmpty
                  onChange={(v) => set({ social_insurance: v })}
                />
                <SelectIn
                  label="雇用保険料"
                  value={d.employment_insurance}
                  options={["適用", "適用なし"]}
                  allowEmpty
                  onChange={(v) => set({ employment_insurance: v })}
                />
              </>
            )}
          </Field>
          <Field
            label="居住費"
            value={[yenText(sheet.housing_cost), sheet.housing_kind, sheet.housing_note]
              .filter(Boolean)
              .join("／")}
            wide
            canEdit={canEdit}
            draft={() => ({
              housing_cost: sheet.housing_cost,
              housing_kind: sheet.housing_kind,
              housing_note: sheet.housing_note,
            })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <>
                <TextIn
                  value={d.housing_cost}
                  onChange={(v) => set({ housing_cost: digits(v) })}
                  placeholder="円"
                />
                <SelectIn
                  value={d.housing_kind}
                  options={["自己所有物件", "賃貸物件"]}
                  allowEmpty
                  onChange={(v) => set({ housing_kind: v })}
                />
                <TextIn
                  value={d.housing_note}
                  onChange={(v) => set({ housing_note: v })}
                  placeholder="居住費の説明"
                />
              </>
            )}
          </Field>
          <Field
            label="水道光熱費"
            value={[
              sheet.utility_cost ? `約${yenText(sheet.utility_cost)}` : "",
              sheet.utility_kind,
            ]
              .filter(Boolean)
              .join("／")}
            canEdit={canEdit}
            draft={() => ({ utility_cost: sheet.utility_cost, utility_kind: sheet.utility_kind })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <>
                <TextIn
                  value={d.utility_cost}
                  onChange={(v) => set({ utility_cost: digits(v) })}
                  placeholder="円"
                />
                <SelectIn
                  value={d.utility_kind}
                  options={["実費", "固定"]}
                  allowEmpty
                  onChange={(v) => set({ utility_kind: v })}
                />
              </>
            )}
          </Field>
          <Field
            label="通信費"
            value={
              /^\d+$/.test(sheet.communication_cost)
                ? `約${yenText(sheet.communication_cost)}`
                : sheet.communication_cost
            }
            canEdit={canEdit}
            draft={() => ({ communication_cost: sheet.communication_cost })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <TextIn
                value={d.communication_cost}
                onChange={(v) => set({ communication_cost: v })}
                placeholder="円 / なし"
              />
            )}
          </Field>
          <Field
            label="昇給"
            value={[sheet.raise, sheet.raise_note].filter(Boolean).join("／")}
            canEdit={canEdit}
            draft={() => ({ raise: sheet.raise, raise_note: sheet.raise_note })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <>
                <SelectIn
                  value={d.raise}
                  options={["有", "無"]}
                  allowEmpty
                  onChange={(v) => set({ raise: v })}
                />
                <TextIn
                  value={d.raise_note}
                  onChange={(v) => set({ raise_note: v })}
                  placeholder="支払時期・内容"
                />
              </>
            )}
          </Field>
          <Field
            label="賞与"
            value={[sheet.bonus, sheet.bonus_note].filter(Boolean).join("／")}
            canEdit={canEdit}
            draft={() => ({ bonus: sheet.bonus, bonus_note: sheet.bonus_note })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <>
                <SelectIn
                  value={d.bonus}
                  options={["有", "無"]}
                  allowEmpty
                  onChange={(v) => set({ bonus: v })}
                />
                <TextIn
                  value={d.bonus_note}
                  onChange={(v) => set({ bonus_note: v })}
                  placeholder="支払時期・内容"
                />
              </>
            )}
          </Field>
          <Field
            label="給与の締切日・支払日"
            value={
              sheet.pay_closing_day || sheet.pay_day
                ? `${sheet.pay_closing_day || "—"} 締切 ／ ${sheet.pay_day || "—"} 支払`
                : ""
            }
            canEdit={canEdit}
            draft={() => ({ pay_closing_day: sheet.pay_closing_day, pay_day: sheet.pay_day })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <>
                <TextIn
                  value={d.pay_closing_day}
                  onChange={(v) => set({ pay_closing_day: v })}
                  placeholder="締切日（例: 10日）"
                />
                <TextIn
                  value={d.pay_day}
                  onChange={(v) => set({ pay_day: v })}
                  placeholder="支払日（例: 末日）"
                />
              </>
            )}
          </Field>
          <Field
            label="支払方法"
            value={sheet.pay_method}
            canEdit={canEdit}
            draft={() => ({ pay_method: sheet.pay_method })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <SelectIn
                value={d.pay_method}
                options={["口座振込", "通貨払い"]}
                allowEmpty
                onChange={(v) => set({ pay_method: v })}
              />
            )}
          </Field>
          <Field
            label="加入保険"
            value={insurancesText(sheet)}
            wide
            canEdit={canEdit}
            draft={() => ({
              insurances: sheet.insurances,
              insurance_other: sheet.insurance_other,
            })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <>
                <ChipsIn
                  values={d.insurances}
                  options={POSTING_INSURANCES}
                  onChange={(v) => set({ insurances: v })}
                />
                <TextIn
                  value={d.insurance_other}
                  onChange={(v) => set({ insurance_other: v })}
                  placeholder="その他の保険"
                />
              </>
            )}
          </Field>
          <Field
            label="受動喫煙防止措置"
            value={smokingText(sheet)}
            wide
            canEdit={canEdit}
            draft={() => ({ smoking: sheet.smoking, smoking_note: sheet.smoking_note })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <>
                <SelectIn
                  value={d.smoking}
                  options={POSTING_SMOKING_OPTIONS}
                  allowEmpty
                  onChange={(v) => set({ smoking: v })}
                />
                <TextIn
                  value={d.smoking_note}
                  onChange={(v) => set({ smoking_note: v })}
                  placeholder="補足（喫煙場所の有無など）"
                />
              </>
            )}
          </Field>
          <Field
            label="経験の有無"
            value={sheet.experience}
            canEdit={canEdit}
            draft={() => ({ experience: sheet.experience })}
            onSave={saveSheet}
          >
            {(d, set) => <TextIn value={d.experience} onChange={(v) => set({ experience: v })} />}
          </Field>
          <Field
            label="必要条件"
            value={sheet.requirements}
            canEdit={canEdit}
            draft={() => ({ requirements: sheet.requirements })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <TextIn
                value={d.requirements}
                onChange={(v) => set({ requirements: v })}
                placeholder="N4（技能実習の専門級合格書）など"
              />
            )}
          </Field>
          <Field
            label="その他（応募条件）"
            value={sheet.other_requirements}
            wide
            canEdit={canEdit}
            draft={() => ({ other_requirements: sheet.other_requirements })}
            onSave={saveSheet}
          >
            {(d, set) => (
              <TextAreaIn
                value={d.other_requirements}
                onChange={(v) => set({ other_requirements: v })}
              />
            )}
          </Field>
        </dl>
        <div className="mt-2">
          <Link
            href={`/postings/${posting.id}/sheet`}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-brand px-3 text-xs font-bold text-brand"
          >
            <Printer size={14} />
            求人票の様式で書く・印刷する
          </Link>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          会社からもらった求人票の内容です。上のボタンを押すと、求人票の様式そのままの画面で
          書き足して、そのまま印刷できます。
          職種・就業場所・採用人数・基本給・連絡先は上の求人管理簿の欄と共通です。
        </p>
        {/* 記載してもらった求人票の原本（PDF・画像）を添付して残す（求人管理簿の裏付け） */}
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1.5 text-[11px] font-bold text-muted">求人票の原本（PDF・画像）</p>
          <PostingFileAttachments postingId={posting.id} canEdit={canEdit} />
        </div>
        {/* 求人不受理に係る自己申告書（訪問指導の確認書類⑦）。この求人の内容で作って添付する */}
        <JikoShinkokuSection
          postingId={posting.id}
          orgName={postingOrg?.name ?? orgName ?? ""}
          orgAddress={postingOrg?.address ?? ""}
          repName={(postingOrg?.intake?.rep_name ?? "").trim()}
          dateOn={posting.received_on ?? ""}
          canEdit={canEdit}
        />
      </Card>
        </>
      )}

      <Button
        variant="primary"
        fullWidth
        icon={<Share2 size={18} />}
        onClick={() => setOutputOpen(true)}
      >
        Facebook掲載用に出力
      </Button>

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-muted">
          <Users size={14} />
          応募者（{applicants.length}名）
        </h2>
        {applicants.length === 0 ? (
          <Card className="p-5 text-center text-sm text-muted">
            まだ応募はありません。外国人の詳細ページ「求職」タブから、この求人への応募を登録できます。
          </Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {applicants.map((a) => (
              <Link
                key={a.id}
                href={a.workers ? `/workers/${a.workers.id}` : "#"}
                className="flex items-center gap-3 p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <p className="truncate font-bold">{a.workers?.name ?? "（削除済み）"}</p>
                    <ApplicationResultBadge result={a.result as ApplicationResult} />
                  </div>
                  <p className="text-xs tabular-nums text-muted">
                    応募日 {a.applied_on}
                    {a.interview_on && ` ・ 面接 ${a.interview_on}`}
                  </p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-muted" />
              </Link>
            ))}
          </Card>
        )}
      </section>

      {canEdit && (
        <Button
          variant="seal"
          fullWidth
          icon={<Trash2 size={18} />}
          onClick={() => setDeleteOpen(true)}
        >
          この求人を削除
        </Button>
      )}

      <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-muted">
        <Megaphone size={13} className="mt-0.5 shrink-0" />
        求人管理簿は厚生労働省の記載事項に沿って記録しています。掲載用の会社名・住所は別途「Facebook掲載用」欄で設定できます。
      </p>

      {outputOpen && (
        <PostingOutputDialog
          posting={posting}
          orgName={orgName}
          onClose={() => setOutputOpen(false)}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        title="求人を削除"
        message={`「${postingDisplayName(posting, orgName)}」を削除します。この求人への応募記録の紐づけは外れます（応募自体は残ります）。`}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

// 画面に並んでいる欄を、その場で直せるようにする。
// 欄を押すと入力に変わり、「保存」でその欄だけ書き戻す（別の入力画面には切り替わらない）。
// 入力の部品は画面の作り直しで文字を打つ途中に外れないよう、この場所に置いている
function Field<T extends object>({
  label,
  value,
  wide = false,
  canEdit,
  draft,
  onSave,
  children,
}: {
  label: string;
  value: string | null;
  wide?: boolean;
  canEdit: boolean;
  // 直し始めるときの値（今の内容）
  draft: () => T;
  onSave: (d: T) => Promise<void>;
  children: (d: T, set: (patch: Partial<T>) => void) => React.ReactNode;
}) {
  const [d, setD] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!d) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(d);
      setD(null);
    } catch (err) {
      setError(errorMessage(err, "保存できませんでした"));
    } finally {
      setBusy(false);
    }
  };

  if (d) {
    return (
      <div className={wide ? "col-span-2" : ""}>
        <dt className="text-[11px] font-bold text-brand">{label}</dt>
        <dd className="mt-0.5 space-y-1.5">
          {children(d, (patch) => setD((cur) => ({ ...(cur as T), ...patch })))}
          {error && <p className="text-[11px] font-bold text-seal">{error}</p>}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="min-h-[34px] rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-50"
            >
              {busy ? "保存中…" : "保存"}
            </button>
            <button
              type="button"
              onClick={() => {
                setD(null);
                setError(null);
              }}
              disabled={busy}
              className="min-h-[34px] rounded-lg border border-border px-3 text-xs font-bold text-muted"
            >
              やめる
            </button>
          </div>
        </dd>
      </div>
    );
  }

  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[11px] font-bold text-muted">{label}</dt>
      {canEdit ? (
        <dd>
          <button
            type="button"
            onClick={() => setD(draft())}
            className="-mx-1 w-full rounded-md px-1 py-0.5 text-left whitespace-pre-wrap break-words hover:bg-brand/5"
          >
            {value || <span className="text-muted">＋ 入力する</span>}
          </button>
        </dd>
      ) : (
        <dd className="whitespace-pre-wrap break-words">{value || "—"}</dd>
      )}
    </div>
  );
}

const IN_CLASS =
  "min-h-[38px] w-full min-w-0 rounded-lg border border-border bg-background px-2 text-sm focus:border-brand focus:outline-none";

function TextIn({
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "date";
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={IN_CLASS}
    />
  );
}

function TextAreaIn({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
    />
  );
}

function SelectIn({
  value,
  options,
  onChange,
  allowEmpty = false,
  label,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  allowEmpty?: boolean;
  label?: string;
}) {
  return (
    <label className="block">
      {label && <span className="text-[11px] font-bold text-muted">{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={IN_CLASS}>
        {(allowEmpty || !options.includes(value)) && <option value="">（未選択）</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

// いくつでも選べる欄（休日・加入保険）
function ChipsIn({
  values,
  options,
  onChange,
}: {
  values: string[];
  options: readonly string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = values.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(on ? values.filter((v) => v !== o) : [...values, o])}
            className={
              on
                ? "min-h-[34px] rounded-lg bg-brand px-2.5 text-xs font-bold text-brand-foreground"
                : "min-h-[34px] rounded-lg border border-border px-2.5 text-xs text-muted"
            }
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

// 入力の受け取り（数字だけ・円の表示・手当の行）
const digits = (v: string): string => v.replace(/[^0-9]/g, "");
const numOrNull = (v: string): number | null => (digits(v) ? Number(digits(v)) : null);
const yenText = (v: string): string =>
  /^\d+$/.test(v) ? `${Number(v).toLocaleString("ja-JP")}円` : v;

function allowanceText(sheet: PostingSheet): string {
  return sheet.allowances
    .filter((a) => a.name || a.amount || a.method)
    .map((a) =>
      [a.name, a.amount ? yenText(a.amount) : "", a.method ? `計算方法：${a.method}` : ""]
        .filter(Boolean)
        .join("／"),
    )
    .join("\n");
}

// 手当は求人票と同じく2行まで書けるようにしておく
function allowanceRows(sheet: PostingSheet): PostingAllowance[] {
  const rows = sheet.allowances.map((a) => ({ ...a }));
  while (rows.length < 2) rows.push({ name: "", amount: "", method: "" });
  return rows;
}

function patchRow(
  rows: PostingAllowance[],
  i: number,
  patch: Partial<PostingAllowance>,
): PostingAllowance[] {
  return rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
}
