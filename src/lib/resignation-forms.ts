// 随時届出の参考様式（public/forms/ の公式テンプレート）へ退職記録を転記する。
// 3-1-2号・3-4号は Excel（exceljs）、5-11号は Word（jszip でトークン置換）。
// テンプレートのセル座標は公式様式（アップロードされた実ファイル）から特定したもの。

import type { ResignationKind } from "@/types/db";

export const FORM_TEMPLATE_PATHS = {
  form312: "/forms/sanko-3-1-2.xlsx",
  form34: "/forms/sanko-3-4.xlsx",
  form511: "/forms/sanko-5-11.docx",
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
  reason: string; // 理由（05/11その他の括弧・3-4号の事案の概要）
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
  // 3-4号の選択欄
  contactStatus: string; // ③現状
  intention: string; // ④Ａ
  measure: string; // ④Ｂ
  // 作成年月日
  reportOn: string; // YYYY-MM-DD
}

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

type Worksheet = {
  getCell(address: string): { value: unknown };
};

function setCells(ws: Worksheet, entries: Record<string, string>) {
  for (const [addr, value] of Object.entries(entries)) {
    ws.getCell(addr).value = value;
  }
}

function setChecks(ws: Worksheet, cells: string[], checkedCell: string | null) {
  for (const c of cells) {
    ws.getCell(c).value = c === checkedCell ? CHECKED : UNCHECKED;
  }
}

// exceljs はCJSのため、実行環境によって default に本体が入る場合がある
async function loadExcelJS(): Promise<typeof import("exceljs")> {
  const mod = (await import("exceljs")) as unknown as {
    default?: typeof import("exceljs");
    Workbook?: unknown;
  };
  return (mod.Workbook ? mod : mod.default) as typeof import("exceljs");
}

// ---- 参考様式第3-1-2号（Excel） ----

export async function fill312(template: ArrayBuffer, data: FormFillData): Promise<Uint8Array> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template);
  const ws = wb.worksheets[0];

  const birth = dateParts(data.birth);
  const leave = dateParts(data.leavingOn);
  const report = dateParts(data.reportOn);
  const card = cardChars(data.residenceCardNo);
  const cardCells = ["I27", "K27", "M27", "O27", "Q27", "S27", "U27", "W27", "Y27", "AA27", "AC27", "AE27"];

  // ① 届出の対象者
  setCells(ws, {
    I16: data.workerName,
    I19: birth.y,
    O19: birth.m,
    S19: birth.d,
    AC19: data.nationality,
    I22: data.address,
    I30: data.field,
    AB30: data.businessCategory,
  });
  const mark = genderMark(data.gender);
  if (mark) ws.getCell("AE16").value = mark;
  cardCells.forEach((addr, i) => {
    ws.getCell(addr).value = card[i];
  });

  // ② 届出の事由: 特定技能雇用契約の終了にチェック
  ws.getCell("B35").value = CHECKED;
  ws.getCell("M35").value = UNCHECKED;

  // Ａa 雇用契約終了年月日
  setCells(ws, { M42: leave.y, S42: leave.m, W42: leave.d });

  // Ａb 終了の事由: 親チェック（所属機関の都合 D49 / 外国人の都合 D55）＋該当番号
  const reasonDef = END_REASONS_312.find((r) => r.code === data.endReason);
  const parent = reasonDef?.kind === "会社都合" ? "D49" : reasonDef?.kind === "自己都合" ? "D55" : null;
  ws.getCell("D47").value = data.endReason === "01" ? CHECKED : UNCHECKED;
  ws.getCell("D49").value = parent === "D49" ? CHECKED : UNCHECKED;
  ws.getCell("D55").value = parent === "D55" ? CHECKED : UNCHECKED;
  setChecks(ws, ["E50", "E51", "E52", "E53"], parent === "D49" ? reasonDef?.cell ?? null : null);
  setChecks(ws, ["E56", "E57", "E58", "E59", "E60", "E61"], parent === "D55" ? reasonDef?.cell ?? null : null);
  // その他（05/11）は括弧内に理由を記入
  if (data.endReason === "05") {
    ws.getCell("F53").value = `05.その他（　${data.reason}　）`;
  }
  if (data.endReason === "11") {
    ws.getCell("F61").value = `11.その他（　${data.reason}　）`;
  }

  // Ａc 委託契約終了年月日＋登録支援機関（毎回同じ）
  setCells(ws, {
    J71: leave.y,
    P71: leave.m,
    T71: leave.d,
    J74: data.supportRegNo,
    J80: data.supportName,
    J83: data.supportAddress,
  });

  // ③ 届出機関（退職元の特定技能所属機関）
  setCells(ws, {
    I101: data.orgName,
    I104: data.orgAddress,
    I108: data.orgStaff,
    AA108: data.orgPhone,
  });

  // 作成年月日
  setCells(ws, { U116: report.y, AA116: report.m, AE116: report.d });

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

// ---- 参考様式第3-4号（Excel・会社都合のみ） ----

export async function fill34(template: ArrayBuffer, data: FormFillData): Promise<Uint8Array> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template);
  const ws = wb.worksheets[0];

  const birth = dateParts(data.birth);
  const leave = dateParts(data.leavingOn);
  const report = dateParts(data.reportOn);
  const card = cardChars(data.residenceCardNo);
  const cardCells = ["H30", "J30", "L30", "N30", "P30", "R30", "T30", "V30", "X30", "Z30", "AB30", "AD30"];

  // ① 届出の対象者
  setCells(ws, {
    H19: data.workerName,
    H22: birth.y,
    N22: birth.m,
    R22: birth.d,
    AB22: data.nationality,
    H25: data.address,
    H33: data.field,
    Z33: data.businessCategory,
  });
  const mark = genderMark(data.gender);
  if (mark) ws.getCell("AD19").value = mark;
  cardCells.forEach((addr, i) => {
    ws.getCell(addr).value = card[i];
  });

  // ② 届出の事由（この様式は会社都合＝特定技能所属機関の都合のＡ欄を使う）
  ws.getCell("F39").value = CHECKED;
  ws.getCell("T39").value = UNCHECKED;

  // Ａa 事由の区分: 3-1-2号の終了の事由（02〜05）に対応させる
  const kubunCell =
    data.endReason === "02" ? "K48" : data.endReason === "03" ? "K49" : data.endReason === "04" ? "K50" : "K51";
  setChecks(ws, ["K48", "K49", "K50", "K51"], kubunCell);
  if (kubunCell === "K51") {
    ws.getCell("L51").value = `その他（　${data.reason}　）`;
  }

  // Ａb 事由発生日 / Ａc 事案の概要（全角20文字以内）
  setCells(ws, { J54: leave.y, P54: leave.m, T54: leave.d, J58: data.reason });

  // ③ 特定技能外国人の現状
  const contactCell = CONTACT_STATUSES_34.find((o) => o.value === data.contactStatus)?.cell ?? null;
  setChecks(ws, ["K86", "K87"], contactCell);

  // ④Ａ 活動継続の意思 / ④Ｂ 措置内容
  const intentionCell = INTENTION_OPTIONS_34.find((o) => o.value === data.intention)?.cell ?? null;
  setChecks(
    ws,
    INTENTION_OPTIONS_34.map((o) => o.cell),
    intentionCell,
  );
  const measureCell = MEASURE_OPTIONS_34.find((o) => o.value === data.measure)?.cell ?? null;
  setChecks(
    ws,
    MEASURE_OPTIONS_34.map((o) => o.cell),
    measureCell,
  );

  // ⑤ 届出機関
  setCells(ws, {
    I111: data.orgName,
    I114: data.orgAddress,
    I118: data.orgStaff,
    AA118: data.orgPhone,
  });

  // 作成年月日
  setCells(ws, { U127: report.y, AA127: report.m, AE127: report.d });

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

// ---- 参考様式第5-11号（Word・会社都合のみ） ----
// テンプレート内の {{TOKEN}} を置換する（経緯の本文はWordで記入する運用）

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function fill511(template: ArrayBuffer, data: FormFillData): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(template);
  const path = "word/document.xml";
  let xml = await zip.file(path)!.async("string");

  const report = dateParts(data.reportOn);
  const dateText = report.y ? `${report.y}年　${report.m}　月　${report.d}　日` : "　　　　年　　　月　　　日";
  const tokens: Record<string, string> = {
    "{{WORKER_NAME}}": data.workerName,
    "{{ORG_NAME}}": data.orgName,
    "{{STAFF_NAME}}": data.orgStaff,
    "{{CONTACT_NAME}}": "",
    "{{DATE}}": dateText,
  };
  for (const [tok, value] of Object.entries(tokens)) {
    xml = xml.split(tok).join(escapeXml(value));
  }
  zip.file(path, xml);
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
