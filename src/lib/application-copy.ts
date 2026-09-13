// 申請準備 ＞ 申請書（在留資格変更許可申請書：申請人等作成用 1〜3・所属機関等作成用 1〜4）に
// 貼り付ける項目を、外国人・所属機関・賃金・職歴・支援計画書の日付から組み立てる。
// 画面ではこの一覧を項目ごとにコピーできる。
// 項目の並びと名前は、実際に使っている申請書のエクセル（別記第三十号様式）に合わせている。

import type { Organization, OrganizationIntake, Worker, WorkerWage } from "@/types/db";
import type { WorkHistory } from "@/types/ssw";
import { calcSsw } from "@/lib/ssw/calc";
import { currentWage, hourlyFromMonthly, monthlyFromHourly } from "@/lib/wage";
import { formatHoursDecimal, parseHoursMinutes, rosaiMeasureText, weeklyHoursText } from "@/lib/organization-intake";
import { effectiveResidencePeriod } from "@/lib/residence-card";
import { CUSTODIAN_INFO, type CustodianInfo, type SupportOrgInterpreter } from "@/lib/custody";
import { RESUME_LANG_JA } from "@/lib/resume-tool/i18n";
import { resumeLangForNationality } from "@/lib/resume-tool/share";
import { contractPeriodEnd, formatYmdJa } from "@/lib/support-plan-dates";
import { JLPT_LEVELS, normalizeCertExams, type WorkerCertExam } from "@/lib/cert-exam";

// 項目をその場で入力・編集するときの保存先（外国人・所属機関・所属機関の登録内容（intake）・登録支援機関）
export type CopyEdit =
  | { target: "worker"; column: keyof CopyWorker; kind?: "text" | "date"; options?: readonly string[] }
  | { target: "custodian"; column: keyof CustodianInfo; kind?: "text" | "date" } // 登録支援機関（app_settings）
  // 協力確認書の提出（所属機関の登録内容の council_office_submissions / council_residence_submissions の index 行目）
  | { target: "council"; list: "office" | "residence"; index: number; field: "to" | "on"; kind?: "text" | "date" }
  | { target: "org"; column: "name" | "industry" | "business_category" | "address" | "contact" | "corporate_no" }
  | {
      target: "intake";
      column:
        | "posting_weekly_hours"
        | "posting_monthly_hours"
        | "pay_method"
        | "koyo_no"
        | "capital"
        | "rep_name"
        | "work_address"
        | "rosai_no"
        | "rosai_measure"
        | "health_insurance"
        | "support_fee";
      options?: readonly string[];
    };

export interface CopyItem {
  label: string;
  value: string; // 空なら未登録
  parts?: string[]; // 年・月・日など、欄が分かれているときに1つずつコピーできる部品
  note?: string; // 補足（どこから取ったか・注意）
  edit?: CopyEdit; // この場で入力・編集して保存できる（無い項目は他の画面で登録する）
  editValue?: string; // 編集欄に最初に入れる値（表示値と保存されている値が違うとき。日付は YYYY-MM-DD）
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
> &
  // 合格証（日本語・専門外の受験情報）と良好に修了した技能実習2号（0110・0114・0115。古いデータでは無いことがある）
  Partial<
    Pick<
      Worker,
      | "specialty_grade"
      | "jisshu2_shokushu"
      | "jisshu2_sagyo"
      | "jisshu2_proof"
      | "cert_nihongo_name"
      | "cert_nihongo_location"
      | "cert_nihongo_level"
      | "cert_senmongai_name"
      | "cert_senmongai_location"
      | "cert_exams"
    >
  >;

export interface ApplicationCopyInput {
  worker: CopyWorker;
  org: Pick<Organization, "name" | "industry" | "business_category" | "address" | "contact" | "corporate_no"> | null;
  intake: OrganizationIntake | null;
  wages: WorkerWage[];
  histories: WorkHistory[]; // 職歴（calc の形）
  planDates: Record<string, string>; // 支援計画書の日付（es = 雇用開始日 など）
  desiredStatus?: string; // 希望する在留資格（申請種別から）
  custodian?: CustodianInfo; // 登録支援機関の情報（無ければ既定値 CUSTODIAN_INFO）
  interpreters?: SupportOrgInterpreter[]; // 対応可能言語ごとの通訳者（登録支援機関の情報）
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

const dateItem = (label: string, ymd: string | null | undefined, note?: string, edit?: CopyEdit): CopyItem => ({
  label,
  value: ymd ? formatYmdJa(ymd) : "",
  parts: ymdParts(ymd),
  note,
  edit,
  editValue: edit ? (ymd ?? "") : undefined,
});

// 編集先の短い書き方
const wk = (column: keyof CopyWorker, options?: readonly string[]): CopyEdit => ({ target: "worker", column, options });
const wkDate = (column: keyof CopyWorker): CopyEdit => ({ target: "worker", column, kind: "date" });
const og = (column: Extract<CopyEdit, { target: "org" }>["column"]): CopyEdit => ({ target: "org", column });
const it = (
  column: Extract<CopyEdit, { target: "intake" }>["column"],
  options?: readonly string[],
): CopyEdit => ({ target: "intake", column, options });
const cu = (column: keyof CustodianInfo, kind?: "text" | "date"): CopyEdit => ({ target: "custodian", column, kind });
const council = (list: "office" | "residence", index: number, field: "to" | "on"): CopyEdit => ({
  target: "council",
  list,
  index,
  field,
  kind: field === "on" ? "date" : "text",
});

// 協力確認書の提出（提出年月日・提出先の市町村名）を、登録がある行ごとに項目にする。無ければ1行目を入力できる形で出す
function councilItems(
  list: "office" | "residence",
  rows: { to: string; on: string }[] | undefined,
  title: string,
  hasOrg: boolean,
): CopyItem[] {
  const filled = (rows ?? []).filter((r) => r.to || r.on);
  const src = filled.length > 0 ? filled : [{ to: "", on: "" }];
  const note = `所属機関 ＞ 協力確認書の提出（提出先・提出日）の${list === "office" ? "事業所の所在地" : "住居地"}から`;
  return src.flatMap((r, i) => {
    const nth = src.length > 1 ? `（${i + 1}件目）` : "";
    return [
      dateItem(`${title} 提出年月日${nth}`, r.on, i === 0 ? note : undefined, hasOrg ? council(list, i, "on") : undefined),
      { label: `${title} 提出先の市町村名${nth}`, value: r.to, edit: hasOrg ? council(list, i, "to") : undefined },
    ];
  });
}

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
  const weekly = weeklyHoursText(intake);
  const monthlyHours = parseHoursMinutes(intake?.posting_monthly_hours ?? "");
  const lang = resumeLangForNationality(w.nationality);
  const c: CustodianInfo = input.custodian ?? { ...CUSTODIAN_INFO };

  const applicant1: CopyItem[] = [
    { label: "1 国籍・地域", value: w.nationality, edit: wk("nationality") },
    dateItem("2 生年月日", w.birth, undefined, wkDate("birth")),
    { label: "3 氏名", value: w.name, note: w.kana ? `フリガナ: ${w.kana}` : undefined, edit: wk("name") },
    { label: "4 性別", value: w.gender, edit: wk("gender", ["男", "女"]) },
    { label: "6 配偶者の有無", value: w.has_spouse, edit: wk("has_spouse", ["有", "無"]) },
    { label: "7 職業", value: w.field, edit: wk("field") },
    { label: "8 本国における居住地", value: w.home_address, edit: wk("home_address") },
    { label: "9 住居地", value: w.address, edit: wk("address") },
    { label: "10 旅券 (1)番号", value: w.passport_no, edit: wk("passport_no") },
    dateItem("10 旅券 (2)有効期限", w.passport_expiry_date, undefined, wkDate("passport_expiry_date")),
    { label: "11 現に有する在留資格", value: w.residence_status, edit: wk("residence_status") },
    {
      label: "11 在留期間",
      value: effectiveResidencePeriod(w),
      note: "許可年月日と満了日から自動計算（できないときは登録値）",
      edit: wk("residence_period"),
      editValue: w.residence_period,
    },
    dateItem("11 在留期間の満了日", w.residence_expiry_date, undefined, wkDate("residence_expiry_date")),
    { label: "12 在留カード番号", value: w.residence_card_no, edit: wk("residence_card_no") },
    {
      label: "13 希望する在留資格",
      value: input.desiredStatus ?? "",
      note: input.desiredStatus ? undefined : "申請準備の「準備の内容」と申請種別を選ぶと出ます",
    },
  ];

  // 合格証の受験情報（1件目は workers の列、2件目以降は cert_exams）
  const exams: WorkerCertExam[] = normalizeCertExams(w.cert_exams);
  const moreExams = (kind: WorkerCertExam["kind"], numbering: string): CopyItem[] =>
    exams
      .filter((e) => e.kind === kind && (e.name || e.location || e.level))
      .flatMap((e, i) => [
        { label: `${numbering} (1)試験名（${i + 2}件目）`, value: e.name, note: "外国人詳細 ＞ 合格証の受験情報（2件目以降）" },
        { label: `${numbering} (2)受験地（${i + 2}件目）`, value: e.location },
        ...(kind === "nihongo" ? [{ label: `${numbering} レベル（${i + 2}件目）`, value: e.level }] : []),
      ]);

  const applicant2: CopyItem[] = [
    { label: "17 特定技能所属機関 (1)氏名又は名称", value: org?.name ?? "", edit: org ? og("name") : undefined },
    { label: "17 (2)住所（所在地）", value: org?.address ?? "", edit: org ? og("address") : undefined },
    { label: "17 電話番号", value: org?.contact ?? "", edit: org ? og("contact") : undefined },
    // 18 技能水準（専門外の合格証 ＝ 技能試験）
    {
      label: "18 技能水準 (1)試験名",
      value: w.cert_senmongai_name ?? "",
      note: "外国人詳細 ＞ 専門外の合格証の受験情報（技能試験）。技能実習の専門級で代える人は下の専門級を使う",
      edit: wk("cert_senmongai_name"),
    },
    {
      label: "18 (2)受験地",
      value: w.cert_senmongai_location ?? "",
      note: "日本国内、または海外の国名",
      edit: wk("cert_senmongai_location"),
    },
    ...moreExams("senmongai", "18"),
    {
      label: "18 専門級の合格名（技能実習）",
      value: w.specialty_grade ?? "",
      note: "外国人詳細 ＞ 専門級の合格名（技能実習の専門級で技能試験を免除する人）",
      edit: wk("specialty_grade"),
    },
    // 19 日本語能力（日本語の合格証）
    {
      label: "19 日本語能力 (1)試験名",
      value: w.cert_nihongo_name ?? "",
      note: "外国人詳細 ＞ 日本語の合格証の受験情報",
      edit: wk("cert_nihongo_name"),
    },
    {
      label: "19 (2)受験地",
      value: w.cert_nihongo_location ?? "",
      note: "日本国内、または海外の国名",
      edit: wk("cert_nihongo_location"),
    },
    { label: "19 レベル", value: w.cert_nihongo_level ?? "", edit: wk("cert_nihongo_level", JLPT_LEVELS) },
    ...moreExams("nihongo", "19"),
    // 20 良好に修了した技能実習2号（該当者のみ）
    {
      label: "20 技能実習2号良好修了 (1)職種名",
      value: w.jisshu2_shokushu ?? "",
      note: "技能実習2号を良好に修了した人だけ（外国人詳細 ＞ 良好に修了した技能実習2号）",
      edit: wk("jisshu2_shokushu"),
    },
    { label: "20 (2)作業名", value: w.jisshu2_sagyo ?? "", edit: wk("jisshu2_sagyo") },
    {
      label: "20 (3)良好修了の証明方法",
      value: w.jisshu2_proof ?? "",
      note: "実技試験の合格（3級の技能検定等）か、実習状況に関する書面による証明（技能評価調書）",
      edit: wk("jisshu2_proof", ["実技試験の合格", "書面による証明"]),
    },
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
      note: "雇用開始日から2年間（終了日は2年後の前日）。支援計画書の日付の雇用開始日か、外国人の雇用開始日から",
      edit: wkDate("employment_start_on"),
      editValue: w.employment_start_on ?? "",
    },
    { label: "2 (2)特定産業分野", value: w.field || org?.industry || "", edit: wk("field"), editValue: w.field },
    { label: "2 (2)業務区分", value: org?.business_category ?? "", edit: org ? og("business_category") : undefined },
    {
      label: "2 (3)所定労働時間（週平均）",
      value: weekly.value,
      note: weekly.auto
        ? "所属機関の週平均所定労働時間数が未登録のため、年間所定労働時間 ÷ 52 で自動計算（登録すればその値を出します）"
        : "所属機関 ＞ 週平均所定労働時間数",
      edit: org ? it("posting_weekly_hours") : undefined,
      editValue: intake?.posting_weekly_hours ?? "",
    },
    {
      label: "2 (3)所定労働時間（月平均）",
      value: monthlyHours != null ? formatHoursDecimal(monthlyHours) : (intake?.posting_monthly_hours ?? ""),
      note: "所属機関 ＞ 月平均所定労働時間数",
      edit: org ? it("posting_monthly_hours") : undefined,
      editValue: intake?.posting_monthly_hours ?? "",
    },
    { label: "2 (4)月額報酬", value: wage.monthly, note: wage.note },
    { label: "2 (4)基本給の時間換算額", value: wage.hourly },
    {
      label: "2 (5)報酬の支払方法",
      value: intake?.pay_method ?? "",
      edit: org ? it("pay_method", ["通貨払い", "口座振込"]) : undefined,
    },
  ];

  const organization2: CopyItem[] = [
    { label: "3 (1)氏名又は名称", value: org?.name ?? "", edit: org ? og("name") : undefined },
    { label: "3 (2)法人番号（13桁）", value: org?.corporate_no ?? "", edit: org ? og("corporate_no") : undefined },
    { label: "3 (3)雇用保険適用事業所番号（11桁）", value: intake?.koyo_no ?? "", edit: org ? it("koyo_no") : undefined },
    { label: "3 (4)業種", value: org?.industry ?? "", edit: org ? og("industry") : undefined },
    { label: "3 (5)住所（所在地）", value: org?.address ?? "", edit: org ? og("address") : undefined },
    { label: "3 (5)電話番号", value: org?.contact ?? "", edit: org ? og("contact") : undefined },
    { label: "3 (6)資本金", value: intake?.capital ?? "", edit: org ? it("capital") : undefined },
    {
      label: "3 (7)年間売上金額（直近年度）",
      value: intake?.financials.find((f) => f.sales)?.sales ?? "",
      note: "所属機関 ＞ 決算情報（直近3年分）で登録します",
    },
    {
      label: "3 (8)常勤職員数",
      value: totalStaff(intake),
      note: "日本人・技能実習生・特定技能・特定活動の合計（所属機関 ＞ 常勤職員数で登録します）",
    },
    { label: "3 (9)代表者の氏名", value: intake?.rep_name ?? "", edit: org ? it("rep_name") : undefined },
    { label: "3 (10)勤務させる事業所名", value: org?.name ?? "", edit: org ? og("name") : undefined },
    {
      label: "3 (10)所在地",
      value: intake?.work_address || org?.address || "",
      note: "作業する住所（会社の住所と別の場合）。無ければ会社の住所",
      edit: org ? it("work_address") : undefined,
      editValue: intake?.work_address ?? "",
    },
    {
      label: "健康保険及び厚生年金保険の適用事業所",
      value: intake?.health_insurance === "社会保険" ? "有" : intake?.health_insurance ? "無" : "",
      note: "所属機関の保険（社会保険なら有）",
      edit: org ? it("health_insurance", ["社会保険", "国民健康保険", "その他"]) : undefined,
      editValue: intake?.health_insurance ?? "",
    },
    {
      label: "労災保険及び雇用保険の適用事業所",
      value: intake?.rosai_covered === "はい" && intake?.koyo_covered === "はい" ? "有" : intake?.rosai_covered || intake?.koyo_covered ? "無" : "",
      note: "所属機関の労災・雇用保険の登録から",
    },
    { label: "3 (10)労働保険番号", value: intake?.rosai_no ?? "", edit: org ? it("rosai_no") : undefined },
  ];

  // 登録支援機関（当社）。編集すると app_settings に保存され、全員の申請準備に反映される
  // 所属機関等作成用 3 は元の申請書では「有・無」のチェックがほとんどのため、
  // 文章で書く (29) 労災保険加入等の措置の内容と、協力確認書の提出（事業所・住居地）だけを出す
  const organization3: CopyItem[] = [
    {
      label: "(29)労災保険加入等の措置の内容",
      value: rosaiMeasureText(intake),
      note: "所属機関 ＞ 労災保険・雇用保険。労災の適用事業所なら「労災保険加入」、適用外なら措置の内容（民間の労災保険など）",
      edit: org ? it("rosai_measure") : undefined,
      editValue: intake?.rosai_measure ?? "",
    },
    ...councilItems("office", intake?.council_office_submissions, "協力確認書（外国人に活動させる事業所）", !!org),
    ...councilItems("residence", intake?.council_residence_submissions, "協力確認書（外国人の住居地）", !!org),
  ];

  const support: CopyItem[] = [
    { label: "5 (1)氏名又は名称", value: c.officeName, edit: cu("officeName") },
    { label: "5 (3)雇用保険適用事業所番号", value: c.koyoNo, edit: cu("koyoNo") },
    { label: "5 (4)住所（所在地）", value: c.headOfficeAddress, edit: cu("headOfficeAddress") },
    { label: "5 (4)電話番号", value: c.tel, edit: cu("tel") },
    { label: "5 (5)代表者の氏名", value: c.representativeName, edit: cu("representativeName") },
    { label: "5 (6)登録番号", value: c.registrationNo, edit: cu("registrationNo") },
    dateItem("5 (7)登録年月日", c.registeredOn, undefined, cu("registeredOn", "date")),
    { label: "5 (8)支援を行う事業所の名称", value: c.supportOfficeName, edit: cu("supportOfficeName") },
    { label: "5 (9)所在地", value: c.address, edit: cu("address") },
    { label: "5 (10)支援責任者名", value: c.supportManagerName, edit: cu("supportManagerName") },
    { label: "5 (11)支援担当者名", value: c.supportStaffName, edit: cu("supportStaffName") },
    {
      label: "5 (12)対応可能言語",
      // 登録支援機関の情報に登録があればそれを使い、無ければ外国人の国籍から自動で出す
      value: c.languages || (lang === "en" ? "" : RESUME_LANG_JA[lang]),
      note: c.languages ? "登録支援機関の情報から（全員共通）" : "国籍から（変更すると全員共通の登録支援機関の情報に保存されます）",
      edit: cu("languages"),
      editValue: c.languages,
    },
    // 言語ごとの通訳者（登録支援機関の情報で登録。申請書の欄ではないが、対応可能言語の根拠として添える）
    ...(input.interpreters && input.interpreters.length > 0
      ? [
          {
            label: "通訳者（言語ごと）",
            value: input.interpreters.map((r) => `${r.language}: ${r.name}`).join("、"),
            note: "登録支援機関の情報から（メニュー ＞ 登録支援機関 で変更）",
          },
        ]
      : []),
    {
      label: "5 (13)支援委託手数料（月額／人）",
      value: intake?.support_fee ?? "",
      note: "所属機関 ＞ 毎月の支援代",
      edit: org ? it("support_fee") : undefined,
    },
  ];

  // 職業紹介事業者（国内）。登録支援機関の情報で登録・変更する（全員共通）
  const placement: CopyItem[] = [
    { label: "2 許可・届出受理番号", value: c.placementLicenseNo, edit: cu("placementLicenseNo") },
    dateItem("2 受理年月日", c.placementLicensedOn, undefined, cu("placementLicensedOn", "date")),
    { label: "3 職業紹介事業者の区分", value: c.placementKind, edit: cu("placementKind") },
    { label: "4 職業紹介事業者の氏名", value: c.placementName, edit: cu("placementName") },
    { label: "5 郵便番号", value: c.placementPostal, edit: cu("placementPostal") },
    { label: "5 住所", value: c.placementAddress, edit: cu("placementAddress") },
    { label: "5 電話番号", value: c.placementTel, edit: cu("placementTel") },
  ];

  return [
    { title: "申請人等作成用 1（在留資格変更許可申請書）", items: applicant1 },
    { title: "申請人等作成用 2（特定技能所属機関・通算在留期間）", items: applicant2 },
    { title: "申請人等作成用 3（職歴）", items: careers },
    { title: "所属機関等作成用 1（特定技能雇用契約）", items: organization1 },
    { title: "所属機関等作成用 2（特定技能所属機関）", items: organization2 },
    { title: "所属機関等作成用 3（労災保険・協力確認書）", items: organization3 },
    { title: "所属機関等作成用 4（登録支援機関）", items: support },
    { title: "職業紹介事業者（国内）", items: placement },
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
