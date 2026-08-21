// 所属機関の「在籍者・過去の在籍者」の表で、未登録の雇用開始日・賃金を
// その場で入力するための下書き。
//
// 賃金の適用開始日は、入れ直さなくて済むよう既定値を用意する:
//   1. この場で入力した雇用開始日（同じ行で一緒に入れているとき）
//   2. すでに登録されているこの機関での雇用開始日
//   3. どちらも無ければ今日
// わざと別の日にしたいときは、日付を触ればその値が優先される。

export interface RosterFill {
  startOn: string; // 雇用開始日（未登録のときだけ入力できる）
  wageKind: string; // 賃金の区分（時給 など）
  wageAmount: string; // 賃金の金額（数字だけ。空なら賃金は登録しない）
  wageStartedOn: string; // 賃金の適用開始日。空なら既定値を使う
}

export function emptyRosterFill(): RosterFill {
  return { startOn: "", wageKind: "時給", wageAmount: "", wageStartedOn: "" };
}

// 下書きの一部を書き換える（触っていない項目は残す）
export function rosterFillPatch(fill: RosterFill, patch: Partial<RosterFill>): RosterFill {
  return { ...fill, ...patch };
}

// 保存するものが入っているか（雇用開始日だけ・賃金だけでもよい）。
// 賃金は金額を入れたときだけ登録する（区分だけ選んでも保存しない）
export function hasRosterFill(fill: RosterFill): boolean {
  return fill.startOn.trim() !== "" || wageAmountOf(fill) > 0;
}

// 入力された金額（「1,100円」のような書き方でも数字だけ取り出す）
export function wageAmountOf(fill: RosterFill): number {
  return Number(fill.wageAmount.replace(/[^0-9]/g, "")) || 0;
}

// 賃金の適用開始日（上のコメントの優先順）
export function wageStartedOnOf(
  fill: RosterFill,
  savedStartOn: string | null,
  today: string,
): string {
  return fill.wageStartedOn || fill.startOn || savedStartOn || today;
}
