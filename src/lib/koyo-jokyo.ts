// 外国人雇用状況届出書（様式第3号）。
//
// 雇用保険の適用事業所でない会社は、外国人を雇い入れたときに
// ハローワークへ「外国人雇用状況届出書」を出す（雇い入れた日の翌月末日まで）。
// 雇用保険の被保険者になる会社は資格取得届で兼ねるため、この様式は使わない。

export const KOYO_COVERED_NO = "いいえ";

// 所属機関が雇用保険の適用事業所でないか（organizations.intake.koyo_covered）
export function needsKoyoJokyoForm(koyoCovered: string | null | undefined): boolean {
  return (koyoCovered ?? "").trim() === KOYO_COVERED_NO;
}

// ⑤性別: 該当するものの番号を○で囲む（丸囲みの数字で表す）。判定できないときは様式のまま
export function koyoGenderMark(gender: string): string {
  const g = (gender ?? "").trim();
  if (g.includes("女") || /^f/i.test(g)) return "1男・②女";
  if (g.includes("男") || /^m/i.test(g)) return "①男・2女";
  return "1男・2女";
}

// ②在留資格。特定技能・特定活動は、指定された分野・活動を括弧書きで足す（裏面の記載要領）
export function koyoVisaLabel(residenceStatus: string, field: string): string {
  const status = (residenceStatus ?? "").trim();
  const f = (field ?? "").trim();
  if (!status || !f) return status;
  // すでに括弧書きがあるものはそのまま
  if (/[（(]/.test(status)) return status;
  if (!/特定技能|特定活動/.test(status)) return status;
  return `${status}（${f}）`;
}

// 西暦の「YYYY年M月D日」（空・不正な値は空欄）
export function koyoJpDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return "";
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}

// 印刷（ダウンロード）のときのファイル名
export function koyoFileName(workerName: string): string {
  const safe = (workerName ?? "").replace(/[\\/:*?"<>|]/g, "-").trim();
  return ["外国人雇用状況届出書", safe].filter(Boolean).join("_");
}
