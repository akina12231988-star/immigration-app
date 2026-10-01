// 申請の収入印紙代（在留資格変更・更新の手数料）をだれが負担するか。
//
// 申請準備の詳細（申請種別の上）で「本人負担」「会社負担」を選ぶ。
// 有限会社國崎青果だけは、所属機関を見て自動的に本人負担にする。
// どちらか分かっていない申請は、所属機関別の一覧（/todos/stamp-fee）に出して確認する。

import { orgSearchKeys } from "@/lib/org-search";

export const STAMP_FEE_PAYERS = ["本人負担", "会社負担"] as const;
export type StampFeePayer = (typeof STAMP_FEE_PAYERS)[number];

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

// 所属機関から決まる既定の負担（有限会社國崎青果は本人負担。ほかは未設定）
export function defaultStampFeePayer(orgName: string | null | undefined): StampFeePayer | "" {
  return isKunisakiSeika(orgName) ? "本人負担" : "";
}

// 保存されている値と所属機関から、画面に出す負担（未設定なら所属機関の既定）
export function effectiveStampFeePayer(saved: string | null | undefined, orgName: string | null | undefined): StampFeePayer | "" {
  const v = (saved ?? "").trim();
  if (v === "本人負担" || v === "会社負担") return v;
  return defaultStampFeePayer(orgName);
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
