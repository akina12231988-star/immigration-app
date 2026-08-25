// 求人管理簿・求職管理簿に出る日付の並びがおかしくないかを見る。
//
// 正しい流れ:
//   求人受付年月日 → 紹介年月日 → 採用年月日
//   求職受付日 → 紹介年月日
//
// 求職受付日は求人受付年月日より前でも構わない（先に求職の登録をしてから
// 求人が来ることがあるため）。ここでは比べない。

export interface LedgerDates {
  postingReceivedOn: string | null; // 求人受付年月日（求人管理簿・様式30）
  jobseekerAcceptedOn: string | null; // 求職受付日（求職管理簿）
  appliedOn: string | null; // 紹介年月日（応募日）
  resultOn: string | null; // 採用年月日（結果日）
  result: string; // 採用 / 不採用 / 辞退 / 選考中
}

export interface LedgerDateIssue {
  kind: "紹介年月日" | "採用年月日";
  message: string;
}

const d = (s: string | null | undefined): string => (s ?? "").trim();

export function checkLedgerDates(dates: LedgerDates): LedgerDateIssue[] {
  const issues: LedgerDateIssue[] = [];
  const posting = d(dates.postingReceivedOn);
  const accepted = d(dates.jobseekerAcceptedOn);
  const applied = d(dates.appliedOn);
  const result = d(dates.resultOn);

  if (applied && posting && applied < posting) {
    issues.push({
      kind: "紹介年月日",
      message: `紹介年月日（${applied}）が求人受付年月日（${posting}）より前です`,
    });
  }
  if (applied && accepted && applied < accepted) {
    issues.push({
      kind: "紹介年月日",
      message: `紹介年月日（${applied}）が求職受付日（${accepted}）より前です`,
    });
  }
  if (dates.result === "採用") {
    if (result && applied && result < applied) {
      issues.push({
        kind: "採用年月日",
        message: `採用年月日（${result}）が紹介年月日（${applied}）より前です`,
      });
    }
    if (!result) {
      issues.push({ kind: "採用年月日", message: "採用ですが採用年月日が入っていません" });
    }
  }
  return issues;
}

export function hasLedgerDateIssue(dates: LedgerDates): boolean {
  return checkLedgerDates(dates).length > 0;
}
