import { PDFDocument, type PDFForm } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  dependentAge,
  dependentCategories,
  formatYenAmount,
  isSpouseRelation,
  remittanceTotal,
  warekiParts,
} from "@/lib/dependents";
import type { WorkerDependent } from "@/types/db";

// ---- 給与所得者の扶養控除等（異動）申告書（令和8年分・国税庁の入力用PDF）への入力 ----
// テンプレート（public/forms/fuyo-r8.pdf）のフィールド名は機械的な連番のため、
// ここで意味のある名前に対応付ける。座標をレンダリングして特定したマッピング。

// 発行パターン。年末調整時はB欄の「生計を一にする事実」にその年の送金合計額を記載する
export type FuyoFormKind = "入社時" | "年末調整時";

export interface FuyoFormData {
  kind?: FuyoFormKind; // 省略時は入社時
  worker: {
    name: string;
    kana: string;
    birth: string | null;
    address: string;
    myNumber: string;
    hasSpouse: string; // '' / 有 / 無
  };
  householdHead: string; // 世帯主の氏名
  headRelation: string; // あなたとの続柄（通常は 本人）
  dependents: WorkerDependent[];
}

// B欄（控除対象扶養親族・16歳以上）の行ごとのフィールド名
// fact = 「生計を一にする事実」欄（その年に送金した合計額を記載する）
const B_ROWS = [
  {
    kana: "Text25", name: "Text26", num: "Text27", rel: "Text28",
    era: "Dropdown5", y: "Text29", m: "Text30", d: "Text31",
    income: "Text32", addr: "Text33", fact: "Text120",
    cbElderly: "Check Box1-2", cbSpecific: "Check Box2-1",
    cbYoung: "Check Box3-1", cbRemit: "Check Box3-4",
  },
  {
    kana: "Text35", name: "Text36", num: "Text37", rel: "Text38",
    era: "Dropdown6", y: "Text39", m: "Text40", d: "Text41",
    income: "Text42", addr: "Text43", fact: "Text121",
    cbElderly: "Check Box4-2", cbSpecific: "Check Box5-1",
    cbYoung: "Check Box6-1", cbRemit: "Check Box6-4",
  },
  {
    kana: "Text45", name: "Text46", num: "Text47", rel: "Text48",
    era: "Dropdown7", y: "Text49", m: "Text50", d: "Text51",
    income: "Text52", addr: "Text53", fact: "Text122",
    cbElderly: "Check Box7-2", cbSpecific: "Check Box8-1",
    cbYoung: "Check Box9-1", cbRemit: "Check Box9-4",
  },
  {
    kana: "Text55", name: "Text56", num: "Text57", rel: "Text58",
    era: "Dropdown8", y: "Text59", m: "Text60", d: "Text61",
    income: "Text62", addr: "Text63", fact: "Text123",
    cbElderly: "Check Box10-2", cbSpecific: "Check Box11-1",
    cbYoung: "Check Box12-1", cbRemit: "Check Box12-4",
  },
] as const;

// 住民税に関する事項（16歳未満の扶養親族）の行ごとのフィールド名
const U16_ROWS = [
  {
    kana: "Text90", name: "Text91", num: "Text92", rel: "Text93",
    era: "Dropdown19", y: "Text94", m: "Text95", d: "Text96",
    addr: "Text97", overseas: "Dropdown20", income: "Text98",
  },
  {
    kana: "Text100", name: "Text101", num: "Text102", rel: "Text103",
    era: "Dropdown21", y: "Text119", m: "Text104", d: "Text105",
    addr: "Text106", overseas: "Dropdown22", income: "Text107",
  },
] as const;

export interface FuyoFieldValues {
  texts: Record<string, string>;
  dropdowns: Record<string, string>; // 値は選択肢の文字列（前後の空白は無視して照合）
  checks: string[]; // チェックするチェックボックス名
}

// 申告書の各フィールドに入れる値を組み立てる（純粋関数・テスト対象）。
// 扶養親族は非居住者（国外居住）前提で、控除区分は today 時点の年齢から自動判定する
export function buildFuyoFieldValues(data: FuyoFormData, today: string): FuyoFieldValues {
  const texts: Record<string, string> = {};
  const dropdowns: Record<string, string> = {};
  const checks: string[] = [];

  // 所得の見積額欄は様式側に「円」が印字済みのため、末尾の円は取り除く
  const yen = (v: string) => v.replace(/円\s*$/, "");

  const setBirth = (
    birth: string | null,
    era: string,
    y: string,
    m: string,
    d: string,
  ) => {
    const p = warekiParts(birth);
    if (!p) return;
    dropdowns[era] = p.era;
    texts[y] = String(p.year);
    texts[m] = String(p.month);
    texts[d] = String(p.day);
  };

  // 上部: 本人情報。給与の支払者の欄（名称・法人番号・所在地）は会社側が記載するため入力しない
  texts["Text6"] = data.worker.kana;
  texts["Text7"] = data.worker.name;
  texts["Text8"] = data.worker.myNumber;
  texts["Text10"] = data.worker.address;
  setBirth(data.worker.birth, "Dropdown1", "Text11", "Text12", "Text13");
  texts["Text14"] = data.householdHead;
  texts["Text15"] = data.headRelation;

  const spouse = data.dependents.find((dep) => isSpouseRelation(dep.relation));
  const over16 = data.dependents.filter(
    (dep) =>
      !isSpouseRelation(dep.relation) &&
      dep.birth !== "" &&
      (dependentAge(dep.birth, today) ?? 0) >= 16,
  );
  const under16 = data.dependents.filter(
    (dep) => dependentCategories(dep, today).under16,
  );

  // 配偶者の有無
  dropdowns["Dropdown2"] = spouse || data.worker.hasSpouse === "有" ? "有" : "無";

  // A欄: 源泉控除対象配偶者
  if (spouse) {
    texts["Text16"] = spouse.kana;
    texts["Text17"] = spouse.name;
    texts["Text18"] = spouse.my_number;
    setBirth(spouse.birth, "Dropdown4", "Text19", "Text20", "Text21");
    texts["Text22"] = yen(spouse.income);
    dropdowns["Dropdown50"] = "○"; // 非居住者である親族
    texts["Text23"] = spouse.address;
  }

  // B欄: 控除対象扶養親族（16歳以上）。様式は4行まで
  over16.slice(0, B_ROWS.length).forEach((dep, i) => {
    const row = B_ROWS[i];
    const c = dependentCategories(dep, today);
    texts[row.kana] = dep.kana;
    texts[row.name] = dep.name;
    texts[row.num] = dep.my_number;
    texts[row.rel] = dep.relation;
    setBirth(dep.birth, row.era, row.y, row.m, row.d);
    texts[row.income] = yen(dep.income);
    texts[row.addr] = dep.address;
    // 年末調整時は「生計を一にする事実」欄にその年（1/1〜12/31）の送金合計額を記載する
    if (data.kind === "年末調整時") {
      const total = remittanceTotal(dep.remittances);
      if (total > 0) texts[row.fact] = formatYenAmount(total);
    }
    if (c.elderly) checks.push(row.cbElderly); // 老人扶養親族（その他）
    if (c.specific) checks.push(row.cbSpecific); // 特定扶養親族
    if (c.youngOrElderly) checks.push(row.cbYoung); // 16歳以上30歳未満又は70歳以上
    if (c.remittanceRequired) checks.push(row.cbRemit); // 38万円以上の支払
  });

  // 住民税に関する事項: 16歳未満の扶養親族。様式は2行まで
  under16.slice(0, U16_ROWS.length).forEach((dep, i) => {
    const row = U16_ROWS[i];
    texts[row.kana] = dep.kana;
    texts[row.name] = dep.name;
    texts[row.num] = dep.my_number;
    texts[row.rel] = dep.relation;
    setBirth(dep.birth, row.era, row.y, row.m, row.d);
    texts[row.addr] = dep.address;
    dropdowns[row.overseas] = "○"; // 控除対象外国外扶養親族
    texts[row.income] = yen(dep.income);
  });

  return { texts, dropdowns, checks };
}

// 様式の行数を超えた人数（画面での注意表示に使う）
export function fuyoOverflow(data: FuyoFormData, today: string): {
  over16Overflow: number;
  under16Overflow: number;
} {
  const over16 = data.dependents.filter(
    (dep) =>
      !isSpouseRelation(dep.relation) &&
      dep.birth !== "" &&
      (dependentAge(dep.birth, today) ?? 0) >= 16,
  ).length;
  const under16 = data.dependents.filter(
    (dep) => dependentCategories(dep, today).under16,
  ).length;
  return {
    over16Overflow: Math.max(0, over16 - B_ROWS.length),
    under16Overflow: Math.max(0, under16 - U16_ROWS.length),
  };
}

// 選択肢の前後空白を無視してドロップダウンを選択する（テンプレートの選択肢に「 ○」がある）
function selectOption(form: PDFForm, name: string, value: string) {
  const field = form.getDropdown(name);
  const option = field.getOptions().find((o) => o.trim() === value.trim());
  if (option) field.select(option);
}

// テンプレートPDFに値を書き込んで返す。flatten すると以後の編集不可＝印刷用の確定版になる
export async function fillFuyoForm(
  template: ArrayBuffer | Uint8Array,
  font: ArrayBuffer | Uint8Array,
  data: FuyoFormData,
  today: string,
  options: { flatten?: boolean } = {},
): Promise<Uint8Array> {
  const { flatten = true } = options;
  const doc = await PDFDocument.load(template);
  doc.registerFontkit(fontkit);
  // subset: true にすると一部ビューアで日本語グリフが描画されない（CFFサブセットの不具合）ため
  // フォントは全埋め込みにする（生成PDFは5MB程度になるが確実に表示される）
  const jpFont = await doc.embedFont(font, { subset: false });
  const form = doc.getForm();
  const values = buildFuyoFieldValues(data, today);

  for (const [name, value] of Object.entries(values.texts)) {
    if (!value) continue;
    const field = form.getTextField(name);
    const max = field.acroField.getMaxLength();
    field.setFontSize(0); // 枠に合わせて自動縮小
    field.setText(max != null ? value.slice(0, max) : value);
  }
  for (const [name, value] of Object.entries(values.dropdowns)) {
    if (!value) continue;
    selectOption(form, name, value);
  }
  for (const name of values.checks) {
    form.getCheckBox(name).check();
  }

  form.updateFieldAppearances(jpFont);
  if (flatten) form.flatten();
  return doc.save();
}
