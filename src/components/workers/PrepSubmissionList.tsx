"use client";

import { Fragment, useState } from "react";
import { ChevronDown, Printer } from "lucide-react";
import {
  SUBMISSION_TABLE_TITLES,
  submissionListPrintHtml,
  type SubmissionRow,
  type SubmissionTable,
  type SubmitMark,
} from "@/lib/submission-list";

// 申請準備の詳細の「提出書類一覧表」。入管の一覧表と同じ番号・順番で書類を並べ、
// 提出確認欄の「有」「無」を押して選ぶ（押していない行は、申請準備の情報から見当を付けて出す）。
// ○を付けた一覧表を A4 で印刷できる。
export function PrepSubmissionList({
  rows,
  canEdit,
  workerName,
  orgName,
  onMark,
  onError,
}: {
  rows: SubmissionRow[];
  canEdit: boolean;
  workerName: string;
  orgName: string;
  // 有／無を選ぶ（null は選択を外して見当に戻す）
  onMark: (key: string, mark: SubmitMark | null) => void;
  onError: (message: string) => void;
}) {
  const [openNotes, setOpenNotes] = useState(false);
  const undecided = rows.filter((r) => r.mark == null);
  const autoCount = rows.filter((r) => r.auto && r.mark != null).length;
  const yesCount = rows.filter((r) => r.mark === "有").length;

  const print = () => {
    if (
      undecided.length > 0 &&
      !window.confirm(
        `有・無を選んでいない書類があります（${undecided.map((r) => `${r.no}${r.sub ?? ""}`).join("・")}）。○を付けずに印刷しますか？`,
      )
    ) {
      return;
    }
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      onError("印刷用の画面を開けませんでした。ブラウザのポップアップの許可をご確認ください。");
      return;
    }
    w.document.write(submissionListPrintHtml({ workerName, orgName, rows }));
    w.document.close();
    w.focus();
    w.print();
  };

  const tables = (["1", "3agri"] as SubmissionTable[]).filter((t) => rows.some((r) => r.table === t));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
          入管の「特定技能1号」に係る提出書類一覧表（在留資格変更許可申請用）と同じ番号・順番です。書類ごとに提出確認欄の「有」「無」を押してください。
          国保・年金・国籍・あっせん・合格証などから見当が付くものは、最初から選んであります（
          <span className="rounded bg-background px-1 font-bold">見当</span>
          の印）。押すと確定します。同一年度内に受け入れているかで変わる 4・7(1) などは選んでください。
        </p>
        <button
          type="button"
          onClick={print}
          className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground"
        >
          <Printer size={14} />
          ○を付けた一覧表を印刷（A4）
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full bg-brand/10 px-2.5 py-1 font-bold text-brand">有 {yesCount}件</span>
        {autoCount > 0 && (
          <span className="rounded-full bg-background px-2.5 py-1 font-bold text-muted">見当のまま {autoCount}件</span>
        )}
        {undecided.length > 0 ? (
          <a href="#prep-list-undecided" className="rounded-full bg-seal px-2.5 py-1 font-bold text-seal-foreground">
            未選択 {undecided.length}件（{undecided.map((r) => `${r.no}${r.sub ?? ""}`).join("・")}）
          </a>
        ) : (
          <span className="rounded-full bg-background px-2.5 py-1 font-bold text-muted">全部選びました</span>
        )}
        <button
          type="button"
          onClick={() => setOpenNotes((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 font-bold text-brand"
        >
          <ChevronDown size={12} className={openNotes ? "rotate-180" : ""} />
          留意事項を{openNotes ? "隠す" : "出す"}
        </button>
      </div>

      {tables.map((t) => {
        const list = rows.filter((r) => r.table === t);
        let lastGroup = "";
        return (
          <div key={t} className="overflow-x-auto rounded-xl border border-border">
            <p className="bg-background px-3 py-2 text-xs font-black">{SUBMISSION_TABLE_TITLES[t]}</p>
            <table className="w-full min-w-[36rem] border-collapse text-xs">
              <thead>
                <tr className="bg-background text-[11px] text-muted">
                  <th className="w-10 border-t border-border px-2 py-1.5">番号</th>
                  <th className="border-t border-border px-2 py-1.5 text-left">必要書類</th>
                  <th className="w-28 border-t border-border px-2 py-1.5">様式・発行機関</th>
                  <th className="w-10 border-t border-border px-2 py-1.5">要否</th>
                  <th className="w-36 border-t border-border px-2 py-1.5">提出確認欄</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => {
                  const showGroup = r.group && r.group !== lastGroup;
                  lastGroup = r.group ?? "";
                  const firstUndecided = r.mark == null && undecided[0]?.key === r.key;
                  return (
                    <Fragment key={r.key}>
                      {showGroup && (
                        <tr>
                          <td className="border-t border-border bg-background px-2 py-1 text-[11px] font-bold text-seal" colSpan={5}>
                            {r.no}. {r.group}
                          </td>
                        </tr>
                      )}
                      <tr
                        id={firstUndecided ? "prep-list-undecided" : undefined}
                        className={r.mark == null ? "bg-seal/5" : r.mark === "無" ? "text-muted" : ""}
                      >
                        <td className="border-t border-border px-2 py-1.5 text-center font-bold tabular-nums">
                          {i > 0 && list[i - 1].no === r.no ? "" : r.no}
                        </td>
                        <td className="border-t border-border px-2 py-1.5">
                          {r.sub && <span className="mr-1 font-bold">{r.sub}</span>}
                          {r.label}
                          {openNotes && r.note && <p className="mt-0.5 text-[10px] leading-snug text-muted">※{r.note}</p>}
                        </td>
                        <td className="border-t border-border px-2 py-1.5 text-center text-[10px] text-muted">{r.formNo}</td>
                        <td className="border-t border-border px-2 py-1.5 text-center">{r.required}</td>
                        <td className="border-t border-border px-2 py-1.5">
                          <div className="flex items-center justify-center gap-1">
                            {(["有", "無"] as const).map((m) => (
                              <button
                                key={m}
                                type="button"
                                disabled={!canEdit}
                                onClick={() => onMark(r.key, r.mark === m && !r.auto ? null : m)}
                                title={r.mark === m && !r.auto ? "もう一度押すと選択を外します" : `「${m}」にする`}
                                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-black disabled:opacity-60 ${
                                  r.mark === m
                                    ? r.auto
                                      ? "border-dashed border-brand/60 text-brand"
                                      : m === "有"
                                        ? "border-brand bg-brand text-brand-foreground"
                                        : "border-muted bg-muted/20 text-foreground"
                                    : "border-border text-muted"
                                }`}
                              >
                                {m}
                              </button>
                            ))}
                            {r.auto && r.mark != null && (
                              <span className="rounded bg-background px-1 text-[10px] font-bold text-muted">見当</span>
                            )}
                            {r.mark == null && <span className="text-[10px] font-bold text-seal">未選択</span>}
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
