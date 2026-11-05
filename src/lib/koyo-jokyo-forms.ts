// 外国人雇用状況届出書（様式第3号）への転記。
// テンプレートは厚生労働省の公式様式をもとにした2つ。
//  ・public/forms/koyo-jokyo-3.docx … 雇入れ用。標題「離職」に取り消し線
//  ・public/forms/koyo-jokyo-3-rishoku.docx … 離職用。標題「雇入れ」に取り消し線、
//    離職年月日（{{LEAVE}}）と主たる事務所（{{MAIN_*}}）の欄を足し、⑦資格外活動許可の有無は「無」にしてある
// （様式裏面の注意「表面標題中『離職』（『雇入れ』）の文字を抹消すること」）。
// 各記入欄には {{TOKEN}} を仕込んであり、ここで置き換える（参考様式第5-11号と同じ方式）。

import { cardChars, escapeXml } from "@/lib/xlsx-form-fill";
import { koyoGenderMark, koyoJpDate, koyoVisaLabel } from "@/lib/koyo-jokyo";

export interface KoyoJokyoFillData {
  // ①〜⑧ 外国人の情報（在留カードのとおり）
  workerName: string; // ①氏名（ローマ字）
  kana: string; // フリガナ（カタカナ）
  residenceStatus: string; // ②在留資格
  field: string; // 特定産業分野（②の括弧書きに使う）
  residenceExpiryDate: string | null; // ③在留期間（期限）
  birth: string | null; // ④生年月日
  gender: string; // ⑤性別
  nationality: string; // ⑥国籍・地域
  residenceCardNo: string; // ⑧在留カードの番号（12桁）
  // 雇入れ年月日
  hiredOn: string | null;
  // 離職年月日（離職用の様式だけ）
  leavingOn?: string | null;
  // 事業主（所属機関）の情報
  officeName: string; // 事業所の名称
  officeAddress: string; // 所在地
  officeTel: string; // 電話番号
  ownerName: string; // 事業主の氏名（法人は代表者の氏名）
}

// テンプレートのトークンと入れる値の対応
export function koyoJokyoTokens(data: KoyoJokyoFillData): Record<string, string> {
  const card = cardChars(data.residenceCardNo);
  const tokens: Record<string, string> = {
    "{{KANA}}": data.kana,
    "{{NAME}}": data.workerName,
    "{{VISA}}": koyoVisaLabel(data.residenceStatus, data.field),
    "{{EXPIRY}}": koyoJpDate(data.residenceExpiryDate),
    "{{BIRTH}}": koyoJpDate(data.birth),
    "{{GENDER}}": koyoGenderMark(data.gender),
    "{{NATIONALITY}}": data.nationality,
    "{{HIRE}}": koyoJpDate(data.hiredOn),
    "{{OFFICE_NAME}}": data.officeName,
    "{{OFFICE_ADDR}}": data.officeAddress,
    "{{OFFICE_TEL}}": data.officeTel,
    "{{OWNER_NAME}}": data.ownerName,
    // 離職用の様式にだけある欄（雇入れ用には無いので置き換えても何も起きない）
    "{{LEAVE}}": koyoJpDate(data.leavingOn ?? null),
    // 主たる事務所は、届出の事業所と同じ内容を書く（個人事業主・本社で雇っている会社）
    "{{MAIN_NAME}}": data.officeName,
    "{{MAIN_ADDR}}": data.officeAddress,
    "{{MAIN_TEL}}": data.officeTel,
  };
  card.forEach((ch, i) => {
    tokens[`{{C${i + 1}}}`] = ch;
  });
  return tokens;
}

export async function fillKoyoJokyo3(
  template: ArrayBuffer,
  data: KoyoJokyoFillData,
): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(template);
  const path = "word/document.xml";
  const file = zip.file(path);
  if (!file) throw new Error("テンプレートの形式が不正です（document.xml がありません）");
  let xml = await file.async("string");
  for (const [token, value] of Object.entries(koyoJokyoTokens(data))) {
    xml = xml.split(token).join(escapeXml(value));
  }
  zip.file(path, xml, { createFolders: false });
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
