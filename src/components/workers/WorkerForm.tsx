"use client";

import { useState } from "react";
import { CreditCard, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ResidenceCardDialog } from "@/components/workers/ResidenceCardDialog";
import { PassportMrzDialog } from "@/components/workers/PassportMrzDialog";
import { filledFieldCount, overwrittenFields, type FieldChange } from "@/lib/field-overwrite";
import { RESIDENCE_PERIODS } from "@/lib/residence-card";
import { WORKER_SITUATIONS, situationDescription } from "@/lib/worker-situation";
import { todayStr } from "@/lib/application-alerts";
import { Combobox } from "@/components/ui/Combobox";
import { createClient } from "@/lib/supabase/client";
import { insertOrganization } from "@/lib/supabase/queries/organizations";
import { SSW_INDUSTRIES, categoriesFor } from "@/lib/industries";
import { suggestSupportScope, supportScopeReason } from "@/lib/worker-support";
import {
  RESIDENCE_STATUSES,
  SUPPORT_SCOPES,
  WORKER_STATUSES,
  type Organization,
  type SupportScope,
  type Worker,
  type WorkerInput,
  type WorkerRelative,
  type WorkerStatus,
} from "@/types/db";

function toInput(w: Worker | null): WorkerInput {
  return {
    name: w?.name ?? "",
    kana: w?.kana ?? "",
    nationality: w?.nationality ?? "",
    birth: w?.birth ?? null,
    residence_card_no: w?.residence_card_no ?? "",
    field: w?.field ?? "",
    support: w?.support ?? "支援開始前",
    status: w?.status ?? "申請準備中",
    health_note: w?.health_note ?? "",
    family_note: w?.family_note ?? "",
    current_organization_id: w?.current_organization_id ?? null,
    application_prep_organization_id: w?.application_prep_organization_id ?? null,
    residence_status: w?.residence_status ?? "",
    residence_permit_date: w?.residence_permit_date ?? null,
    residence_expiry_date: w?.residence_expiry_date ?? null,
    passport_no: w?.passport_no ?? "",
    passport_expiry_date: w?.passport_expiry_date ?? null,
    passport_mrz: w?.passport_mrz ?? "",
    residence_period: w?.residence_period ?? "",
    current_situation: w?.current_situation ?? "",
    notion_link: w?.notion_link ?? "",
    residence_renewal_status: w?.residence_renewal_status ?? "",
    residence_renewal_todo: w?.residence_renewal_todo ?? "",
    application_prep_kind: w?.application_prep_kind ?? "",
    leaving_on: w?.leaving_on ?? null,
    leaving_todo: w?.leaving_todo ?? "",
    leaving_kind: w?.leaving_kind ?? "",
    leaving_reason: w?.leaving_reason ?? "",
    leaving_org_name: w?.leaving_org_name ?? "",
    leaving_org_address: w?.leaving_org_address ?? "",
    gender: w?.gender ?? "",
    has_spouse: w?.has_spouse ?? "",
    relatives_in_japan: w?.relatives_in_japan ?? "",
    relatives: w?.relatives ?? [],
    dependents: w?.dependents ?? [],
    address: w?.address ?? "",
    home_address: w?.home_address ?? "",
    employment_start_on: w?.employment_start_on ?? null,
    org_employment_starts: w?.org_employment_starts ?? [],
    assigned_office: w?.assigned_office ?? "",
    residence_note: w?.residence_note ?? "",
    photo_path: w?.photo_path ?? null,
    messenger_link: w?.messenger_link ?? "",
    specialty_grade: w?.specialty_grade ?? "",
    ssw2_exam: w?.ssw2_exam ?? "",
    recurring_sales_no: w?.recurring_sales_no ?? "",
    past_recurring_sales: w?.past_recurring_sales ?? [],
    other_qualifications: w?.other_qualifications ?? "",
    my_number: w?.my_number ?? "",
    employment_insurance_no: w?.employment_insurance_no ?? "",
    pension_no: w?.pension_no ?? "",
    ssw_insurance_link: w?.ssw_insurance_link ?? "",
    ssw_insurance_expiry_date: w?.ssw_insurance_expiry_date ?? null,
    ssw_insurance_self_join: w?.ssw_insurance_self_join ?? false,
    note: w?.note ?? "",
  };
}

const INPUT_CLASS =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";
const TEXTAREA_CLASS =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none";

// 外国人の基本情報フォーム（新規登録・編集で共用）
export function WorkerForm({
  initial,
  organizations,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Worker | null;
  organizations: Organization[];
  submitLabel: string;
  onSubmit: (input: WorkerInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<WorkerInput>(() => toInput(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 所属機関: この画面で新規登録した機関も候補に出すためローカルに保持する
  const [orgs, setOrgs] = useState<Organization[]>(organizations);
  const [newOrgName, setNewOrgName] = useState("");
  const [addingOrg, setAddingOrg] = useState(false);

  async function addOrg() {
    const name = newOrgName.trim();
    if (!name) return;
    setAddingOrg(true);
    setError(null);
    try {
      const org = await insertOrganization(createClient(), {
        name,
        industry: "",
        business_category: "",
        address: "",
        contact: "",
        corporate_no: "",
        note: "",
        intake: {},
      });
      setOrgs((prev) =>
        [...prev, org].sort((a, b) => a.name.localeCompare(b.name, "ja")),
      );
      set("current_organization_id", org.id);
      setNewOrgName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "所属機関の登録に失敗しました");
    } finally {
      setAddingOrg(false);
    }
  }

  const set = <K extends keyof WorkerInput>(key: K, value: WorkerInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // 在留カード・パスポートMRZからの反映（手入力のフォームはそのまま使える補助の入口）。
  // 空いている項目はそのまま入れ、すでに入っている項目を変えるときだけ確認してもらう
  const [cardOpen, setCardOpen] = useState(false);
  const [mrzOpen, setMrzOpen] = useState(false);
  const [pending, setPending] = useState<{
    fields: Record<string, string>;
    changes: FieldChange[];
    source: string;
  } | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const applyFields = (fields: Record<string, string>) =>
    setForm((f) => {
      const next = { ...f } as Record<string, unknown>;
      for (const [key, value] of Object.entries(fields)) next[key] = value;
      return next as WorkerInput;
    });

  // 反映の要求を受ける。書き換えになる項目があれば確認ダイアログを先に出す
  const requestApply = (source: string, fields: Record<string, string>) => {
    const current = form as unknown as Record<string, unknown>;
    const changes = overwrittenFields(current, fields, IMPORT_FIELD_LABELS);
    if (changes.length > 0) {
      setPending({ fields, changes, source });
      return;
    }
    applyFields(fields);
    setCardOpen(false);
    setMrzOpen(false);
    setApplied(
      `${source}から${filledFieldCount(current, fields)}件を反映しました。内容を確かめて保存してください。`,
    );
  };

  const confirmApply = () => {
    if (!pending) return;
    const count = filledFieldCount(form as unknown as Record<string, unknown>, pending.fields);
    applyFields(pending.fields);
    setApplied(`${pending.source}から${count}件を反映しました。内容を確かめて保存してください。`);
    setPending(null);
    setCardOpen(false);
    setMrzOpen(false);
  };

  // 在留資格・状態を変えたら、支援区分の候補を入れ直す（手で変えられる）。
  // 退職・帰国・求職活動中では候補を出さない（退職月の請求を残すため）
  const setWithSupport = (patch: Partial<WorkerInput>) =>
    setForm((f) => {
      const next = { ...f, ...patch };
      const suggested = suggestSupportScope(next.residence_status, next.status);
      return suggested ? { ...next, support: suggested } : next;
    });

  // date input は空文字を返すため null へ正規化する
  const setDate = (
    key:
      | "birth"
      | "residence_permit_date"
      | "residence_expiry_date"
      | "passport_expiry_date"
      | "leaving_on"
      | "employment_start_on"
      | "ssw_insurance_expiry_date",
  ) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      set(key, e.target.value || null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ ...form, name: form.name.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setBusy(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          保存に失敗しました: {error}
        </p>
      )}
      {applied && (
        <p role="status" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
          {applied}
        </p>
      )}

      {/* 券面から入力する補助の入口（手で入れるときはそのまま下のフォームを使えます） */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCardOpen(true)}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand px-3 text-sm font-bold text-brand"
        >
          <CreditCard size={16} />
          在留カードから入力
        </button>
        <button
          type="button"
          onClick={() => setMrzOpen(true)}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand px-3 text-sm font-bold text-brand"
        >
          <ScanLine size={16} />
          パスポートMRZから入力
        </button>
      </div>

      <Fieldset legend="基本情報">
        <Field label="氏名（必須）">
          <input
            required
            maxLength={100}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="GUEN VAN A"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="フリガナ">
          <input
            value={form.kana}
            onChange={(e) => set("kana", e.target.value)}
            placeholder="グエン バン アー"
            className={INPUT_CLASS}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="国籍">
            <input
              value={form.nationality}
              onChange={(e) => set("nationality", e.target.value)}
              placeholder="ベトナム"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="生年月日">
            <input type="date" value={form.birth ?? ""} onChange={setDate("birth")} className={INPUT_CLASS} />
          </Field>
        </div>
        <Field label="性別">
          <select value={form.gender} onChange={(e) => set("gender", e.target.value)} className={INPUT_CLASS}>
            <option value="">未設定</option>
            <option value="男">男</option>
            <option value="女">女</option>
          </select>
        </Field>
        <Field label="住所">
          <input
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="例: 熊本県熊本市中央区◯◯1-2-3"
            className={INPUT_CLASS}
          />
        </Field>
        <FieldJobSelect field={form.field} onChange={(v) => set("field", v)} />
        <Field label="専門級の合格名">
          <input
            value={form.specialty_grade}
            onChange={(e) => set("specialty_grade", e.target.value)}
            placeholder="例: 介護福祉士 専門級 合格"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="特定技能2号の合格試験名">
          <input
            value={form.ssw2_exam}
            onChange={(e) => set("ssw2_exam", e.target.value)}
            placeholder="例: ビルクリーニング分野特定技能2号評価試験"
            className={INPUT_CLASS}
          />
          <span className="px-1 text-[11px] leading-relaxed text-muted">
            入力すると外国人詳細に「2号合格」と表示されます。合格証は「外国人書類」の
            「特定技能2号の合格証」から添付できます。
          </span>
        </Field>
        <Field label="その他の資格・合格名">
          <input
            value={form.other_qualifications}
            onChange={(e) => set("other_qualifications", e.target.value)}
            placeholder="例: 日本語能力試験N3 合格"
            className={INPUT_CLASS}
          />
        </Field>
      </Fieldset>

      <Fieldset legend="支援・状態">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="支援区分">
            <select
              value={form.support}
              onChange={(e) => set("support", e.target.value as SupportScope)}
              className={INPUT_CLASS}
            >
              {SUPPORT_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {/* 在留資格・状態から入れた候補。違うときはそのまま選び直せる */}
            {supportScopeReason(form.residence_status, form.status) && (
              <p className="mt-0.5 text-[10px] text-muted">
                {supportScopeReason(form.residence_status, form.status)}自動で選んでいます
              </p>
            )}
          </Field>
          <Field label="状態">
            <select
              value={form.status}
              onChange={(e) => setWithSupport({ status: e.target.value as WorkerStatus })}
              className={INPUT_CLASS}
            >
              {/* 統一前の「支援中」などが残っている場合も表示できるよう選択肢に残す */}
              {form.status && !(WORKER_STATUSES as readonly string[]).includes(form.status) && (
                <option value={form.status}>{form.status}</option>
              )}
              {WORKER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {/* 只今の状況（経過メモ）。Notionの只今の状況と同じ選択肢＋自由入力 */}
        <Field label="只今の状況（経過メモ）">
          <input
            list="worker-form-situations"
            value={form.current_situation}
            onChange={(e) => set("current_situation", e.target.value)}
            placeholder="例: 特定技能の審査中"
            className={INPUT_CLASS}
          />
          <datalist id="worker-form-situations">
            {WORKER_SITUATIONS.map((s) => (
              <option key={s.value} value={s.value} />
            ))}
          </datalist>
          {/* どういう人に付ける状況かを添える（説明のある選択肢だけ） */}
          {situationDescription(form.current_situation) && (
            <span className="px-1 text-[11px] leading-relaxed text-muted">
              {situationDescription(form.current_situation)}
            </span>
          )}
        </Field>
        {form.status === "退職" && (
          <div className="grid grid-cols-2 gap-2.5 rounded-xl bg-background p-3">
            <Field label="退職日">
              <input
                type="date"
                value={form.leaving_on ?? ""}
                onChange={setDate("leaving_on")}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Notion 随時報告TODO番号">
              <input
                value={form.leaving_todo}
                onChange={(e) => set("leaving_todo", e.target.value)}
                placeholder="例: TODO-1234"
                className={INPUT_CLASS}
              />
            </Field>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">現在の所属機関</span>
          <Combobox
            options={orgs.map((o) => ({ id: o.id, label: o.name }))}
            value={form.current_organization_id ?? ""}
            onChange={(id) => set("current_organization_id", id || null)}
            placeholder="所属機関名を入力して検索"
          />
          {!form.current_organization_id && (
            <div className="mt-1 rounded-xl border border-dashed border-border p-2.5">
              <p className="mb-1.5 text-[11px] font-bold text-muted">
                一覧にない場合は、所属機関名を入力して登録できます
              </p>
              <div className="flex gap-2">
                <input
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="所属機関名を入力"
                  className={INPUT_CLASS}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addOrg}
                  disabled={!newOrgName.trim() || addingOrg}
                >
                  {addingOrg ? "登録中…" : "登録"}
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="雇用開始年月日">
            <input
              type="date"
              value={form.employment_start_on ?? ""}
              onChange={setDate("employment_start_on")}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="配属先営業所">
            <input
              value={form.assigned_office}
              onChange={(e) => set("assigned_office", e.target.value)}
              placeholder="例: 熊本営業所"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <Field label="居住先">
          <input
            value={form.residence_note}
            onChange={(e) => set("residence_note", e.target.value)}
            placeholder="例: 社宅 / 自分のアパート"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Messenger グループ/個人リンク">
          <input
            type="url"
            value={form.messenger_link}
            onChange={(e) => set("messenger_link", e.target.value)}
            placeholder="https://m.me/... または https://www.messenger.com/..."
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Notion 個人ページのリンク">
          <input
            type="url"
            value={form.notion_link}
            onChange={(e) => set("notion_link", e.target.value)}
            placeholder="https://www.notion.so/... または https://app.notion.com/..."
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="健康状態">
          <textarea
            rows={2}
            value={form.health_note}
            onChange={(e) => set("health_note", e.target.value)}
            placeholder="持病・通院状況など"
            className={TEXTAREA_CLASS}
          />
        </Field>
        <Field label="家族構成">
          <textarea
            rows={2}
            value={form.family_note}
            onChange={(e) => set("family_note", e.target.value)}
            placeholder="配偶者・子どもの有無、同居状況など"
            className={TEXTAREA_CLASS}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="配偶者の有無">
            <select
              value={form.has_spouse}
              onChange={(e) => set("has_spouse", e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">未設定</option>
              <option value="有">有</option>
              <option value="無">無</option>
            </select>
          </Field>
          <Field label="在日親族の同居の有無">
            <select
              value={form.relatives_in_japan}
              onChange={(e) => set("relatives_in_japan", e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">未設定</option>
              <option value="有">有</option>
              <option value="無">無</option>
            </select>
          </Field>
        </div>
        {form.relatives_in_japan === "有" && (
          <RelativesEditor
            relatives={form.relatives}
            onChange={(v) => set("relatives", v)}
          />
        )}
      </Fieldset>

      <Fieldset legend="在留情報">
        <Field label="現在の在留資格">
          <select
            value={form.residence_status}
            onChange={(e) => setWithSupport({ residence_status: e.target.value })}
            className={INPUT_CLASS}
          >
            <option value="">未設定</option>
            {/* 一覧にない表記が登録済みの場合はそのまま選択肢に残す（削除しない） */}
            {form.residence_status &&
              !(RESIDENCE_STATUSES as readonly string[]).includes(form.residence_status) && (
                <option value={form.residence_status}>{form.residence_status}</option>
              )}
            {RESIDENCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="在留カード番号">
          <input
            value={form.residence_card_no}
            onChange={(e) => set("residence_card_no", e.target.value)}
            placeholder="AB12345678CD"
            className={INPUT_CLASS}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="許可日">
            <input
              type="date"
              value={form.residence_permit_date ?? ""}
              onChange={setDate("residence_permit_date")}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="在留期限">
            <input
              type="date"
              value={form.residence_expiry_date ?? ""}
              onChange={setDate("residence_expiry_date")}
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        {/* 在留カードの記載（0092）。在留期間は満了日とは別に、何年もらえたかを残す */}
        <Field label="在留期間">
          <input
            list="worker-residence-periods"
            value={form.residence_period}
            onChange={(e) => set("residence_period", e.target.value)}
            placeholder="1年"
            className={INPUT_CLASS}
          />
          <datalist id="worker-residence-periods">
            {RESIDENCE_PERIODS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="備考">
          <textarea
            rows={2}
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            className={TEXTAREA_CLASS}
          />
        </Field>
      </Fieldset>

      <Fieldset legend="パスポート情報">
        <Field label="パスポート番号">
          <input
            value={form.passport_no}
            onChange={(e) => set("passport_no", e.target.value)}
            placeholder="例: C1234567"
            className={INPUT_CLASS}
          />
        </Field>
        {/* 母国（本国）の住所。基本情報の「住所」は日本での住所なので、分けて入力する */}
        <Field label="母国の住所">
          <textarea
            rows={2}
            value={form.home_address}
            onChange={(e) => set("home_address", e.target.value)}
            placeholder="例: Số 12, Thôn A, Xã B, Huyện C, Tỉnh Nghệ An, Việt Nam"
            className={TEXTAREA_CLASS}
          />
        </Field>
        <Field label="パスポート有効期限">
          <input
            type="date"
            value={form.passport_expiry_date ?? ""}
            onChange={setDate("passport_expiry_date")}
            className={INPUT_CLASS}
          />
        </Field>
        <p className="px-1 text-[11px] leading-relaxed text-muted">
          有効期限の半年前になると「パスポート更新必要」に自動で表示されます。
          母国の住所は本国の住所です（日本での住所は基本情報の「住所」に入れてください）。
        </p>
      </Fieldset>

      <Fieldset legend="番号・保険情報">
        <Field label="個人番号（マイナンバー）">
          <input
            value={form.my_number}
            onChange={(e) => set("my_number", e.target.value)}
            placeholder="例: 123456789012"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="雇用保険被保険者番号">
          <input
            value={form.employment_insurance_no}
            onChange={(e) => set("employment_insurance_no", e.target.value)}
            placeholder="例: 1234-567890-1"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="基礎年金番号">
          <input
            value={form.pension_no}
            onChange={(e) => set("pension_no", e.target.value)}
            placeholder="例: 1234-567890"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="特定技能総合保険の加入リンク先">
          <input
            type="url"
            value={form.ssw_insurance_link}
            onChange={(e) => set("ssw_insurance_link", e.target.value)}
            placeholder="https://..."
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="特定技能総合保険の有効期限">
          <input
            type="date"
            value={form.ssw_insurance_expiry_date ?? ""}
            onChange={setDate("ssw_insurance_expiry_date")}
            className={INPUT_CLASS}
          />
        </Field>
        <p className="px-1 text-[11px] leading-relaxed text-muted">
          有効期限の1か月前になるとダッシュボードにアラートが表示されます。
        </p>
      </Fieldset>

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

      <ResidenceCardDialog
        open={cardOpen}
        onClose={() => setCardOpen(false)}
        onApply={(fields) => requestApply("在留カード", fields)}
      />
      <PassportMrzDialog
        open={mrzOpen}
        today={todayStr()}
        onClose={() => setMrzOpen(false)}
        onApply={(fields) => requestApply("パスポートMRZ", fields)}
      />

      {/* 入力済みの項目を書き換えるときの確認 */}
      <Modal
        open={pending !== null}
        title="入力済みの項目を書き換えます"
        onClose={() => setPending(null)}
      >
        <p className="mb-3 text-sm leading-relaxed">
          {pending?.source}の内容を反映すると、次の項目が書き換わります。よろしいですか。
        </p>
        <ul className="mb-3 flex flex-col gap-1.5">
          {pending?.changes.map((c) => (
            <li key={c.key} className="rounded-lg bg-background px-3 py-2 text-xs">
              <span className="font-bold">{c.label}</span>
              <span className="mt-0.5 block break-words text-muted">
                今: {c.before} → 反映後:{" "}
                <span className="font-bold text-foreground">{c.after}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mb-3 text-[11px] text-muted">
          反映してもまだ保存されません。フォームの内容を確かめてから保存してください。
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" fullWidth onClick={() => setPending(null)}>
            やめる
          </Button>
          <Button type="button" fullWidth onClick={confirmApply}>
            書き換えて反映
          </Button>
        </div>
      </Modal>
    </>
  );
}

// 在留カード・MRZから反映する項目の日本語名（上書き確認の一覧に出す）
export const IMPORT_FIELD_LABELS: Record<string, string> = {
  name: "氏名",
  birth: "生年月日",
  gender: "性別",
  nationality: "国籍",
  address: "住所（住居地）",
  residence_status: "現在の在留資格",
  residence_period: "在留期間",
  residence_expiry_date: "在留期限",
  residence_permit_date: "許可日",
  residence_card_no: "在留カード番号",
  passport_no: "パスポート番号",
  passport_expiry_date: "パスポート有効期限",
  passport_mrz: "パスポートMRZ（2行）",
};

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

// 特定産業分野・職種の連動プルダウン。
// field は「分野／職種」の1文字列で保存する（分野のみの場合は分野だけ）。
// 旧データの自由入力値はリストに無くても選択肢へ含めて保持する
export function FieldJobSelect({
  field,
  onChange,
}: {
  field: string;
  onChange: (value: string) => void;
}) {
  const [industry = "", jobType = ""] = field.split("／");
  const industryOptions =
    !industry || SSW_INDUSTRIES.includes(industry)
      ? SSW_INDUSTRIES
      : [industry, ...SSW_INDUSTRIES];
  const jobs = categoriesFor(industry);
  const jobOptions = jobType && !jobs.includes(jobType) ? [jobType, ...jobs] : jobs;

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <Field label="特定技能分野">
        <select
          value={industry}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">選択してください</option>
          {industryOptions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="職種（業務区分）">
        <select
          value={jobType}
          onChange={(e) =>
            onChange(e.target.value ? `${industry}／${e.target.value}` : industry)
          }
          disabled={!industry}
          className={`${INPUT_CLASS} disabled:opacity-50`}
        >
          <option value="">{industry ? "選択してください" : "先に分野を選択"}</option>
          {jobOptions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

const BLANK_RELATIVE: WorkerRelative = {
  name: "",
  birth: "",
  workplace: "",
  residence_card_no: "",
};

// 同居している在日親族の入力（複数人）。氏名・生年月日・勤務先・在留カード番号
export function RelativesEditor({
  relatives,
  onChange,
}: {
  relatives: WorkerRelative[];
  onChange: (value: WorkerRelative[]) => void;
}) {
  const setAt = (i: number, key: keyof WorkerRelative, value: string) =>
    onChange(relatives.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-background p-3">
      <p className="text-xs font-bold text-muted">同居している在日親族</p>
      {relatives.length === 0 && (
        <p className="text-xs text-muted">「親族を追加」から登録してください。</p>
      )}
      {relatives.map((r, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted">親族 {i + 1}</span>
            <button
              type="button"
              onClick={() => onChange(relatives.filter((_, idx) => idx !== i))}
              className="text-xs font-bold text-seal"
            >
              削除
            </button>
          </div>
          <Field label="氏名">
            <input
              value={r.name}
              onChange={(e) => setAt(i, "name", e.target.value)}
              placeholder="NGUYEN VAN B"
              className={INPUT_CLASS}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="生年月日">
              <input
                type="date"
                value={r.birth}
                onChange={(e) => setAt(i, "birth", e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="在留カード番号">
              <input
                value={r.residence_card_no}
                onChange={(e) => setAt(i, "residence_card_no", e.target.value)}
                placeholder="AB12345678CD"
                className={INPUT_CLASS}
              />
            </Field>
          </div>
          <Field label="勤務先">
            <input
              value={r.workplace}
              onChange={(e) => setAt(i, "workplace", e.target.value)}
              placeholder="株式会社◯◯"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        fullWidth
        onClick={() => onChange([...relatives, { ...BLANK_RELATIVE }])}
      >
        親族を追加
      </Button>
    </div>
  );
}
