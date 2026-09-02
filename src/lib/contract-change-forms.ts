// 参考様式第３－１－１号「特定技能雇用契約の変更に係る届出書」への転記。
// テンプレートは public/forms/sanko-3-1-1.xlsx（出入国在留管理庁の公式様式）。
// セル番地は公式様式の実ファイルから特定したもの。
// 作成年月日は署名してもらった日を手書きするため記載しない（退職の様式と同じ運用）。

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
import { CONTRACT_CHANGE_ITEMS } from "@/lib/contract-change";

export interface ContractChangeFillData {
  // ① 届出の対象者
  workerName: string;
  gender: string;
  birth: string | null; // YYYY-MM-DD
  nationality: string;
  residenceCardNo: string; // 12桁
  field: string; // 特定産業分野
  businessCategory: string; // 業務区分
  // ② 特定技能雇用契約の変更内容
  changedOn: string; // 変更年月日 YYYY-MM-DD
  changeItems: string[]; // 変更事項のコード（Ⅰ〜Ⅸ。複数可）
  // ③ 届出機関（特定技能所属機関）
  orgCorporateNo: string; // 法人番号（13桁・法人でない場合は空）
  orgName: string;
  orgAddress: string;
  orgStaff: string; // 担当者
  orgPhone: string; // 電話番号
}

// ① 在留カード番号のマス（12個）
const CARD_CELLS = [
  "I23", "K23", "M23", "O23", "Q23", "S23",
  "U23", "W23", "Y23", "AA23", "AC23", "AE23",
];

// ③ 法人番号のマス（13個）
const CORPORATE_CELLS = [
  "I49", "K49", "M49", "O49", "Q49", "S49", "U49",
  "W49", "Y49", "AA49", "AC49", "AE49", "AG49",
];

export async function fill311(
  template: ArrayBuffer,
  data: ContractChangeFillData,
): Promise<Uint8Array> {
  const birth = dateParts(data.birth);
  const changed = dateParts(data.changedOn);

  // ① 届出の対象者
  const cells: CellValues = {
    I15: data.workerName,
    I18: birth.y,
    O18: birth.m,
    S18: birth.d,
    AC18: data.nationality,
    I26: data.field,
    AB26: data.businessCategory,
  };
  const mark = genderMark(data.gender);
  if (mark) cells.AE15 = mark;
  cardChars(data.residenceCardNo).forEach((ch, i) => {
    cells[CARD_CELLS[i]] = ch;
  });

  // ② ａ 変更年月日
  Object.assign(cells, { J31: changed.y, P31: changed.m, T31: changed.d });

  // ② ｂ 変更事項（複数選択可なので、選んだものだけ ☑ にする）
  const chosen = new Set(data.changeItems);
  for (const item of CONTRACT_CHANGE_ITEMS) {
    cells[item.cell] = chosen.has(item.code) ? CHECKED : UNCHECKED;
  }

  // ③ 届出機関。法人番号は1桁ずつマスへ（法人でなければ空欄のまま）
  const corp = corporateChars(data.orgCorporateNo);
  CORPORATE_CELLS.forEach((addr, i) => {
    if (corp[i]) cells[addr] = corp[i];
  });
  Object.assign(cells, {
    I52: data.orgName,
    I59: data.orgStaff,
    AA59: data.orgPhone,
  });
  // 住所欄にはテンプレートの「〒　　　-」が入っているので、住所があるときだけ差し替える
  if (data.orgAddress.trim()) cells.I55 = withPostalMark(data.orgAddress);

  return fillXlsxTemplate(template, cells);
}
