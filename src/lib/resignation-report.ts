// 退職の記録で、随時報告書が要るかどうかと「退職扱い」にする時期の判定。
//
// 在留資格が特定技能1号・2号 … 退職扱いにして、所属機関の随時報告書（参考様式第3-1-2号ほか）を作る
// 在留資格が特定活動         … 随時報告書は要らない。退職扱いだけにして、請求書で退職日まで日割り計算する
//
// 「退職扱い」（外国人のステータスを「退職」にする）は退職日を過ぎてから行う。
// 退職日までは在籍しているので、退職日当日までは「在籍中」のままにしておく。

// 在留資格が特定活動か（「特定活動（特定技能1号以降準備）」など、表記のゆれも拾う）
export function isTokuteiKatsudoResidence(residenceStatus: string | null | undefined): boolean {
  return (residenceStatus ?? "").includes("特定活動");
}

// 退職の随時報告書（所属機関の随時届出）が必要か。特定活動の人だけ不要
export function resignationReportNeeded(residenceStatus: string | null | undefined): boolean {
  return !isTokuteiKatsudoResidence(residenceStatus);
}

// 記録の画面に出す案内文
export function resignationFlowLabel(residenceStatus: string | null | undefined): string {
  return resignationReportNeeded(residenceStatus)
    ? "退職扱いにして、所属機関の随時報告書（届出書）を作成します"
    : "随時報告書は不要です。退職扱いにして、請求書で退職日まで日割り計算します";
}

// 退職日を過ぎたか（退職日の翌日から「退職」扱いにする）
export function isPastLeavingDate(
  leavingOn: string | null | undefined,
  today: string,
): boolean {
  return Boolean(leavingOn) && (leavingOn as string) < today;
}

// 退職日を過ぎたので自動でステータスを「退職」にする対象かどうかの判定に使う項目
export interface RetireCheckWorker {
  status: string;
  leaving_on: string | null;
  current_organization_id: string | null;
  employment_start_on: string | null;
}

export interface RetireCheckResignation {
  organization_id: string | null;
  leaving_on: string | null;
}

// 退職日を過ぎた退職の記録について、外国人のステータスを「退職」に変えてよいか。
// 次の場合は変えない（退職の記録が残っていても在籍が続いている）:
//   ・すでに退職・帰国になっている
//   ・外国人情報の退職日が記録と違う（再雇用などで退職日を空にした・別の退職日になった）
//   ・別の所属機関に移っている（転職）か、退職日より後に雇用が始まっている
export function shouldRetireWorker(
  worker: RetireCheckWorker,
  resignation: RetireCheckResignation,
  today: string,
): boolean {
  if (!isPastLeavingDate(resignation.leaving_on, today)) return false;
  if (worker.status === "退職" || worker.status === "帰国") return false;
  if (worker.leaving_on !== resignation.leaving_on) return false;
  if (
    worker.current_organization_id &&
    resignation.organization_id &&
    worker.current_organization_id !== resignation.organization_id
  ) {
    return false;
  }
  const start = worker.employment_start_on ?? "";
  if (start && resignation.leaving_on && start > resignation.leaving_on) return false;
  return true;
}
