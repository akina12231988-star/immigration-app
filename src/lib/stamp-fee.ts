// 申請の収入印紙代（在留資格変更・更新の手数料）をだれが負担するか。
//
// 申請準備の詳細（申請種別の上）で「本人負担」「会社負担」を選ぶ。
// 有限会社國崎青果だけは、所属機関を見て自動的に本人負担にする。
// どちらか分かっていない申請は、所属機関別の一覧（/todos/stamp-fee）に出して確認する。

import { orgSearchKeys } from "@/lib/org-search";
import { APPLICATION_CONTENT_CHOICES } from "@/lib/worker-situation";

// 会社立替 = 会社がいったん払い、給与などから本人が負担する（実質本人負担）。
// 請求書・見積書では会社負担と同じく明細に入れ、立替である旨を書く
export const STAMP_FEE_PAYERS = ["本人負担", "会社負担", "会社立替"] as const;
export type StampFeePayer = (typeof STAMP_FEE_PAYERS)[number];

// 画面に出す名前
export function stampFeePayerLabel(p: StampFeePayer | ""): string {
  if (p === "会社立替") return "会社立替（実質本人負担）";
  return p || "未設定";
}

export function isStampFeePayer(v: unknown): v is StampFeePayer {
  return typeof v === "string" && (STAMP_FEE_PAYERS as readonly string[]).includes(v.trim());
}

// 明細に印紙代の行を入れる負担か（会社負担・会社立替）
export function stampFeeBilledToCompany(p: StampFeePayer | ""): boolean {
  return p === "会社負担" || p === "会社立替";
}

// 印紙代がこの金額以下なら、負担の設定にかかわらず会社負担（改定前の手数料 6,000円 など）
export const STAMP_FEE_COMPANY_ONLY_MAX = 6000;

// 自動的に本人負担にする会社（法人格の有無・前後、異体字（國崎／国崎）、全角半角の違いは同じ扱い）
export const STAMP_FEE_SELF_PAY_ORG = "有限会社國崎青果";

function orgKey(name: string): string {
  const keys = orgSearchKeys(name);
  return keys[keys.length - 1]; // 法人格を取り除いた形（無ければそのまま）
}

export function isKunisakiSeika(orgName: string | null | undefined): boolean {
  const key = orgKey(orgName ?? "");
  return !!key && key === orgKey(STAMP_FEE_SELF_PAY_ORG);
}

// 申請準備の申請種別（準備の内容の保存値。worker-situation.ts）の区分。
// 特定技能2号に関わる申請（2号への変更・2号の更新・2号移行準備の特定活動）と、
// 特定技能1号に関わる申請（1号への変更・1号の更新・1号移行準備の特定活動とその更新）
export const SSW2_STAMP_APP_CONTENTS = [
  "特定技能2号申請準備中",
  "特定技能2号更新の準備中",
  "特定活動（特定技能２号移行準備のため）準備中",
] as const;
export const SSW1_STAMP_APP_CONTENTS = [
  "特定技能申請準備中",
  "特定技能更新の準備中",
  "特定活動で申請準備中",
  "特定活動ビザ更新の申請準備",
] as const;
export function isSsw2StampAppContent(appContent: string | null | undefined): boolean {
  return (SSW2_STAMP_APP_CONTENTS as readonly string[]).includes((appContent ?? "").trim());
}
export function isSsw1StampAppContent(appContent: string | null | undefined): boolean {
  return (SSW1_STAMP_APP_CONTENTS as readonly string[]).includes((appContent ?? "").trim());
}

// ---- 所属機関ごとの自動設定（印紙代の自動設定の画面で登録する。app_settings） ----
//
// 所属機関ごとに「更新の申請」「新規の申請（変更・認定・特定活動）」の負担を決めておくと、
// 適用開始日より後に登録した申請準備は、その負担に自動で設定する
// （それより前に登録していた申請準備は自動では決めず、これまでどおり選ぶ）
export const STAMP_FEE_RULES_SETTING_KEY = "stamp_fee_org_rules";

export interface StampFeeOrgRule {
  id: string;
  orgName: string; // 所属機関の名称（法人格・空白の違いは同じ扱い）
  renewal: StampFeePayer | ""; // 更新の申請（在留期間の更新）の負担（'' は自動では決めない）
  newApp: StampFeePayer | ""; // 新規の申請（在留資格の変更・認定・特定活動）の負担
  from: string; // 適用開始日（YYYY-MM-DD）。この日以降に登録した申請準備に効く
}

// 最初から入れておく自動設定（画面で保存するまではこれを使う）
export const DEFAULT_STAMP_FEE_ORG_RULES: StampFeeOrgRule[] = [
  { id: "matsumoto", orgName: "松本英男", renewal: "会社負担", newApp: "会社負担", from: "2026-11-10" },
  { id: "shiraishi", orgName: "白石智和", renewal: "会社負担", newApp: "本人負担", from: "2026-11-10" },
];

export function normalizeStampFeeOrgRules(v: unknown): StampFeeOrgRule[] {
  const list = v && typeof v === "object" ? (v as { rules?: unknown }).rules : undefined;
  if (!Array.isArray(list)) return DEFAULT_STAMP_FEE_ORG_RULES;
  const payer = (x: unknown): StampFeePayer | "" => (isStampFeePayer(x) ? (x as StampFeePayer) : "");
  return list
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r, i) => ({
      id: typeof r.id === "string" && r.id ? r.id : `rule-${i}`,
      orgName: typeof r.orgName === "string" ? r.orgName : "",
      renewal: payer(r.renewal),
      newApp: payer(r.newApp),
      from: typeof r.from === "string" ? r.from : "",
    }))
    .filter((r) => r.orgName.trim());
}

// 申請種別（準備の内容の保存値）が更新の申請か・新規の申請か
export function stampAppKind(appContent: string | null | undefined): "renewal" | "new" | "" {
  const c = APPLICATION_CONTENT_CHOICES.find((x) => x.prepSituation === (appContent ?? "").trim());
  if (!c) return "";
  return c.appType === "更新" ? "renewal" : "new";
}

const nameKey = (name: string) => orgKey(name).replace(/[\s　]/g, "");

// その所属機関の自動設定（無ければ null）
export function findStampFeeOrgRule(rules: StampFeeOrgRule[], orgName: string | null | undefined): StampFeeOrgRule | null {
  const key = nameKey(orgName ?? "");
  if (!key) return null;
  return rules.find((r) => nameKey(r.orgName) === key) ?? null;
}

// 所属機関ごとの自動設定から決まる負担。申請準備を登録した日が適用開始日より前なら決めない
export function orgRuleStampFeePayer(
  rules: StampFeeOrgRule[] | undefined,
  appContent: string | null | undefined,
  orgName: string | null | undefined,
  prepCreatedAt: string | null | undefined,
): StampFeePayer | "" {
  if (!rules || !prepCreatedAt) return "";
  const rule = findStampFeeOrgRule(rules, orgName);
  if (!rule) return "";
  if (rule.from && prepCreatedAt.slice(0, 10) < rule.from) return "";
  // 特定技能2号に関わる申請は、所属機関ごとの設定にかかわらず本人負担（autoStampFeePayer で先に決める）
  if (isSsw2StampAppContent(appContent)) return "";
  const kind = stampAppKind(appContent);
  return kind === "renewal" ? rule.renewal : kind === "new" ? rule.newApp : "";
}

export interface StampFeeAutoContext {
  rules?: StampFeeOrgRule[]; // 所属機関ごとの自動設定
  prepCreatedAt?: string | null; // 申請準備を登録した日時
}

// 申請種別と所属機関から自動で決まる負担（申請準備の詳細で未選択なら自動で保存する）。
//  ・特定技能2号に関わる申請は本人負担（所属機関ごとの自動設定があっても2号は本人負担のまま）
//  ・所属機関ごとの自動設定（印紙代の自動設定の画面）に当てはまれば、その負担
//  ・特定技能1号に関わる申請で、所属機関が有限会社國崎青果なら会社立替（実質本人負担）
// どれでもなければ ''（所属機関の情報で選んだ負担 → 未設定）
export function autoStampFeePayer(
  appContent: string | null | undefined,
  orgName: string | null | undefined,
  ctx: StampFeeAutoContext = {},
): StampFeePayer | "" {
  if (isSsw2StampAppContent(appContent)) return "本人負担";
  const byOrg = orgRuleStampFeePayer(ctx.rules, appContent, orgName, ctx.prepCreatedAt);
  if (byOrg) return byOrg;
  if (isSsw1StampAppContent(appContent) && isKunisakiSeika(orgName)) return "会社立替";
  return "";
}

// 所属機関（と申請種別）から決まる既定の負担。
// 申請種別で自動で決まる負担（autoStampFeePayer）→ 所属機関の情報（決算・売上 ＞ 収入印紙代）で選んだ負担 → 未設定。
// 有限会社國崎青果でも、特定技能1号に関わる申請以外は自動では決めず、申請ごとに選ぶ
export function defaultStampFeePayer(
  orgName: string | null | undefined,
  orgDefault?: string | null,
  appContent?: string | null,
  ctx: StampFeeAutoContext = {},
): StampFeePayer | "" {
  const auto = autoStampFeePayer(appContent, orgName, ctx);
  if (auto) return auto;
  const d = (orgDefault ?? "").trim();
  if (isStampFeePayer(d)) return d;
  return "";
}

// 保存されている値と所属機関から、画面に出す負担（未設定なら申請種別・所属機関の既定）
export function effectiveStampFeePayer(
  saved: string | null | undefined,
  orgName: string | null | undefined,
  orgDefault?: string | null,
  appContent?: string | null,
  ctx: StampFeeAutoContext = {},
): StampFeePayer | "" {
  const v = (saved ?? "").trim();
  if (isStampFeePayer(v)) return v;
  return defaultStampFeePayer(orgName, orgDefault, appContent, ctx);
}

// ---- 許可後の請求（請求書作成の当月許可者リスト）での収入印紙代の扱い ----
// 許可のときに入れた実際の印紙代（申請詳細）と、申請準備で選んだ負担から決める。
//  ・6,000円以下（改定前の手数料など）… 負担の設定にかかわらず会社負担で請求する
//  ・6,000円を超える … 会社負担は請求、会社立替（実質本人負担）は請求して立替と書く、
//    本人負担は請求せず「印紙代は本人負担です。」と備考に書く
export type InvoiceStampFeeState = "unknown_amount" | "none" | "billed" | "self" | "unknown_payer";
export interface InvoiceStampFee {
  state: InvoiceStampFeeState;
  amount: number | null; // 実際の印紙代（未入力は null）
  billed: boolean; // 請求書の明細に入れるか
  payer: StampFeePayer | ""; // 実際に使った負担（6,000円以下は会社負担）
  itemName: string; // 明細に入れるときの項目名
  note: string; // 備考に書く文（無ければ ''）
}

export function invoiceStampFee(amount: number | null | undefined, payer: StampFeePayer | ""): InvoiceStampFee {
  const base = { amount: amount ?? null, itemName: "収入印紙代（申請手数料）", note: "" };
  if (amount == null) return { ...base, state: "unknown_amount", billed: false, payer };
  if (amount <= 0) return { ...base, state: "none", billed: false, payer };
  if (amount <= STAMP_FEE_COMPANY_ONLY_MAX) return { ...base, state: "billed", billed: true, payer: "会社負担" };
  if (payer === "会社負担") return { ...base, state: "billed", billed: true, payer };
  if (payer === "会社立替") {
    return {
      ...base,
      state: "billed",
      billed: true,
      payer,
      itemName: "収入印紙代（申請手数料・会社立替）",
      note: "印紙代は会社立替です（実質本人負担）。",
    };
  }
  if (payer === "本人負担") return { ...base, state: "self", billed: false, payer, note: "印紙代は本人負担です。" };
  return { ...base, state: "unknown_payer", billed: false, payer };
}

// 負担が分かっていない申請の1行
export interface StampFeeUnknownRow {
  workerId: string;
  workerName: string;
  todoNo: string;
  appContent: string; // 申請種別（準備の内容）
  tantou: string; // 担当者
  orgId: string;
  orgName: string; // 所属機関（申請準備で選んだ機関があればそれ、無ければ現在の機関。無ければ ''）
}

export interface StampFeeUnknownGroup {
  orgId: string;
  orgName: string;
  rows: StampFeeUnknownRow[];
}

export const STAMP_FEE_NO_ORG_LABEL = "所属機関が未登録";

// 所属機関別にまとめる（機関名の順。未登録は最後）。機関の中はTODO番号の順
export function groupStampFeeByOrg(rows: StampFeeUnknownRow[]): StampFeeUnknownGroup[] {
  const byOrg = new Map<string, StampFeeUnknownGroup>();
  for (const r of rows) {
    const key = r.orgId || "";
    const g = byOrg.get(key) ?? { orgId: key, orgName: r.orgName || STAMP_FEE_NO_ORG_LABEL, rows: [] };
    g.rows.push(r);
    byOrg.set(key, g);
  }
  const groups = [...byOrg.values()];
  for (const g of groups) g.rows.sort((a, b) => a.todoNo.localeCompare(b.todoNo, "ja") || a.workerName.localeCompare(b.workerName, "ja"));
  groups.sort((a, b) => {
    if (!a.orgId !== !b.orgId) return a.orgId ? -1 : 1;
    return a.orgName.localeCompare(b.orgName, "ja");
  });
  return groups;
}

// 所属機関で絞る（'' はすべて）
export function filterStampFeeByOrg(rows: StampFeeUnknownRow[], orgId: string): StampFeeUnknownRow[] {
  if (!orgId) return rows;
  return rows.filter((r) => (r.orgId || "") === orgId);
}

// コピー用のテキスト（所属機関ごとに見出しを付けて1人1行）
export function stampFeeUnknownText(groups: StampFeeUnknownGroup[], today: string): string {
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const lines: string[] = [`収入印紙代の負担が未設定の申請（${today} 現在・${total}件）`, ""];
  for (const g of groups) {
    lines.push(`■ ${g.orgName}（${g.rows.length}件）`);
    for (const r of g.rows) {
      const parts = [r.todoNo ? `${r.todoNo}` : "", r.workerName, r.appContent, r.tantou ? `担当: ${r.tantou}` : ""].filter(Boolean);
      lines.push(`・${parts.join("　")}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
