// 定期報告書（参考様式第3-6号・別紙1）への転記。
// テンプレートは public/forms/sanko-3-6.xlsx（本紙）と sanko-3-6-b1.xlsx（別紙1）
// （出入国在留管理庁の公式様式）。セル番地は公式様式の実ファイルから特定したもの。
// 平均値の計算は src/lib/periodic-report.ts（buildReport36）で済ませてから渡す。

import { CHECKED, UNCHECKED, dateParts, fillXlsxTemplate, type CellValues } from "@/lib/xlsx-form-fill";
import type { Section36 } from "@/lib/periodic-report";

// 法人番号の13マス（L14:M14 が結合されているため12セル…ではなく13番地。アンカーで指定）
const CORPORATE_CELLS = [
  "F14", "G14", "H14", "I14", "J14", "K14", "L14",
  "N14", "O14", "P14", "Q14", "R14", "S14",
];

// 「平均　◯◯　単位」の欄の文字（空欄のまま出すときは書かない）
const avgText = (v: number, unit: string) => `平均　${v.toLocaleString("ja-JP")}　${unit}`;

export interface Fill36Data {
  fy: number; // 届出対象年度（開始年）
  corporateNo: string; // 法人番号（13桁・法人でない場合は空）
  fieldName: string; // ②特定産業分野（最も多く受け入れている分野）
  fieldCount: number; // 受け入れている分野の数（2以上のとき※欄に書く）
  orgKana: string; // （ふりがな）
  orgName: string; // ③氏名又は名称
  postal: string; // 〒（7桁。ハイフン無し可）
  address: string; // ④住所
  phone: string; // 電話番号
  count1: number; // 特定技能1号の人数
  count2: number; // 特定技能2号の人数
  one: Section36 | null; // 1号の（1）〜（6）。null = 受入れなし（欄はテンプレートのまま）
  two: Section36 | null;
  raise1: number | null; // （7）昇給率。null = 対象者なし（空欄のまま）
  raise2: number | null;
  supportDelegated: boolean; // true = 支援の全部委託あり / false = 自社支援のみ
  note: string; // ６備考
  staffName: string; // 担当者（特定技能所属機関）
  staffPhone: string; // 担当者の電話番号
}

// 本紙の「4 労働条件等」の列（F = 1号・M = 2号）を書く
function sectionCells(column: "F" | "M", s: Section36): CellValues {
  return {
    [`${column}27`]: avgText(s.workDays, "日／月"),
    [`${column}28`]: avgText(s.regularHours, "時間／月"),
    [`${column}29`]: avgText(s.overtimeHours, "時間／月"),
    [`${column}30`]: avgText(s.cashPay, "円／月"),
    [`${column}31`]: avgText(s.overtimePay, "円／月"),
    [`${column}32`]: avgText(s.commute, "円／月"),
    [`${column}33`]: avgText(s.attendance, "円／月"),
    [`${column}34`]: avgText(s.family, "円／月"),
    [`${column}35`]: avgText(s.bonus, "円"),
    [`${column}37`]: avgText(s.food, "円／月"),
    [`${column}38`]: avgText(s.housing, "円／月"),
    [`${column}39`]: avgText(s.taxSocial, "円／月"),
    [`${column}40`]: avgText(s.otherDeduction, "円／月"),
  };
}

export async function fill36(template: ArrayBuffer, data: Fill36Data): Promise<Uint8Array> {
  const digits = data.corporateNo.replace(/\D/g, "").split("");
  const postal = data.postal.replace(/\D/g, "");
  const postalText = postal.length === 7 ? `〒${postal.slice(0, 3)}－${postal.slice(3)}` : "〒　　　－";

  const cells: CellValues = {
    // １届出対象期間（テンプレートと同じ全角の「４月１日」の形に合わせる）
    F13: `　　　　　　${data.fy}年４月１日　～　${data.fy + 1}年３月３１日`,
    // ２特定技能所属機関
    F15: data.fieldName,
    F16: data.orgKana,
    F17: data.orgName,
    F19: `${postalText}　${data.address}`,
    F21: data.phone ? `（電話　${data.phone}）` : "（電話　　　―　　　―　　　　）",
    // ３報告対象特定技能外国人数
    F24: `${data.count1 + data.count2}　人`,
    M24: `${data.count1}　人`,
    Q24: `${data.count2}　人`,
    // ５支援の実施状況（どちらかに印）
    F43: data.supportDelegated
      ? `${UNCHECKED} 自社支援のみ　　\n${CHECKED} 支援の全部委託あり　`
      : `${CHECKED} 自社支援のみ　　\n${UNCHECKED} 支援の全部委託あり　`,
    // ６備考・担当者
    F44: data.note,
    D45: data.staffName,
    M45: data.staffPhone,
  };
  // 法人番号（法人でない場合はマスを空欄のまま）
  if (digits.length > 0) {
    CORPORATE_CELLS.forEach((addr, i) => {
      cells[addr] = digits[i] ?? "";
    });
  }
  // 複数の分野で受け入れている場合だけ※欄に合計数を書く
  if (data.fieldCount > 1) {
    cells.P15 = `※②を含め、\n　計( ${data.fieldCount} )分野受入れ`;
  }
  // ４労働条件等（受入れの無い号はテンプレートのまま＝空欄）
  if (data.one) Object.assign(cells, sectionCells("F", data.one));
  if (data.two) Object.assign(cells, sectionCells("M", data.two));
  if (data.raise1 != null) cells.F41 = `平均　${data.raise1.toFixed(1)}　％`;
  if (data.raise2 != null) cells.F42 = `平均　${data.raise2.toFixed(1)}　％`;

  return fillXlsxTemplate(template, cells);
}

export interface FillB1Worker {
  name: string;
  nationality: string;
  birth: string | null; // YYYY-MM-DD
  gender: string; // 男 / 女（それ以外は印を付けない）
  cardNo: string; // 在留カード番号（12桁）
  field: string; // 受入れ分野
  days: number; // 活動日数の総数（年間）
  pay: number; // 報酬の支給総額（年間・円）
  payBank: boolean | null; // true = 預貯金口座への振り込み / false = それ以外 / null = 印を付けない
  note: string; // 備考（受入れ開始日・終了日など）
}

export interface FillB1Data {
  orgName: string; // 特定技能所属機関の氏名又は名称
  officeName: string; // 事業所の名称
  supportDelegated: boolean; // true = 登録支援機関に全部委託 / false = 自社支援
  supportOrgName: string; // 全部委託のときの登録支援機関名
  staffName: string; // 支援担当者名
  staffPhone: string; // 支援担当者の電話番号
  workers: FillB1Worker[]; // 最大5名（6名以上はページを分けて作る）
}

// 別紙1の1人分のブロックの先頭行（5名で1枚）
export const B1_BLOCK_ROWS = [7, 11, 15, 19, 23] as const;
export const B1_PER_PAGE = B1_BLOCK_ROWS.length;

export async function fill36Besshi1(template: ArrayBuffer, data: FillB1Data): Promise<Uint8Array> {
  const supportText = data.supportDelegated
    ? `\n　${UNCHECKED} 自社支援\n　${CHECKED} 登録支援機関に全部委託\n　（機関名：${data.supportOrgName}\n　　　　　　　　　　　　　　）\n`
    : `\n　${CHECKED} 自社支援\n　${UNCHECKED} 登録支援機関に全部委託\n　（機関名：\n　　　　　　　　　　　　　　）\n`;

  // 活動日数・報酬総額は数値で入れる（表示形式はテンプレートのまま）
  const cells: Record<string, string | number> = {
    D3: data.orgName,
    P3: `事業所の名称：${data.officeName}`,
  };
  data.workers.slice(0, B1_PER_PAGE).forEach((w, i) => {
    const r = B1_BLOCK_ROWS[i];
    const birth = dateParts(w.birth);
    cells[`B${r + 1}`] = w.name;
    cells[`B${r + 3}`] = w.nationality;
    if (birth.y) cells[`C${r + 1}`] = `${birth.y}年${birth.m}月${birth.d}日`;
    if (w.gender === "男" || w.gender === "女") {
      cells[`D${r + 1}`] = w.gender === "男" ? CHECKED : UNCHECKED;
      cells[`F${r + 1}`] = w.gender === "女" ? CHECKED : UNCHECKED;
    }
    cells[`C${r + 3}`] = w.cardNo;
    cells[`H${r}`] = w.field;
    cells[`J${r}`] = w.days;
    cells[`L${r}`] = w.pay;
    if (w.payBank != null) {
      cells[`N${r}`] = w.payBank
        ? `${CHECKED} 預貯金口座\n　 への振り込み`
        : `${UNCHECKED} 預貯金口座\n　 への振り込み`;
      cells[`N${r + 2}`] = w.payBank ? `${UNCHECKED} それ以外の\n　 方法` : `${CHECKED} それ以外の\n　 方法`;
    }
    cells[`O${r}`] = supportText;
    cells[`S${r + 1}`] = data.staffName;
    cells[`S${r + 3}`] = data.staffPhone;
    cells[`U${r}`] = w.note;
  });

  return fillXlsxTemplate(template, cells);
}

// ダウンロードのファイル名
export function report36FileName(orgName: string, fy: number): string {
  const name = (orgName ?? "").trim().replace(/[\\/:*?"<>|]/g, "-");
  return `参考様式第3-6号_${fy}年度_${name}.xlsx`;
}

export function report36B1FileName(orgName: string, fy: number, page: number, pages: number): string {
  const name = (orgName ?? "").trim().replace(/[\\/:*?"<>|]/g, "-");
  const suffix = pages > 1 ? `_${page}枚目` : "";
  return `参考様式第3-6号別紙1_${fy}年度_${name}${suffix}.xlsx`;
}
