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
import { PREP_TANTOU_OPTIONS } from "@/lib/application-prep";
import { todayStr } from "@/lib/ssw/calc";
import {
  emptyFinancialYear,
  emptyJapaneseStaff,
  emptyLodging,
  emptyOfficer,
  emptyOrganizationIntake,
  formatYen,
  lodgingContractKind,
  normalizeOrganizationIntake,
  ownedMonthlyRent,
  perResidentCost,
} from "@/lib/organization-intake";
import type {
  OrgFinancialYear,
  OrgJapaneseStaff,
  OrgLodging,
  OrgOfficer,
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

// 担当職員の選択肢。名簿から外れた保存済みの名前も選択肢として残す
function staffOptions(current: string): string[] {
  const options: string[] = [...PREP_TANTOU_OPTIONS];
  if (current && !options.includes(current)) options.unshift(current);
  return options;
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
}: {
  form: OrganizationInput;
  setForm: React.Dispatch<React.SetStateAction<OrganizationInput>>;
  orgId: string | null;
  snapshot: OrganizationInput | null;
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

  return (
    <>
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
      {/* 連絡先の下: 定期報告書・随時報告書の担当者名（退職の随時報告書へ自動転記） */}
      <IntakeField
        label="定期報告書・随時報告書の担当者名"
        value={intake.report_staff}
        onChange={(v) => setIntake({ report_staff: v })}
        placeholder="例: 井上　有基"
        hint="退職＜随時報告＞の様式（3-1-2号・3-4号）の届出機関担当者欄に自動転記されます。"
        locked={locks.intake("report_staff")}
      />
      {/* この機関の担当職員（主・副）。外国人詳細・申請一覧・ダッシュボードに表示され、
          申請一覧では担当者での絞り込みに使う */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <IntakeSelect
          label="この機関の主担当"
          value={intake.staff_primary}
          onChange={(v) => setIntake({ staff_primary: v })}
          options={staffOptions(intake.staff_primary)}
          hint="会社との窓口・進捗管理の責任者。外国人詳細・申請一覧・ダッシュボードに表示されます。"
          locked={locks.intake("staff_primary")}
        />
        <IntakeSelect
          label="この機関の副担当"
          value={intake.staff_secondary}
          onChange={(v) => setIntake({ staff_secondary: v })}
          options={staffOptions(intake.staff_secondary)}
          hint="主担当が不在のときのバックアップ。"
          locked={locks.intake("staff_secondary")}
        />
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

      <IntakeSection intake={intake} setIntake={setIntake} orgId={orgId} locks={locks} />
    </>
  );
}

// 登録支援機関への申込書の内容。折りたたまず最初から全項目を表示する
function IntakeSection({
  intake,
  setIntake,
  orgId,
  locks,
}: {
  intake: OrganizationIntake;
  setIntake: (patch: Partial<OrganizationIntake>) => void;
  orgId: string | null; // 見積書の添付に使う（新規登録時は保存後に添付可）
  locks: FieldLocks;
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
        <IntakeField
          label="名称のフリガナ"
          value={intake.kana}
          onChange={(v) => setIntake({ kana: v })}
          locked={locks.intake("kana")}
        />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
            label="年金（事業所としての適用内容）"
            value={intake.pension}
            onChange={(v) => setIntake({ pension: v })}
            options={["国民年金", "厚生年金"]}
            locked={locks.intake("pension")}
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
              <IntakeField
                label="純損益"
                value={row.net}
                onChange={(v) => setFinancial(i, { net: v })}
                locked={locks.fin(i, "net")}
              />
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

        <IntakeField
          label="毎月の支援代（月額）"
          value={intake.support_fee}
          onChange={(v) => setIntake({ support_fee: v })}
          placeholder="例: 20,000円/人"
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

        <p className={GROUP_CLASS}>見積書の添付（複数可）</p>
        {orgId ? (
          <OrgFileAttachments orgId={orgId} kind="見積書" addLabel="見積書を追加（画像・PDF）" />
        ) : (
          <p className={HINT_CLASS}>見積書は、会社・機関を登録したあとに編集画面から添付できます。</p>
        )}

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
                    locked={locks.lodging(i, "useful_years")}
                  />
                </div>
                <CalcResult
                  label="1ヶ月分の家賃代（(総費用＋備品代) ÷ (耐用年数×12)）"
                  value={ownedMonthlyRent(
                    lodging.total_cost,
                    lodging.equipment_cost,
                    lodging.useful_years,
                  )}
                  emptyHint="総費用と耐用年数を入力すると自動計算されます"
                />
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
                <div className="grid grid-cols-2 gap-2.5">
                  <IntakeField
                    label="家賃（月額・円）"
                    value={lodging.rent}
                    onChange={(v) => setLodging(i, { rent: v })}
                    placeholder="例: 60,000"
                    hint={lodging.kind === "自己所有物件" ? "上の自動計算の金額を参考に入力してください。" : undefined}
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
                  label="1人あたりの居住費用（家賃 ÷ 最大入居人数）"
                  value={perResidentCost(lodging.rent, lodging.max_residents)}
                  emptyHint="家賃と最大入居人数を入力すると自動計算されます"
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
        <IntakeField
          label="協議会の加入・協力確認書（提出先・提出日など）"
          value={intake.council_note}
          onChange={(v) => setIntake({ council_note: v })}
          hint="協議会の加入通知書などがある場合はコピーをもらってください。"
          locked={locks.intake("council_note")}
        />

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
