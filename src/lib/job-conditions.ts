// 所属機関 ＞ 求人票に記載する内容（雇用条件書の順番）の計算。
// 始業・終業・休憩から1日の所定労働時間、年間所定労働日数から年間休日日数を出す。

import type { OrgWorkplace } from "@/types/db";

// "8:00" / "08:00" → 分。読めなければ null
export function timeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// 1日の所定労働時間（分）= 終業 − 始業 − 休憩。終業が始業より前なら日をまたぐ勤務とみなす
export function dailyWorkMinutes(start: string, end: string, breakMinutes: string): number | null {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s == null || e == null) return null;
  const span = e > s ? e - s : e + 24 * 60 - s;
  const brk = Number(breakMinutes.replace(/[^0-9]/g, "")) || 0;
  const work = span - brk;
  return work > 0 ? work : null;
}

// 分 → 「8時間」「7時間30分」
export function minutesText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

// 1日の所定労働時間の表記（入力が足りなければ空）
export function dailyWorkText(start: string, end: string, breakMinutes: string): string {
  const w = dailyWorkMinutes(start, end, breakMinutes);
  return w == null ? "" : minutesText(w);
}

// 分 → 求人票の「1日の所定労働時間」に入れる小数の時間（例: 450 → "7.5"）
export function minutesToHoursDecimal(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100);
}

// 年間合計休日日数 = 365 − 年間所定労働日数
export function annualHolidays(daysYear: string): number | null {
  const n = Number(daysYear.replace(/[^0-9]/g, ""));
  if (!daysYear.trim() || !Number.isFinite(n) || n <= 0 || n > 365) return null;
  return 365 - n;
}

// 事業所1件の表記（例: 本社（長崎県雲仙市…／0957-00-0000））
export function workplaceText(w: OrgWorkplace): string {
  const detail = [w.address.trim(), w.contact.trim()].filter(Boolean).join("／");
  const name = w.name.trim();
  if (!name && !detail) return "";
  return detail ? `${name || "事業所"}（${detail}）` : name;
}

// 求人票の「勤務地の変更の可能性」の表記
export function workplaceChangeText(kind: string, changes: OrgWorkplace[]): string {
  if (kind === "無") return "変更なし";
  if (kind !== "有") return "";
  const list = changes.map(workplaceText).filter(Boolean);
  return list.length > 0 ? `変更あり: ${list.join("、")}` : "変更あり";
}

// 社会保険の加入状況・労働保険の適用状況の選択肢（複数選択。「その他」は内容を文字で入れる）
export const JOB_INSURANCE_OPTIONS = [
  "厚生年金",
  "健康保険",
  "雇用保険",
  "労災保険",
  "国民年金",
  "国民健康保険",
  "その他",
] as const;

// 求人票の加入保険の名前（厚生年金 → 厚生年金保険）
export function postingInsuranceName(name: string): string {
  return name === "厚生年金" ? "厚生年金保険" : name;
}

// 就業の場所の1行目を「作業する住所・TEL/FAX」に合わせる（自動転記）。
// 1行目が空か、前の作業する住所・TEL/FAX のままなら新しい値に置き換える。
// 手で別の内容に書き換えた行は上書きしない。事業所名が空なら会社名を入れる
export function followWorkSite(
  workplaces: OrgWorkplace[],
  prev: { address: string; contact: string },
  next: { address: string; contact: string },
  orgName: string,
): OrgWorkplace[] {
  const rows = workplaces.length > 0 ? [...workplaces] : [{ name: "", address: "", contact: "" }];
  const first = rows[0];
  const follows = (cur: string, before: string) => cur.trim() === "" || cur.trim() === before.trim();
  const address = follows(first.address, prev.address) ? next.address : first.address;
  const contact = follows(first.contact, prev.contact) ? next.contact : first.contact;
  const name = first.name.trim() || !(address.trim() || contact.trim()) ? first.name : orgName.trim();
  rows[0] = { name, address, contact };
  return rows;
}

// 連絡先から電話番号だけを取り出す（「TEL 0957-00-0000 / FAX 0957-00-0001」→「0957-00-0000」）。
// FAX 番号は就業場所の一覧表に載せない
export function phoneOnly(contact: string): string {
  const parts = contact
    .split(/[\/／、,]/)
    .map((p) => p.trim())
    .filter((p) => p && !/^FAX/i.test(p));
  return parts
    .map((p) => p.replace(/^(TEL|電話)[\s:：]*/i, "").trim())
    .filter(Boolean)
    .join(" / ");
}

// 就業場所の一覧表（A4）の行。就業の場所 → 変更先の事業所（変更の可能性が「有」のとき）の順。
// 事業所名・所在地・連絡先がすべて空の行は除く
export function workplaceListRows(intake: {
  job_workplaces?: OrgWorkplace[];
  job_workplace_change?: string;
  job_workplace_changes?: OrgWorkplace[];
}): { name: string; address: string; phone: string }[] {
  const rows = [
    ...(intake.job_workplaces ?? []),
    ...(intake.job_workplace_change === "有" ? (intake.job_workplace_changes ?? []) : []),
  ];
  return rows
    .filter((w) => w.name.trim() || w.address.trim() || w.contact.trim())
    .map((w) => ({ name: w.name.trim(), address: w.address.trim(), phone: phoneOnly(w.contact) }));
}

// 一覧表を印刷できるか（変更の可能性が「有」で、就業場所が2か所以上）
export function canPrintWorkplaceList(intake: Parameters<typeof workplaceListRows>[0]): boolean {
  return intake.job_workplace_change === "有" && workplaceListRows(intake).length >= 2;
}
