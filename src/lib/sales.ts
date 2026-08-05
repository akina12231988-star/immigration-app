// freee販売への売上登録（第1段階: 登録待ちの明細を作って登録漏れを防ぐ）のロジック。
// 在留カード受領後に、申請種別・特定技能総合保険・支援代の日割り・定期売上の明細を組み立てる。

import { parseAmount } from "@/lib/organization-intake";

// 申請種別（この4種で売上の品目が決まる）
export const SALES_APP_KINDS = [
  "特定技能申請",
  "特定活動申請",
  "特定技能更新申請",
  "特定活動更新申請",
] as const;
export type SalesAppKind = (typeof SALES_APP_KINDS)[number];

// 特定技能総合保険（会社負担のときに1人あたり計上・非課税）
export const SSW_INSURANCE_AMOUNT = 8820;

// 明細の種類
export type SalesEntryKind =
  | "申請" // 申請種別ごとの売上
  | "保険" // 特定技能総合保険
  | "支援代日割り" // 許可日からの日割り
  | "支援代満額" // 特定活動（1号移行準備）から特定技能へ移行した月（支援継続中のため日割りしない）
  | "定期売上" // 翌月以降の月額（freee販売の定期売上に登録）
  | "退職精算"; // 退職日までの日割り

// 特定活動は「サポート代」、特定技能は「支援代」と名称を変える
export function supportFeeName(kind: SalesAppKind): string {
  return kind.startsWith("特定活動") ? "サポート代" : "支援代";
}

// 品目名（例: 特定技能支援代 / 特定活動サポート代）
export function supportItemName(kind: SalesAppKind): string {
  return kind.startsWith("特定活動") ? "特定活動サポート代" : "特定技能支援代";
}

// 特定技能の新規申請か（特定技能総合保険を計上する対象）
export function isNewSswApplication(kind: SalesAppKind): boolean {
  return kind === "特定技能申請";
}

// YYYY-MM-DD の月の日数
export function daysInMonth(dateStr: string): number {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
}

// YYYY-MM-DD → 日
function dayOf(dateStr: string): number {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? Number(m[3]) : 0;
}

// 日割り計算の結果（画面で式を見せるため内訳も返す）
export interface ProratedFee {
  amount: number; // 日割り後の金額（1日あたり × 日数）
  monthly: number; // 月額
  daily: number; // 1日あたり（月額 ÷ その月の日数・小数点以下切り捨て）
  days: number; // 対象日数
  monthDays: number; // その月の日数
}

// 1日あたりの支援代（月額 ÷ その月の日数・小数点以下切り捨て）。
// 日割りは「1日あたりを先に切り捨ててから日数を掛ける」（弊社の運用。
// 例: 10,000円÷31日=322円 → 322円×15日=4,830円）
export function dailyFee(monthly: number, monthDays: number): number {
  if (monthDays <= 0) return 0;
  return Math.floor(monthly / monthDays);
}

// 許可日からその月末までの日割り（許可日当日を含む）。月まるごとなら満額
export function prorateFromDate(monthly: number, fromDate: string): ProratedFee | null {
  const monthDays = daysInMonth(fromDate);
  const day = dayOf(fromDate);
  if (!monthDays || !day || monthly <= 0) return null;
  const days = monthDays - day + 1;
  const daily = dailyFee(monthly, monthDays);
  const amount = days === monthDays ? monthly : daily * days;
  return { amount, monthly, daily, days, monthDays };
}

// 月初から退職日までの日割り（退職日当日を含む）。月まるごとなら満額
export function prorateToDate(monthly: number, toDate: string): ProratedFee | null {
  const monthDays = daysInMonth(toDate);
  const day = dayOf(toDate);
  if (!monthDays || !day || monthly <= 0) return null;
  const daily = dailyFee(monthly, monthDays);
  const amount = day === monthDays ? monthly : daily * day;
  return { amount, monthly, daily, days: day, monthDays };
}

// YYYY-MM-DD → 「4月8日」
export function mdText(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[2])}月${Number(m[3])}日` : dateStr;
}

// その月の月初・月末（YYYY-MM-DD）
export function monthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}
export function monthEnd(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-${String(daysInMonth(dateStr)).padStart(2, "0")}`;
}

// 翌月の1日（定期売上の開始日）
export function nextMonthStart(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})/);
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
}

// 組み立てた明細1件分（保存前の形）
export interface SalesEntryDraft {
  kind: SalesEntryKind;
  item_name: string; // 品目
  description: string; // freeeに記載する内容
  amount: number;
  taxable: boolean; // false = 非課税
  period_from: string | null;
  period_to: string | null;
}

export interface BuildSalesInput {
  workerName: string;
  appKind: SalesAppKind;
  permitDate: string; // 許可日 YYYY-MM-DD
  supportFee: string; // 所属機関の毎月の支援代（例: "20,000円/人"）
  insuranceByCompany: boolean; // 特定技能総合保険が会社負担か
  // 申請種別ごとの売上明細（所属機関マスタに登録した内容。複数行）
  applicationItems: { name: string; amount: string }[];
  // 支援代を満額で登録する場合 true（更新申請や、同じ所属機関で特定活動〔1号移行準備〕から
  // 特定技能へ移行した場合など、支援が継続しているため許可月を日割りしないとき）。
  // false（既定）は新規の日割り計算（許可日から月末まで）
  fullMonthSupport?: boolean;
}

// 在留カード受領後に登録する売上明細を組み立てる。
// ①申請種別ごとの売上 → ②特定技能総合保険（会社負担・新規のみ）→
// ③許可日からの支援代の日割り → ④翌月からの定期売上
export function buildSalesEntries(input: BuildSalesInput): SalesEntryDraft[] {
  const entries: SalesEntryDraft[] = [];
  const monthly = parseAmount(input.supportFee) ?? 0;
  const feeName = supportFeeName(input.appKind);
  const itemName = supportItemName(input.appKind);

  // 申請の売上は所属機関マスタの「申請種別ごとの売上明細」をそのまま行にする
  for (const item of input.applicationItems) {
    const name = item.name.trim();
    if (!name) continue;
    entries.push({
      kind: "申請",
      item_name: name,
      description: `${input.workerName}さん　${name}`,
      amount: parseAmount(item.amount) ?? 0,
      taxable: true,
      period_from: null,
      period_to: null,
    });
  }

  if (isNewSswApplication(input.appKind) && input.insuranceByCompany) {
    entries.push({
      kind: "保険",
      item_name: "特定技能総合保険",
      description: `${input.workerName}さん　特定技能総合保険`,
      amount: SSW_INSURANCE_AMOUNT,
      taxable: false, // 非課税
      period_from: null,
      period_to: null,
    });
  }

  if (input.fullMonthSupport) {
    // 更新や特定活動（1号移行準備）からの移行など支援が継続している月は、
    // 日割りせず満額（特定活動からの移行では名称がサポート代から特定技能支援代に変わる）
    if (monthly > 0) {
      const month = Number(input.permitDate.slice(5, 7));
      entries.push({
        kind: "支援代満額",
        item_name: itemName,
        description: `${input.workerName}さん　${month}月分の${itemName}（満額）`,
        amount: monthly,
        taxable: true,
        period_from: monthStart(input.permitDate),
        period_to: monthEnd(input.permitDate),
      });
    }
  } else {
    const prorated = prorateFromDate(monthly, input.permitDate);
    if (prorated) {
      entries.push({
        kind: "支援代日割り",
        item_name: itemName,
        description: `${input.workerName}さん　${mdText(input.permitDate)}からの特定${
          input.appKind.startsWith("特定活動") ? "活動サポート代" : "技能支援代"
        }`,
        amount: prorated.amount,
        taxable: true,
        period_from: input.permitDate,
        period_to: monthEnd(input.permitDate),
      });
    }
  }

  if (monthly > 0) {
    const from = nextMonthStart(input.permitDate);
    entries.push({
      kind: "定期売上",
      item_name: itemName,
      description: `${input.workerName}さん　${feeName}（定期売上・月額）`,
      amount: monthly,
      taxable: true,
      period_from: from,
      period_to: null, // 退職時に対象期間を締める
    });
  }

  return entries;
}

// 退職時の精算明細（退職日までの日割り）。あわせて定期売上の対象期間を締める必要がある
export function buildResignationEntry(params: {
  workerName: string;
  appKind: SalesAppKind;
  leavingOn: string;
  supportFee: string;
}): SalesEntryDraft | null {
  const monthly = parseAmount(params.supportFee) ?? 0;
  const prorated = prorateToDate(monthly, params.leavingOn);
  if (!prorated) return null;
  return {
    kind: "退職精算",
    item_name: supportItemName(params.appKind),
    description: `${params.workerName}さん　${mdText(params.leavingOn)}までの特定${
      params.appKind.startsWith("特定活動") ? "活動サポート代" : "技能支援代"
    }`,
    amount: prorated.amount,
    taxable: true,
    period_from: monthStart(params.leavingOn),
    period_to: params.leavingOn,
  };
}

// 在留資格・申請内容から申請種別の初期値を推定する（画面で変更可）
export function guessAppKind(visa: string, content: string): SalesAppKind {
  const isKatsudo = /特定活動/.test(visa) || /特定活動/.test(content);
  const isRenewal = /更新/.test(content);
  if (isKatsudo) return isRenewal ? "特定活動更新申請" : "特定活動申請";
  return isRenewal ? "特定技能更新申請" : "特定技能申請";
}

// 金額の表示（例: 15,333円）
export function formatSalesYen(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")}円`;
}
