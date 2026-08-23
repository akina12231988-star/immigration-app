"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Loader2, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { listOrganizationFiles } from "@/lib/supabase/queries/organization-files";
import {
  createOrgFileTicket,
  deleteOrgFile,
  getOrgFilePreviewUrl,
  registerOrgFile,
} from "@/app/(app)/organizations/actions";
import { SSW_INDUSTRIES, categoriesFor } from "@/lib/industries";
import { REFERRAL_SALES_KEY, SALES_APP_KINDS } from "@/lib/sales";
import { todayStr } from "@/lib/ssw/calc";
import {
  emptyCouncilSubmission,
  emptyFinancialYear,
  emptyJapaneseStaff,
  emptyLodging,
  emptyOfficer,
  emptyOrganizationIntake,
  emptySalesItem,
  digitsOnly,
  flexDocsValidUntil,
  formatHoursDecimal,
  formatYen,
  parseHoursMinutes,
  lodgingContractKind,
  normalizeOrganizationIntake,
  ownedMonthlyRent,
  parseAmount,
  reverseLodgingCost,
  suggestedUsefulYears,
  WOODEN_USEFUL_YEARS,
} from "@/lib/organization-intake";
import { orgYearlyFileGroups, orgYearlyKind } from "@/lib/org-yearly-files";
import { SUPPORT_CONTRACT_STATUSES } from "@/types/db";
import type {
  OrgCouncilSubmission,
  OrgFinancialYear,
  OrgJapaneseStaff,
  OrgLodging,
  OrgOfficer,
  OrgSalesItem,
  Organization,
  OrganizationFileRow,
  OrganizationInput,
  OrganizationIntake,
} from "@/types/db";

export const INPUT_CLASS =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

const GROUP_CLASS = "mt-1 text-xs font-bold text-brand";
const HINT_CLASS = "text-[11px] leading-relaxed text-muted";

export function emptyOrganizationInput(): OrganizationInput {
  return {
    name: "",
    industry: "",
    business_category: "",
    address: "",
    contact: "",
    corporate_no: "",
    note: "",
    intake: emptyOrganizationIntake(),
  };
}

// DBの行をフォームの初期値に変換する。
// 電話番号（旧・申込書の項目）は連絡先へ統合。連絡先が空なら旧データを引き継ぐ
export function organizationToInput(org: Organization): OrganizationInput {
  const intake = normalizeOrganizationIntake(org.intake);
  return {
    name: org.name,
    industry: org.industry,
    business_category: org.business_category,
    address: org.address,
    contact: org.contact || intake.phone,
    corporate_no: org.corporate_no,
    note: org.note,
    intake: { ...intake, phone: "" },
  };
}

// 会社・機関の基本項目のうち、ロック判定の対象になる文字列項目
type TopTextField =
  | "name"
  | "industry"
  | "business_category"
  | "address"
  | "contact"
  | "corporate_no"
  | "note";

// 詳細表示モードのロック判定。開いた時点で入力済みの欄は表示のみにする
interface FieldLocks {
  detail: boolean; // 詳細表示モードか（行の削除ボタンを隠す）
  top: (key: TopTextField) => boolean;
  intake: (key: keyof OrganizationIntake) => boolean;
  fin: (i: number, key: keyof OrgFinancialYear) => boolean;
  staff: (i: number, key: keyof OrgJapaneseStaff) => boolean;
  lodging: (i: number, key: keyof OrgLodging) => boolean;
  officerField: (i: number, key: "kana" | "name" | "title") => boolean;
  officerRow: (i: number) => boolean;
}

const NO_LOCKS: FieldLocks = {
  detail: false,
  top: () => false,
  intake: () => false,
  fin: () => false,
  staff: () => false,
  lodging: () => false,
  officerField: () => false,
  officerRow: () => false,
};

function filled(v: unknown): boolean {
  // 支援責任者・支援担当者のように複数選択の項目は、1つでも選ばれていれば入力済み
  if (Array.isArray(v)) return v.some((x) => typeof x === "string" && x.trim() !== "");
  return typeof v === "string" && v.trim() !== "";
}

// 入力済み項目の表示（詳細表示モードでロックされた欄）
function StaticValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-bold text-muted">{label}</span>
      <p className="min-h-[44px] w-full whitespace-pre-wrap rounded-xl bg-border/30 px-3 py-2.5 text-sm">
        {value}
      </p>
    </div>
  );
}

// 申込書の1入力欄（テキスト）
function IntakeField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  locked,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  locked?: boolean;
}) {
  if (locked) return <StaticValue label={label} value={value} />;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
      {hint && <span className={HINT_CLASS}>{hint}</span>}
    </label>
  );
}

// 支援責任者・支援担当者の選択肢。
// 従業員マスタ（/employees）でその役割にしている人だけを候補にする。
// 既に選任されている名前は、候補から外れても選択を解除できるよう残す。
function supportNameOptions(roleNames: string[], selected: string[]): string[] {
  const options: string[] = [];
  for (const name of [...roleNames, ...selected]) {
    const trimmed = name.trim();
    if (trimmed && !options.includes(trimmed)) options.push(trimmed);
  }
  return options;
}

// 支援責任者・支援担当者（複数選択）。従業員マスタの氏名からチェックで選ぶ
function IntakeNameMulti({
  label,
  value,
  onChange,
  options,
  hint,
  locked,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  options: string[];
  hint?: string;
  locked?: boolean;
}) {
  if (locked) return <StaticValue label={label} value={value.join("・")} />;
  const toggle = (name: string) => {
    onChange(value.includes(name) ? value.filter((v) => v !== name) : [...value, name]);
  };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-bold text-muted">{label}</span>
      {options.length === 0 ? (
        <span className={HINT_CLASS}>
          該当する従業員がいません。「支援体制（従業員）」で対象者にこの役割をチェックしてください。
        </span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {options.map((name) => {
            const on = value.includes(name);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(name)}
                className={`min-h-[36px] rounded-full border px-3 text-sm transition ${
                  on
                    ? "border-brand bg-brand/10 font-bold text-brand"
                    : "border-border bg-background text-muted"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
      {hint && <span className={HINT_CLASS}>{hint}</span>}
    </div>
  );
}

// 金額の入力欄（数字だけ）。「円」は入力欄の外に表示する
function IntakeYen({
  label,
  value,
  onChange,
  hint,
  locked,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  locked?: boolean;
}) {
  const digits = digitsOnly(value);
  if (locked) {
    return <StaticValue label={label} value={digits ? formatYen(Number(digits)) : value} />;
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold text-muted">{label}</span>
      <span className="flex items-center gap-2">
        <input
          value={digits}
          onChange={(e) => onChange(digitsOnly(e.target.value))}
          inputMode="numeric"
          placeholder="例: 20000"
          className={`${INPUT_CLASS} text-right`}
        />
        <span className="shrink-0 text-sm text-muted">円</span>
      </span>
      {digits && (
        <span className={HINT_CLASS}>{formatYen(Number(digits))}</span>
      )}
      {hint && <span className={HINT_CLASS}>{hint}</span>}
    </label>
  );
}

// 申込書の1入力欄（選択式）
function IntakeSelect({
  label,
  value,
  onChange,
  options,
  hint,
  locked,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  hint?: string;
  locked?: boolean;
}) {
  if (locked) return <StaticValue label={label} value={value} />;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}>
        <option value="">選択してください</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {hint && <span className={HINT_CLASS}>{hint}</span>}
    </label>
  );
}

// 決算情報の期表記に使う小さなインライン入力
function InlineNum({
  value,
  onChange,
  placeholder,
  widthClass,
  locked,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  widthClass: string;
  locked?: boolean;
}) {
  if (locked) return <span className="tabular-nums">{value}</span>;
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`min-h-[34px] ${widthClass} rounded-lg border border-border bg-background px-2 text-center text-xs tabular-nums focus:border-brand focus:outline-none`}
    />
  );
}

// 居住費用などの自動計算の結果表示。計算できたら金額を大きく強調する
function CalcResult({
  label,
  value,
  emptyHint,
}: {
  label: string;
  value: number | null;
  emptyHint: string;
}) {
  if (value == null) {
    return (
      <p className={HINT_CLASS}>
        {label}: {emptyHint}
      </p>
    );
  }
  return (
    <p className="rounded-xl bg-brand/10 px-3 py-2.5 text-xs text-muted">
      {label}:{" "}
      <span className="ml-1 align-middle text-lg font-bold tabular-nums text-brand">
        {formatYen(value)}
      </span>
    </p>
  );
}

// 会社・機関フォームの全入力欄（基本項目＋申込書の情報）。
// snapshot を渡すと詳細表示モードになり、開いた時点で入力済みの欄は表示のみ・
// 未記入の欄だけ入力できる（編集は一覧の鉛筆ボタンから）。
export function OrganizationFormBody({
  form,
  setForm,
  orgId,
  snapshot,
  managerNames = [],
  staffNames = [],
}: {
  form: OrganizationInput;
  setForm: React.Dispatch<React.SetStateAction<OrganizationInput>>;
  orgId: string | null;
  snapshot: OrganizationInput | null;
  managerNames?: string[]; // 支援責任者にしている従業員（/employees で設定）
  staffNames?: string[]; // 支援担当者にしている従業員（/employees で設定）
}) {
  const locks = useMemo<FieldLocks>(() => {
    if (!snapshot) return NO_LOCKS;
    const snapIntake = normalizeOrganizationIntake(snapshot.intake);
    return {
      detail: true,
      top: (key) => filled(snapshot[key]),
      intake: (key) => filled(snapIntake[key]),
      fin: (i, key) => filled(snapIntake.financials[i]?.[key]),
      staff: (i, key) => filled(snapIntake.japanese_staff[i]?.[key]),
      lodging: (i, key) => filled(snapIntake.lodgings[i]?.[key]),
      officerField: (i, key) => filled(snapIntake.officers[i]?.[key]),
      officerRow: (i) => {
        const row = snapIntake.officers[i];
        return !!row && (filled(row.kana) || filled(row.name) || filled(row.title));
      },
    };
  }, [snapshot]);

  const set = <K extends keyof OrganizationInput>(key: K, value: OrganizationInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const intake = normalizeOrganizationIntake(form.intake);
  const setIntake = (patch: Partial<OrganizationIntake>) =>
    setForm((f) => ({ ...f, intake: { ...normalizeOrganizationIntake(f.intake), ...patch } }));

  // 支援責任者と支援担当者を兼任している人
  const dualNames = intake.support_managers.filter((n) => intake.support_staff.includes(n));

  // 会社の基本情報（名称・業種・所在地・連絡先など）。バラバラに並べず、
  // 「申込書の情報 ＞ 会社の情報」にフリガナ・FAX・Emailと一緒にまとめて表示する
  const companyFields = (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {locks.top("name") ? (
        <StaticValue label="名称" value={form.name} />
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">名称（必須）</span>
          <input
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="株式会社◯◯食品"
            className={INPUT_CLASS}
          />
        </label>
      )}
      <IntakeField
        label="名称のフリガナ"
        value={intake.kana}
        onChange={(v) => setIntake({ kana: v })}
        locked={locks.intake("kana")}
      />
      {locks.top("industry") ? (
        <StaticValue label="業種（特定技能 産業分野）" value={form.industry} />
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">業種（特定技能 産業分野）</span>
          <select
            value={form.industry}
            onChange={(e) => {
              // 分野を変えたら業務区分をリセット
              setForm((f) => ({ ...f, industry: e.target.value, business_category: "" }));
            }}
            className={INPUT_CLASS}
          >
            <option value="">選択してください</option>
            {SSW_INDUSTRIES.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>
        </label>
      )}
      {form.industry &&
        categoriesFor(form.industry).length > 0 &&
        (locks.top("business_category") ? (
          <StaticValue label="業務区分" value={form.business_category} />
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">業務区分</span>
            <select
              value={form.business_category}
              onChange={(e) => set("business_category", e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">選択してください</option>
              {categoriesFor(form.industry).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ))}
      <div className="sm:col-span-2">
        {locks.top("address") ? (
          <StaticValue label="所在地" value={form.address} />
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">所在地</span>
            <input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              className={INPUT_CLASS}
            />
            <span className={HINT_CLASS}>
              法人で支店などがある場合は本店の所在地を記載してください。
              個人事業主の場合は事業主の免許証の住所を記載してください。
            </span>
          </label>
        )}
      </div>
      {locks.top("contact") ? (
        <StaticValue label="電話番号・連絡先" value={form.contact} />
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">電話番号・連絡先</span>
          <input
            value={form.contact}
            onChange={(e) => set("contact", e.target.value)}
            placeholder="電話番号など"
            className={INPUT_CLASS}
          />
          <span className={HINT_CLASS}>
            入管から連絡が来ても対応できる連絡先を記載してください。
          </span>
        </label>
      )}
      <IntakeField
        label="FAX"
        value={intake.fax}
        onChange={(v) => setIntake({ fax: v })}
        locked={locks.intake("fax")}
      />
      <IntakeField
        label="Email"
        value={intake.email}
        onChange={(v) => setIntake({ email: v })}
        locked={locks.intake("email")}
      />
      <IntakeField
        label="定期報告書・随時報告書の担当者名"
        value={intake.report_staff}
        onChange={(v) => setIntake({ report_staff: v })}
        placeholder="例: 井上　有基"
        hint="退職＜随時報告＞の様式（3-1-2号・3-4号）の届出機関担当者欄に自動転記されます。"
        locked={locks.intake("report_staff")}
      />
    </div>
  );

  return (
    <>
      {/* この機関の支援責任者・支援担当者（複数可）。外国人詳細・申請一覧・ダッシュボードに表示され、
          申請一覧では担当者での絞り込みに使う。令和9年4月1日施行の省令改正に対応 */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-border p-3">
        <IntakeSelect
          label="支援委託の状況"
          value={intake.support_contract_status}
          onChange={(v) => setIntake({ support_contract_status: v })}
          options={[...SUPPORT_CONTRACT_STATUSES]}
          hint="「支援委託中」「特定技能1号の許可後に支援委託開始」を選ぶと、委託を受けている機関として数えます（支援責任者1人当たり10機関未満）。所属機関の一覧からも切り替えられます。"
          locked={locks.intake("support_contract_status")}
        />
        <p className="text-xs leading-relaxed text-muted">
          支援責任者・支援担当者は、支援業務を行う事務所ごとに常勤の役員又は職員からそれぞれ1名以上選任します（兼務可）。
          <strong>「支援体制（従業員）」でその役割にしている在籍者だけが候補に出ます。</strong>
          候補に出ない場合は、先に従業員側で役割をチェックしてください。
        </p>
        <IntakeNameMulti
          label="この機関の支援責任者（複数選択可）"
          value={intake.support_managers}
          onChange={(v) => setIntake({ support_managers: v })}
          options={supportNameOptions(managerNames, intake.support_managers)}
          hint="支援計画の作成・実施を統括する責任者。外国人詳細・申請一覧・ダッシュボードに表示されます。"
          locked={locks.intake("support_managers")}
        />
        <IntakeNameMulti
          label="この機関の支援担当者（複数選択可）"
          value={intake.support_staff}
          onChange={(v) => setIntake({ support_staff: v })}
          options={supportNameOptions(staffNames, intake.support_staff)}
          hint="実際に支援業務を行う担当者。支援責任者との兼任も可（両方で同じ人を選ぶと「兼任」と表示されます）。"
          locked={locks.intake("support_staff")}
        />
        {dualNames.length > 0 && (
          <p className="text-xs font-bold text-brand">兼任: {dualNames.join("・")}</p>
        )}
      </div>
      {locks.top("corporate_no") ? (
        <StaticValue label="法人番号" value={form.corporate_no} />
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">法人番号（13桁・法人でない場合は空欄）</span>
          <input
            value={form.corporate_no}
            onChange={(e) => set("corporate_no", e.target.value)}
            placeholder="1234567890123"
            inputMode="numeric"
            maxLength={13}
            className={INPUT_CLASS}
          />
        </label>
      )}
      {locks.top("note") ? (
        <StaticValue label="備考" value={form.note} />
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">備考</span>
          <input
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            className={INPUT_CLASS}
          />
        </label>
      )}

      <IntakeSection
        intake={intake}
        setIntake={setIntake}
        orgId={orgId}
        locks={locks}
        companyFields={companyFields}
      />
    </>
  );
}

// 登録支援機関への申込書の内容。折りたたまず最初から全項目を表示する
function IntakeSection({
  intake,
  setIntake,
  orgId,
  locks,
  companyFields,
}: {
  intake: OrganizationIntake;
  setIntake: (patch: Partial<OrganizationIntake>) => void;
  orgId: string | null; // 見積書の添付に使う（新規登録時は保存後に添付可）
  locks: FieldLocks;
  companyFields?: React.ReactNode; // 会社の基本情報（名称・業種・所在地など。ここにまとめて表示）
}) {
  const setFinancial = (i: number, patch: Partial<OrgFinancialYear>) =>
    setIntake({
      financials: intake.financials.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    });
  const setStaff = (i: number, patch: Partial<OrgJapaneseStaff>) =>
    setIntake({
      japanese_staff: intake.japanese_staff.map((row, idx) =>
        idx === i ? { ...row, ...patch } : row,
      ),
    });
  const setOfficer = (i: number, patch: Partial<OrgOfficer>) =>
    setIntake({
      officers: intake.officers.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    });
  const setLodging = (i: number, patch: Partial<OrgLodging>) =>
    setIntake({
      lodgings: intake.lodgings.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    });
  // 常勤職員数は年1回更新するため、入力したらその日の日付を最終更新日として記録する
  const setStaffCount = (patch: Partial<OrganizationIntake>) =>
    setIntake({ ...patch, staff_updated_on: todayStr() });

  return (
    <div className="rounded-xl border border-border">
      <p className="px-3 pt-3 text-sm font-bold">申込書の情報（登録支援機関への申込書）</p>
      <div className="flex flex-col gap-2.5 p-3">
        <p className={GROUP_CLASS}>会社の情報</p>
        {companyFields}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <IntakeSelect
            label="資料のやりとり方法"
            value={intake.contact_method}
            onChange={(v) => setIntake({ contact_method: v })}
            options={["FAX", "グループLINE", "email"]}
            locked={locks.intake("contact_method")}
          />
          <IntakeSelect
            label="保険（事業所としての適用内容）"
            value={intake.health_insurance}
            onChange={(v) => setIntake({ health_insurance: v })}
            options={["国民健康保険", "社会保険", "その他"]}
            locked={locks.intake("health_insurance")}
          />
          <IntakeSelect
            label="特定技能総合保険の負担"
            value={intake.ssw_insurance_burden}
            onChange={(v) => setIntake({ ssw_insurance_burden: v })}
            options={["会社負担", "外国人負担"]}
            hint="外国人詳細の「特定技能総合保険」欄の表示が切り替わります。外国人負担の場合は、本人が自己負担加入を希望したときだけリンク先と有効期限を表示します。"
            locked={locks.intake("ssw_insurance_burden")}
          />
          <IntakeSelect
            label="年金（事業所としての適用内容）"
            value={intake.pension}
            onChange={(v) => setIntake({ pension: v })}
            options={["国民年金", "厚生年金"]}
            locked={locks.intake("pension")}
          />
          <IntakeSelect
            label="給与支払い方法"
            value={intake.pay_method}
            onChange={(v) => setIntake({ pay_method: v })}
            options={["通貨払い", "口座振込"]}
            hint="賃金（1-6号別紙）の入力画面に表示されます。"
            locked={locks.intake("pay_method")}
          />
        </div>
        <IntakeField
          label="作業する住所（会社の住所と別の場合）"
          value={intake.work_address}
          onChange={(v) => setIntake({ work_address: v })}
          placeholder="〒　住所"
          locked={locks.intake("work_address")}
        />
        <IntakeField
          label="作業する住所のTEL・FAX"
          value={intake.work_contact}
          onChange={(v) => setIntake({ work_contact: v })}
          locked={locks.intake("work_contact")}
        />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <IntakeField
            label="代表者フリガナ"
            value={intake.rep_kana}
            onChange={(v) => setIntake({ rep_kana: v })}
            locked={locks.intake("rep_kana")}
          />
          <IntakeField
            label="代表者役職・氏名"
            value={intake.rep_name}
            onChange={(v) => setIntake({ rep_name: v })}
            placeholder="例: 代表取締役 ◯◯ ◯◯"
            locked={locks.intake("rep_name")}
          />
          <IntakeField
            label="資本金（法人）"
            value={intake.capital}
            onChange={(v) => setIntake({ capital: v })}
            placeholder="例: 3,000,000円"
            locked={locks.intake("capital")}
          />
          <IntakeField
            label="決算月（法人）"
            value={intake.fiscal_month}
            onChange={(v) => setIntake({ fiscal_month: v })}
            placeholder="例: 3月"
            locked={locks.intake("fiscal_month")}
          />
        </div>

        <p className={GROUP_CLASS}>
          常勤職員数（専従者も含む）
          <span className="ml-2 font-medium text-muted">
            {intake.staff_updated_on
              ? `最終更新: ${intake.staff_updated_on}`
              : "未更新（入力すると日付が記録されます）"}
          </span>
        </p>
        <p className={HINT_CLASS}>年に1回情報を更新してください。入力するとその日の日付が自動で記録されます。</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          <IntakeField
            label="日本人"
            value={intake.staff_japanese}
            onChange={(v) => setStaffCount({ staff_japanese: v })}
            locked={locks.intake("staff_japanese")}
          />
          <IntakeField
            label="技能実習生"
            value={intake.staff_trainee}
            onChange={(v) => setStaffCount({ staff_trainee: v })}
            locked={locks.intake("staff_trainee")}
          />
          <IntakeField
            label="特定技能1号"
            value={intake.staff_ssw1}
            onChange={(v) => setStaffCount({ staff_ssw1: v })}
            locked={locks.intake("staff_ssw1")}
          />
          <IntakeField
            label="特定技能2号"
            value={intake.staff_ssw2}
            onChange={(v) => setStaffCount({ staff_ssw2: v })}
            locked={locks.intake("staff_ssw2")}
          />
          <IntakeField
            label="特定活動"
            value={intake.staff_katsudo}
            onChange={(v) => setStaffCount({ staff_katsudo: v })}
            locked={locks.intake("staff_katsudo")}
          />
        </div>

        <p className={GROUP_CLASS}>決算情報（年月が経過したら行を追加）</p>
        <p className={HINT_CLASS}>
          個人事業主は、売上高＝青色決算書の「売上（収入）金額」、経常損益＝「所得金額」、
          純資産＝貸借対照表の「元入金」を記入してください（純損益は記載不要）。
        </p>
        {locks.intake("fiscal_kind") ? (
          <p className="text-xs font-bold">
            <span className="text-muted">区分: </span>
            {intake.fiscal_kind}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-[11px] font-bold text-muted">区分:</span>
            {["個人事業主", "法人"].map((k) => (
              <label key={k} className="flex items-center gap-1.5 text-xs font-bold">
                <input
                  type="radio"
                  name="fiscal-kind"
                  checked={intake.fiscal_kind === k}
                  onChange={() => setIntake({ fiscal_kind: k })}
                  className="h-4 w-4"
                />
                {k}
              </label>
            ))}
          </div>
        )}
        {intake.financials.map((row, i) => (
          <div key={i} className="rounded-xl border border-border p-2.5">
            {/* 期の表記: 個人事業主は「令和◯年分売上情報」、法人は「◯期分（令和◯年◯月分〜令和◯年◯月分）」 */}
            {intake.fiscal_kind === "法人" ? (
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs font-bold">
                <InlineNum
                  value={row.term}
                  onChange={(v) => setFinancial(i, { term: v })}
                  placeholder="12"
                  widthClass="w-14"
                  locked={locks.fin(i, "term")}
                />
                期分（令和
                <InlineNum
                  value={row.period_from}
                  onChange={(v) => setFinancial(i, { period_from: v })}
                  placeholder="7年4月"
                  widthClass="w-20"
                  locked={locks.fin(i, "period_from")}
                />
                分〜令和
                <InlineNum
                  value={row.period_to}
                  onChange={(v) => setFinancial(i, { period_to: v })}
                  placeholder="8年3月"
                  widthClass="w-20"
                  locked={locks.fin(i, "period_to")}
                />
                分）
              </div>
            ) : (
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
                令和
                <InlineNum
                  value={row.year}
                  onChange={(v) => setFinancial(i, { year: v })}
                  placeholder="7"
                  widthClass="w-14"
                  locked={locks.fin(i, "year")}
                />
                年分売上情報
              </div>
            )}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <IntakeField
                label="売上高"
                value={row.sales}
                onChange={(v) => setFinancial(i, { sales: v })}
                locked={locks.fin(i, "sales")}
              />
              <IntakeField
                label="経常損益"
                value={row.ordinary}
                onChange={(v) => setFinancial(i, { ordinary: v })}
                locked={locks.fin(i, "ordinary")}
              />
              {/* 純損益は個人事業主では記載不要のため、選択中は記入できないようにする */}
              {intake.fiscal_kind === "個人事業主" ? (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-muted">純損益</span>
                  <p className="flex min-h-[44px] items-center rounded-xl bg-border/30 px-3 text-[11px] leading-tight text-muted">
                    個人事業主は記入不要
                  </p>
                </div>
              ) : (
                <IntakeField
                  label="純損益"
                  value={row.net}
                  onChange={(v) => setFinancial(i, { net: v })}
                  locked={locks.fin(i, "net")}
                />
              )}
              <IntakeField
                label="純資産"
                value={row.assets}
                onChange={(v) => setFinancial(i, { assets: v })}
                locked={locks.fin(i, "assets")}
              />
            </div>
            {!locks.detail && intake.financials.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setIntake({ financials: intake.financials.filter((_, idx) => idx !== i) })
                }
                className="mt-1.5 text-[11px] font-bold text-seal"
              >
                この期を削除
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setIntake({ financials: [...intake.financials, emptyFinancialYear()] })}
          className="self-start text-xs font-bold text-brand"
        >
          ＋ 期を追加
        </button>

        <IntakeYen
          label="毎月の支援代（1人あたり月額）"
          value={intake.support_fee}
          onChange={(v) => setIntake({ support_fee: v })}
          hint="数字だけを入力してください（例: 20000）。在留カード受領後の売上登録・退職時の日割り計算に使います。"
          locked={locks.intake("support_fee")}
        />
        {locks.intake("posting_note") ? (
          <StaticValue
            label="求人で必須としている他条件（求人情報の画面で注意喚起として表示されます）"
            value={intake.posting_note}
          />
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">
              求人で必須としている他条件（求人情報の画面で注意喚起として表示されます）
            </span>
            <textarea
              value={intake.posting_note}
              onChange={(e) => setIntake({ posting_note: e.target.value })}
              rows={2}
              placeholder="例: 普通自動車免許必須・寮なし など"
              className={`${INPUT_CLASS} min-h-[60px] py-2 leading-relaxed`}
            />
          </label>
        )}

        <p className={GROUP_CLASS}>求人票に記載する内容</p>
        <p className={HINT_CLASS}>
          この会社の求人を登録するときに、求人票の欄へ自動で反映されます（毎回同じ値を入れ直さなくて済みます）。
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <IntakeField
            label="通信費（約・円）"
            value={intake.posting_comm_cost}
            onChange={(v) => setIntake({ posting_comm_cost: v })}
            placeholder="例: 3000／無し"
            hint="徴収しない会社は「無し」と入力してください。"
            locked={locks.intake("posting_comm_cost")}
          />
          <IntakeField
            label="水道光熱費（約・円）"
            value={intake.posting_utility_cost}
            onChange={(v) => setIntake({ posting_utility_cost: digitsOnly(v) })}
            placeholder="例: 8000"
            locked={locks.intake("posting_utility_cost")}
          />
          {locks.intake("posting_utility_kind") ? (
            <StaticValue label="水道光熱費の徴収" value={intake.posting_utility_kind} />
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">水道光熱費の徴収</span>
              <select
                value={intake.posting_utility_kind}
                onChange={(e) => setIntake({ posting_utility_kind: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">—</option>
                <option value="実費">実費</option>
                <option value="固定">固定</option>
              </select>
            </label>
          )}
        </div>
        <IntakeField
          label="通信費を徴収しない理由（聞いていたら記録）"
          value={intake.posting_comm_reason}
          onChange={(v) => setIntake({ posting_comm_reason: v })}
          placeholder="例: Wi-Fiは会社負担で本人契約のスマホ代のみのため など"
          locked={locks.intake("posting_comm_reason")}
        />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <IntakeField
            label="給与の締切日"
            value={intake.posting_pay_closing}
            onChange={(v) => setIntake({ posting_pay_closing: v })}
            placeholder="例: 末日"
            locked={locks.intake("posting_pay_closing")}
          />
          <IntakeField
            label="給与の支払日"
            value={intake.posting_pay_day}
            onChange={(v) => setIntake({ posting_pay_day: v })}
            placeholder="例: 翌月10日"
            locked={locks.intake("posting_pay_day")}
          />
          <IntakeSelect
            label="支払方法"
            value={intake.pay_method}
            onChange={(v) => setIntake({ pay_method: v })}
            options={["口座振込", "通貨払い"]}
            hint="上の「給与支払い方法」と同じ項目です。"
            locked={locks.intake("pay_method")}
          />
        </div>
        {locks.intake("posting_other_conditions") ? (
          <StaticValue
            label="その他（応募条件。採用の際に必ず確認）"
            value={intake.posting_other_conditions}
          />
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">
              その他（応募条件。採用の際に必ず確認）
            </span>
            <textarea
              value={intake.posting_other_conditions}
              onChange={(e) => setIntake({ posting_other_conditions: e.target.value })}
              rows={2}
              placeholder="例: タトゥー（刺青）のある人は不可 など"
              className={`${INPUT_CLASS} min-h-[60px] py-2 leading-relaxed`}
            />
            <span className={HINT_CLASS}>
              求人票の「その他（応募条件）」へ自動で反映されます。タトゥー（刺青）不可などの条件はここに登録しておくと採用の際に見落としません。
            </span>
          </label>
        )}
        {/* 月平均と年間はどちらかを入れると片方が自動で入る（月平均×12＝年間） */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* 「173時間20分」の形で入れても小数（173.3）に自動で直して計算に使う */}
          <IntakeField
            label="月平均所定労働時間数"
            value={intake.posting_monthly_hours}
            onChange={(v) => {
              const n = parseHoursMinutes(v);
              setIntake({
                posting_monthly_hours: v,
                posting_annual_hours:
                  n != null ? String(Math.round(n * 12)) : intake.posting_annual_hours,
              });
            }}
            placeholder="例: 173時間20分／173.3"
            hint={(() => {
              const n = parseHoursMinutes(intake.posting_monthly_hours);
              if (n == null) return "「173時間20分」「173:20」「173.3」のどの形でも入力できます。";
              return `＝ ${formatHoursDecimal(n)}時間（年間 ${Math.round(n * 12)}時間）として自動で計算します。`;
            })()}
            locked={locks.intake("posting_monthly_hours")}
          />
          <IntakeField
            label="年間所定労働時間数"
            value={intake.posting_annual_hours}
            onChange={(v) => {
              const n = parseAmount(v);
              setIntake({
                posting_annual_hours: v,
                posting_monthly_hours:
                  n != null ? String(Math.round((n / 12) * 10) / 10) : intake.posting_monthly_hours,
              });
            }}
            placeholder="例: 2080"
            hint="どちらかを入れるともう片方も自動で入ります。求人票の時給⇔月給換算・手取りプレビューに使います。"
            locked={locks.intake("posting_annual_hours")}
          />
        </div>

        <p className={GROUP_CLASS}>変形労働時間制</p>
        {locks.intake("flex_hours_kind") ? (
          <StaticValue label="変形労働時間制" value={intake.flex_hours_kind} />
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">
              変形労働時間制（求人票へ自動反映されます）
            </span>
            <select
              value={intake.flex_hours_kind}
              onChange={(e) => setIntake({ flex_hours_kind: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">—</option>
              <option value="なし">なし</option>
              <option value="1ヶ月単位">1ヶ月単位</option>
              <option value="1年単位">1年単位</option>
            </select>
          </label>
        )}
        {/* 書類の添付は1年単位の変形労働時間制をとっている会社だけ */}
        {intake.flex_hours_kind === "1年単位" && (
          <>
            <p className={HINT_CLASS}>
              1年単位の変形労働時間制の会社は、年間カレンダーと労使協定書を添付してください。書類は開始日から1年間有効です。求人票の入力画面から確認できます。
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {locks.intake("flex_docs_start") ? (
                <StaticValue label="書類の有効期間の開始日" value={intake.flex_docs_start} />
              ) : (
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-muted">書類の有効期間の開始日</span>
                  <input
                    type="date"
                    value={intake.flex_docs_start}
                    onChange={(e) => setIntake({ flex_docs_start: e.target.value })}
                    className={INPUT_CLASS}
                  />
                </label>
              )}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-muted">有効期限（開始日から1年間）</span>
                {(() => {
                  const until = flexDocsValidUntil(intake.flex_docs_start);
                  const expired = until !== "" && until < todayStr();
                  return (
                    <p
                      className={`flex min-h-[44px] items-center rounded-xl px-3 text-sm font-bold ${
                        expired ? "bg-seal/10 text-seal" : "bg-border/30"
                      }`}
                    >
                      {until
                        ? `${until} まで${expired ? "（期限切れ・新しい書類を添付してください）" : ""}`
                        : "開始日を入力すると自動で入ります"}
                    </p>
                  );
                })()}
              </div>
            </div>
            {orgId ? (
              <>
                <OrgFileAttachments
                  orgId={orgId}
                  kind="年間カレンダー"
                  addLabel="年間カレンダーを追加（画像・PDF）"
                />
                <OrgFileAttachments
                  orgId={orgId}
                  kind="労使協定書"
                  addLabel="労使協定書を追加（画像・PDF）"
                />
              </>
            ) : (
              <p className={HINT_CLASS}>
                年間カレンダー・労使協定書は、会社・機関を登録したあとに編集画面から添付できます。
              </p>
            )}
          </>
        )}

        <p className={GROUP_CLASS}>見積書の添付（複数可）</p>
        {orgId ? (
          <OrgFileAttachments orgId={orgId} kind="見積書" addLabel="見積書を追加（画像・PDF）" />
        ) : (
          <p className={HINT_CLASS}>見積書は、会社・機関を登録したあとに編集画面から添付できます。</p>
        )}

        <p className={GROUP_CLASS}>申請種別ごとの売上明細（freee販売）</p>
        <p className={HINT_CLASS}>
          在留カード受領後の売上登録で、申請種別を選ぶとここに登録した明細が自動で入ります。
          明細項目と金額を必要な行数だけ登録してください（例: 申請取次費用 150000 / 書類作成費 30000）。
          金額は数字だけ・税抜で入力してください（消費税はfreee販売で計算します）。
          あっせん（人材紹介手数料）の明細は、紹介手数料台帳で手数料の初期値になります。
        </p>
        {[...SALES_APP_KINDS, REFERRAL_SALES_KEY].map((kind) => {
          const rows = intake.sales_items[kind] ?? [];
          const setRows = (next: OrgSalesItem[]) =>
            setIntake({ sales_items: { ...intake.sales_items, [kind]: next } });
          return (
            <div key={kind} className="rounded-xl border border-border p-2.5">
              <p className="mb-1.5 text-xs font-bold">
                {kind === REFERRAL_SALES_KEY ? "あっせん（人材紹介手数料）" : kind}
              </p>
              {rows.length === 0 && (
                <p className={HINT_CLASS}>まだ明細がありません。「＋ 明細を追加」から登録してください。</p>
              )}
              <div className="flex flex-col gap-2">
                {rows.map((row, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <IntakeField
                        label="明細項目"
                        value={row.name}
                        onChange={(v) =>
                          setRows(rows.map((r, idx) => (idx === i ? { ...r, name: v } : r)))
                        }
                        placeholder="例: 申請取次費用"
                      />
                    </div>
                    <div className="w-36 shrink-0">
                      <IntakeYen
                        label="金額"
                        value={row.amount}
                        onChange={(v) =>
                          setRows(rows.map((r, idx) => (idx === i ? { ...r, amount: v } : r)))
                        }
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                      className="min-h-[44px] shrink-0 text-[11px] font-bold text-seal"
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setRows([...rows, emptySalesItem()])}
                className="mt-1.5 text-xs font-bold text-brand"
              >
                ＋ 明細を追加
              </button>
            </div>
          );
        })}

        <p className={GROUP_CLASS}>一緒に働く日本人常勤職員（専従者）</p>
        <p className={HINT_CLASS}>記入した職員については、定期報告の際に賃金台帳を提出します。</p>
        {intake.japanese_staff.map((row, i) => (
          <div key={i} className="rounded-xl border border-border p-2.5">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <IntakeField
                label="氏名"
                value={row.name}
                onChange={(v) => setStaff(i, { name: v })}
                locked={locks.staff(i, "name")}
              />
              <IntakeField
                label="役職・職務内容・責任程度"
                value={row.role}
                onChange={(v) => setStaff(i, { role: v })}
                locked={locks.staff(i, "role")}
              />
              <IntakeField
                label="年齢・性別・経験年数"
                value={row.profile}
                onChange={(v) => setStaff(i, { profile: v })}
                placeholder="例: 45歳・男・経験10年"
                locked={locks.staff(i, "profile")}
              />
              <IntakeField
                label="報酬（月給/時給）"
                value={row.pay}
                onChange={(v) => setStaff(i, { pay: v })}
                placeholder="例: 月給250,000円"
                locked={locks.staff(i, "pay")}
              />
            </div>
            {!locks.detail && intake.japanese_staff.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setIntake({ japanese_staff: intake.japanese_staff.filter((_, idx) => idx !== i) })
                }
                className="mt-1.5 text-[11px] font-bold text-seal"
              >
                この職員を削除
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setIntake({ japanese_staff: [...intake.japanese_staff, emptyJapaneseStaff()] })}
          className="self-start text-xs font-bold text-brand"
        >
          ＋ 職員を追加
        </button>
        {locks.intake("wage_parity_reason") ? (
          <StaticValue
            label="特定技能外国人の報酬が日本人と同等以上であると考えられる理由"
            value={intake.wage_parity_reason}
          />
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">
              特定技能外国人の報酬が日本人と同等以上であると考えられる理由
            </span>
            <textarea
              value={intake.wage_parity_reason}
              onChange={(e) => setIntake({ wage_parity_reason: e.target.value })}
              rows={3}
              className={`${INPUT_CLASS} min-h-[70px] py-2 leading-relaxed`}
            />
          </label>
        )}

        <p className={GROUP_CLASS}>労災保険・雇用保険</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <IntakeSelect
            label="労災保険の適用事業所か"
            value={intake.rosai_covered}
            onChange={(v) => setIntake({ rosai_covered: v })}
            options={["はい", "いいえ"]}
            hint="民間の労災保険に加入の場合は、保険証の写しをもらってください。"
            locked={locks.intake("rosai_covered")}
          />
          <IntakeField
            label="労働保険番号"
            value={intake.rosai_no}
            onChange={(v) => setIntake({ rosai_no: v })}
            locked={locks.intake("rosai_no")}
          />
          <IntakeSelect
            label="雇用保険の適用事業所か"
            value={intake.koyo_covered}
            onChange={(v) => setIntake({ koyo_covered: v })}
            options={["はい", "いいえ"]}
            locked={locks.intake("koyo_covered")}
          />
          <IntakeField
            label="雇用保険適用事業所番号"
            value={intake.koyo_no}
            onChange={(v) => setIntake({ koyo_no: v })}
            hint="末尾4桁は割り振られている場合のみ記入。"
            locked={locks.intake("koyo_no")}
          />
        </div>

        <p className={GROUP_CLASS}>寮・宿泊物件の情報（特定技能外国人の宿泊先）</p>
        <p className={HINT_CLASS}>女子寮・男子寮など物件が複数ある場合は「＋ 寮を追加」で登録してください。</p>
        {intake.lodgings.map((lodging, i) => (
          <div key={lodging.id} className="flex flex-col gap-2.5 rounded-xl border border-border p-2.5">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <IntakeField
                label="寮の名前"
                value={lodging.name}
                onChange={(v) => setLodging(i, { name: v })}
                placeholder="例: 女子寮 / 男子寮 / 第1寮"
                locked={locks.lodging(i, "name")}
              />
              <IntakeField
                label="宿泊住所"
                value={lodging.address}
                onChange={(v) => setLodging(i, { address: v })}
                placeholder="〒　住所"
                locked={locks.lodging(i, "address")}
              />
            </div>
            {locks.lodging(i, "kind") ? (
              <p className="text-xs font-bold">
                <span className="text-muted">宿泊物件の区分: </span>
                {lodging.kind}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-[11px] font-bold text-muted">宿泊物件の区分:</span>
                {["自己所有物件", "賃貸物件"].map((k) => (
                  <label key={k} className="flex items-center gap-1.5 text-xs font-bold">
                    <input
                      type="radio"
                      name={`lodging-kind-${lodging.id}`}
                      checked={lodging.kind === k}
                      onChange={() => setLodging(i, { kind: k })}
                      className="h-4 w-4"
                    />
                    {k}
                  </label>
                ))}
              </div>
            )}
            {lodging.kind === "自己所有物件" && (
              <>
                {/* 新品/中古から耐用年数の目安を自動で入れる（木造住宅22年・中古は簡便法）。
                    入れたあとの微調整は耐用年数の欄で直せる */}
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-[11px] font-bold text-muted">購入時の状態:</span>
                  {["新品", "中古"].map((k) => (
                    <label key={k} className="flex items-center gap-1.5 text-xs font-bold">
                      <input
                        type="radio"
                        name={`lodging-state-${lodging.id}`}
                        checked={lodging.purchase_state === k}
                        onChange={() => {
                          const years = suggestedUsefulYears(k, lodging.elapsed_years);
                          setLodging(i, {
                            purchase_state: k,
                            useful_years: years != null ? String(years) : lodging.useful_years,
                          });
                        }}
                        className="h-4 w-4"
                      />
                      {k}
                    </label>
                  ))}
                </div>
                {lodging.purchase_state === "中古" && (
                  <IntakeField
                    label="購入時の築年数（年）"
                    value={lodging.elapsed_years}
                    onChange={(v) => {
                      const years = suggestedUsefulYears("中古", v);
                      setLodging(i, {
                        elapsed_years: v,
                        useful_years: years != null ? String(years) : lodging.useful_years,
                      });
                    }}
                    placeholder="例: 25"
                    hint={`築年数から耐用年数の目安を自動で入れます（木造住宅${WOODEN_USEFUL_YEARS}年・中古の簡便法）。`}
                    locked={locks.lodging(i, "elapsed_years")}
                  />
                )}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <IntakeField
                    label="かかった総費用（円）"
                    value={lodging.total_cost}
                    onChange={(v) => setLodging(i, { total_cost: v })}
                    placeholder="例: 15,000,000"
                    locked={locks.lodging(i, "total_cost")}
                  />
                  <IntakeField
                    label="備品代（円）"
                    value={lodging.equipment_cost}
                    onChange={(v) => setLodging(i, { equipment_cost: v })}
                    placeholder="例: 500,000"
                    locked={locks.lodging(i, "equipment_cost")}
                  />
                  <IntakeField
                    label="耐用年数（年）"
                    value={lodging.useful_years}
                    onChange={(v) => setLodging(i, { useful_years: v })}
                    placeholder="例: 22"
                    hint="新品/中古を選ぶと目安が自動で入ります。直すこともできます。"
                    locked={locks.lodging(i, "useful_years")}
                  />
                </div>
                <CalcResult
                  label="1ヶ月分の家賃代・物件全体（(総費用＋備品代) ÷ (耐用年数×12)）"
                  value={ownedMonthlyRent(
                    lodging.total_cost,
                    lodging.equipment_cost,
                    lodging.useful_years,
                  )}
                  emptyHint="総費用と耐用年数を入力すると自動計算されます"
                />
                <CalcResult
                  label="1人あたりの家賃の目安（物件全体の家賃 ÷ 最大入居人数）"
                  value={(() => {
                    const whole = ownedMonthlyRent(
                      lodging.total_cost,
                      lodging.equipment_cost,
                      lodging.useful_years,
                    );
                    const n = parseAmount(lodging.max_residents);
                    return whole != null && n != null ? Math.round(whole / n) : null;
                  })()}
                  emptyHint="総費用・耐用年数・最大入居人数を入力すると自動計算されます"
                />
                {/* 家賃から逆算: この家賃で説明するには最低これぐらいの費用がかかった想定になる */}
                {(() => {
                  const reverse = reverseLodgingCost(
                    lodging.rent,
                    lodging.max_residents,
                    lodging.useful_years,
                  );
                  if (reverse == null) return null;
                  return (
                    <div className="rounded-xl border border-dashed border-border bg-background p-2.5">
                      <p className="text-[11px] font-bold text-muted">
                        家賃からの逆算（1人あたり家賃 × 最大入居人数 × 耐用年数 × 12）
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed">
                        この1人あたりの家賃（月額）で説明するには、かかった総費用＋備品代が
                        <span className="font-bold"> 約{formatYen(reverse)} </span>
                        かかった想定になります。
                      </p>
                      {!locks.lodging(i, "total_cost") && (
                        <button
                          type="button"
                          onClick={() => setLodging(i, { total_cost: String(reverse) })}
                          className="mt-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-brand"
                        >
                          この金額を「かかった総費用」に入れる（あとで微調整できます）
                        </button>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
            {lodging.kind === "賃貸物件" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted">賃貸契約書のコピー（複数可）</span>
                {orgId ? (
                  <OrgFileAttachments
                    orgId={orgId}
                    kind={lodgingContractKind(lodging)}
                    addLabel="賃貸契約書を追加（画像・PDF）"
                  />
                ) : (
                  <p className={HINT_CLASS}>賃貸契約書は、会社・機関を登録したあとに編集画面から添付できます。</p>
                )}
              </div>
            )}
            {lodging.kind && (
              <>
                {/* 家賃は「1人あたり」で登録する（賃金の別紙・求人票の居住費にそのまま使う） */}
                <div className="grid grid-cols-2 gap-2.5">
                  <IntakeField
                    label="家賃（1人あたり・月額・円）"
                    value={lodging.rent}
                    onChange={(v) => setLodging(i, { rent: v })}
                    placeholder="例: 13,000"
                    hint={
                      lodging.kind === "自己所有物件"
                        ? "上の「1人あたりの家賃の目安」を参考に入力してください。"
                        : "物件全体の家賃を最大入居人数で割った1人あたりの金額を入力してください。"
                    }
                    locked={locks.lodging(i, "rent")}
                  />
                  <IntakeField
                    label="最大入居人数"
                    value={lodging.max_residents}
                    onChange={(v) => setLodging(i, { max_residents: v })}
                    placeholder="例: 3"
                    locked={locks.lodging(i, "max_residents")}
                  />
                </div>
                <CalcResult
                  label="物件全体の家賃（1人あたり × 最大入居人数）"
                  value={(() => {
                    const r = parseAmount(lodging.rent);
                    const n = parseAmount(lodging.max_residents);
                    return r != null && n != null ? Math.round(r * n) : null;
                  })()}
                  emptyHint="1人あたりの家賃と最大入居人数を入力すると自動計算されます"
                />
              </>
            )}
            {!locks.detail && intake.lodgings.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setIntake({ lodgings: intake.lodgings.filter((_, idx) => idx !== i) })
                }
                className="self-start text-[11px] font-bold text-seal"
              >
                この寮を削除
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setIntake({ lodgings: [...intake.lodgings, emptyLodging(crypto.randomUUID())] })}
          className="self-start text-xs font-bold text-brand"
        >
          ＋ 寮を追加
        </button>

        <p className={GROUP_CLASS}>その他</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <IntakeField
            label="労働者の雇用開始日（国籍問わず・大体で可）"
            value={intake.first_hired_on}
            onChange={(v) => setIntake({ first_hired_on: v })}
            placeholder="例: 2015年4月頃〜"
            locked={locks.intake("first_hired_on")}
          />
          <IntakeField
            label="過去1年間の行方不明者数（特定技能）"
            value={intake.missing_ssw}
            onChange={(v) => setIntake({ missing_ssw: v })}
            locked={locks.intake("missing_ssw")}
          />
          <IntakeField
            label="過去1年間の行方不明者数（技能実習生）"
            value={intake.missing_trainee}
            onChange={(v) => setIntake({ missing_trainee: v })}
            locked={locks.intake("missing_trainee")}
          />
        </div>
        <p className={GROUP_CLASS}>協力確認書の提出（提出先・提出日）</p>
        <p className={HINT_CLASS}>
          提出先と提出日を分けて記録します。複数ある場合は「＋提出を追加」で行を足してください。協議会の加入通知書などがある場合はコピーをもらってください。
        </p>
        <CouncilSubmissionRows
          label="特定技能外国人の活動する事業所の所在地での提出"
          rows={intake.council_office_submissions}
          onChange={(rows) => setIntake({ council_office_submissions: rows })}
        />
        <CouncilSubmissionRows
          label="特定技能外国人の住居地での提出"
          rows={intake.council_residence_submissions}
          onChange={(rows) => setIntake({ council_residence_submissions: rows })}
        />
        <IntakeField
          label="協議会の加入メモ（旧: 提出先・提出日をまとめて書いていた欄）"
          value={intake.council_note}
          onChange={(v) => setIntake({ council_note: v })}
          hint="以前この欄にまとめて書いていた提出先・提出日は、上の欄へ分けて記録し直せます。"
          locked={locks.intake("council_note")}
        />

        <p className={GROUP_CLASS}>定期報告・賃金台帳（毎年の提出データ）</p>
        {orgId ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <OrgYearlyFiles
              orgId={orgId}
              baseKind="定期報告書"
              label="定期報告書の提出データ"
              hint="毎年の定期報告で提出したデータです。追加で提出した書類も同じ年度にアップロードできます。"
            />
            <OrgYearlyFiles
              orgId={orgId}
              baseKind="賃金台帳"
              label="賃金台帳"
              hint="毎年の賃金台帳のデータをアップロードして保存します。"
            />
          </div>
        ) : (
          <p className={HINT_CLASS}>
            定期報告・賃金台帳のデータは、会社・機関を登録したあとに編集画面から添付できます。
          </p>
        )}

        <p className={GROUP_CLASS}>所属役員（法人の場合）</p>
        <p className={HINT_CLASS}>
          特定技能外国人の受入れ業務の執行に直接関与しない役員はチェックしてください。
        </p>
        {intake.officers.map((row, i) => (
          <div key={i} className="rounded-xl border border-border p-2.5">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <IntakeField
                label="ふりがな"
                value={row.kana}
                onChange={(v) => setOfficer(i, { kana: v })}
                locked={locks.officerField(i, "kana")}
              />
              <IntakeField
                label="氏名"
                value={row.name}
                onChange={(v) => setOfficer(i, { name: v })}
                locked={locks.officerField(i, "name")}
              />
              <IntakeField
                label="役職"
                value={row.title}
                onChange={(v) => setOfficer(i, { title: v })}
                locked={locks.officerField(i, "title")}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={row.not_involved}
                  onChange={(e) => setOfficer(i, { not_involved: e.target.checked })}
                  disabled={locks.officerRow(i)}
                  className="h-4 w-4"
                />
                受入れ業務の執行に直接関与しない
              </label>
              {!locks.detail && intake.officers.length > 1 && (
                <button
                  type="button"
                  onClick={() => setIntake({ officers: intake.officers.filter((_, idx) => idx !== i) })}
                  className="text-[11px] font-bold text-seal"
                >
                  この役員を削除
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setIntake({ officers: [...intake.officers, emptyOfficer()] })}
          className="self-start text-xs font-bold text-brand"
        >
          ＋ 役員を追加
        </button>
      </div>
    </div>
  );
}

// 協力確認書の提出（提出先・提出日）の複数行入力。行の追加・削除ができる
function CouncilSubmissionRows({
  label,
  rows,
  onChange,
}: {
  label: string;
  rows: OrgCouncilSubmission[];
  onChange: (rows: OrgCouncilSubmission[]) => void;
}) {
  const setRow = (i: number, patch: Partial<OrgCouncilSubmission>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="rounded-xl border border-border p-2.5">
      <p className="mb-1.5 text-xs font-bold">{label}</p>
      <div className="flex flex-col gap-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
              <span className="text-[11px] text-muted">提出先</span>
              <input
                value={row.to}
                onChange={(e) => setRow(i, { to: e.target.value })}
                placeholder="例: 農業特定技能協議会"
                className="min-h-[40px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">提出日</span>
              <input
                type="date"
                value={row.on}
                onChange={(e) => setRow(i, { on: e.target.value })}
                className="min-h-[40px] rounded-xl border border-border bg-background px-2 text-sm focus:border-brand focus:outline-none"
              />
            </label>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                aria-label="この提出を削除"
                className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg border border-border text-seal"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...rows, emptyCouncilSubmission()])}
        className="mt-1.5 text-xs font-bold text-brand"
      >
        ＋ 提出を追加
      </button>
    </div>
  );
}

// 毎年の提出データ（定期報告書・賃金台帳）。年度ラベルごとにまとめて保存・表示する
export function OrgYearlyFiles({
  orgId,
  baseKind,
  label,
  hint,
}: {
  orgId: string;
  baseKind: string; // 定期報告書 / 賃金台帳
  label: string;
  hint?: string;
}) {
  const [files, setFiles] = useState<OrganizationFileRow[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // どの年度（kind）へアップロードするか。空文字は新しい年度ラベル入力を使う
  const uploadKindRef = useRef<string>(baseKind);

  const load = () =>
    listOrganizationFiles(createClient(), orgId)
      .then((rows) =>
        setFiles(rows.filter((r) => r.kind === baseKind || r.kind.startsWith(`${baseKind}:`))),
      )
      .catch(() => undefined);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, baseKind]);

  const groups = orgYearlyFileGroups(files, baseKind);

  function startUpload(kind: string) {
    uploadKindRef.current = kind;
    inputRef.current?.click();
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const kind = uploadKindRef.current;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        const { blob, mimeType, fileName } = await compressImage(file);
        const ticket = await createOrgFileTicket(orgId, fileName, mimeType);
        if (!ticket.ok) throw new Error(ticket.message);
        const { error: upErr } = await createClient()
          .storage.from("app-files")
          .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
        if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
        const res = await registerOrgFile(orgId, kind, ticket.path, fileName, mimeType);
        if (!res.ok) throw new Error(res.message);
      }
      setNewLabel("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function preview(id: string) {
    const res = await getOrgFilePreviewUrl(id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  }

  async function remove(f: OrganizationFileRow) {
    if (!window.confirm(`「${f.file_name}」を削除します。よろしいですか？`)) return;
    setError(null);
    const res = await deleteOrgFile(f.id);
    if (res.ok) setFiles((prev) => prev.filter((x) => x.id !== f.id));
    else setError(res.message);
  }

  return (
    <div className="rounded-xl border border-border p-2.5">
      <p className="text-xs font-bold">{label}</p>
      {hint && <p className={`${HINT_CLASS} mb-1.5`}>{hint}</p>}
      {error && <p className="mb-1.5 rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
      <div className="flex flex-col gap-2">
        {groups.map((g) => (
          <div key={g.kind} className="rounded-lg bg-background p-2">
            <p className="mb-1 flex items-center justify-between gap-2 text-[11px] font-bold text-muted">
              {g.label || "年度未設定"}
              <button
                type="button"
                onClick={() => startUpload(g.kind)}
                disabled={busy}
                className="font-bold text-brand disabled:opacity-50"
              >
                ＋ この年度に追加
              </button>
            </p>
            <div className="flex flex-col gap-1">
              {g.files.map((f) => (
                <div key={f.id} className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{f.file_name}</span>
                  <button
                    type="button"
                    onClick={() => void preview(f.id)}
                    aria-label="表示"
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted hover:text-brand"
                  >
                    <Eye size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(f)}
                    aria-label="削除"
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-seal"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="年度（例: 令和7年）"
            className="min-h-[36px] w-32 rounded-lg border border-border bg-background px-2 text-xs focus:border-brand focus:outline-none"
          />
          <button
            type="button"
            onClick={() => startUpload(orgYearlyKind(baseKind, newLabel))}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-brand px-3 py-2 text-xs font-bold text-brand disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {busy ? "アップロード中…" : "アップロード"}
          </button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// 会社・機関へのファイル添付（見積書・賃貸契約書など・複数可）。kind で種類を分けて保存する
export function OrgFileAttachments({
  orgId,
  kind,
  addLabel,
}: {
  orgId: string;
  kind: string;
  addLabel: string;
}) {
  const [files, setFiles] = useState<OrganizationFileRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    listOrganizationFiles(createClient(), orgId)
      .then((rows) => {
        if (!cancelled) setFiles(rows.filter((r) => r.kind === kind));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [orgId, kind]);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        const { blob, mimeType, fileName } = await compressImage(file);
        const ticket = await createOrgFileTicket(orgId, fileName, mimeType);
        if (!ticket.ok) throw new Error(ticket.message);
        const { error: upErr } = await createClient()
          .storage.from("app-files")
          .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
        if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
        const res = await registerOrgFile(orgId, kind, ticket.path, fileName, mimeType);
        if (!res.ok) throw new Error(res.message);
      }
      setFiles((await listOrganizationFiles(createClient(), orgId)).filter((r) => r.kind === kind));
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function preview(id: string) {
    const res = await getOrgFilePreviewUrl(id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  }

  async function remove(f: OrganizationFileRow) {
    if (!window.confirm(`「${f.file_name}」を削除します。よろしいですか？`)) return;
    setError(null);
    const res = await deleteOrgFile(f.id);
    if (res.ok) setFiles((prev) => prev.filter((x) => x.id !== f.id));
    else setError(res.message);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
      {files.map((f) => (
        <div key={f.id} className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{f.file_name}</span>
          <button
            type="button"
            onClick={() => preview(f.id)}
            aria-label="表示"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted hover:text-brand"
          >
            <Eye size={13} />
          </button>
          <button
            type="button"
            onClick={() => remove(f)}
            aria-label="削除"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-seal"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex items-center gap-1.5 self-start rounded-lg border border-dashed border-brand px-3 py-2 text-xs font-bold text-brand disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
        {busy ? "アップロード中…" : addLabel}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
