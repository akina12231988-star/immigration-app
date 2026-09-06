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

// その所属機関の「ひと続きの在籍」（在籍期間の始まり・終わり）。
// 同じ会社の職歴は、更新のたびに行が分かれていることがある（期間が重なる・つながる）。
// つながっている行はひとまとめにして、いちばん古い開始日と、最後の退職日を返す。
// いったん辞めてから入り直した（期間が離れている）場合は、新しいほうの在籍を使う
export function mergedOrgPeriod(
  histories: OrgHistoryRow[],
  orgName: string,
): { start: string; end: string | null } | null {
  const key = normalizeOrgSearchText(orgName);
  if (!key) return null;
  const rows = histories
    .filter((h) => h.visa !== "本国での職歴" && normalizeOrgSearchText(h.org_name) === key)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (rows.length === 0) return null;

  let current = { start: rows[0].start_date, end: rows[0].end_date };
  for (const row of rows.slice(1)) {
    // 前の在籍が続いている、または期間が重なる・つながるなら同じ在籍とみなす
    const continues = current.end === null || row.start_date <= current.end;
    if (continues) {
      current = {
        start: current.start,
        end: current.end === null || row.end_date === null ? null : maxDate(current.end, row.end_date),
      };
    } else {
      current = { start: row.start_date, end: row.end_date };
    }
  }
  return current;
}

function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

// 表示している所属機関の雇用開始日・退職日を返す。
//  ・雇用開始日: 所属機関別の雇用開始日 → その機関の職歴の開始日 → 雇用開始年月日
//  ・退職日: その機関の職歴の退職日 → 退職者情報の退職日（退職した所属機関がこの機関のとき）。
//    まだ在籍中（継続中）なら空欄。どこにも所属していない人は workers の退職日を出す
export function orgEmploymentDates(params: {
  orgName: string;
  histories: OrgHistoryRow[];
  orgStartOn: string | null; // その機関の雇用開始日（org_employment_starts）
  employmentStartOn: string | null; // workers.employment_start_on
  leavingOn: string | null; // workers.leaving_on
  leavingOrgName?: string; // workers.leaving_org_name（退職者情報の退職した所属機関）
  isCurrentOrg?: boolean; // 表示している機関が、その人の今の所属機関か
  workerLeft?: boolean; // 状態が退職・帰国（今の所属機関を辞めた人）
  hasCurrentOrg: boolean; // 今どこかに所属しているか
}): OrgDates {
  const period = mergedOrgPeriod(params.histories, params.orgName);
  // 退職者情報の退職日が、この機関を辞めたときのものか
  const leftThisOrg =
    !!params.leavingOn &&
    !!params.leavingOrgName &&
    !!params.orgName &&
    normalizeOrgSearchText(params.leavingOrgName) === normalizeOrgSearchText(params.orgName);
  // 退職した所属機関が入っていない古い記録でも、その人が退職・帰国していて
  // 表示しているのが今の所属機関なら、退職者情報の退職日はその機関のもの
  const leftCurrentOrg = !!params.leavingOn && !!params.isCurrentOrg && !!params.workerLeft;
  return {
    employmentStartOn: params.orgStartOn || period?.start || params.employmentStartOn || null,
    leavingOn:
      period?.end ||
      (leftThisOrg || leftCurrentOrg ? params.leavingOn : null) ||
      (params.hasCurrentOrg ? null : params.leavingOn),
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
    // 同じ会社で行が分かれている職歴はまとめて、ひと続きの在籍の開始日と比べる
    const period = mergedOrgPeriod(params.histories, s.orgName);
    if (!period?.start) continue;
    if (period.start !== s.startOn) {
      out.push({ orgName: s.orgName, historyStart: period.start, orgStart: s.startOn });
    }
  }
  return out;
}

// ---- 退職者情報を入れたときに、職歴の退職日にも反映する ----

// 退職日を入れる職歴（在籍していた会社の職歴）。見つからなければ null。
//  ・退職した所属機関が入っていれば、その会社の職歴（いちばん新しく始まったもの）
//  ・空欄なら、まだ続いている職歴（継続中）のうちいちばん新しく始まったもの
//  ・すでに同じ退職日が入っている職歴は返さない（保存の必要が無い）
//  ・雇用開始日より前の退職日は入れない（入力ミスを広げないため）
export function historyToCloseOnLeaving<T extends OrgHistoryRow & { id: string; end_date: string | null }>(
  histories: T[],
  leaving: { orgName: string; leavingOn: string },
): T | null {
  if (!leaving.leavingOn) return null;
  const rows = histories.filter((h) => h.visa !== "本国での職歴");
  const key = normalizeOrgSearchText(leaving.orgName);
  const candidates = key
    ? rows.filter((h) => normalizeOrgSearchText(h.org_name) === key)
    : rows.filter((h) => h.end_date === null);
  const hit = [...candidates].sort((a, b) => a.start_date.localeCompare(b.start_date)).pop();
  if (!hit) return null;
  if (hit.end_date === leaving.leavingOn) return null;
  if (hit.start_date && leaving.leavingOn < hit.start_date) return null;
  return hit;
}
