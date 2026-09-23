// 申請準備の「前回の申請（1年以内）」の判定。
//
// 課税証明書・納税証明書（市県民税／国保税）・源泉徴収票・保険証・年金記録は、
// 過去1年以内の申請で提出していれば、その申請日と申請番号を申請書に書くことで
// 再提出を省ける。申請一覧（immigration_applications）から1年以内の申請を自動で拾い、
// 無ければ外国人情報に手で入れた申請日・申請番号（0158）を使う。

// この案内を出す書類（application-prep.ts の PrepDocDef.id）
export const PRIOR_APP_DOC_IDS = [
  "kazei",
  "nozei_shiken",
  "nozei_kokuho",
  "gensen",
  "hokensho",
  "nenkin",
] as const;

// 前回使った年度を控える書類（年度・年分の付く書類。保険証・年金記録は年度が無い）
export const PRIOR_YEAR_DOC_IDS = ["kazei", "nozei_shiken", "nozei_kokuho", "gensen"] as const;

// 前回の申請で使った書類の年度（書類ID → 令和年。workers.prior_application_doc_years・0166）
export type PriorDocYears = Partial<Record<string, number | null>>;

export function isPriorAppDoc(defId: string): boolean {
  return (PRIOR_APP_DOC_IDS as readonly string[]).includes(defId);
}

export interface PriorApplicationSource {
  applicationDate: string; // YYYY-MM-DD
  applicationNumber: string;
  withdrawnOn?: string | null; // 取下げた申請は数えない
  applicationContent?: string; // 申請内容（在留資格の変更許可 など）
  visaAtGrant?: string; // 許可時の在留資格（特定技能1号 など。許可前は空）
  organizationId?: string | null; // 所属機関
}

export interface PriorApplication {
  applicationOn: string; // 申請日 YYYY-MM-DD
  applicationNo: string; // 申請番号
  source: "auto" | "manual"; // 申請一覧から自動 / 手入力
  content: string; // 申請内容（例: 在留資格の変更許可（特定技能1号））。分からなければ空
  organizationId: string | null; // 所属機関
}

// 手入力の前回の申請（0158・0166）
export interface ManualPriorApplication {
  on: string | null | undefined;
  no: string | null | undefined;
  content?: string | null;
  orgId?: string | null;
}

// 手入力の申請内容の候補（自由入力もできる）
export const PRIOR_CONTENT_OPTIONS = [
  "在留資格の変更許可（特定技能）",
  "在留期間の更新許可（特定技能）",
  "在留資格の変更許可（特定活動）",
  "在留期間の更新許可（特定活動）",
  "在留資格認定証明書交付申請",
] as const;

// 申請一覧の申請内容の表示（許可時の在留資格が分かれば括弧で添える）
export function applicationContentLabel(a: Pick<PriorApplicationSource, "applicationContent" | "visaAtGrant">): string {
  const content = (a.applicationContent ?? "").trim();
  const visa = (a.visaAtGrant ?? "").trim();
  if (!content) return visa;
  return visa ? `${content}（${visa}）` : content;
}

// 特定活動の申請の申請番号は、ほかの申請に転用できない
export function isNonTransferable(p: Pick<PriorApplication, "content"> | null): boolean {
  return !!p && p.content.includes("特定活動");
}

// today の1年前（同じ月日）。例: 2026-09-15 → 2025-09-15
export function oneYearBefore(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y - 1, m - 1, d));
  // 2/29 の1年前は 2/28 に寄せる（Date が 3/1 にしてしまうため）
  if (dt.getUTCMonth() !== m - 1) dt.setUTCDate(0);
  return dt.toISOString().slice(0, 10);
}

// 申請一覧のうち、今日から1年以内で申請日が今日以前のいちばん新しい申請。
// 取下げた申請と、申請番号が空の申請（まだ受付前）は除く
export function latestApplicationWithinYear(
  apps: PriorApplicationSource[],
  today: string,
): PriorApplication | null {
  const from = oneYearBefore(today);
  const hit = apps
    .filter(
      (a) =>
        a.applicationDate &&
        a.applicationDate >= from &&
        a.applicationDate <= today &&
        a.applicationNumber.trim() !== "" &&
        !a.withdrawnOn,
    )
    .sort((a, b) => b.applicationDate.localeCompare(a.applicationDate))[0];
  return hit
    ? {
        applicationOn: hit.applicationDate,
        applicationNo: hit.applicationNumber.trim(),
        source: "auto",
        content: applicationContentLabel(hit),
        organizationId: hit.organizationId ?? null,
      }
    : null;
}

// 表示する前回の申請。申請一覧から拾えればそれを優先し、無ければ手入力の値
export function priorApplication(
  apps: PriorApplicationSource[],
  manual: ManualPriorApplication,
  today: string,
): PriorApplication | null {
  const auto = latestApplicationWithinYear(apps, today);
  if (auto) return auto;
  return manualPrior(manual);
}

function manualPrior(manual: ManualPriorApplication): PriorApplication | null {
  const on = (manual.on ?? "").trim();
  const no = (manual.no ?? "").trim();
  if (!on && !no) return null;
  return {
    applicationOn: on,
    applicationNo: no,
    source: "manual",
    content: (manual.content ?? "").trim(),
    organizationId: manual.orgId || null,
  };
}

// 参考様式1-25号（支援委託契約書）を転用できる申請。
// 申請準備の所属機関と同じ所属機関で出した「在留資格の変更許可（特定技能）」のいちばん新しい申請。
// 許可前で在留資格が未記録の変更許可も候補にする（取下げ・申請番号なしは除く）。
// 申請一覧に無ければ、手入力の前回の申請が条件に合うときだけ使う
export function sswChangeApplicationFor(
  apps: PriorApplicationSource[],
  organizationId: string | null,
  manual: ManualPriorApplication,
): PriorApplication | null {
  if (!organizationId) return null;
  const hit = apps
    .filter(
      (a) =>
        a.organizationId === organizationId &&
        (a.applicationContent ?? "") === "在留資格の変更許可" &&
        (!a.visaAtGrant || a.visaAtGrant.includes("特定技能")) &&
        a.applicationDate &&
        a.applicationNumber.trim() !== "" &&
        !a.withdrawnOn,
    )
    .sort((a, b) => b.applicationDate.localeCompare(a.applicationDate))[0];
  if (hit) {
    return {
      applicationOn: hit.applicationDate,
      applicationNo: hit.applicationNumber.trim(),
      source: "auto",
      content: applicationContentLabel(hit) || "在留資格の変更許可",
      organizationId,
    };
  }
  const m = manualPrior(manual);
  if (m && m.organizationId === organizationId && m.content.includes("変更") && m.content.includes("特定技能")) return m;
  return null;
}

// 書類の行に出す短い案内（例: 前回提出: 申請日 2026-03-10／申請番号 12345／在留資格の変更許可（特定技能1号））。
// 特定活動の申請は申請番号を転用できないので、その旨を添える
export function priorApplicationText(p: PriorApplication | null): string {
  if (!p) return "";
  const parts = [
    p.applicationOn ? `申請日 ${p.applicationOn}` : "",
    p.applicationNo ? `申請番号 ${p.applicationNo}` : "",
    p.content,
  ].filter(Boolean);
  const text = `前回提出: ${parts.join("／")}${p.source === "manual" ? "（手入力）" : ""}`;
  return isNonTransferable(p) ? `${text}　※特定活動の申請のため、この申請番号は転用できません` : text;
}

// 手入力の年度で出す案内（前回の準備リストが無いとき）。例:
//   「前回は令和7年度を使用 → 今回も令和7年度なので再提出を省けます」
//   「前回は令和6年度を使用（今回は令和7年度が必要）」
export function manualDocYearNote(
  yearKind: string | undefined,
  priorYear: number | null | undefined,
  thisYear: number | null,
): string {
  if (!yearKind || !priorYear) return "";
  const label = `令和${priorYear}${yearKind}`;
  if (thisYear == null) return `前回は${label}を使用`;
  if (thisYear === priorYear) return `前回は${label}を使用 → 今回も${label}なので再提出を省けます`;
  return `前回は${label}を使用（今回は令和${thisYear}${yearKind}が必要）`;
}
