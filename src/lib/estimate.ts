// 申請準備の見積書（所属機関あて）の組み立て。
//
// 申請準備の詳細で「収入印紙代」の負担（本人負担 / 会社負担）を選ぶと、所属機関の情報の
// 「申請種別ごとの売上明細」（決算・売上タブ）を明細にした見積書を印刷できる。
// 会社負担のときは収入印紙代（申請手数料）の行を足す。特定技能の変更・更新申請で特定技能総合保険が
// 会社負担（所属機関の登録内容）のときは保険料の行（非課税）も足す。印紙代は 2026年10月1日の改定で
// 「許可される在留期間」によって金額が変わるため、見込みの在留期間での金額を明細に入れ、
// 期間ごとの金額の表を備考に印字して、どの期間ならいくらになるかが分かるようにする。

import { parseAmount } from "@/lib/organization-intake";
import { guessAppKind, SSW_INSURANCE_AMOUNT, taxFromExcl, type SalesAppKind } from "@/lib/sales";
import { prepSituationLabel } from "@/lib/worker-situation";
import { PREP_APP_TYPE_LABELS, type PrepAppType } from "@/lib/application-prep";
import { honorificFor } from "@/lib/reminder-letter";
import type { OrgSalesItem } from "@/types/db";
import type { CustodianInfo } from "@/lib/custody";
import type { StampFeePayer } from "@/lib/stamp-fee";

// ---- 収入印紙代（在留許可手数料。改正入管法施行令第25条第1項） ----

// 改定日。この日以降に受け付けた申請は改定後の手数料（9月30日までの受付は改定前のまま）
export const STAMP_FEE_REVISION_DATE = "2026-10-01";

// 申請方法（窓口は収入印紙、オンラインはコンビニ決済・銀行決済）
export const STAMP_FEE_METHODS = ["窓口", "オンライン"] as const;
export type StampFeeMethod = (typeof STAMP_FEE_METHODS)[number];

// 改定後: 許可される在留期間ごとの手数料
export interface StampFeeBand {
  key: string; // 許可期間の区分（表の見出し）
  maxMonths: number; // この区分に入る最長の月数（Infinity = 上限なし）
  counter: number; // 窓口（収入印紙）
  online: number; // オンライン
}
export const STAMP_FEE_BANDS: StampFeeBand[] = [
  { key: "3月以下", maxMonths: 3, counter: 10000, online: 10000 },
  { key: "3月超6月以下", maxMonths: 6, counter: 18000, online: 15000 },
  { key: "6月超1年未満", maxMonths: 11, counter: 25000, online: 21000 },
  { key: "1年", maxMonths: 12, counter: 33000, online: 27000 },
  { key: "1年超3年未満", maxMonths: 35, counter: 48000, online: 42000 },
  { key: "3年以上5年未満", maxMonths: 59, counter: 64000, online: 56000 },
  { key: "5年以上", maxMonths: Infinity, counter: 75000, online: 65000 },
];

// 改定前（2026年9月30日までの受付）: 在留資格変更・在留期間更新とも一律
export const STAMP_FEE_BEFORE_REVISION = { counter: 6000, online: 5500 } as const;

// 見込みの在留期間に何も手がかりが無いときの区分
export const DEFAULT_STAMP_FEE_BAND = "1年";

// 在留期間の文字（例: 1年 / 3年 / 6月 / 4月 / 1年3月 / 5年）→ 月数。読めなければ null
export function residencePeriodMonths(period: string | null | undefined): number | null {
  const s = (period ?? "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s/g, "")
    .replace(/ヶ月|か月|カ月|箇月/g, "月");
  const y = /(\d+)年/.exec(s);
  const m = /(\d+)月/.exec(s);
  if (!y && !m) return null;
  return (y ? Number(y[1]) : 0) * 12 + (m ? Number(m[1]) : 0);
}

// 月数 → 手数料の区分
export function stampFeeBandOfMonths(months: number): StampFeeBand {
  return STAMP_FEE_BANDS.find((b) => months <= b.maxMonths) ?? STAMP_FEE_BANDS[STAMP_FEE_BANDS.length - 1];
}

// 在留期間の文字 → 手数料の区分のキー（読めなければ null）
export function stampFeeBandKeyOfPeriod(period: string | null | undefined): string | null {
  const months = residencePeriodMonths(period);
  return months == null ? null : stampFeeBandOfMonths(months).key;
}

// 見積に使う「許可の見込みの在留期間」の初期値。
//  ・特定活動（新規・更新）: 3月超6月以下（特定活動は4か月・6か月の許可が多い）
//  ・特定技能への変更（2号への変更を含む）: 1年
//  ・特定技能の更新: いまの在留カードの在留期間（同じ期間になることが多い）。読めなければ1年
// 実際に許可される在留期間は審査の結果しだいなので、見積書には未定である旨を赤線付きで出す
export function defaultStampFeeBandKey(
  appContent: string,
  appType: "" | PrepAppType,
  residencePeriod: string | null | undefined,
): string {
  const label = prepAppLabel(appContent, appType);
  if (appType === "特定活動" || /特定活動/.test(label)) return "3月超6月以下";
  if (appType === "変更") return DEFAULT_STAMP_FEE_BAND;
  if (appType === "更新") return stampFeeBandKeyOfPeriod(residencePeriod) ?? DEFAULT_STAMP_FEE_BAND;
  return DEFAULT_STAMP_FEE_BAND;
}

// 備考の先頭に赤線付きで出す注意（許可される在留期間は審査の結果しだいで未定）
export const PERIOD_UNDETERMINED_NOTE =
  "許可される在留期間（年月）は審査の結果しだいで、どれになるかは未定です。収入印紙代は許可後に確定した金額でご請求します。";

export function stampFeeBand(key: string): StampFeeBand {
  return STAMP_FEE_BANDS.find((b) => b.key === key) ?? stampFeeBand(DEFAULT_STAMP_FEE_BAND);
}

// 改定後の手数料を使うか（申請予定日が無ければ見積日で判断）
export function usesRevisedStampFee(plannedAppOn: string | null | undefined, today: string): boolean {
  const d = (plannedAppOn ?? "").trim() || today;
  return d >= STAMP_FEE_REVISION_DATE;
}

// 特定技能総合保険の行を入れるか: 特定技能の変更申請・更新申請（2号への変更を含む）で、
// 所属機関の登録内容の保険の負担が会社負担のとき。認定（海外から）や特定活動は入れない
export function sswInsuranceIncluded(appContent: string, appType: "" | PrepAppType, burden: string): boolean {
  if (burden.trim() !== "会社負担") return false;
  if (appType !== "変更" && appType !== "更新") return false;
  return salesKindOfPrep(appContent, appType).startsWith("特定技能");
}

// 申請手数料（収入印紙代）がかかる申請種別か。
// 在留資格認定証明書の交付申請には手数料がかからない。未選択（''）は分からないので false
export function stampFeeApplies(appType: "" | PrepAppType): boolean {
  return appType === "変更" || appType === "更新" || appType === "特定活動";
}

// 印紙代の金額（区分と申請方法から）
export function stampFeeAmount(bandKey: string, method: StampFeeMethod, revised: boolean): number {
  if (!revised) return method === "窓口" ? STAMP_FEE_BEFORE_REVISION.counter : STAMP_FEE_BEFORE_REVISION.online;
  const b = stampFeeBand(bandKey);
  return method === "窓口" ? b.counter : b.online;
}

// ---- 見積書 ----

// 申請準備の申請種別（準備の内容）→ 所属機関の売上明細のキー（申請種別）。
// 在留資格認定と特定技能2号も、新規の特定技能の売上として「特定技能申請」の明細を使う
export function salesKindOfPrep(appContent: string, appType: "" | PrepAppType): SalesAppKind {
  const label = appContent ? prepSituationLabel(appContent) : appType ? PREP_APP_TYPE_LABELS[appType] : "";
  const visa = appType === "特定活動" || /特定活動/.test(label) ? "特定活動" : "特定技能";
  // 「特定活動（特定技能２号移行準備のため）」は特定活動の新規扱い、「特定活動ビザ更新」は特定活動の更新
  return guessAppKind(visa, appType === "更新" ? "更新" : "");
}

// 申請種別の言い方（件名に使う）
export function prepAppLabel(appContent: string, appType: "" | PrepAppType): string {
  if (appContent) return prepSituationLabel(appContent);
  return appType ? PREP_APP_TYPE_LABELS[appType] : "";
}

// 明細の行の種類（印刷ページで編集するとき、申請方法や在留期間を変えたら印紙代の行だけ差し替えるために使う）
export type EstimateItemKind = "sales" | "stamp" | "insurance" | "custom";

export interface EstimateItem {
  name: string;
  qty: string; // 数量（例: 1式 / 1件）
  unitPrice: number;
  amount: number; // 単価 × 数量の数字（数量が読めなければ ×1）
  taxable: boolean; // 10%の課税対象か（収入印紙代は非課税）
  kind: EstimateItemKind;
}

// 数量の文字（1式 / 2人 / ３件）から数を読む。読めなければ 1
export function estimateQty(qty: string): number {
  const half = qty.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const m = /(\d+)/.exec(half);
  const n = m ? Number(m[1]) : 1;
  return n > 0 ? n : 1;
}

// 明細1行の金額（単価 × 数量）
export function estimateItemAmount(item: Pick<EstimateItem, "unitPrice" | "qty">): number {
  return Math.max(0, Math.round(item.unitPrice)) * estimateQty(item.qty);
}

export interface EstimateTotals {
  subtotalTaxable: number; // 10%対象（税抜）
  tax: number; // 10%消費税
  taxFree: number; // 非課税
  taxFreeLabel: string; // 内訳の非課税の行の名前（入れた行に合わせて「収入印紙代・特定技能総合保険」など）
  total: number; // 合計（税込）
}

// 明細から小計・消費税・合計を出す（印刷ページで明細を編集したあとも同じ計算を使う）
export function estimateTotals(items: EstimateItem[]): EstimateTotals {
  const subtotalTaxable = items.filter((i) => i.taxable).reduce((s, i) => s + i.amount, 0);
  const taxFreeItems = items.filter((i) => !i.taxable);
  const taxFree = taxFreeItems.reduce((s, i) => s + i.amount, 0);
  const tax = taxFromExcl(subtotalTaxable);
  const labels: string[] = [];
  for (const i of taxFreeItems) {
    const l = i.kind === "stamp" ? "収入印紙代" : i.kind === "insurance" ? "特定技能総合保険" : "その他";
    if (!labels.includes(l)) labels.push(l);
  }
  return { subtotalTaxable, tax, taxFree, taxFreeLabel: labels.join("・"), total: subtotalTaxable + tax + taxFree };
}

// 印刷ページで明細を編集したあとに申請方法や在留期間を変えたとき、収入印紙代の行だけを新しい内容に差し替える。
// 印紙代の行を消していれば足さない（消した判断を尊重する）
export function withStampRow(items: EstimateItem[], rebuilt: Estimate): EstimateItem[] {
  const next = rebuilt.items.find((i) => i.kind === "stamp");
  if (!next) return items;
  return items.map((i) => (i.kind === "stamp" ? { ...next } : i));
}

export interface EstimateInput {
  workerName: string;
  orgName: string;
  orgAddress: string;
  orgRepName: string; // 代表者役職・氏名（所属機関の登録内容）。無ければ機関名だけ
  appContent: string; // 準備の内容（申請種別。'' = 未選択）
  appType: "" | PrepAppType;
  stampFeePayer: StampFeePayer | "";
  salesItems: OrgSalesItem[]; // 所属機関の売上明細（この申請種別のぶん）
  supportFee: string; // 毎月の支援代（所属機関の登録内容。参考として備考に出す）
  sswInsuranceBurden: string; // 特定技能総合保険の負担（所属機関の登録内容。'' / 会社負担 / 外国人負担）
  todoNo: string;
  today: string; // 見積日
  plannedAppOn: string | null; // 申請予定日（改定前後の判定）
  method: StampFeeMethod;
  bandKey: string; // 見込みの在留期間の区分
  custodian: CustodianInfo;
}

export interface Estimate {
  issuedOn: string; // 見積日（YYYY-MM-DD）
  number: string; // 見積書番号（TODO番号から。'' = 番号なし）
  addressee: { address: string; orgLine: string; repLine: string }; // 宛先（住所・機関名＋御中/様・代表者 様）
  issuer: { name: string; address: string; tel: string; registrationNo: string; invoiceRegistrationNo: string };
  subject: string; // 件名
  items: EstimateItem[];
  subtotalTaxable: number; // 10%対象（税抜）
  tax: number; // 10%消費税
  taxFree: number; // 非課税（収入印紙代・特定技能総合保険）
  taxFreeLabel: string; // 内訳の非課税の行の名前（入れた行に合わせて「収入印紙代・特定技能総合保険」など）
  total: number; // 合計（税込）
  stampFee: {
    payer: StampFeePayer | "";
    applies: boolean; // この申請種別に手数料がかかるか
    revised: boolean; // 改定後の手数料か
    method: StampFeeMethod;
    bandKey: string;
    amount: number; // 見込みの区分での金額
    included: boolean; // 明細に入れたか（会社負担かつ手数料がかかる申請）
  };
  insurance: { included: boolean; amount: number }; // 特定技能総合保険の行を入れたか
  notes: string[]; // 備考
  emphasizedNote: string | null; // 備考の先頭に赤線付きで出す注意（印紙代を明細に入れたときだけ）
  salesKind: SalesAppKind;
  invalidAmounts: string[]; // 金額が読めなかった売上明細の項目名（所属機関の情報で直してもらう）
}

export function buildEstimate(input: EstimateInput): Estimate {
  const items: EstimateItem[] = [];
  const invalidAmounts: string[] = [];
  for (const row of input.salesItems) {
    const name = row.name.trim();
    if (!name && !row.amount.trim()) continue;
    const price = parseAmount(row.amount) ?? 0;
    if (!price) invalidAmounts.push(name || "（項目名なし）");
    items.push({ name: name || "（項目名なし）", qty: "1式", unitPrice: price, amount: price, taxable: true, kind: "sales" });
  }

  const applies = stampFeeApplies(input.appType);
  const revised = usesRevisedStampFee(input.plannedAppOn, input.today);
  const stampAmount = stampFeeAmount(input.bandKey, input.method, revised);
  const included = input.stampFeePayer === "会社負担" && applies;
  if (included) {
    const band = stampFeeBand(input.bandKey);
    items.push({
      name: revised
        ? `収入印紙代（申請手数料・${input.method}申請。在留期間「${band.key}」で許可された場合）`
        : `収入印紙代（申請手数料・${input.method}申請・改定前）`,
      qty: "1件",
      unitPrice: stampAmount,
      amount: stampAmount,
      taxable: false,
      kind: "stamp",
    });
  }

  const insuranceIncluded = sswInsuranceIncluded(input.appContent, input.appType, input.sswInsuranceBurden);
  if (insuranceIncluded) {
    items.push({
      name: "特定技能総合保険（会社負担）",
      qty: "1人",
      unitPrice: SSW_INSURANCE_AMOUNT,
      amount: SSW_INSURANCE_AMOUNT,
      taxable: false,
      kind: "insurance",
    });
  }

  const { subtotalTaxable, tax, taxFree, taxFreeLabel, total } = estimateTotals(items);

  const notes: string[] = [];
  if (applies && input.stampFeePayer === "会社負担") {
    if (revised) {
      notes.push(
        `収入印紙代（申請手数料）は、許可される在留期間によって金額が変わります（${estimateDateText(STAMP_FEE_REVISION_DATE)}改定）。` +
          `上の明細は在留期間「${input.bandKey}」で許可された場合の金額です。実際の金額は下の表のとおり、許可後に確定した金額でご請求します。`,
      );
      if (input.method === "オンライン") {
        notes.push("オンライン申請の手数料はコンビニ決済または銀行決済での納付となり、別途決済手数料がかかります。");
      }
    } else {
      notes.push(
        "2026年9月30日までに受け付けた申請は、許可が10月1日以降になっても改定前の手数料（窓口6,000円・オンライン5,500円）です。",
      );
    }
  } else if (applies && input.stampFeePayer === "本人負担") {
    notes.push(
      "収入印紙代（申請手数料）はご本人の負担のため、この見積には含めていません。" +
        "（参考）申請手数料は許可される在留期間によって金額が変わります。下の表をご確認ください。",
    );
  } else if (!applies && input.appType === "認定") {
    notes.push("在留資格認定証明書の交付申請には申請手数料（収入印紙代）はかかりません。");
  }
  if (insuranceIncluded) {
    notes.push("特定技能総合保険（会社負担）の保険料は非課税です。保険の加入手続きは許可後に行います。");
  }
  const supportFee = parseAmount(input.supportFee);
  if (supportFee) {
    const feeName = input.appType === "特定活動" || /特定活動/.test(prepAppLabel(input.appContent, input.appType)) ? "特定活動のサポート代" : "特定技能の支援代";
    notes.push(
      `許可後の毎月の費用（${feeName}）${supportFee.toLocaleString("ja-JP")}円/月（税抜）は、この見積には含めず毎月別途ご請求します。`,
    );
  }

  const label = prepAppLabel(input.appContent, input.appType);
  const subject = `${label || "在留手続"}の申請費用（${input.workerName}）`;
  const honorific = honorificFor(input.orgName);
  const rep = input.orgRepName.trim();
  const todoDigits = input.todoNo.trim();

  return {
    issuedOn: input.today,
    number: todoDigits ? `Q-${todoDigits}` : "",
    addressee: {
      address: input.orgAddress.trim(),
      orgLine: `${input.orgName} ${honorific}`,
      repLine: rep && honorific === "御中" ? `${rep} 様` : "",
    },
    issuer: {
      name: `登録支援機関 ${input.custodian.officeName}`,
      address: input.custodian.headOfficeAddress || input.custodian.address,
      tel: input.custodian.tel,
      registrationNo: input.custodian.registrationNo,
      invoiceRegistrationNo: input.custodian.invoiceRegistrationNo,
    },
    subject,
    items,
    subtotalTaxable,
    tax,
    taxFree,
    taxFreeLabel,
    total,
    insurance: { included: insuranceIncluded, amount: insuranceIncluded ? SSW_INSURANCE_AMOUNT : 0 },
    stampFee: {
      payer: input.stampFeePayer,
      applies,
      revised,
      method: input.method,
      bandKey: input.bandKey,
      amount: stampAmount,
      included,
    },
    notes,
    emphasizedNote: included && revised ? PERIOD_UNDETERMINED_NOTE : null,
    salesKind: salesKindOfPrep(input.appContent, input.appType),
    invalidAmounts,
  };
}

// 金額の表示（例: 33,000円）
export function estimateYen(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")}円`;
}

// 見積日の表示（2026-10-07 → 2026年10月7日）
export function estimateDateText(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日` : ymd;
}
