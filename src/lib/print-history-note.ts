import { orgAtDate, type VisaHistoryEmployment, type VisaHistoryRow } from "@/lib/visa-history";
import { normalizeOrgSearchText } from "@/lib/org-search";
import { rosterJpDate } from "@/lib/roster";

// 個人票（A4印刷）の「在留資格の履歴」で、許可が表から抜けているときに画面に出す注意。
//
// 表には「その所属機関にいた間の許可」だけを出す。在籍の始まりは
//   所属機関別の雇用開始日 → 職歴（在籍期間）の入社日 → 外国人の雇用開始日
// の順に決めるので、職歴が入っていない・入社日がずれていると、本当はその会社にいた間の
// 許可が表から抜ける。どこを直せば表に出るかを、画面（印刷には出ない）で知らせる。

export type PrintHistoryStartSource = "org" | "history" | "worker" | "";

export const START_SOURCE_LABELS: Record<PrintHistoryStartSource, string> = {
  org: "所属機関別の雇用開始日",
  history: "職歴（在籍期間）の入社日",
  worker: "外国人の雇用開始日",
  "": "",
};

export interface PrintHistoryNote {
  title: string;
  lines: string[]; // 直してほしい場所の案内
}

// 在籍の始まりがどこから決まったか
export function printHistoryStartSource(input: {
  orgStart: string; // 所属機関別の雇用開始日
  historyStart: string; // 職歴（ひと続きの在籍）の入社日
  workerStart: string; // 外国人の雇用開始日
}): { start: string; source: PrintHistoryStartSource } {
  const candidates: { start: string; source: PrintHistoryStartSource }[] = [
    { start: input.orgStart, source: "org" as const },
    { start: input.historyStart, source: "history" as const },
  ].filter((c) => c.start);
  // 所属機関別の雇用開始日と職歴の入社日は、早いほうを使う
  candidates.sort((a, b) => a.start.localeCompare(b.start));
  if (candidates[0]) return candidates[0];
  if (input.workerStart) return { start: input.workerStart, source: "worker" };
  return { start: "", source: "" };
}

const rowText = (r: VisaHistoryRow) => `${rosterJpDate(r.permitDate)} ${r.label}`;

// 注意が要るときだけ返す（要らなければ null）
export function printHistoryNote(input: {
  orgName: string; // 今の所属機関
  allRows: VisaHistoryRow[]; // 在留資格の履歴（全部）
  shownRows: VisaHistoryRow[]; // 表に出す分
  histories: VisaHistoryEmployment[]; // 職歴
  start: string; // 在籍の始まりに使った日
  source: PrintHistoryStartSource;
}): PrintHistoryNote | null {
  const org = input.orgName || "今の所属機関";
  const shown = new Set(input.shownRows.map((r) => `${r.permitDate}_${r.status}`));
  const hidden = input.allRows.filter((r) => !shown.has(`${r.permitDate}_${r.status}`));
  const orgKey = normalizeOrgSearchText(input.orgName);
  // この会社の職歴があるか
  const hasOrgHistory =
    !!orgKey &&
    input.histories.some((h) => h.visa !== "本国での職歴" && normalizeOrgSearchText(h.org_name) === orgKey);
  // 表から抜けている許可のうち、どの会社の在籍期間にも入っていないもの（職歴の入社日がずれているか、職歴が無い）
  const orphan = hidden.filter((r) => !orgAtDate(input.histories, r.permitDate));

  if (!input.start) {
    if (input.allRows.length === 0) return null;
    return {
      title: `${org}の在籍期間が分からないため、在留資格の履歴を全部出しています`,
      lines: [
        `外国人詳細 ＞ 職歴 で ${org} の在籍期間（入社日）を登録すると、その会社にいた間の許可だけが表に出ます。`,
      ],
    };
  }

  if (orphan.length === 0) {
    // 抜けている許可は、別の会社（または入り直す前）の在籍期間のもの。表は正しい
    if (hasOrgHistory || hidden.length === 0) return null;
    return {
      title: `${org}の職歴（在籍期間）が登録されていません`,
      lines: [
        `今は${START_SOURCE_LABELS[input.source]}（${rosterJpDate(input.start)}）を在籍の始まりとして表を作っています。`,
        `外国人詳細 ＞ 職歴 で ${org} の在籍期間（入社日）を登録してください。`,
      ],
    };
  }

  const lines = [
    `在籍の始まりを${START_SOURCE_LABELS[input.source]}（${rosterJpDate(input.start)}）としているため、それより前の許可が表に出ていません: ${orphan.map(rowText).join("、")}`,
  ];
  if (!hasOrgHistory) {
    lines.push(`外国人詳細 ＞ 職歴 で ${org} の在籍期間（入社日）を登録してください。入社日がその許可の日以前なら表に出ます。`);
  } else {
    lines.push(`外国人詳細 ＞ 職歴 の ${org} の入社日を確認してください（入社日をその許可の日以前にすると表に出ます）。`);
  }
  if (input.source === "org") {
    lines.push("外国人詳細 ＞ 所属機関別の雇用開始日 も、職歴の入社日より遅い日になっていないか確認してください。");
  }
  return {
    title: `${org}にいた間の許可が表から抜けています（${orphan.length}件）`,
    lines,
  };
}
