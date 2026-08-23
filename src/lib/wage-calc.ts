// 参考様式第1-6号 別紙1「賃金の支払」の計算。
//
// もとにしているのは、いつも使っている賃金の明細 計算ツール:
//   https://akina12231988-star.github.io/wage-calc-tool/
// ツールと同じ計算をこのアプリの中でもできるようにして、賃金を入れるときに
// 「どういう内容で1-6号別紙を作ったか」と一緒に残せるようにしている。
//
// 数字はすべて「約」＝概算。所得税は国税庁 令和8年分 源泉徴収税額表（月額表・甲欄）の
// 電算機計算の特例、社会保険料は協会けんぽ 令和8年度の都道府県別料率と厚生年金 18.3%、
// 雇用保険料は厚生労働省 令和8年度（令和8年4月〜令和9年3月）の率による。
// 毎年の改定時は、この下の RATE の定数をまとめて入れ替えれば済むようにしてある。

import type {
  OrgLodging,
  WageAgeBand,
  WageDetail,
  WorkerWageKind,
} from "@/types/db";

// 料率の年度表示（画面に出して、いつの率で計算したか分かるようにする）
export const WAGE_CALC_YEAR_LABEL = "令和8年分（所得税）／令和8年度（社会保険・雇用保険）";
export const WAGE_CALC_TOOL_URL = "https://akina12231988-star.github.io/wage-calc-tool/";

// ---- 健康保険料率（協会けんぽ 令和8年度・都道府県別） ----
// 熊本県が既定。表に無い県は「手入力」を選んで率を直接入れる。
export const HEALTH_PREFECTURE_CUSTOM = "手入力";

export const HEALTH_INSURANCE_RATES: { prefecture: string; rate: number }[] = [
  { prefecture: "熊本", rate: 10.08 },
  { prefecture: "全国平均", rate: 9.9 },
  { prefecture: "東京", rate: 9.85 },
  { prefecture: "愛知", rate: 9.93 },
  { prefecture: "大阪", rate: 10.13 },
  { prefecture: "北海道", rate: 10.28 },
  { prefecture: "佐賀", rate: 10.55 },
  { prefecture: "新潟", rate: 9.21 },
];

// 選んだ都道府県の健康保険料率（%）。「手入力」や表に無い名前なら入力値をそのまま使う
export function healthInsuranceRate(prefecture: string, customRate: number): number {
  const hit = HEALTH_INSURANCE_RATES.find((r) => r.prefecture === prefecture);
  return hit ? hit.rate : customRate;
}

// 介護保険料率（40〜64歳のみ）・こども子育て支援金・厚生年金保険料率（いずれも労使折半前）
const KAIGO_RATE = 1.62;
const KOSODATE_RATE = 0.23;
const KOSEI_NENKIN_RATE = 18.3;

// ---- 雇用保険料率（労働者負担分・令和8年度） ----
export const EMPLOYMENT_INSURANCE_KINDS: { kind: string; rate: number }[] = [
  { kind: "一般の事業", rate: 0.005 },
  { kind: "農林水産・清酒製造の事業", rate: 0.006 },
  { kind: "建設の事業", rate: 0.006 },
];

export function employmentInsuranceRate(kind: string): number {
  return EMPLOYMENT_INSURANCE_KINDS.find((k) => k.kind === kind)?.rate ?? 0.005;
}

// ---- 建設分野（国交省）の賃金基準 ----
// 所定内賃金（基本給＋毎月固定の手当。通勤手当・固定残業代は除く）が
// 「最低賃金の全国平均 × 1.1 × 年間所定労働時間 ÷ 12」以上でないと認定されない。
// 全国平均は毎年変動するため、改定されたらこの定数を入れ替える
export const CONSTRUCTION_MIN_WAGE_AVG = 1121;

// 建設分野で必要な所定内賃金の月額（円未満切り上げ）。例: 年間2080hなら213,738円
export function constructionMinMonthly(annualHours: number): number {
  return Math.ceil((CONSTRUCTION_MIN_WAGE_AVG * 1.1 * annualHours) / 12);
}

// ---- 諸手当の計算方法の文例（別紙の「計算方法」欄にそのまま書ける形） ----
export const WAGE_ALLOWANCE_TYPES = [
  "家族手当",
  "通勤手当",
  "住宅手当",
  "皆勤手当",
  "資格手当",
  "役職手当",
  "食事手当",
  "その他",
] as const;

export function allowanceMethodTemplate(type: string, amount: number): string {
  const yen = `月額${formatYen(amount)}円`;
  switch (type) {
    case "家族手当":
      return `扶養家族の人数に応じて算定し、${yen}を定額支給する。`;
    case "通勤手当":
      return `自宅から就労場所までの通勤に要する実費交通費として、${yen}を支給する。`;
    case "住宅手当":
      return `会社契約（借上げ）住宅の家賃相当額として、${yen}を定額支給する。`;
    case "皆勤手当":
      return `当該賃金計算期間中に欠勤がなかった場合に、${yen}を定額支給する。`;
    case "資格手当":
      return `業務に関連する資格・技能を保有する者に対し、${yen}を定額支給する。`;
    case "役職手当":
      return `職務の責任・役職の程度に応じ、${yen}を定額支給する。`;
    case "食事手当":
      return `食事の提供又は補助として、${yen}を定額支給する。`;
    default:
      return "支給要件（対象者・条件）と算定方法（定額／実費の別）を具体的に記載してください。";
  }
}

// ---- 表示の補助 ----
export function formatYen(n: number): string {
  return Math.round(Number(n) || 0).toLocaleString("ja-JP");
}

// ---- 1. 基本賃金（1か月当たりの金額に直す） ----
// 月給はそのまま、時給は「時給×年間所定労働時間÷12」、
// 日給は1日8時間として「日給×月平均所定労働日数」、年収は12で割る。
export function monthlyBaseWage(
  kind: WorkerWageKind | string,
  amount: number,
  annualHours: number,
): number {
  const a = Number(amount) || 0;
  const hours = Number(annualHours) || 0;
  if (kind === "月給") return a;
  if (kind === "年収") return Math.round(a / 12);
  if (kind === "時給") return hours > 0 ? Math.round((a * hours) / 12) : 0;
  if (kind === "日給") return hours > 0 ? Math.round((a * (hours / 12)) / 8) : 0;
  return a;
}

// 基本賃金の計算式の説明（別紙にそのまま書ける一文）
export function baseWageNote(
  kind: WorkerWageKind | string,
  amount: number,
  annualHours: number,
): string {
  const hours = Number(annualHours) || 0;
  if (hours <= 0) {
    return "年間所定労働時間が未登録のため、1か月当たりの金額を計算できません。";
  }
  const monthly = monthlyBaseWage(kind, amount, hours);
  if (kind === "月給") {
    const hourly = Math.round((amount * 12) / hours);
    return `※月給の場合の1時間当たりの金額：約 ${formatYen(hourly)}円（計算式：月給×12ヶ月÷年間所定労働時間数）`;
  }
  if (kind === "時給") {
    return `※時間給の場合の1か月当たりの金額：約 ${formatYen(monthly)}円（計算式：時給×年間所定労働時間数÷12ヶ月）`;
  }
  if (kind === "日給") {
    const days = hours / 12 / 8;
    return `※日給の場合の1か月当たりの金額：約 ${formatYen(monthly)}円（1日8時間を標準として、月平均所定労働日数 約${days.toFixed(1)}日で換算）／1時間当たり 約${formatYen(Math.round(amount / 8))}円`;
  }
  return `※年収の場合の1か月当たりの金額：約 ${formatYen(monthly)}円（計算式：年収÷12ヶ月）`;
}

// ---- 4-(a) 所得税（令和8年分 月額表 甲欄・電算機計算の特例） ----
// A = 社会保険料・雇用保険料を引いたあとの月額
export function calcIncomeTaxMonthly(
  amountAfterInsurance: number,
  hasSpouse: boolean,
  dependents: number,
): number {
  const A = Math.max(0, Math.round(Number(amountAfterInsurance) || 0));
  const deps = Math.max(0, Math.floor(Number(dependents) || 0));

  // 給与所得控除の月割
  let shotokuKoujo: number;
  if (A <= 158_333) shotokuKoujo = 54_167;
  else if (A <= 299_999) shotokuKoujo = A * 0.3 + 6_667;
  else if (A <= 549_999) shotokuKoujo = A * 0.2 + 36_667;
  else if (A <= 708_330) shotokuKoujo = A * 0.1 + 91_667;
  else shotokuKoujo = 162_500;
  shotokuKoujo = Math.ceil(shotokuKoujo);

  const haigusha = hasSpouse ? 31_667 : 0;
  const fuyou = 31_667 * Math.min(deps, 7);

  // 基礎控除の月割
  let kiso: number;
  if (A <= 2_120_833) kiso = 48_334;
  else if (A <= 2_162_499) kiso = 40_000;
  else if (A <= 2_204_166) kiso = 26_667;
  else if (A <= 2_245_833) kiso = 13_334;
  else kiso = 0;

  const B = Math.max(0, A - shotokuKoujo - haigusha - fuyou - kiso);

  let tax: number;
  if (B <= 162_500) tax = B * 0.05105;
  else if (B <= 275_000) tax = B * 0.1021 - 8_296;
  else if (B <= 579_166) tax = B * 0.2042 - 36_374;
  else if (B <= 750_000) tax = B * 0.23483 - 54_113;
  else if (B <= 1_500_000) tax = B * 0.33693 - 130_688;
  else if (B <= 3_333_333) tax = B * 0.4084 - 237_893;
  else tax = B * 0.45945 - 408_061;

  // 扶養親族等が8人以上のときは1人につき1,610円を差し引く
  if (deps > 7) tax -= (deps - 7) * 1_610;
  if (tax < 0) tax = 0;
  return Math.round(tax / 10) * 10;
}

// ---- 4-(b) 社会保険料（被保険者負担分の概算） ----
// 健康保険（折半）＋介護保険（40〜64歳のみ・折半）＋こども子育て支援金（折半）
// ＋厚生年金 18.3%（折半）
export function socialInsuranceAmount(
  gross: number,
  opts: { enabled: boolean; healthRate: number; ageBand: WageAgeBand },
): number {
  if (!opts.enabled) return 0;
  const kaigo = opts.ageBand === "40〜64歳" ? KAIGO_RATE : 0;
  const combined =
    (opts.healthRate + kaigo + KOSODATE_RATE + KOSEI_NENKIN_RATE) / 2;
  return Math.round(((Number(gross) || 0) * combined) / 100);
}

// ---- 4-(c) 雇用保険料（労働者負担分） ----
export function employmentInsuranceAmount(
  gross: number,
  opts: { enabled: boolean; kind: string },
): number {
  if (!opts.enabled) return 0;
  return Math.round((Number(gross) || 0) * employmentInsuranceRate(opts.kind));
}

// ---- 4-(e) 居住費（社宅） ----
// 所属機関に登録した寮の家賃（1人あたり・月額）をそのまま1人当たりの目安にする
export function lodgingPerPerson(lodging: Pick<OrgLodging, "rent" | "max_residents">): number {
  return Number(String(lodging.rent).replace(/[^0-9]/g, "")) || 0;
}

// 居住費の算定方法の文例（入管に説明できる形。人数が分かるときだけ具体的に書く）
export function lodgingNoteTemplate(
  lodging: Pick<OrgLodging, "name" | "rent" | "max_residents">,
  perPerson: number,
): string {
  const people = Number(String(lodging.max_residents).replace(/[^0-9]/g, "")) || 0;
  const where = lodging.name ? `${lodging.name}（会社が借り上げた社宅）` : "会社が借り上げた社宅";
  if (people) {
    return (
      `${where}について、家賃月額を入居者${people}名で按分した1人当たり月額${formatYen(perPerson)}円を徴収する。` +
      `敷金・礼金・仲介手数料等の初期費用は含まない。（算出根拠：賃貸借契約書、入居者名簿）`
    );
  }
  return (
    `${where}について、家賃月額を入居人数で按分した1人当たり月額${formatYen(perPerson)}円を徴収する。` +
    `敷金・礼金・仲介手数料等の初期費用は含まない。（算出根拠：賃貸借契約書、入居者名簿）`
  );
}

// ---- 既定値・保存された内容の読み込み ----
export function emptyWageDetail(): WageDetail {
  return {
    annual_hours: 0,
    allowances: [],
    fixed_ot_enabled: false,
    fixed_ot_amount: 0,
    fixed_ot_hours: 20,
    tax_spouse: false,
    tax_dependents: 0,
    social_enabled: true,
    health_prefecture: "熊本",
    health_rate: 10.08,
    age_band: "40歳未満",
    employment_enabled: true,
    employment_kind: "一般の事業",
    food_cost: 0,
    housing_self_contract: false,
    housing_lodging_id: "",
    housing_amount: 0,
    housing_note: "",
    utility_kind: "実費",
    utility_amount: 0,
    others: [],
    company_agreed: false,
  };
}

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// 保存された jsonb（項目が欠けていることがある）を、欠けを既定値で埋めた形にする
export function normalizeWageDetail(raw: unknown): WageDetail {
  const base = emptyWageDetail();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const allowances = Array.isArray(r.allowances)
    ? (r.allowances as Record<string, unknown>[]).map((a) => ({
        type: String(a?.type ?? "その他"),
        name: String(a?.name ?? ""),
        amount: toNumber(a?.amount),
        method: String(a?.method ?? ""),
      }))
    : base.allowances;
  const others = Array.isArray(r.others)
    ? (r.others as Record<string, unknown>[]).map((o) => ({
        name: String(o?.name ?? ""),
        amount: toNumber(o?.amount),
      }))
    : base.others;
  return {
    ...base,
    ...r,
    annual_hours: toNumber(r.annual_hours ?? base.annual_hours),
    allowances,
    others,
    fixed_ot_enabled: Boolean(r.fixed_ot_enabled ?? base.fixed_ot_enabled),
    fixed_ot_amount: toNumber(r.fixed_ot_amount ?? base.fixed_ot_amount),
    fixed_ot_hours: toNumber(r.fixed_ot_hours ?? base.fixed_ot_hours),
    tax_spouse: Boolean(r.tax_spouse ?? base.tax_spouse),
    tax_dependents: toNumber(r.tax_dependents ?? base.tax_dependents),
    social_enabled: Boolean(r.social_enabled ?? base.social_enabled),
    health_prefecture: String(r.health_prefecture ?? base.health_prefecture),
    health_rate: toNumber(r.health_rate ?? base.health_rate),
    age_band: (r.age_band as WageAgeBand) ?? base.age_band,
    employment_enabled: Boolean(r.employment_enabled ?? base.employment_enabled),
    employment_kind: String(r.employment_kind ?? base.employment_kind),
    food_cost: toNumber(r.food_cost ?? base.food_cost),
    housing_self_contract: Boolean(r.housing_self_contract ?? base.housing_self_contract),
    housing_lodging_id: String(r.housing_lodging_id ?? base.housing_lodging_id),
    housing_amount: toNumber(r.housing_amount ?? base.housing_amount),
    housing_note: String(r.housing_note ?? base.housing_note),
    utility_kind: (r.utility_kind as WageDetail["utility_kind"]) ?? base.utility_kind,
    utility_amount: toNumber(r.utility_amount ?? base.utility_amount),
    company_agreed: Boolean(r.company_agreed ?? base.company_agreed),
  };
}

// 何か入力されているか（賃金の行に別紙の内容が入っているかの判定に使う）
export function hasWageDetail(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  return Object.keys(raw as Record<string, unknown>).length > 0;
}

// ---- 計算結果 ----
export interface WageCalcResult {
  base: number; // 1. 基本賃金（1か月当たり）
  allowanceTotal: number; // 2. 諸手当 合計（固定残業代を含む）
  gross: number; // 3. 1か月当たりの支払概算額（1＋2）
  tax: number; // 4-(a) 所得税
  social: number; // 4-(b) 社会保険料
  employment: number; // 4-(c) 雇用保険料
  food: number; // 4-(d) 食費
  housing: number; // 4-(e) 居住費
  utility: number; // 4-(f) 水道光熱費
  otherTotal: number; // その他控除
  deductTotal: number; // 4. 控除額 合計
  net: number; // 5. 手取り支給額（3－4）
  healthRate: number; // 計算に使った健康保険料率（%）
  annualHours: number; // 計算に使った年間所定労働時間
}

// 賃金（区分・金額）と別紙の内容から、支払概算額・控除・手取りを出す
export function calcWageDetail(
  wage: { kind: WorkerWageKind | string; amount: number },
  detail: WageDetail,
  fallbackAnnualHours = 0,
): WageCalcResult {
  const annualHours = detail.annual_hours || fallbackAnnualHours;
  const base = monthlyBaseWage(wage.kind, wage.amount, annualHours);

  const allowanceSum = detail.allowances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const fixedOT = detail.fixed_ot_enabled ? Number(detail.fixed_ot_amount) || 0 : 0;
  const allowanceTotal = allowanceSum + fixedOT;

  const gross = base + allowanceTotal;

  const healthRate = healthInsuranceRate(detail.health_prefecture, detail.health_rate);
  const social = socialInsuranceAmount(gross, {
    enabled: detail.social_enabled,
    healthRate,
    ageBand: detail.age_band,
  });
  const employment = employmentInsuranceAmount(gross, {
    enabled: detail.employment_enabled,
    kind: detail.employment_kind,
  });
  const tax = calcIncomeTaxMonthly(
    Math.max(0, gross - social - employment),
    detail.tax_spouse,
    detail.tax_dependents,
  );

  const food = Number(detail.food_cost) || 0;
  const housing = detail.housing_self_contract ? 0 : Number(detail.housing_amount) || 0;
  const utility = Number(detail.utility_amount) || 0;
  const otherTotal = detail.others.reduce((s, o) => s + (Number(o.amount) || 0), 0);

  const deductTotal = tax + social + employment + food + housing + utility + otherTotal;

  return {
    base,
    allowanceTotal,
    gross,
    tax,
    social,
    employment,
    food,
    housing,
    utility,
    otherTotal,
    deductTotal,
    net: gross - deductTotal,
    healthRate,
    annualHours,
  };
}

// ---- 様式に貼り付けるテキスト（計算ツールの「様式用テキスト」と同じ形） ----
export function wageDetailFormText(
  wage: { kind: WorkerWageKind | string; amount: number },
  detail: WageDetail,
  result: WageCalcResult,
): string {
  const allowLines = detail.allowances
    .map(
      (a, i) =>
        `(${String.fromCharCode(97 + i)}) ${a.type}${a.name ? `／${a.name}` : ""} ${formatYen(a.amount)}円／計算方法：${a.method}`,
    )
    .join("\n");
  const otLine = detail.fixed_ot_enabled
    ? `(固定残業代) ${formatYen(detail.fixed_ot_amount)}円／時間外労働${formatYen(detail.fixed_ot_hours)}時間分の割増賃金として定額支給する。`
    : "";
  const otherLines = detail.others
    .map((o) => `　　　　　（${o.name}）（約${formatYen(o.amount)}円）`)
    .join("\n");

  const lines: string[] = [
    "【賃金の支払】",
    `１．基本賃金：${wage.kind}（${formatYen(wage.amount)}円）`,
    baseWageNote(wage.kind, wage.amount, result.annualHours),
    "",
    "２．諸手当の額及び計算方法等",
  ];
  if (allowLines) lines.push(allowLines);
  if (otLine) lines.push(otLine);
  lines.push(
    "",
    `３．１か月当たりの支払概算額（１＋２）　約${formatYen(result.gross)}円（合計）`,
    "",
    "４．賃金支払時に控除する項目",
    `(a) 税　　　金　　　（約${formatYen(result.tax)}円）`,
    `(b) 社会保険料　　　（約${formatYen(result.social)}円）`,
    `(c) 雇用保険料　　　（約${formatYen(result.employment)}円）`,
    `(d) 食　　　費　　　（約${formatYen(result.food)}円）`,
    `(e) 居　住　費　　　（約${formatYen(result.housing)}円）`,
  );
  if (detail.housing_note) lines.push(`　　${detail.housing_note}`);
  lines.push(`(f) その他（水道光熱費）（約${formatYen(result.utility)}円）`);
  if (otherLines) lines.push(otherLines);
  lines.push(
    `控除する金額　　約${formatYen(result.deductTotal)}円（合計）`,
    "",
    `５．手取り支給額（３－４）　約${formatYen(result.net)}円（合計）`,
    "※欠勤等がない場合であって、時間外労働の割増賃金等は除く。",
  );
  return lines.join("\n");
}
