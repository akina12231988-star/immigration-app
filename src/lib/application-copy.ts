// 申請準備 ＞ 申請書（在留資格変更許可申請書：申請人等作成用 1〜3・所属機関等作成用 1〜4）に
// 貼り付ける項目を、外国人・所属機関・賃金・職歴・支援計画書の日付から組み立てる。
// 画面ではこの一覧を項目ごとにコピーできる。
// 項目の並びと名前は、実際に使っている申請書のエクセル（別記第三十号様式）に合わせている。

import type { Organization, OrganizationIntake, OrgJapaneseStaff, Worker, WorkerWage } from "@/types/db";
import type { WorkHistory } from "@/types/ssw";
import { calcDocumentTotal, todayStr } from "@/lib/ssw/calc";
import { currentWage, hourlyFromMonthly, monthlyFromHourly, wageText } from "@/lib/wage";
import { formatHoursDecimal, parseHoursMinutes, rosaiMeasureText, weeklyHoursText } from "@/lib/organization-intake";
import { effectiveResidencePeriod } from "@/lib/residence-card";
import { CUSTODIAN_INFO, type CustodianInfo, type SupportOrgInterpreter } from "@/lib/custody";
import { RESUME_LANG_JA } from "@/lib/resume-tool/i18n";
import { resumeLangForNationality } from "@/lib/resume-tool/share";
import { contractPeriodEnd, formatYmdJa } from "@/lib/support-plan-dates";
import { JLPT_LEVELS, normalizeCertExams, type WorkerCertExam } from "@/lib/cert-exam";
import { JISSHU_SHOKUSHU_LIST } from "@/lib/jisshu-shokushu";
import { businessCategoryOptions } from "@/lib/online-business-categories";
import { ONLINE_MAIN_OCCUPATIONS, suggestedMainOccupation } from "@/lib/online-main-occupations";
import { ONLINE_MAIN_INDUSTRIES, suggestedMainIndustry } from "@/lib/online-main-industries";

// 項目をその場で入力・編集するときの保存先（外国人・所属機関・所属機関の登録内容（intake）・登録支援機関）
export type CopyEdit =
  | { target: "worker"; column: keyof CopyWorker; kind?: "text" | "date"; options?: readonly string[] }
  | { target: "custodian"; column: keyof CustodianInfo; kind?: "text" | "date" } // 登録支援機関（app_settings）
  // 協力確認書の提出（所属機関の登録内容の council_office_submissions / council_residence_submissions の index 行目）
  | { target: "council"; list: "office" | "residence"; index: number; field: "to" | "on"; kind?: "text" | "date" }
  | {
      target: "org";
      column: "name" | "industry" | "business_category" | "main_industry" | "address" | "contact" | "corporate_no";
      options?: readonly string[];
    }
  // 一緒に働く日本人常勤職員（所属機関の登録内容の japanese_staff の index 行目）
  | { target: "staff"; index: number; field: keyof OrgJapaneseStaff }
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
  asOf?: string; // いつの時点で計算した値か（「2026年10月1日時点（書類作成日）」など。目立つ形で出す）
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
      | "residence_period_manual"
      | "jisshu2_shokushu"
      | "jisshu2_sagyo"
      | "jisshu2_proof"
      | "cert_nihongo_name"
      | "cert_nihongo_location"
      | "cert_nihongo_level"
      | "cert_senmongai_name"
      | "cert_senmongai_location"
      | "cert_exams"
      // 在日親族（16）・犯罪歴（15）・技能水準の評価区分（18.1）。古いデータ・0187 未適用では無いことがある
      | "relatives_in_japan"
      | "relatives"
      | "criminal_record"
      | "criminal_record_note"
      | "skill_eval_kind"
      | "japanese_eval_kind"
      | "main_occupation"
      // 取次機関（オンライン申請 2.38〜2.42・0190）
      | "agency_name"
      | "agency_corporate_no"
      | "agency_postal"
      | "agency_address"
      | "agency_tel"
      // 在留カードの受領方法（オンライン申請の受領方法等・0204）
      | "card_receipt_method"
    >
  >;

// オンライン申請 18.1 技能水準 評価区分・19.1 日本語能力 評価区分の選択肢（画面のプルダウンと同じ並び）
export const SKILL_EVAL_KINDS = [
  "技能実習２号を良好に修了",
  "特定技能評価試験",
  "技能検定",
  "介護福祉士養成施設修了",
  "ＥＰＡ介護福祉士候補者",
  "その他分野固有の証明",
] as const;

// 有無の選択肢
export const YES_NO = ["無", "有"] as const;

// オンライン申請 2.3「従事すべき業務の内容 特定産業分野01」のプルダウン（「○○分野」の「○○」。画面と同じ並び）
export const ONLINE_INDUSTRY_FIELDS = [
  "介護",
  "ビルクリーニング",
  "リネンサプライ",
  "工業製品製造業",
  "建設",
  "造船・舶用工業",
  "自動車整備",
  "航空",
  "宿泊",
  "自動車運送業",
  "鉄道",
  "物流倉庫",
  "農業",
  "漁業",
  "飲食料品製造業",
  "外食業",
  "林業",
  "木材産業",
  "資源循環",
] as const;

// 「農業／畜産農業全般」「農業分野」のような書き方から分野名（農業）だけを取り出す
export function industryFieldName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKC")
    .split(/[／/]/)[0]
    .replace(/分野$/, "")
    .trim();
}

export interface ApplicationCopyInput {
  worker: CopyWorker;
  org: Pick<Organization, "name" | "industry" | "business_category" | "address" | "contact" | "corporate_no"> &
    Partial<Pick<Organization, "main_industry">> | null;
  orgId?: string | null; // 申請準備中の所属機関のID（賃金をこの機関のものに絞る）
  intake: OrganizationIntake | null;
  wages: WorkerWage[];
  histories: WorkHistory[]; // 職歴（calc の形）
  planDates: Record<string, string>; // 支援計画書の日付（es = 雇用開始日 など）
  desiredStatus?: string; // 希望する在留資格（申請種別から）
  agentName?: string; // 申請準備の申請取次士（取次者の氏名に使う。無ければ登録支援機関の申請取次者）
  assen?: string; // あっせんの有無（'' / あり / なし。申請準備のTODOから。職業紹介事業者 2.30〜2.37 を出すか決める）
  appType?: string; // 申請種別（認定 / 変更 / 更新。認定のとき取次機関 2.38〜2.42 を入れる）
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

// 区切り無しの8桁: "1994-07-10" → "19940710"（生年月日を数字だけで入れる欄用）
export function ymdCompact(ymd: string | null | undefined): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((ymd ?? "").trim());
  return m ? `${m[1]}${m[2]}${m[3]}` : undefined;
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
export const wk = (column: keyof CopyWorker, options?: readonly string[]): CopyEdit => ({ target: "worker", column, options });
export const wkDate = (column: keyof CopyWorker): CopyEdit => ({ target: "worker", column, kind: "date" });
export const og = (column: Extract<CopyEdit, { target: "org" }>["column"], options?: readonly string[]): CopyEdit => ({
  target: "org",
  column,
  options,
});
export const it = (
  column: Extract<CopyEdit, { target: "intake" }>["column"],
  options?: readonly string[],
): CopyEdit => ({ target: "intake", column, options });
export const cu = (column: keyof CustodianInfo, kind?: "text" | "date"): CopyEdit => ({ target: "custodian", column, kind });
const staff = (index: number, field: keyof OrgJapaneseStaff): CopyEdit => ({ target: "staff", index, field });
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
// 申請準備中の所属機関（orgId）の賃金があればそれに絞る（転職先の賃金を入れているとき）。無ければ全部から
export function wageForApplication(
  wages: WorkerWage[],
  intake: OrganizationIntake | null,
  employmentStartOn: string | null,
  orgId?: string | null,
  orgName?: string,
): { monthly: string; hourly: string; note: string } {
  const scoped = orgId ? wages.filter((x) => x.organization_id === orgId) : [];
  const w = currentWage(scoped.length > 0 ? scoped : wages, undefined, employmentStartOn);
  if (!w) return { monthly: "", hourly: "", note: "賃金が未登録です（外国人詳細の賃金、または申請準備の賃金）" };
  const from =
    scoped.length > 0
      ? `所属機関「${orgName || "申請準備中の機関"}」の賃金（${wageText(w.kind, w.amount)}）から。`
      : orgId
        ? `申請準備中の所属機関の賃金が未登録のため、いちばん新しい賃金（${wageText(w.kind, w.amount)}）から。`
        : "";
  const annual = Number.parseFloat(intake?.posting_annual_hours ?? "") || 0;
  if (w.kind === "月給") {
    const h = hourlyFromMonthly(w.amount, annual);
    return {
      monthly: String(w.amount),
      hourly: yen(h),
      note: `${from}${h == null ? "所属機関の年間所定労働時間が未登録のため時間換算できません" : `時間換算額は 月給 ÷（年間所定労働時間 ${annual}時間 ÷ 12）`}`,
    };
  }
  if (w.kind === "時給") {
    const m = monthlyFromHourly(w.amount, annual);
    return {
      monthly: yen(m),
      hourly: String(w.amount),
      note: `${from}${m == null ? "所属機関の年間所定労働時間が未登録のため月額に換算できません" : `月額報酬は 時給 ×（年間所定労働時間 ${annual}時間 ÷ 12）`}`,
    };
  }
  return { monthly: "", hourly: "", note: `${from}賃金の区分が${w.kind}のため換算していません` };
}

// 2 (4)同等の業務に従事する日本人の月額報酬: 所属機関に登録している「一緒に働く日本人常勤職員（専従者）」の報酬から。
// 「月給250,000円」はそのまま、「時給1,100円」は年間所定労働時間で月額に換算する
export function japaneseStaffMonthly(
  intake: OrganizationIntake | null,
  orgName: string,
): { monthly: string; note: string; index: number; staff: OrgJapaneseStaff | null } {
  const rows = intake?.japanese_staff ?? [];
  const index = Math.max(
    0,
    rows.findIndex((r) => (r.pay ?? "").trim()),
  );
  const st = rows[index] ?? null;
  const pay = (st?.pay ?? "").normalize("NFKC").trim();
  const who = `所属機関「${orgName || "未設定"}」の日本人常勤職員${st?.name ? ` ${st.name}` : ""}`;
  if (!pay) return { monthly: "", note: `${who}の報酬が未登録です（所属機関 ＞ 一緒に働く日本人常勤職員（専従者）＞ 報酬）`, index, staff: st };
  const amount = Number.parseInt(pay.replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(amount) || amount <= 0) return { monthly: "", note: `${who}の報酬「${pay}」から金額が読み取れません`, index, staff: st };
  if (/時給/.test(pay)) {
    const annual = Number.parseFloat(intake?.posting_annual_hours ?? "") || 0;
    const m = monthlyFromHourly(amount, annual);
    return {
      monthly: yen(m),
      note: m == null ? `${who}の報酬（${pay}）。所属機関の年間所定労働時間が未登録のため月額に換算できません` : `${who}の報酬（${pay}）× 年間所定労働時間 ${annual}時間 ÷ 12`,
      index,
      staff: st,
    };
  }
  return { monthly: String(amount), note: `${who}の報酬（${pay}）から`, index, staff: st };
}

export function buildApplicationCopyGroups(input: ApplicationCopyInput): CopyGroup[] {
  const { worker: w, org, intake, wages, histories, planDates } = input;
  // 「21 申請時における通算在留期間」は書類作成日の時点で数える。
  // 書類作成日（支援計画書の日付計算で保存）があればその日、無ければ今日の時点
  const docOn = (planDates.doc ?? "").trim();
  const sswBase = docOn || input.today || todayStr();
  // 外国人詳細の「申請書類用の通算」と同じ数え方（1日でも在留した月は1か月）
  const docMonths = calcDocumentTotal(histories, sswBase);
  const docY = docMonths ? String(Math.floor(docMonths / 12)) : "";
  const docM = docMonths ? String(docMonths % 12) : "";
  const es = planDates.es || w.employment_start_on || "";
  const ee = es ? contractPeriodEnd(es) : "";
  const wage = wageForApplication(wages, intake, w.employment_start_on, input.orgId, org?.name);
  const jpStaff = japaneseStaffMonthly(intake, org?.name ?? "");
  const weekly = weeklyHoursText(intake);
  const monthlyHours = parseHoursMinutes(intake?.posting_monthly_hours ?? "");
  const lang = resumeLangForNationality(w.nationality);
  const c: CustodianInfo = input.custodian ?? { ...CUSTODIAN_INFO };

  const applicant1: CopyItem[] = [
    { label: "1 国籍・地域", value: w.nationality, edit: wk("nationality") },
    // 生年月日は 年・月・日 の部品に加えて、区切り無しの8桁（19940710）もコピーできるようにする
    {
      ...dateItem("2 生年月日", w.birth, undefined, wkDate("birth")),
      parts: w.birth ? [...(ymdParts(w.birth) ?? []), ymdCompact(w.birth) ?? ""] : undefined,
    },
    { label: "3 氏名", value: w.name, note: w.kana ? `フリガナ: ${w.kana}` : undefined, edit: wk("name") },
    { label: "4 性別", value: w.gender, edit: wk("gender", ["男", "女"]) },
    { label: "6 配偶者の有無", value: w.has_spouse, edit: wk("has_spouse", ["有", "無"]) },
    // 職歴のいちばん新しい行の「職種・仕事内容」。無ければ分野・職種（その場で直せる）
    ...(() => {
      const last = [...histories].sort((a, b) => (a.start < b.start ? -1 : 1)).at(-1);
      const role = (last?.role ?? "").trim();
      return role
        ? [{ label: "7 職業", value: role, note: "職歴のいちばん新しい行の「職種・仕事内容」。違うときは外国人詳細の職歴で直す" }]
        : [{ label: "7 職業", value: w.field, edit: wk("field") }];
    })(),
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
    // 15 犯罪歴（有無を選び、有なら内容を書く）
    {
      label: "15 犯罪を理由とする処分を受けたことの有無",
      value: w.criminal_record ?? "",
      note: "通常は「無」。有なら下に内容を書く",
      edit: wk("criminal_record", YES_NO),
    },
    {
      label: "15 処分の内容（有のとき）",
      value: w.criminal_record_note ?? "",
      note: "処分を受けた年月・内容。無のときは空欄",
      edit: wk("criminal_record_note"),
    },
    // 16 在日親族（外国人詳細の「在日親族の同居」から）
    {
      label: "16 在日親族及び同居者 有無",
      value: w.relatives_in_japan ?? "",
      note: "外国人詳細 ＞ 在日親族の同居。有なら同居している在日親族の氏名・生年月日・勤務先・在留カード番号も外国人詳細で登録",
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
      label: "18 技能水準 評価区分",
      value: w.skill_eval_kind ?? "",
      note: "オンライン申請 18.1 のプルダウンと同じ選択肢。選ぶと 18.2〜18.8 の入力項目が変わる",
      edit: wk("skill_eval_kind", SKILL_EVAL_KINDS),
    },
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
      label: "19 日本語能力 評価区分",
      value: w.japanese_eval_kind ?? "",
      note: "オンライン申請 19.1 のプルダウンと同じ選択肢（特定技能1号の申請のとき）。選ぶと 19.2〜 の入力項目が変わる",
      edit: wk("japanese_eval_kind", SKILL_EVAL_KINDS),
    },
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
      edit: wk("jisshu2_shokushu", JISSHU_SHOKUSHU_LIST), // オンライン申請 20.1 と同じ職種のプルダウンから選ぶ
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
      value: docMonths ? `${docY}年${docM}か月` : "",
      parts: docMonths ? [docY, docM] : undefined,
      asOf: `${formatYmdJa(sswBase)}時点${docOn ? "（書類作成日）" : "（今日。書類作成日が未登録）"}`,
      note: docOn
        ? "職歴の特定技能1号（通算対象）の期間を、書類作成日まで、1日でも在留した月を1か月として数えています（外国人詳細の「申請書類用の通算」と同じ）。書類作成日が変わったら「支援計画書の日付計算」で直してください"
        : "職歴の特定技能1号（通算対象）の期間を、今日まで、1日でも在留した月を1か月として数えています（外国人詳細の「申請書類用の通算」と同じ）。書類作成日の時点で数えるには「支援計画書の日付計算」で書類作成日を入れてください",
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
    // 所属機関の業種（オンライン申請 2.3 と同じ分野のプルダウンから選んで保存）。無ければ外国人の分野・職種から
    {
      label: "2 (2)特定産業分野",
      value: org?.industry || industryFieldName(w.field),
      note: "所属機関の業種。オンライン申請 2.3 のプルダウンと同じ分野から選べます",
      edit: org ? og("industry", ONLINE_INDUSTRY_FIELDS) : undefined,
      editValue: org?.industry ?? "",
    },
    // 業務区分はオンライン申請 2.4 の分野ごとのプルダウンから選んで保存（所属機関の業務区分）
    {
      label: "2 (2)業務区分",
      value: org?.business_category ?? "",
      note: "所属機関の業務区分。オンライン申請 2.4 の分野ごとの選択肢から選べます",
      edit: org ? og("business_category", businessCategoryOptions(org.industry || industryFieldName(w.field))) : undefined,
    },
    // 主たる職種（オンライン申請 2.5 の職種一覧から選んで保存。未登録なら分野からの目安を案内）
    {
      label: "2 (2)主たる職種",
      value: w.main_occupation ?? "",
      note: (() => {
        const hint = suggestedMainOccupation(org?.industry || industryFieldName(w.field));
        return `オンライン申請 2.5 の職種一覧から選ぶ${hint && !w.main_occupation ? `（この分野は通常「${hint}」）` : ""}`;
      })(),
      edit: wk("main_occupation", ONLINE_MAIN_OCCUPATIONS),
    },
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
    // 同等の業務に従事する日本人（所属機関の専従者）。未登録ならここで名前・報酬を入れて所属機関に保存する
    {
      label: "2 (4)同等の業務に従事する日本人（氏名）",
      value: jpStaff.staff?.name ?? "",
      note: `所属機関「${org?.name || "未設定"}」＞ 一緒に働く日本人常勤職員（専従者）の${jpStaff.index + 1}人目`,
      edit: org ? staff(jpStaff.index, "name") : undefined,
    },
    {
      label: "2 (4)同等の業務に従事する日本人の月額報酬",
      value: jpStaff.monthly,
      note: `${jpStaff.note}。報酬は「月給250,000円」「時給1,100円」の形で入れる`,
      edit: org ? staff(jpStaff.index, "pay") : undefined,
      editValue: jpStaff.staff?.pay ?? "",
    },
    {
      label: "2 (5)報酬の支払方法",
      value: intake?.pay_method ?? "",
      edit: org ? it("pay_method", ["通貨払い", "口座振込"]) : undefined,
    },
  ];

  const organization2: CopyItem[] = [
    { label: "3 (1)氏名又は名称", value: org?.name ?? "", edit: org ? og("name") : undefined },
    { label: "3 (2)法人番号（13桁）", value: org?.corporate_no ?? "", edit: org ? og("corporate_no") : undefined },
    {
      label: "3 (3)雇用保険適用事業所番号（11桁）",
      value: intake?.koyo_no ?? "",
      note: "ハイフンありで入れてよい（オンライン申請の順ではハイフン無しでコピーできる）",
      edit: org ? it("koyo_no") : undefined,
    },
    { label: "3 (4)業種", value: org?.industry ?? "", edit: org ? og("industry") : undefined },
    // 主たる業種（オンライン申請 3.4 のプルダウンと同じ一覧から選んで所属機関に保存）
    {
      label: "3 (4)業種 主たる業種",
      value: org?.main_industry ?? "",
      note: (() => {
        const hint = suggestedMainIndustry(org?.industry || industryFieldName(w.field));
        return `日本標準産業分類の業種（所属機関の情報にも出ます）${hint && !org?.main_industry ? `。この分野は通常「${hint}」` : ""}`;
      })(),
      edit: org ? og("main_industry", ONLINE_MAIN_INDUSTRIES) : undefined,
    },
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
    {
      label: "3 (10)労働保険番号",
      value: intake?.rosai_no ?? "",
      note: "ハイフンありで入れてよい（オンライン申請の順ではハイフン無しでコピーできる）",
      edit: org ? it("rosai_no") : undefined,
    },
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

  // 取次機関（国外。在留資格認定証明書交付申請のとき。外国人ごとに保存・0190）
  const agency: CopyItem[] = [
    { label: "(14)取次機関 氏名又は名称", value: w.agency_name ?? "", note: "認定申請のときに入れる国外の取次機関（送出機関など）。外国人ごとに保存", edit: wk("agency_name") },
    { label: "(14)取次機関 法人番号", value: w.agency_corporate_no ?? "", note: "無ければ空欄", edit: wk("agency_corporate_no") },
    { label: "(14)取次機関 郵便番号", value: w.agency_postal ?? "", edit: wk("agency_postal") },
    { label: "(14)取次機関 住所", value: w.agency_address ?? "", edit: wk("agency_address") },
    { label: "(14)取次機関 電話番号", value: w.agency_tel ?? "", edit: wk("agency_tel") },
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
    { title: "取次機関（認定申請のとき）", items: agency },
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
