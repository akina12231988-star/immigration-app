// 応募から雇用開始までの日付の並びがおかしくないかを見る。
//
// 正しい流れ:
//   求人受付年月日 → 紹介年月日（応募日） → 採用年月日（結果日）
//     → 雇用条件書の作成日／雇用契約日 → 雇用開始日
//   求職受付日 → 紹介年月日
//
// 求職受付日は求人受付年月日より前でも構わない（先に求職の登録をしてから
// 求人が来ることがあるため）。ここでは比べない。
// 雇用条件書の作成日と雇用契約日はどちらが先でも構わないため、その2つは比べない。

// 訂正する日付の種類（画面で赤い枠を付けるところ）
export type LedgerDateKind =
  | "紹介年月日"
  | "採用年月日"
  | "雇用条件書の作成日"
  | "雇用契約日"
  | "雇用開始日";

export interface LedgerDates {
  postingReceivedOn: string | null; // 求人受付年月日（求人管理簿・様式30）
  jobseekerAcceptedOn: string | null; // 求職受付日（求職管理簿）
  appliedOn: string | null; // 紹介年月日（応募日）
  resultOn: string | null; // 採用年月日（結果日）
  result: string; // 採用 / 不採用 / 辞退 / 選考中
  conditionsOn?: string | null; // 雇用条件書の作成日
  contractOn?: string | null; // 雇用契約日
  employmentStartOn?: string | null; // 雇用開始日
}

export interface LedgerDateIssue {
  kind: LedgerDateKind;
  message: string;
}

const d = (s: string | null | undefined): string => (s ?? "").trim();

export function checkLedgerDates(dates: LedgerDates): LedgerDateIssue[] {
  const issues: LedgerDateIssue[] = [];
  const posting = d(dates.postingReceivedOn);
  const accepted = d(dates.jobseekerAcceptedOn);
  const applied = d(dates.appliedOn);
  const result = d(dates.resultOn);
  const conditions = d(dates.conditionsOn);
  const contract = d(dates.contractOn);
  const started = d(dates.employmentStartOn);
  const hired = dates.result === "採用";

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
  if (hired) {
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

  // 採用のあとに作る書類（採用より前の日付にはならない）
  const afterHire: { kind: LedgerDateKind; value: string; label: string }[] = [
    { kind: "雇用条件書の作成日", value: conditions, label: "雇用条件書の作成日" },
    { kind: "雇用契約日", value: contract, label: "雇用契約日" },
  ];
  for (const f of afterHire) {
    if (!f.value) continue;
    if (applied && f.value < applied) {
      issues.push({
        kind: f.kind,
        message: `${f.label}（${f.value}）が紹介年月日（${applied}）より前です`,
      });
    } else if (hired && result && f.value < result) {
      issues.push({
        kind: f.kind,
        message: `${f.label}（${f.value}）が採用年月日（${result}）より前です`,
      });
    }
  }

  // 雇用開始日は、採用・契約より後になる
  if (started) {
    if (hired && result && started < result) {
      issues.push({
        kind: "雇用開始日",
        message: `雇用開始日（${started}）が採用年月日（${result}）より前です`,
      });
    }
    if (contract && started < contract) {
      issues.push({
        kind: "雇用開始日",
        message: `雇用開始日（${started}）が雇用契約日（${contract}）より前です`,
      });
    }
  }

  return issues;
}

export function hasLedgerDateIssue(dates: LedgerDates): boolean {
  return checkLedgerDates(dates).length > 0;
}

// その日付に訂正が必要か（画面で赤い枠を付けるかの判定）
export function issueKinds(issues: LedgerDateIssue[]): Set<LedgerDateKind> {
  return new Set(issues.map((i) => i.kind));
}
