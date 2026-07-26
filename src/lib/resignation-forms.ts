// 随時届出の参考様式（public/forms/ の公式テンプレート）へ退職記録を転記する。
// 3-1-2号・3-4号は Excel、5-11号は Word。いずれも jszip でテンプレートのXMLを
// 直接編集する（対象セル・トークン以外はテンプレートをバイト単位でそのまま残す）。
// テンプレートのセル座標は公式様式（アップロードされた実ファイル）から特定したもの。
//
// 以前は Excel を exceljs で読み込み直して書き出していたが、デプロイ環境によっては
// 壊れたファイルが生成され、Excel が開くときに「修復」してシートが空になる問題が
// 起きたため、テンプレートを解釈し直さないこの方式に変更した。

import type { ResignationKind } from "@/types/db";

export const FORM_TEMPLATE_PATHS = {
  form312: "/forms/sanko-3-1-2.xlsx",
  form34: "/forms/sanko-3-4.xlsx",
  form511: "/forms/sanko-5-11.docx",
  form14: "/forms/sanko-1-4.xlsx",
} as const;

const CHECKED = "☑";
const UNCHECKED = "□";

// 3-1-2号「終了の事由」（実様式のチェック体系）
export const END_REASONS_312 = [
  { code: "01", label: "01.雇用契約の終期到来", cell: "D47", kind: null },
  { code: "02", label: "02.経営上の都合", cell: "E50", kind: "会社都合" },
  { code: "03", label: "03.基準不適合", cell: "E51", kind: "会社都合" },
  { code: "04", label: "04.死亡（個人事業主）", cell: "E52", kind: "会社都合" },
  { code: "05", label: "05.その他（理由を記入）", cell: "E53", kind: "会社都合" },
  { code: "06", label: "06.死亡", cell: "E56", kind: "自己都合" },
  { code: "07", label: "07.病気・怪我", cell: "E57", kind: "自己都合" },
  { code: "08", label: "08.行方不明", cell: "E58", kind: "自己都合" },
  { code: "09", label: "09.重責解雇", cell: "E59", kind: "自己都合" },
  { code: "10", label: "10.自己都合退職", cell: "E60", kind: "自己都合" },
  { code: "11", label: "11.その他（理由を記入）", cell: "E61", kind: "自己都合" },
] as const;

export type EndReason312Code = (typeof END_REASONS_312)[number]["code"];

// 退職区分に応じた既定の終了の事由。
// 運用ルール: 会社都合は「05.その他」＋括弧内に理由、自己都合は「10.自己都合退職」。
export function defaultEndReason312(kind: ResignationKind): EndReason312Code {
  return kind === "会社都合" ? "05" : "10";
}

// 退職区分で選べる事由の選択肢（01は両方で選択可）
export function endReasonOptions312(kind: ResignationKind) {
  return END_REASONS_312.filter((r) => r.kind === null || r.kind === kind);
}

// 3-4号 ③特定技能外国人の現状
export const CONTACT_STATUSES_34 = [
  { value: "連絡可能", cell: "K86" },
  { value: "連絡不可能", cell: "K87" },
] as const;

// 3-4号 ④Ａ活動継続の意思
export const INTENTION_OPTIONS_34 = [
  { value: "活動継続の意思あり（復帰予定あり）", cell: "I92" },
  { value: "活動継続の意思あり（復帰予定なし）", cell: "I93" },
  { value: "活動継続の意思なし（転職希望）", cell: "I94" },
  { value: "活動継続の意思なし（帰国希望）", cell: "I95" },
  { value: "確認不可能", cell: "I96" },
] as const;

// 3-4号 ④Ｂ措置内容
export const MEASURE_OPTIONS_34 = [
  { value: "雇用継続予定", cell: "I99" },
  { value: "転職支援実施予定", cell: "I100" },
  { value: "帰国支援実施予定", cell: "I101" },
  { value: "雇用契約解除予定", cell: "I102" },
] as const;

// 特定産業分野と業務区分の対応表（様式の記載要領に基づく）。
// 分野を選択すると、その分野の業務区分だけが選べるようになる。
export const FORM_INDUSTRY_CATEGORIES: { field: string; categories: string[] }[] = [
  { field: "介護分野", categories: ["介護"] },
  { field: "ビルクリーニング分野", categories: ["ビルクリーニング"] },
  { field: "リネンサプライ分野", categories: ["リネンサプライ"] },
  {
    field: "工業製品製造業分野",
    categories: [
      "機械金属加工",
      "電気電子機器組立て",
      "金属表面処理",
      "紙器・段ボール箱製造",
      "コンクリート製品製造",
      "RPF製造",
      "陶磁器製品製造",
      "印刷・製本",
      "紡織製品製造",
      "縫製",
      "電線・ケーブル製造",
      "プレハブ住宅製品製造",
      "家具製造",
      "定形・不定形耐火物製造",
      "生コンクリート製造",
      "ゴム製品製造",
      "かばん製造",
    ],
  },
  { field: "建設分野", categories: ["土木", "建築", "ライフライン・設備"] },
  { field: "造船・舶用工業分野", categories: ["造船", "舶用機械", "舶用電気電子機器"] },
  { field: "自動車整備分野", categories: ["自動車の整備等"] },
  { field: "航空分野", categories: ["空港グランドハンドリング", "航空機整備"] },
  { field: "宿泊分野", categories: ["宿泊"] },
  { field: "自動車運送業分野", categories: ["トラック運転者", "タクシー運転者", "バス運転者"] },
  {
    field: "鉄道分野",
    categories: ["軌道整備", "電気設備整備", "車両整備", "車両製造", "運輸係員", "駅・車両清掃"],
  },
  { field: "物流倉庫分野", categories: ["物流倉庫"] },
  { field: "農業分野", categories: ["耕種農業", "畜産農業"] },
  { field: "漁業分野", categories: ["漁業", "養殖業"] },
  { field: "飲食料品製造業分野", categories: ["飲食料品製造業全般"] },
  { field: "外食業分野", categories: ["外食業"] },
  { field: "林業分野", categories: ["林業"] },
  { field: "木材産業分野", categories: ["木材産業"] },
  { field: "資源循環分野", categories: ["廃棄物処分業（中間処理）"] },
];

export function categoriesForField(field: string): string[] {
  return FORM_INDUSTRY_CATEGORIES.find((e) => e.field === field)?.categories ?? [];
}

// 外国人情報の自由入力（例: 「農業分野・耕種農業」）から対応表の分野を推定する
export function matchFormField(workerField: string): string {
  if (!workerField) return "";
  const exact = FORM_INDUSTRY_CATEGORIES.find((e) => e.field === workerField);
  if (exact) return exact.field;
  // 最長一致（「工業製品製造業分野」と「飲食料品製造業分野」の取り違えを防ぐ）
  let best = "";
  for (const e of FORM_INDUSTRY_CATEGORIES) {
    const stem = e.field.replace(/分野$/, "");
    if (workerField.includes(stem) && stem.length > best.replace(/分野$/, "").length) {
      best = e.field;
    }
  }
  return best;
}

// 届出書へ転記するデータ一式（画面で編集した最終値を渡す）
export interface FormFillData {
  kind: ResignationKind;
  // 届出の対象者
  workerName: string; // 氏名（ローマ字）
  gender: string; // 男 / 女 / ''（不明なら様式の「男・女」を残す）
  birth: string | null; // YYYY-MM-DD
  nationality: string;
  address: string; // 住居地
  residenceCardNo: string; // 12桁
  field: string; // 特定産業分野
  businessCategory: string; // 業務区分
  // 退職情報
  leavingOn: string; // YYYY-MM-DD（雇用契約終了年月日・委託契約終了年月日・事由発生日）
  reason: string; // その他（05/11）の括弧内に記入する理由
  caseSummary: string; // 3-4号の事案の概要（全角20文字以内）
  endReason: EndReason312Code;
  // 委託契約をしていた登録支援機関（毎回同じ）
  supportRegNo: string;
  supportName: string;
  supportAddress: string;
  // 届出機関（退職元の特定技能所属機関）
  orgName: string;
  orgAddress: string;
  orgPhone: string;
  orgStaff: string; // 担当者
  orgCorporateNo: string; // 法人番号（13桁・法人でない場合は空）
  // 3-4号の選択欄
  contactStatus: string; // ③現状
  intention: string; // ④Ａ
  measure: string; // ④Ｂ
}
// 作成年月日・届出年月日は署名してもらった日を手書きするため、どの様式にも記載しない

interface DateParts {
  y: string;
  m: string;
  d: string;
}

function dateParts(dateStr: string | null | undefined): DateParts {
  if (!dateStr) return { y: "", m: "", d: "" };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return { y: "", m: "", d: "" };
  return { y: m[1], m: String(Number(m[2])), d: String(Number(m[3])) };
}

// 性別の自由入力から様式記入用の「男/女」を判定（判定不能は空）
export function genderMark(gender: string): "男" | "女" | "" {
  if (gender.includes("女") || /^f/i.test(gender)) return "女";
  if (gender.includes("男") || /^m/i.test(gender)) return "男";
  return "";
}

// 在留カード番号を1文字ずつ12個のマスへ（スペース除去・大文字化）
function cardChars(cardNo: string): string[] {
  const chars = cardNo.replace(/\s/g, "").toUpperCase().split("");
  return Array.from({ length: 12 }, (_, i) => chars[i] ?? "");
}

// 法人番号を1桁ずつ13個のマスへ（数字以外は除去。空なら全マス空欄のまま）
function corporateChars(corporateNo: string): string[] {
  const digits = corporateNo.replace(/\D/g, "").split("");
  return Array.from({ length: 13 }, (_, i) => digits[i] ?? "");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// 書き込むセルの値一式（セル番地 → 文字列）
type CellValues = Record<string, string>;

// チェックボックス群: 該当セルだけ ☑、それ以外は □ にする
function checkMarks(cells: string[], checkedCell: string | null): CellValues {
  return Object.fromEntries(cells.map((c) => [c, c === checkedCell ? CHECKED : UNCHECKED]));
}

// sheet1.xml 内の <c r="番地" ...> 要素だけを書き換える。
// スタイル属性（s="n"）は残し、値は inlineStr（テンプレートと同じ文字列形式）で入れる。
function setSheetCell(xml: string, addr: string, value: string): string {
  const key = `<c r="${addr}"`;
  const start = xml.indexOf(key);
  if (start < 0) {
    throw new Error(`テンプレートにセル ${addr} が見つかりません（様式が変わった可能性があります）`);
  }
  const tagEnd = xml.indexOf(">", start);
  const selfClosing = xml[tagEnd - 1] === "/";
  const end = selfClosing ? tagEnd + 1 : xml.indexOf("</c>", tagEnd) + "</c>".length;
  const openTag = xml.slice(start, tagEnd);
  const sAttr = / s="\d+"/.exec(openTag)?.[0] ?? "";
  const cell =
    value === ""
      ? `<c r="${addr}"${sAttr}/>`
      : `<c r="${addr}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  return xml.slice(0, start) + cell + xml.slice(end);
}

// Excel テンプレートの先頭シートへセル値を転記する（対象セル以外は一切変更しない）
async function fillXlsxTemplate(template: ArrayBuffer, cells: CellValues): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(template);
  const sheetPath = "xl/worksheets/sheet1.xml";
  const sheet = zip.file(sheetPath);
  if (!sheet) throw new Error("テンプレートの形式が不正です（sheet1.xml がありません）");
  let xml = await sheet.async("string");
  for (const [addr, value] of Object.entries(cells)) {
    xml = setSheetCell(xml, addr, value);
  }
  // createFolders: false — テンプレートに無いフォルダエントリを zip に増やさない
  zip.file(sheetPath, xml, { createFolders: false });
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ---- 参考様式第3-1-2号（Excel） ----

export async function fill312(template: ArrayBuffer, data: FormFillData): Promise<Uint8Array> {
  const birth = dateParts(data.birth);
  const leave = dateParts(data.leavingOn);
  const card = cardChars(data.residenceCardNo);
  const cardCells = ["I27", "K27", "M27", "O27", "Q27", "S27", "U27", "W27", "Y27", "AA27", "AC27", "AE27"];

  // ① 届出の対象者
  const cells: CellValues = {
    I16: data.workerName,
    I19: birth.y,
    O19: birth.m,
    S19: birth.d,
    AC19: data.nationality,
    I22: data.address,
    I30: data.field,
    AB30: data.businessCategory,
  };
  const mark = genderMark(data.gender);
  if (mark) cells.AE16 = mark;
  cardCells.forEach((addr, i) => {
    cells[addr] = card[i];
  });

  // ② 届出の事由: 特定技能雇用契約の終了にチェック
  cells.B35 = CHECKED;
  cells.M35 = UNCHECKED;

  // Ａa 雇用契約終了年月日
  Object.assign(cells, { M42: leave.y, S42: leave.m, W42: leave.d });

  // Ａb 終了の事由: 親チェック（所属機関の都合 D49 / 外国人の都合 D55）＋該当番号
  const reasonDef = END_REASONS_312.find((r) => r.code === data.endReason);
  const parent = reasonDef?.kind === "会社都合" ? "D49" : reasonDef?.kind === "自己都合" ? "D55" : null;
  cells.D47 = data.endReason === "01" ? CHECKED : UNCHECKED;
  cells.D49 = parent === "D49" ? CHECKED : UNCHECKED;
  cells.D55 = parent === "D55" ? CHECKED : UNCHECKED;
  Object.assign(cells, checkMarks(["E50", "E51", "E52", "E53"], parent === "D49" ? (reasonDef?.cell ?? null) : null));
  Object.assign(
    cells,
    checkMarks(["E56", "E57", "E58", "E59", "E60", "E61"], parent === "D55" ? (reasonDef?.cell ?? null) : null),
  );
  // その他（05/11）は括弧内に理由を記入
  if (data.endReason === "05") {
    cells.F53 = `05.その他（　${data.reason}　）`;
  }
  if (data.endReason === "11") {
    cells.F61 = `11.その他（　${data.reason}　）`;
  }

  // Ａc 委託契約終了年月日＋登録支援機関（毎回同じ）
  Object.assign(cells, {
    J71: leave.y,
    P71: leave.m,
    T71: leave.d,
    J74: data.supportRegNo,
    J80: data.supportName,
    J83: data.supportAddress,
  });

  // ③ 届出機関（退職元の特定技能所属機関）。法人の場合は法人番号を1桁ずつ
  const corp = corporateChars(data.orgCorporateNo);
  ["I98", "K98", "M98", "O98", "Q98", "S98", "U98", "W98", "Y98", "AA98", "AC98", "AE98", "AG98"].forEach(
    (addr, i) => {
      if (corp[i]) cells[addr] = corp[i];
    },
  );
  Object.assign(cells, {
    I101: data.orgName,
    I104: data.orgAddress,
    I108: data.orgStaff,
    AA108: data.orgPhone,
  });

  // 作成年月日は署名日を手書きするため記載しない

  return fillXlsxTemplate(template, cells);
}

// ---- 参考様式第3-4号（Excel・会社都合のみ） ----

export async function fill34(template: ArrayBuffer, data: FormFillData): Promise<Uint8Array> {
  const birth = dateParts(data.birth);
  const leave = dateParts(data.leavingOn);
  const card = cardChars(data.residenceCardNo);
  const cardCells = ["H30", "J30", "L30", "N30", "P30", "R30", "T30", "V30", "X30", "Z30", "AB30", "AD30"];

  // ① 届出の対象者
  const cells: CellValues = {
    H19: data.workerName,
    H22: birth.y,
    N22: birth.m,
    R22: birth.d,
    AB22: data.nationality,
    H25: data.address,
    H33: data.field,
    Z33: data.businessCategory,
  };
  const mark = genderMark(data.gender);
  if (mark) cells.AD19 = mark;
  cardCells.forEach((addr, i) => {
    cells[addr] = card[i];
  });

  // ② 届出の事由（この様式は会社都合＝特定技能所属機関の都合のＡ欄を使う）
  cells.F39 = CHECKED;
  cells.T39 = UNCHECKED;

  // Ａa 事由の区分: 3-1-2号の終了の事由（02〜05）に対応させる
  const kubunCell =
    data.endReason === "02" ? "K48" : data.endReason === "03" ? "K49" : data.endReason === "04" ? "K50" : "K51";
  Object.assign(cells, checkMarks(["K48", "K49", "K50", "K51"], kubunCell));
  if (kubunCell === "K51") {
    cells.L51 = `その他（　${data.reason}　）`;
  }

  // Ａb 事由発生日 / Ａc 事案の概要（全角20文字以内）
  Object.assign(cells, { J54: leave.y, P54: leave.m, T54: leave.d, J58: data.caseSummary });

  // ③ 特定技能外国人の現状
  const contactCell = CONTACT_STATUSES_34.find((o) => o.value === data.contactStatus)?.cell ?? null;
  Object.assign(cells, checkMarks(["K86", "K87"], contactCell));

  // ④Ａ 活動継続の意思 / ④Ｂ 措置内容
  const intentionCell = INTENTION_OPTIONS_34.find((o) => o.value === data.intention)?.cell ?? null;
  Object.assign(
    cells,
    checkMarks(
      INTENTION_OPTIONS_34.map((o) => o.cell),
      intentionCell,
    ),
  );
  const measureCell = MEASURE_OPTIONS_34.find((o) => o.value === data.measure)?.cell ?? null;
  Object.assign(
    cells,
    checkMarks(
      MEASURE_OPTIONS_34.map((o) => o.cell),
      measureCell,
    ),
  );

  // ⑤ 届出機関。法人の場合は法人番号を1桁ずつ
  const corp = corporateChars(data.orgCorporateNo);
  ["I108", "K108", "M108", "O108", "Q108", "S108", "U108", "W108", "Y108", "AA108", "AC108", "AE108", "AG108"].forEach(
    (addr, i) => {
      if (corp[i]) cells[addr] = corp[i];
    },
  );
  Object.assign(cells, {
    I111: data.orgName,
    I114: data.orgAddress,
    I118: data.orgStaff,
    AA118: data.orgPhone,
  });

  // 作成年月日は署名日を手書きするため記載しない

  return fillXlsxTemplate(template, cells);
}

// ---- 参考様式1の4「契約機関に関する届出（契約の終了）」（Excel・本人が提出） ----
// 退職した外国人本人が入管へ提出する届出。随時報告書と一緒に作成する。
// ③署名・⑥届出年月日は本人が署名した日を手書きするため空欄のまま、
// ⑤提出者は本人以外が提出する場合のみ記入する欄なので触らない。

// 性別・在留資格はテンプレートのプルダウン（リスト入力規則）の値に合わせる
const SEX_OPTIONS_14: Record<"男" | "女", string> = {
  男: "男（ Male ）",
  女: "女（Female）",
};
const STATUS_SSW_14 = "特定技能　（　Specified Skilled Worker　）";

// 住居地・所在地の入力欄は「〒」が欄内に印字されているため、上書きしても残るように付け直す
function withPostalMark(address: string): string {
  const a = address.trim();
  return a.startsWith("〒") ? a : `〒　${a}`;
}

export async function fill14(template: ArrayBuffer, data: FormFillData): Promise<Uint8Array> {
  const birth = dateParts(data.birth);
  const leave = dateParts(data.leavingOn);
  const card = cardChars(data.residenceCardNo);
  const cardCells = ["H18", "J18", "L18", "N18", "P18", "R18", "T18", "V18", "X18", "Z18", "AB18", "AD18"];

  // ① 届出人（本人）
  const cells: CellValues = {
    J9: data.workerName,
    H12: birth.y,
    N12: birth.m,
    R12: birth.d,
    AA12: data.nationality,
    H22: STATUS_SSW_14,
  };
  const mark = genderMark(data.gender);
  if (mark) cells.AD9 = SEX_OPTIONS_14[mark];
  if (data.address.trim()) cells.H15 = withPostalMark(data.address);
  cardCells.forEach((addr, i) => {
    cells[addr] = card[i];
  });

  // ② 届出の事由（契約の終了）: 終了年月日・法人番号・機関の名称・所在地
  Object.assign(cells, { K30: leave.y, Q30: leave.m, U30: leave.d });
  const corp = data.orgCorporateNo.replace(/\D/g, "");
  if (corp) cells.AD30 = corp;
  cells.L36 = data.orgName;
  if (data.orgAddress.trim()) cells.M42 = withPostalMark(data.orgAddress);

  return fillXlsxTemplate(template, cells);
}

// ---- 参考様式第5-11号（Word・会社都合のみ） ----
// テンプレート内の {{TOKEN}} を置換する（経緯の本文はWordで記入する運用）

export async function fill511(template: ArrayBuffer, data: FormFillData): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(template);
  const path = "word/document.xml";
  let xml = await zip.file(path)!.async("string");

  // 作成年月日は署名日を手書きするため空欄のままにする
  const tokens: Record<string, string> = {
    "{{WORKER_NAME}}": data.workerName,
    "{{ORG_NAME}}": data.orgName,
    "{{STAFF_NAME}}": data.orgStaff,
    "{{CONTACT_NAME}}": "",
    "{{DATE}}": "　　　　年　　　月　　　日",
  };
  for (const [tok, value] of Object.entries(tokens)) {
    xml = xml.split(tok).join(escapeXml(value));
  }
  zip.file(path, xml, { createFolders: false });
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
