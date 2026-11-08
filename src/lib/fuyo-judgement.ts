import { docNameReiwaYear } from "@/lib/org-document-requests";
import { formatYenAmount, remittanceTarget, remittanceTotal } from "@/lib/dependents";
import type { WorkerDependent } from "@/types/db";

// 会社からの書類の依頼（年末調整）の扶養控除等申告書のマスに出す、送金額からの判定。
//
// 送金明細書の金額を外国人詳細の扶養家族に入れると、その年の送金が目標に達した人だけが
// 年末調整用の申告書に載る。入社時（全員記載）のままでよいか、作り直しが必要かを自動で出す。

export type FuyoJudgementKind =
  | "no-dependents" // 扶養家族が登録されていない
  | "not-entered" // その年の送金額が1件も入っていない
  | "all-achieved" // 全員達成（入社時のままでよい）
  | "partial" // 一部だけ達成（年末調整用に作り直し）
  | "none-achieved"; // 誰も達成していない（年末調整用は記載なし）

export interface FuyoDependentAmount {
  name: string;
  relation: string;
  amount: number;
  target: number;
  achieved: boolean;
}

export interface FuyoJudgement {
  kind: FuyoJudgementKind;
  year: string;
  dependents: FuyoDependentAmount[];
  achieved: FuyoDependentAmount[];
  unachieved: FuyoDependentAmount[];
}

export type FuyoFormKind = "入社時" | "年末調整時";

// 添付した申告書の中身（0220。あとで送金額が変わったかを見るために残す）
export interface FuyoAttachedDetail {
  kind: FuyoFormKind;
  year: string;
  names: string[];
}

export function normalizeFuyoAttachedDetail(v: unknown): FuyoAttachedDetail | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.kind !== "入社時" && o.kind !== "年末調整時") return null;
  return {
    kind: o.kind,
    year: typeof o.year === "string" ? o.year : "",
    names: Array.isArray(o.names) ? o.names.filter((x): x is string => typeof x === "string") : [],
  };
}

const depLabel = (d: Pick<WorkerDependent, "name" | "relation">) => d.name.trim() || d.relation || "（氏名なし）";

export function fuyoYearEndJudgement(deps: WorkerDependent[], today: string, year: string): FuyoJudgement {
  const list: FuyoDependentAmount[] = deps.map((d) => {
    const amount = remittanceTotal(d.remittances ?? [], year);
    const target = remittanceTarget(d, today);
    return { name: depLabel(d), relation: d.relation, amount, target, achieved: amount >= target };
  });
  const achieved = list.filter((d) => d.achieved);
  const unachieved = list.filter((d) => !d.achieved);
  // 金額の行（0円の行も含む）が1件も無ければ、まだ入力していない
  const entered = deps.some((d) => (d.remittances ?? []).some((r) => r.year === year && r.amount.trim() !== ""));
  const kind: FuyoJudgementKind =
    deps.length === 0
      ? "no-dependents"
      : !entered
        ? "not-entered"
        : unachieved.length === 0
          ? "all-achieved"
          : achieved.length === 0
            ? "none-achieved"
            : "partial";
  return { kind, year, dependents: list, achieved, unachieved };
}

// その発行パターンの申告書に載る人
export function fuyoFormNames(j: FuyoJudgement, kind: FuyoFormKind): string[] {
  return (kind === "年末調整時" ? j.achieved : j.dependents).map((d) => d.name);
}

// 送金額から見て、合う方（全員達成なら入社時、それ以外は年末調整時）
export function recommendedFuyoKind(j: FuyoJudgement): FuyoFormKind {
  return j.kind === "all-achieved" ? "入社時" : "年末調整時";
}

// 添付した申告書の人と、いまの送金額で載るべき人が違うか（添付後に送金額を直したとき）
export function fuyoAttachedStale(detail: FuyoAttachedDetail | null, j: FuyoJudgement): boolean {
  if (!detail || j.kind === "not-entered" || j.kind === "no-dependents") return false;
  const now = [...fuyoFormNames(j, detail.kind)].sort();
  const was = [...detail.names].sort();
  return now.length !== was.length || now.some((n, i) => n !== was[i]);
}

export const fuyoAmountText = (d: FuyoDependentAmount) =>
  `${d.name}${d.relation ? `（${d.relation}）` : ""} ${formatYenAmount(d.amount)}`;

// 依頼の書類名・依頼名に書いてある年（令和・西暦）。無ければ今日の年
export function fuyoTargetYear(itemName: string, requestTitle: string, today: string): string {
  const r = docNameReiwaYear(itemName) ?? docNameReiwaYear(requestTitle);
  return r ? String(2018 + r) : today.slice(0, 4);
}

// 送金証明書（送金明細書）の項目か
export function isRemittanceItemName(name: string): boolean {
  return /送金/.test((name ?? "").normalize("NFKC"));
}
