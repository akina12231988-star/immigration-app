// 入社書類の目次（紙で会社に渡すときにA4縦で印刷する）。
//
// 所属機関の「会社に渡す外国人資料のやりとり方法」が「紙で資料を渡す」のとき、
// 入社書類メールと同じ並びの書類を目次にして、資料の束の1枚目に付ける。
//   ・扶養控除等申告書は、有限会社國崎青果と BASE株式会社にだけ渡す
//   ・雇用保険の適用事業所でない会社は、外国人雇用状況届出書（様式第3号）を足す
//   ・通貨払いの会社は、報酬支払証明書（参考様式第５－７号）を足す

import { HANDOVER_METHODS } from "@/lib/organization-intake";
import { onboardingDocDefs } from "@/lib/onboarding";
import { orgSearchKeys } from "@/lib/org-search";
import { needsKoyoJokyoForm } from "@/lib/koyo-jokyo";
import { isCashPay } from "@/lib/pay-proof";

export const HANDOVER_PAPER = HANDOVER_METHODS[0]; // 紙で資料を渡す
export const HANDOVER_MAIL = HANDOVER_METHODS[1]; // mailで資料を送る

export function isPaperHandover(method: string | null | undefined): boolean {
  return (method ?? "").trim() === HANDOVER_PAPER;
}

// 扶養控除等申告書を渡す会社（この2社だけ）。
// 法人格の有無・前後、異体字（國崎／国崎）、全角半角の違いは同じ扱いにする
export const FUYOKOJO_ORG_NAMES = ["有限会社國崎青果", "BASE株式会社"] as const;

function orgKey(name: string): string {
  const keys = orgSearchKeys(name);
  return keys[keys.length - 1]; // 法人格を取り除いた形（無ければそのまま）
}

export function attachesFuyokojo(orgName: string | null | undefined): boolean {
  const key = orgKey(orgName ?? "");
  if (!key) return false;
  return FUYOKOJO_ORG_NAMES.some((n) => orgKey(n) === key);
}

export interface OnboardingIndexItem {
  key: string;
  num: number; // 目次の番号（1はじまり）
  label: string;
  note: string; // 備考（なぜ入っているか）
}

// 目次の行。入社書類メールの並びのとおりで、会社の条件で足し引きする
export function onboardingIndexItems(input: {
  today: string;
  orgName: string;
  payMethod: string | null | undefined; // 給与支払い方法（通貨払い / 口座振込）
  koyoCovered: string | null | undefined; // 雇用保険の適用事業所か（はい / いいえ）
}): OnboardingIndexItem[] {
  const rows: { key: string; label: string; note: string }[] = [];
  for (const def of onboardingDocDefs(input.today)) {
    if (def.key === "fuyokojo" && !attachesFuyokojo(input.orgName)) continue;
    rows.push({ key: def.key, label: def.label, note: "" });
  }
  if (needsKoyoJokyoForm(input.koyoCovered)) {
    rows.push({
      key: "koyo_jokyo",
      label: "外国人雇用状況届出書（様式第3号）",
      note: "雇用保険の適用事業所ではないため",
    });
  }
  if (isCashPay(input.payMethod)) {
    rows.push({
      key: "pay_proof",
      label: "報酬支払証明書（参考様式第５－７号）",
      note: "通貨払いのため（毎月1枚）",
    });
  }
  return rows.map((r, i) => ({ ...r, num: i + 1 }));
}

// 印刷（PDF保存）のファイル名
export function onboardingIndexFileName(workerName: string): string {
  const name = (workerName ?? "").trim();
  return name ? `入社書類目次_${name}` : "入社書類目次";
}
