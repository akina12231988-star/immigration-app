import type { WorkerDependent } from "@/types/db";

// ---- 扶養家族の年齢・和暦・控除区分の判定 ----

// YYYY-MM-DD から today 時点の満年齢を返す。不正な日付は null
export function dependentAge(birth: string, today: string): number | null {
  const b = birth.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = today.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!b || !t) return null;
  let age = Number(t[1]) - Number(b[1]);
  // 誕生日がまだ来ていなければ1歳引く
  if (`${t[2]}-${t[3]}` < `${b[2]}-${b[3]}`) age -= 1;
  return age >= 0 ? age : null;
}

// YYYY-MM-DD → 和暦表示（例: 1999-12-12 → 平成11年12月12日）。元号外・不正な日付は ''
export function warekiDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ymd = dateStr;
  let era = "";
  let eraYear = 0;
  if (ymd >= "2019-05-01") {
    era = "令和";
    eraYear = y - 2018;
  } else if (ymd >= "1989-01-08") {
    era = "平成";
    eraYear = y - 1988;
  } else if (ymd >= "1926-12-25") {
    era = "昭和";
    eraYear = y - 1925;
  } else if (ymd >= "1912-07-30") {
    era = "大正";
    eraYear = y - 1911;
  } else {
    return "";
  }
  return `${era}${eraYear === 1 ? "元" : eraYear}年${mo}月${d}日`;
}

// 続柄が配偶者か（配偶者控除の対象）
export function isSpouseRelation(relation: string): boolean {
  return /配偶者|妻|夫/.test(relation);
}

// 扶養家族の該当区分。年齢は today（現時点）から計算する。
// 外国人の扶養親族は国外居住（非居住者）が前提のため、
// 30歳以上70歳未満は「38万円以上の支払（送金）」が扶養控除の要件になる
export interface DependentCategories {
  spouse: boolean; // 配偶者控除
  elderly: boolean; // 老人扶養親族（70歳以上）
  specific: boolean; // 特定扶養親族・特定親族（19歳以上23歳未満）
  youngOrElderly: boolean; // 16歳以上30歳未満又は70歳以上（非居住者でもそのまま控除対象）
  remittanceRequired: boolean; // 38万円以上の支払必要（30歳以上70歳未満の非居住者）
  under16: boolean; // 16歳未満の親族（扶養控除対象外・住民税欄に記載）
}

export function dependentCategories(
  dep: Pick<WorkerDependent, "relation" | "birth">,
  today: string,
): DependentCategories {
  const spouse = isSpouseRelation(dep.relation);
  const age = dependentAge(dep.birth, today);
  const none: DependentCategories = {
    spouse,
    elderly: false,
    specific: false,
    youngOrElderly: false,
    remittanceRequired: false,
    under16: false,
  };
  if (age == null || spouse) return none;
  return {
    spouse: false,
    elderly: age >= 70,
    specific: age >= 19 && age < 23,
    youngOrElderly: (age >= 16 && age < 30) || age >= 70,
    remittanceRequired: age >= 30 && age < 70,
    under16: age < 16,
  };
}

// 区分バッジの表示ラベル（該当するものだけ）
export function dependentCategoryLabels(
  dep: Pick<WorkerDependent, "relation" | "birth">,
  today: string,
): string[] {
  const c = dependentCategories(dep, today);
  const labels: string[] = [];
  if (c.spouse) labels.push("配偶者控除");
  if (c.elderly) labels.push("老人扶養親族");
  if (c.specific) labels.push("特定扶養親族・特定親族");
  if (c.youngOrElderly) labels.push("16歳以上30歳未満又は70歳以上");
  if (c.remittanceRequired) labels.push("38万円以上の支払必要");
  if (c.under16) labels.push("16歳未満の親族");
  return labels;
}

export function emptyDependent(): WorkerDependent {
  return {
    name: "",
    kana: "",
    relation: "",
    birth: "",
    address: "",
    occupation: "",
    my_number: "",
    income: "",
  };
}

// 保存済みの dependents（欠けたキーがあり得る）を完全な形に補完する
export function normalizeDependents(raw: unknown): WorkerDependent[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((d) => ({
    ...emptyDependent(),
    ...(d && typeof d === "object" ? d : {}),
  }));
}
