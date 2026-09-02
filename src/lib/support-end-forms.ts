// 参考様式第３－３－２号「支援委託契約の終了又は締結に係る届出書」への転記。
// テンプレートは public/forms/sanko-3-3-2.xlsx（出入国在留管理庁の公式様式）。
// セル番地は公式様式の実ファイルから特定したもの。
// この画面で作るのは「支援委託契約の終了」だけなので、Ｂ（契約の締結）欄は空のまま。
// 作成年月日は署名してもらった日を手書きするため記載しない（他の様式と同じ運用）。

import {
  CHECKED,
  UNCHECKED,
  cardChars,
  corporateChars,
  dateParts,
  fillXlsxTemplate,
  withPostalMark,
  type CellValues,
} from "@/lib/xlsx-form-fill";
import { genderMark } from "@/lib/resignation-forms";
import {
  SUPPORT_END_MAJOR_REASONS,
  SUPPORT_END_MINOR_REASONS,
  SUPPORT_END_OTHER_CELL,
  SUPPORT_END_OTHER_CODE,
} from "@/lib/support-end";

export interface SupportEndFillData {
  // ① 届出の対象者（特定技能2号へ移る前＝特定技能1号のときの情報）
  workerName: string;
  gender: string;
  birth: string | null; // YYYY-MM-DD
  nationality: string;
  residenceCardNo: string; // 12桁
  field: string; // 特定産業分野
  businessCategory: string; // 業務区分
  // Ａ 契約の終了
  endedOn: string; // 終了年月日 YYYY-MM-DD（特定技能2号の許可日の前の日）
  majorReason: string; // 大分類のコード
  minorReason: string; // 小分類のコード
  otherReason: string; // 小分類が「その他」のときの理由（全角20文字以内）
  // ③ 届出機関（特定技能所属機関）
  orgCorporateNo: string; // 法人番号（13桁・法人でない場合は空）
  orgName: string;
  orgAddress: string;
  orgStaff: string; // 担当者
  orgPhone: string; // 電話番号
}

// ① 在留カード番号のマス（12個）
const CARD_CELLS = [
  "I27", "K27", "M27", "O27", "Q27", "S27",
  "U27", "W27", "Y27", "AA27", "AC27", "AE27",
];

// ③ 法人番号のマス（13個）
const CORPORATE_CELLS = [
  "I100", "K100", "M100", "O100", "Q100", "S100", "U100",
  "W100", "Y100", "AA100", "AC100", "AE100", "AG100",
];

// ② 届出の事由。この画面は「支援委託契約の終了」だけを作る
const REASON_END_CELL = "B36";
const REASON_START_CELL = "B43";
const REASON_BOTH_CELL = "B50";

export async function fill332(
  template: ArrayBuffer,
  data: SupportEndFillData,
): Promise<Uint8Array> {
  const birth = dateParts(data.birth);
  const ended = dateParts(data.endedOn);

  // ① 届出の対象者
  const cells: CellValues = {
    I19: data.workerName,
    I22: birth.y,
    O22: birth.m,
    S22: birth.d,
    AC22: data.nationality,
    I30: data.field,
    AB30: data.businessCategory,
  };
  const mark = genderMark(data.gender);
  if (mark) cells.AE19 = mark;
  cardChars(data.residenceCardNo).forEach((ch, i) => {
    cells[CARD_CELLS[i]] = ch;
  });

  // ② 届出の事由: 支援委託契約の終了
  cells[REASON_END_CELL] = CHECKED;
  cells[REASON_START_CELL] = UNCHECKED;
  cells[REASON_BOTH_CELL] = UNCHECKED;

  // Ａa 終了年月日
  Object.assign(cells, { J60: ended.y, P60: ended.m, T60: ended.d });

  // Ａb 終了の事由（大分類・小分類をそれぞれ1つずつ）
  for (const r of SUPPORT_END_MAJOR_REASONS) {
    cells[r.cell] = r.code === data.majorReason ? CHECKED : UNCHECKED;
  }
  for (const r of SUPPORT_END_MINOR_REASONS) {
    cells[r.cell] = r.code === data.minorReason ? CHECKED : UNCHECKED;
  }
  // 小分類が「その他」のときは（　）の中に理由を書く
  if (data.minorReason === SUPPORT_END_OTHER_CODE && data.otherReason.trim()) {
    cells[SUPPORT_END_OTHER_CELL] = `その他（　${data.otherReason.trim()}　）`;
  }

  // ③ 届出機関。法人番号は1桁ずつマスへ（法人でなければ空欄のまま）
  const corp = corporateChars(data.orgCorporateNo);
  CORPORATE_CELLS.forEach((addr, i) => {
    if (corp[i]) cells[addr] = corp[i];
  });
  Object.assign(cells, {
    I103: data.orgName,
    I110: data.orgStaff,
    AA110: data.orgPhone,
  });
  // 住所欄にはテンプレートの「〒　　　-」が入っているので、住所があるときだけ差し替える
  if (data.orgAddress.trim()) cells.I106 = withPostalMark(data.orgAddress);

  return fillXlsxTemplate(template, cells);
}
