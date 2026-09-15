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

export function isPriorAppDoc(defId: string): boolean {
  return (PRIOR_APP_DOC_IDS as readonly string[]).includes(defId);
}

export interface PriorApplicationSource {
  applicationDate: string; // YYYY-MM-DD
  applicationNumber: string;
  withdrawnOn?: string | null; // 取下げた申請は数えない
}

export interface PriorApplication {
  applicationOn: string; // 申請日 YYYY-MM-DD
  applicationNo: string; // 申請番号
  source: "auto" | "manual"; // 申請一覧から自動 / 手入力
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
    ? { applicationOn: hit.applicationDate, applicationNo: hit.applicationNumber.trim(), source: "auto" }
    : null;
}

// 表示する前回の申請。申請一覧から拾えればそれを優先し、無ければ手入力の値
export function priorApplication(
  apps: PriorApplicationSource[],
  manual: { on: string | null | undefined; no: string | null | undefined },
  today: string,
): PriorApplication | null {
  const auto = latestApplicationWithinYear(apps, today);
  if (auto) return auto;
  const on = (manual.on ?? "").trim();
  const no = (manual.no ?? "").trim();
  if (!on && !no) return null;
  return { applicationOn: on, applicationNo: no, source: "manual" };
}

// 書類の行に出す短い案内（例: 前回提出: 申請日 2026-03-10／申請番号 12345）
export function priorApplicationText(p: PriorApplication | null): string {
  if (!p) return "";
  const parts = [
    p.applicationOn ? `申請日 ${p.applicationOn}` : "",
    p.applicationNo ? `申請番号 ${p.applicationNo}` : "",
  ].filter(Boolean);
  return `前回提出: ${parts.join("／")}${p.source === "manual" ? "（手入力）" : ""}`;
}
