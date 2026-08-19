import type { WorkHistoryRow, WorkerOrgEmploymentStart } from "@/types/db";

// 履歴書の職歴に、アプリで記録した「所属機関別の雇用開始日」と「退職」を自動で足す。
//
// 職歴（work_histories）に手入力していない在籍も、雇用開始日（所属機関別）を保存して
// いれば履歴書に出す。退職の記録があれば、その在籍の終了日として反映する。
// 職歴に同じ機関の行が既にあるときは足さない（手入力を優先する）。

export interface ResumeHistoryRow {
  id: string;
  visa: string;
  start: string; // YYYY-MM-DD
  end: string | null;
  org: string;
  role: string;
}

export interface ResumeResignation {
  organization_id: string | null;
  org_name: string;
  leaving_on: string | null;
}

// 機関名の突き合わせ（空白・法人格の表記ゆれを吸収する）
function orgKey(name: string): string {
  return (name ?? "")
    .replace(/[\s　]/g, "")
    .replace(/有限会社|株式会社|合同会社|（有）|（株）|\(有\)|\(株\)/g, "");
}

export function mergeResumeHistories(input: {
  histories: (Pick<WorkHistoryRow, "id" | "start_date" | "end_date" | "org_name" | "role"> & {
    visa: string; // 在留資格（work_histories の visa。テストしやすいよう文字列で受ける）
  })[];
  employmentStarts: (WorkerOrgEmploymentStart & { orgName: string })[];
  resignations: ResumeResignation[];
  residenceStatus: string; // 合成する行の在留資格（現在の在留資格を使う）
  currentOrganizationId: string | null;
  workerStatus: string; // 退職 なら現在の機関の在籍にも終了日を入れる
  workerLeavingOn: string | null;
}): ResumeHistoryRow[] {
  const rows: ResumeHistoryRow[] = input.histories.map((h) => ({
    id: h.id,
    visa: h.visa,
    start: h.start_date,
    end: h.end_date,
    org: h.org_name,
    role: h.role,
  }));

  const usedKeys = new Set(rows.map((r) => orgKey(r.org)).filter(Boolean));
  const usedStarts = new Set(rows.map((r) => r.start));

  for (const e of input.employmentStarts) {
    if (!e.start_on || !e.orgName) continue;
    const key = orgKey(e.orgName);
    // 職歴に同じ機関・同じ開始日の行が既にあれば、手入力を優先して足さない
    if (usedKeys.has(key) || usedStarts.has(e.start_on)) continue;

    // 終了日: その機関からの退職記録 → 退職者情報（現在の機関で退職済みのとき）→ 在職中
    const resigned = input.resignations
      .filter(
        (r) =>
          r.leaving_on &&
          r.leaving_on >= e.start_on &&
          (r.organization_id === e.organization_id || orgKey(r.org_name) === key),
      )
      .sort((a, b) => ((a.leaving_on as string) < (b.leaving_on as string) ? -1 : 1))[0];
    const end =
      resigned?.leaving_on ??
      (input.workerStatus === "退職" && e.organization_id === input.currentOrganizationId
        ? input.workerLeavingOn
        : null);

    rows.push({
      id: `employment-${e.organization_id}`,
      visa: input.residenceStatus || "",
      start: e.start_on,
      end,
      org: e.orgName,
      role: "",
    });
    usedKeys.add(key);
    usedStarts.add(e.start_on);
  }

  return rows.sort((a, b) => (a.start < b.start ? -1 : 1));
}
