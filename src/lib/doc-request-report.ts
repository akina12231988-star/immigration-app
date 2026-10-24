// 会社からの書類の依頼のチェック表で、選んだ人の資料を会社へ報告するときの出力。
//   - 1人分の資料（マスに添付したもの・外国人詳細に紐づいているもの）をひとつの PDF に
//     まとめたときのファイル名: No.{番号}_{氏名}_{末尾}.pdf（末尾は「令和8年度年末調整資料」など）
//   - 選んだ人の一覧（氏名・入社年月日・各書類の状況）のエクセルの行
// 画面に依存しない部分だけここに置いて、単体テストできるようにしている。

import {
  checkKey,
  checkState,
  joinedYearExcludedReason,
  type DocumentRequestCheck,
  type DocumentRequestItem,
} from "@/lib/org-document-requests";

// ファイル名に使えない文字を中黒に置き換える
function safeName(v: string): string {
  return v.replace(/[\\/:*?"<>|]/g, "・").trim();
}

// 今日の令和年（2026 → 8）
export function reiwaYearOf(today: string): number {
  const y = Number(today.slice(0, 4));
  return Number.isNaN(y) ? 0 : y - 2018;
}

// PDF のファイル名の末尾の初期値。年末調整の依頼なら「令和○年度年末調整資料」、それ以外は依頼名
export function defaultReportSuffix(requestTitle: string, today: string): string {
  const title = requestTitle.trim();
  if (/年末調整/.test(title)) return `令和${reiwaYearOf(today)}年度年末調整資料`;
  return title || "提出資料";
}

// 1人分の PDF の名前: No.1_HA SI HIEU_令和8年度年末調整資料.pdf
export function reportPdfName(no: number, workerName: string, suffix: string): string {
  return `No.${no}_${safeName(workerName)}_${safeName(suffix)}.pdf`;
}

// まとめて出すときの ZIP・エクセルの名前
export function reportBundleName(suffix: string, ext: "zip" | "xlsx"): string {
  return `${safeName(suffix)}_${ext === "xlsx" ? "添付一覧" : "添付資料"}.${ext}`;
}

export interface ReportWorker {
  id: string;
  name: string;
  kana: string;
  nationality: string;
  startOn: string | null; // この機関での雇用開始日（入社年月日）
}

// エクセルに書く、1マスの状況の言い方
export function reportStatusLabel(
  item: Pick<DocumentRequestItem, "joined_year">,
  startOn: string | null,
  c: DocumentRequestCheck | undefined,
): string {
  const yearReason = joinedYearExcludedReason(item, startOn);
  if (yearReason) return `対象外（${yearReason}）`;
  const note = c?.note?.trim() ? `（${c.note.trim()}）` : "";
  switch (checkState(c)) {
    case "対象外":
      return `対象外${note}`;
    case "送付済":
      return `会社へ送付済 ${c?.sent_on ?? ""}`.trim();
    case "発行済":
      return `発行済 ${c?.issued_on ?? ""}`.trim();
    case "無し回答":
      return `本人から無いと回答 ${c?.none_replied_on ?? ""}`.trim();
    case "案内済":
      return `案内済（未発行） ${c?.informed_on ?? ""}`.trim();
    default:
      return "未着手";
  }
}

// エクセルの行（1行目は見出し）。No. は選んだ順（PDF の No. と同じ）
export function reportSheetRows(
  items: DocumentRequestItem[],
  workers: ReportWorker[],
  idx: Map<string, DocumentRequestCheck>,
  meta: { organizationName: string; requestTitle: string; dueOn: string | null; today: string },
): (string | number | null)[][] {
  const header = ["No.", "氏名", "フリガナ", "国籍", "入社年月日", ...items.map((i) => i.name), "PDF のファイル名"];
  const rows = workers.map((w, i) => [
    i + 1,
    w.name,
    w.kana,
    w.nationality,
    w.startOn ?? "",
    ...items.map((item) => reportStatusLabel(item, w.startOn, idx.get(checkKey(w.id, item.id)))),
    reportPdfName(i + 1, w.name, meta.requestTitle),
  ]);
  return [
    [`${meta.organizationName} ${meta.requestTitle}`, null, null, null, `出力日 ${meta.today}`, meta.dueOn ? `提出期限 ${meta.dueOn}` : null],
    [],
    header,
    ...rows,
  ];
}
