// 個人票に出す「雇用開始日・退職日」を、表示している所属機関のものにそろえる。
//
// workers.employment_start_on / leaving_on は「その人の最新の1件」なので、
// 転職すると前の会社の退職日が残ったままになる（今の会社で働いているのに退職日が出る）。
// 職歴（work_histories）と所属機関別の雇用開始日（org_employment_starts）を見て、
// 表示している所属機関の在籍期間の日付だけを出す。

import { normalizeOrgSearchText } from "@/lib/org-search";

export interface OrgHistoryRow {
  org_name: string;
  start_date: string;
  end_date: string | null; // null = 継続中
  visa: string;
}

export interface OrgDates {
  employmentStartOn: string | null;
  leavingOn: string | null;
}

// その所属機関の職歴（同じ名前の在籍のうち、いちばん新しく始まったもの）
function historyOf(histories: OrgHistoryRow[], orgName: string): OrgHistoryRow | null {
  const key = normalizeOrgSearchText(orgName);
  if (!key) return null;
  const rows = histories
    .filter((h) => h.visa !== "本国での職歴" && normalizeOrgSearchText(h.org_name) === key)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  return rows[rows.length - 1] ?? null;
}

// 表示している所属機関の雇用開始日・退職日を返す。
//  ・雇用開始日: 所属機関別の雇用開始日 → その機関の職歴の開始日 → 雇用開始年月日
//  ・退職日: その機関の職歴の退職日。まだ在籍中（継続中）なら空欄。
//    職歴が無いときは、今の所属機関がある人は空欄（前の会社の退職日を出さない）、
//    どこにも所属していない人だけ workers の退職日を出す
export function orgEmploymentDates(params: {
  orgName: string;
  histories: OrgHistoryRow[];
  orgStartOn: string | null; // その機関の雇用開始日（org_employment_starts）
  employmentStartOn: string | null; // workers.employment_start_on
  leavingOn: string | null; // workers.leaving_on
  hasCurrentOrg: boolean; // 今どこかに所属しているか
}): OrgDates {
  const hit = historyOf(params.histories, params.orgName);
  return {
    employmentStartOn: params.orgStartOn || hit?.start_date || params.employmentStartOn || null,
    leavingOn: hit ? hit.end_date : params.hasCurrentOrg ? null : params.leavingOn,
  };
}

// ---- 職歴の開始日と、所属機関別の雇用開始日の食い違い ----

// 同じ会社なのに日付が違う（＝どちらかが入力ミス）ときに知らせるための組み合わせ
export interface StartDateMismatch {
  orgName: string;
  historyStart: string; // 職歴の開始日
  orgStart: string; // 所属機関別の雇用開始日
}

// 所属機関別の雇用開始日と職歴の開始日を突き合わせ、違っているものを返す。
// どちらかが空のときは食い違いとしない（まだ入れていないだけのため）
export function startDateMismatches(params: {
  // 所属機関別の雇用開始日（機関名と日付にほどいたもの）
  orgStarts: { orgName: string; startOn: string }[];
  histories: OrgHistoryRow[];
}): StartDateMismatch[] {
  const out: StartDateMismatch[] = [];
  for (const s of params.orgStarts) {
    if (!s.orgName || !s.startOn) continue;
    const hit = historyOf(params.histories, s.orgName);
    if (!hit?.start_date) continue;
    if (hit.start_date !== s.startOn) {
      out.push({ orgName: s.orgName, historyStart: hit.start_date, orgStart: s.startOn });
    }
  }
  return out;
}
