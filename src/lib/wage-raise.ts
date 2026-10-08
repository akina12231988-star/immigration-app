// 所属機関の在籍者の時給をまとめて登録する（最低賃金の改定・一斉の昇給）。
//
// 「◯月◯日から、特定技能1号は◯円、2号は◯円」という決め方が多いので、
// 在籍中・審査中（受け取り待ち）・準備中の人を1つの表に出し、在留資格から金額を仮に決めて、
// 確認のうえ1回の操作で worker_wages に1行ずつ入れる。1人ずつの金額は表で直せる。

import { isSsw1Residence } from "@/lib/support-system";

export const WAGE_RAISE_GROUPS = ["在籍中", "審査中・受け取り待ち", "準備中"] as const;
export type WageRaiseGroup = (typeof WAGE_RAISE_GROUPS)[number];

export interface WageRaiseAmounts {
  ssw1: number; // 特定技能1号（と、それ以外の在留資格）の時給
  ssw2: number; // 特定技能2号（移行準備の特定活動を含む）の時給
}

// 一括登録の対象になる人の必要な項目（所属機関の在籍名簿の行から）
export interface WageRaiseWorkerLike {
  id: string;
  name: string;
  residenceStatus: string;
  status: string;
  wageKind: string | null;
  wageAmount: number | null;
  wageStartedOn: string | null;
}

export interface WageRaiseRow<T extends WageRaiseWorkerLike> {
  worker: T;
  group: WageRaiseGroup;
  proposed: number | null; // 在留資格から仮に決めた時給（金額未入力なら null）
  checked: boolean; // 登録の対象にするか（既定）
  note: string; // 確認してほしいこと（特定活動・時給以外・登録済み など）
}

// 特定技能2号か（移行準備の特定活動も2号あつかい）。全角の「２」も同じに見る
export function isSsw2Residence(residenceStatus: string | null | undefined): boolean {
  const s = (residenceStatus ?? "").normalize("NFKC");
  return s.includes("特定技能2号") || s.includes("2号");
}

// 在留資格から仮に決める時給。2号なら ssw2、それ以外は ssw1。金額が入っていなければ null
export function proposedWage(
  residenceStatus: string | null | undefined,
  amounts: WageRaiseAmounts,
): number | null {
  const amount = isSsw2Residence(residenceStatus) ? amounts.ssw2 : amounts.ssw1;
  return amount > 0 ? amount : null;
}

// 「1,100」「１１００円」などを数値にする（数字以外は捨てる）。空は 0
export function parseYen(input: string): number {
  const digits = (input ?? "").normalize("NFKC").replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
}

// 記録の備考（あとで「いつの一括登録か」が分かるように）
export function wageRaiseNote(startedOn: string): string {
  return `時給の一括登録（${startedOn}から）`;
}

// 一括登録の表の行を作る。
//   active        … 状態が「在籍中」の人
//   notYet        … この機関に紐づいているが「在籍中」ではない人（申請準備中など）
//   applying      … この機関への申請が審査中・許可済（在留カード受け取り待ち）の人
//   underReviewIds… notYet のうち申請が審査中の人
// 既定でチェックを外すのは、金額が決まらない人・現在の賃金が時給でない人・同じ時給が登録済みの人
export function buildWageRaiseRows<T extends WageRaiseWorkerLike>(
  active: T[],
  notYet: T[],
  applying: T[],
  underReviewIds: Set<string>,
  amounts: WageRaiseAmounts,
  startedOn: string,
): WageRaiseRow<T>[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "ja");
  const seen = new Set<string>();
  const list: { worker: T; group: WageRaiseGroup }[] = [];
  const push = (w: T, group: WageRaiseGroup) => {
    if (seen.has(w.id)) return;
    seen.add(w.id);
    list.push({ worker: w, group });
  };
  [...active].sort(byName).forEach((w) => push(w, "在籍中"));
  [...applying, ...notYet.filter((w) => underReviewIds.has(w.id))]
    .sort(byName)
    .forEach((w) => push(w, "審査中・受け取り待ち"));
  notYet
    .filter((w) => !underReviewIds.has(w.id))
    .sort(byName)
    .forEach((w) => push(w, "準備中"));

  return list.map(({ worker, group }) => {
    const proposed = proposedWage(worker.residenceStatus, amounts);
    const notes: string[] = [];
    let checked = proposed !== null;
    const s = (worker.residenceStatus ?? "").normalize("NFKC");
    if (!s) {
      notes.push("在留資格が未登録です。金額を確認してください");
    } else if (s.includes("特定活動")) {
      notes.push(`在留資格が特定活動（${isSsw2Residence(s) ? "2号" : "1号"}の金額で仮置き）です。金額を確認してください`);
    } else if (!isSsw1Residence(s) && !isSsw2Residence(s)) {
      notes.push(`在留資格が特定技能ではありません（${s}）。金額を確認してください`);
    }
    if (worker.wageKind && worker.wageKind !== "時給") {
      notes.push(`現在の賃金が時給ではありません（${worker.wageKind}）。対象から外しています`);
      checked = false;
    }
    if (
      proposed !== null &&
      worker.wageKind === "時給" &&
      worker.wageAmount === proposed &&
      (worker.wageStartedOn ?? "") >= startedOn
    ) {
      notes.push("同じ時給がこの日以降で登録済みです。対象から外しています");
      checked = false;
    }
    return { worker, group, proposed, checked, note: notes.join("。") };
  });
}

// 対象にした人数と、グループごとの内訳（確認の文に使う）
export function wageRaiseSummary<T extends WageRaiseWorkerLike>(
  rows: WageRaiseRow<T>[],
  checked: (row: WageRaiseRow<T>) => boolean,
): { total: number; byGroup: Record<WageRaiseGroup, number> } {
  const byGroup = { 在籍中: 0, "審査中・受け取り待ち": 0, 準備中: 0 } as Record<WageRaiseGroup, number>;
  let total = 0;
  for (const r of rows) {
    if (!checked(r)) continue;
    total += 1;
    byGroup[r.group] += 1;
  }
  return { total, byGroup };
}
