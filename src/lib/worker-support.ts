// 在留資格と状態から支援区分（支援開始前 / 支援対象 / 支援対象外）を判別する。
//
// 支援計画の義務があるのは特定技能1号（とその移行準備の特定活動）だけなので、
// 特定技能2号・特定活動（特定技能2号移行準備）は支援対象外になる。
// 支援対象外でも在籍はしているので、在籍名簿には載る（請求だけ対象外）。
//
// 退職・帰国・求職活動中では支援区分を変えない。退職と同時に支援対象外にすると、
// 退職月の日割り請求が名簿から消えてしまうため（請求は退職日まで行う）。

import type { SupportScope, WorkerStatus } from "@/types/db";
import { situationOnEnrolled } from "@/lib/worker-situation";

// 特定技能2号にあたるか（特定活動〔特定技能2号移行準備〕を含む）
function isSsw2Scope(residenceStatus: string): boolean {
  return /[2２]号/.test(residenceStatus) && !/[1１]号/.test(residenceStatus);
}

// 特定技能1号にあたるか（特定活動〔特定技能1号移行準備〕・更新の表記を含む）
function isSsw1Scope(residenceStatus: string): boolean {
  return /[1１]号/.test(residenceStatus);
}

// その在留資格・状態にふさわしい支援区分。
// 判断できない（＝今の値のままでよい）ときは null を返す
export function suggestSupportScope(
  residenceStatus: string | null | undefined,
  status: WorkerStatus | string | null | undefined,
): SupportScope | null {
  // 退職・帰国・求職活動中は支援区分を触らない（退職月の請求を残すため）
  if (status === "退職" || status === "帰国" || status === "求職活動中") return null;

  const s = (residenceStatus ?? "").trim();
  if (!s) return null;

  if (/特定技能|特定活動/.test(s)) {
    if (isSsw2Scope(s)) return "支援対象外";
    if (isSsw1Scope(s)) {
      // 許可がまだ下りていない準備中は、支援が始まる前
      return status === "申請準備中" ? "支援開始前" : "支援対象";
    }
  }

  // 技能実習など、これから特定技能へ移る方
  return "支援開始前";
}

// 所属機関と雇用開始日がそろったときの状態・支援区分・只今の状況の自動更新。
// 「申請準備中」の人だけを「在籍中」へ進める（在籍中・退職・帰国・求職活動中は触らない）。
// 支援区分は在留資格から判別し（特定技能1号=支援対象・2号=支援対象外）、
// 判別できないときは支援対象にする。
// 只今の状況は、まだ何も入っていない人にだけ入れる（入力済みの内容は上書きしない）
export interface EnrollPatch {
  status: WorkerStatus;
  support: SupportScope;
  current_situation?: string;
}

export function employmentStartPatch(
  status: WorkerStatus | string | null | undefined,
  residenceStatus: string | null | undefined,
  hasOrganization: boolean,
  hasEmploymentStart: boolean,
  currentSituation?: string | null,
): EnrollPatch | null {
  if (!hasOrganization || !hasEmploymentStart) return null;
  if (status !== "申請準備中") return null;
  const support = suggestSupportScope(residenceStatus, "在籍中") ?? "支援対象";
  const situation = (currentSituation ?? "").trim()
    ? null // すでに入力されている只今の状況は変えない
    : situationOnEnrolled(residenceStatus, support);
  return {
    status: "在籍中",
    support,
    ...(situation ? { current_situation: situation } : {}),
  };
}

// 自動判別の理由（画面で「なぜこの区分になるか」を出すため）
export function supportScopeReason(
  residenceStatus: string | null | undefined,
  status: WorkerStatus | string | null | undefined,
): string {
  const scope = suggestSupportScope(residenceStatus, status);
  if (!scope) return "";
  const s = (residenceStatus ?? "").trim();
  if (scope === "支援対象外") return `${s}は支援計画の対象外のため`;
  if (scope === "支援開始前") {
    return status === "申請準備中" ? "許可が下りるまでは支援開始前のため" : `${s}のため`;
  }
  return `${s}のため`;
}
