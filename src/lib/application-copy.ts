// 申請準備 ＞ 申請書（在留資格変更許可申請書：申請人等作成用 1〜3・所属機関等作成用 1〜4）に
// 貼り付ける項目を、外国人・所属機関・賃金・職歴・支援計画書の日付から組み立てる。
// 画面ではこの一覧を項目ごとにコピーできる。
// 項目の並びと名前は、実際に使っている申請書のエクセル（別記第三十号様式）に合わせている。

import type { Organization, OrganizationIntake, Worker, WorkerWage } from "@/types/db";
import type { WorkHistory } from "@/types/ssw";
import { calcSsw } from "@/lib/ssw/calc";
import { currentWage, hourlyFromMonthly, monthlyFromHourly } from "@/lib/wage";
import { formatHoursDecimal, parseHoursMinutes } from "@/lib/organization-intake";
import { effectiveResidencePeriod } from "@/lib/residence-card";
import { CUSTODIAN_INFO } from "@/lib/custody";
import { RESUME_LANG_JA } from "@/lib/resume-tool/i18n";
import { resumeLangForNationality } from "@/lib/resume-tool/share";
import { contractPeriodEnd, formatYmdJa } from "@/lib/support-plan-dates";

export interface CopyItem {
  label: string;
  value: string; // 空なら未登録
  parts?: string[]; // 年・月・日など、欄が分かれているときに1つずつコピーできる部品
  note?: string; // 補足（どこから取ったか・注意）
}

export interface CopyGroup {
  title: string;
  items: CopyItem[];
}

export type CopyWorker = Pick<
  Worker,
  | "name"
  | "kana"
  | "nationality"
  | "birth"
  | "gender"
  | "has_spouse"
  | "field"
  | "home_address"
  | "address"
  | "passport_no"
  | "passport_expiry_date"
  | "residence_status"
  | "residence_period"
  | "residence_permit_date"
  | "residence_expiry_date"
  | "residence_card_no"
  | "employment_start_on"
>;

export interface ApplicationCopyInput {
  worker: CopyWorker;
  org: Pick<Organization, "name" | "industry" | "business_category" | "address" | "contact" | "corporate_no"> | null;
  intake: OrganizationIntake | null;
  wages: WorkerWage[];
  histories: WorkHistory[]; // 職歴（calc の形）
  planDates: Record<string, string>; // 支援計画書の日付（es = 雇用開始日 など）
  desiredStatus?: string; // 希望する在留資格（申請種別から）
  today?: string;
}

// YYYY-MM-DD → ["1995", "4", "2"]（欄が年・月・日に分かれている申請書用）
export function ymdParts(ymd: string | null | undefined): string[] | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((ymd ?? "").trim());
  if (!m) return undefined;
  return [m[1], String(Number(m[2])), String(Number(m[3]))];
}

// 年月だけ（職歴の入社・退社）: "2017-11-01" → ["2017", "11"]
function ymParts(ymd: string | null | undefined): string[] {
  const p = ymdParts(ymd);
  return p ? [p[0], p[1]] : ["", ""];
}

const dateItem = (label: string, ymd: string | null | undefined, note?: string): CopyItem => ({
  label,
  value: ymd ? formatYmdJa(ymd) : "",
  parts: ymdParts(ymd),
  note,
});

const yen = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "" : String(Math.round(n)));

// 常勤職員数（日本人・技能実習生・特定技能・特定活動の合計）
export function totalStaff(intake: OrganizationIntake | null): string {
  if (!intake) return "";
  const nums = [intake.staff_japanese, intake.staff_trainee, intake.staff_ssw1, intake.staff_ssw2, intake.staff_katsudo]
    .map((v) => Number.parseInt((v ?? "").replace(/[^\d]/g, ""), 10))
    .filter((n) => Number.isFinite(n));
  return nums.length === 0 ? "" : String(nums.reduce((a, b) => a + b, 0));
}

// 月額報酬と基本給の時間換算額（登録している賃金と所定労働時間から）
export function wageForApplication(
  wages: WorkerWage[],
  intake: OrganizationIntake | null,
  employmentStartOn: string | null,
): { monthly: string; hourly: string; note: string } {
  const w = currentWage(wages, undefined, employmentStartOn);
  if (!w) return { monthly: "", hourly: "", note: "賃金が未登録です（外国人詳細の賃金）" };
  const annual = Number.parseFloat(intake?.posting_annual_hours ?? "") || 0;
  if (w.kind === "月給") {
    const h = hourlyFromMonthly(w.amount, annual);
    return {
      monthly: String(w.amount),
      hourly: yen(h),
      note: h == null ? "所属機関の年間所定労働時間が未登録のため時間換算できません" : `月給 ÷（年間所定労働時間 ${annual}時間 ÷ 12）`,
    };
  }
  if (w.kind === "時給") {
    const m = monthlyFromHourly(w.amount, annual);
    return {
      monthly: yen(m),
      hourly: String(w.amount),
      note: m == null ? "所属機関の年間所定労働時間が未登録のため月額に換算できません" : `時給 ×（年間所定労働時間 ${annual}時間 ÷ 12）`,
    };
  }
  return { monthly: "", hourly: "", note: `賃金の区分が${w.kind}のため換算していません` };
}

export function buildApplicationCopyGroups(input: ApplicationCopyInput): CopyGroup[] {
  const { worker: w, org, intake, wages, histories, planDates } = input;
  const ssw = calcSsw(histories, input.today);
  const es = planDates.es || w.employment_start_on || "";
  const ee = es ? contractPeriodEnd(es) : "";
  const wage = wageForApplication(wages, intake, w.employment_start_on);
  const weekly = intake?.posting_weekly_hours ?? "";
  const monthlyHours = parseHoursMinutes(intake?.posting_monthly_hours ?? "");
  const lang = resumeLangForNationality(w.nationality);

  const applicant1: CopyItem[] = [
    { label: "1 国籍・地域", value: w.nationality },
    dateItem("2 生年月日", w.birth),
    { label: "3 氏名", value: w.name, note: w.kana ? `フリガナ: ${w.kana}` : undefined },
    { label: "4 性別", value: w.gender },
    { label: "6 配偶者の有無", value: w.has_spouse },
    { label: "7 職業", value: w.field },
    { label: "8 本国における居住地", value: w.home_address },
    { label: "9 住居地", value: w.address },
    { label: "10 旅券 (1)番号", value: w.passport_no },
    dateItem("10 旅券 (2)有効期限", w.passport_expiry_date),
    { label: "11 現に有する在留資格", value: w.residence_status },
    { label: "11 在留期間", value: effectiveResidencePeriod(w) },
    dateItem("11 在留期間の満了日", w.residence_expiry_date),
    { label: "12 在留カード番号", value: w.residence_card_no },
    { label: "13 希望する在留資格", value: input.desiredStatus ?? "" },
  ];

  const applicant2: CopyItem[] = [
    { label: "17 特定技能所属機関 (1)氏名又は名称", value: org?.name ?? "" },
    { label: "17 (2)住所（所在地）", value: org?.address ?? "" },
    { label: "17 電話番号", value: org?.contact ?? "" },
    {
      label: "21 申請時における特定技能1号での通算在留期間",
      value: ssw.usedDays > 0 ? `${ssw.used.y}年${ssw.used.m}月` : "",
      parts: ssw.usedDays > 0 ? [String(ssw.used.y), String(ssw.used.m)] : undefined,
      note: "職歴の通算（特定技能1号の期間）から",
    },
  ];

  const careers: CopyItem[] = [...histories]
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .map((h) => {
      const [sy, sm] = ymParts(h.start);
      const [ey, em] = h.end ? ymParts(h.end) : ["現在", ""];
      return {
        label: "28 職歴",
        value: `${sy}年${sm}月〜${h.end ? `${ey}年${em}月` : "現在"} ${h.org}`,
        parts: [sy, sm, ey, em, h.org],
      };
    });

  const organization1: CopyItem[] = [
    { label: "1 雇用している外国人の氏名", value: w.name },
    {
      label: "2 (1)雇用契約期間",
      value: es ? `${formatYmdJa(es)} から ${formatYmdJa(ee)} まで` : "",
      parts: es ? [...(ymdParts(es) ?? []), ...(ymdParts(ee) ?? [])] : undefined,
      note: "雇用開始日から2年間（終了日は2年後の前日）",
    },
    { label: "2 (2)特定産業分野", value: w.field || org?.industry || "" },
    { label: "2 (2)業務区分", value: org?.business_category ?? "" },
    { label: "2 (3)所定労働時間（週平均）", value: weekly, note: "所属機関 ＞ 週平均所定労働時間数" },
    {
      label: "2 (3)所定労働時間（月平均）",
      value: monthlyHours != null ? formatHoursDecimal(monthlyHours) : (intake?.posting_monthly_hours ?? ""),
      note: "所属機関 ＞ 月平均所定労働時間数",
    },
    { label: "2 (4)月額報酬", value: wage.monthly, note: wage.note },
    { label: "2 (4)基本給の時間換算額", value: wage.hourly },
    { label: "2 (5)報酬の支払方法", value: intake?.pay_method ?? "" },
  ];

  const organization2: CopyItem[] = [
    { label: "3 (1)氏名又は名称", value: org?.name ?? "" },
    { label: "3 (2)法人番号（13桁）", value: org?.corporate_no ?? "" },
    { label: "3 (3)雇用保険適用事業所番号（11桁）", value: intake?.koyo_no ?? "" },
    { label: "3 (4)業種", value: org?.industry ?? "" },
    { label: "3 (5)住所（所在地）", value: org?.address ?? "" },
    { label: "3 (5)電話番号", value: org?.contact ?? "" },
    { label: "3 (6)資本金", value: intake?.capital ?? "" },
    { label: "3 (7)年間売上金額（直近年度）", value: intake?.financials.find((f) => f.sales)?.sales ?? "" },
    { label: "3 (8)常勤職員数", value: totalStaff(intake), note: "日本人・技能実習生・特定技能・特定活動の合計" },
    { label: "3 (9)代表者の氏名", value: intake?.rep_name ?? "" },
    { label: "3 (10)勤務させる事業所名", value: org?.name ?? "" },
    { label: "3 (10)所在地", value: intake?.work_address || org?.address || "" },
    {
      label: "健康保険及び厚生年金保険の適用事業所",
      value: intake?.health_insurance === "社会保険" ? "有" : intake?.health_insurance ? "無" : "",
      note: "所属機関の保険（社会保険なら有）",
    },
    {
      label: "労災保険及び雇用保険の適用事業所",
      value: intake?.rosai_covered === "はい" && intake?.koyo_covered === "はい" ? "有" : intake?.rosai_covered || intake?.koyo_covered ? "無" : "",
      note: "所属機関の労災・雇用保険の登録から",
    },
    { label: "3 (10)労働保険番号", value: intake?.rosai_no ?? "" },
  ];

  const support: CopyItem[] = [
    { label: "5 (1)氏名又は名称", value: CUSTODIAN_INFO.officeName },
    { label: "5 (3)雇用保険適用事業所番号", value: CUSTODIAN_INFO.koyoNo },
    { label: "5 (4)住所（所在地）", value: CUSTODIAN_INFO.headOfficeAddress },
    { label: "5 (4)電話番号", value: CUSTODIAN_INFO.tel },
    { label: "5 (5)代表者の氏名", value: CUSTODIAN_INFO.officeName },
    { label: "5 (6)登録番号", value: CUSTODIAN_INFO.registrationNo },
    dateItem("5 (7)登録年月日", CUSTODIAN_INFO.registeredOn),
    { label: "5 (8)支援を行う事業所の名称", value: CUSTODIAN_INFO.officeName },
    { label: "5 (9)所在地", value: CUSTODIAN_INFO.address },
    { label: "5 (10)支援責任者名", value: CUSTODIAN_INFO.officeName },
    { label: "5 (11)支援担当者名", value: CUSTODIAN_INFO.officeName },
    { label: "5 (12)対応可能言語", value: lang === "en" ? "" : RESUME_LANG_JA[lang], note: "国籍から" },
    { label: "5 (13)支援委託手数料（月額／人）", value: intake?.support_fee ?? "", note: "所属機関 ＞ 毎月の支援代" },
  ];

  return [
    { title: "申請人等作成用 1（在留資格変更許可申請書）", items: applicant1 },
    { title: "申請人等作成用 2（特定技能所属機関・通算在留期間）", items: applicant2 },
    { title: "申請人等作成用 3（職歴）", items: careers },
    { title: "所属機関等作成用 1（特定技能雇用契約）", items: organization1 },
    { title: "所属機関等作成用 2（特定技能所属機関）", items: organization2 },
    { title: "所属機関等作成用 4（登録支援機関）", items: support },
  ];
}

// まとめてコピーする文（「項目: 値」を1行ずつ。未登録は「未登録」）
export function copyGroupText(group: CopyGroup): string {
  return group.items.map((i) => `${i.label}: ${i.value || "未登録"}`).join("\n");
}

// 申請書「13 希望する在留資格」。申請準備の申請内容（準備の内容）と申請種別から決める
export function desiredResidenceStatus(appContent: string, appType: string, currentStatus: string): string {
  const c = (appContent ?? "").normalize("NFKC");
  if (/特定技能2号/.test(c) && !/移行準備/.test(c)) return "特定技能2号";
  if (/特定活動/.test(c)) return "特定活動";
  if (appType === "更新") return currentStatus || (/特定技能/.test(c) ? "特定技能1号" : "");
  if (/特定技能/.test(c) || appType === "変更" || appType === "認定") return "特定技能1号";
  return "";
}
