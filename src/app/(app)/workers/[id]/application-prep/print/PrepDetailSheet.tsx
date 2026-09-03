"use client";

import { useState } from "react";
import Link from "next/link";
import { Printer, RotateCcw } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { prepDetailHref } from "@/lib/application-prep";
import {
  PREP_PRINT_DOC_STATES,
  prepPrintFileName,
  type PrepPrintDocRow,
  type PrepPrintDocState,
  type PrepPrintLine,
} from "@/lib/application-prep-print";
import { rosterJpDate } from "@/lib/roster";

// 申請書類の準備状況の詳細をA4縦1枚で印刷する。
//  ・上: 申請番号と申請種別
//  ・左: 所属機関の情報 / 外国人の情報
//  ・右: 準備チェックリスト / 採用時の賃金情報 / 日付計算結果
// 印刷する前に上の「印刷前の確認・訂正」で内容を確かめ、違うところはその場で直せる
// （直した内容はこの印刷にだけ使う。元のデータを直すときは詳細画面から入力する）。
// 登録が無いところは何も書かずに空けておき、紙の上で書き足せるようにする。
export function PrepDetailSheet({
  workerId,
  workerName,
  todoNo,
  appType,
  tantou,
  printedOn,
  orgLines,
  workerLines,
  docRows,
  wageLines,
  dateLines,
  hasList,
}: {
  workerId: string;
  workerName: string;
  todoNo: string;
  appType: string;
  tantou: string;
  printedOn: string;
  orgLines: PrepPrintLine[];
  workerLines: PrepPrintLine[];
  docRows: PrepPrintDocRow[];
  wageLines: PrepPrintLine[];
  dateLines: PrepPrintLine[];
  hasList: boolean;
}) {
  const [head, setHead] = useState({ todoNo, appType, tantou });
  const [org, setOrg] = useState(orgLines);
  const [person, setPerson] = useState(workerLines);
  const [docs, setDocs] = useState(docRows);
  const [wages, setWages] = useState(wageLines);
  const [dates, setDates] = useState(dateLines);

  const editLine =
    (setter: React.Dispatch<React.SetStateAction<PrepPrintLine[]>>) =>
    (key: string, value: string) =>
      setter((prev) => prev.map((l) => (l.key === key ? { ...l, value } : l)));

  const reset = () => {
    setHead({ todoNo, appType, tantou });
    setOrg(orgLines);
    setPerson(workerLines);
    setDocs(docRows);
    setWages(wageLines);
    setDates(dateLines);
  };

  // 印刷（PDF保存）のとき、保存されるファイル名を「申請番号_氏名_申請準備の詳細」にする
  const printSheet = () => {
    const original = document.title;
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    document.title = prepPrintFileName(head.todoNo, workerName);
    window.addEventListener("afterprint", restore);
    window.print();
  };

  const printedDocs = docs.filter((d) => d.state !== "対象外");

  return (
    <>
      <style>{"@media print{@page{size:A4 portrait;margin:12mm}}"}</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref={prepDetailHref(workerId)} />
          <h1 className="flex-1 text-lg font-bold">申請書類の準備状況の詳細（A4縦で印刷）</h1>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3 lg:px-8">
          {!hasList && (
            <p className="rounded-xl bg-seal/10 px-3 py-2 text-xs font-bold text-seal">
              この外国人の準備リスト（申請TODO番号）がまだありません。
              <Link href={prepDetailHref(workerId)} className="ml-1 underline">
                申請準備の詳細
              </Link>
              でリストを追加してから印刷してください。
            </p>
          )}
          <p className="text-xs leading-relaxed text-muted">
            下の内容がA4縦1枚で印刷されます。違うところは「印刷前の確認・訂正」で直してから印刷してください。
            ここで直した内容はこの印刷にだけ使います（元のデータは変わりません）。データそのものを直すときは
            <Link href={prepDetailHref(workerId)} className="mx-1 font-bold text-brand hover:underline">
              申請準備の詳細
            </Link>
            から入力してください。
          </p>

          {/* 印刷前の確認・訂正 */}
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="mb-2 text-xs font-bold text-muted">印刷前の確認・訂正</p>
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
              <div className="space-y-1.5">
                <EditGroup title="いちばん上（申請番号・申請種別）">
                  <EditRow
                    label="申請番号"
                    value={head.todoNo}
                    onChange={(v) => setHead((h) => ({ ...h, todoNo: v }))}
                  />
                  <EditRow
                    label="申請種別"
                    value={head.appType}
                    onChange={(v) => setHead((h) => ({ ...h, appType: v }))}
                  />
                  <EditRow
                    label="担当者"
                    value={head.tantou}
                    onChange={(v) => setHead((h) => ({ ...h, tantou: v }))}
                  />
                </EditGroup>
                <EditGroup title="所属機関の情報">
                  {org.map((l) => (
                    <EditRow
                      key={l.key}
                      label={l.label}
                      value={l.value}
                      onChange={(v) => editLine(setOrg)(l.key, v)}
                    />
                  ))}
                </EditGroup>
                <EditGroup title="外国人の情報">
                  {person.map((l) => (
                    <EditRow
                      key={l.key}
                      label={l.label}
                      value={l.value}
                      onChange={(v) => editLine(setPerson)(l.key, v)}
                    />
                  ))}
                </EditGroup>
              </div>
              <div className="space-y-1.5">
                <EditGroup title="準備チェックリスト（右側のメモは紙に印刷されます）">
                  {docs.length === 0 ? (
                    <p className="text-[11px] text-muted">
                      申請種別を選ぶと必要書類が決まります（詳細画面で選んでください）。
                    </p>
                  ) : (
                    docs.map((d) => (
                      <div key={d.id} className="flex flex-wrap items-center gap-1.5">
                        <span className="min-w-[10rem] flex-1 text-[11px]">{d.label}</span>
                        <select
                          value={d.state}
                          aria-label={`${d.label}の状態`}
                          onChange={(e) =>
                            setDocs((prev) =>
                              prev.map((x) =>
                                x.id === d.id
                                  ? { ...x, state: e.target.value as PrepPrintDocState }
                                  : x,
                              ),
                            )
                          }
                          className="min-h-[32px] rounded-lg border border-border bg-background px-2 text-xs"
                        >
                          {PREP_PRINT_DOC_STATES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <input
                          value={d.memo}
                          aria-label={`${d.label}のメモ`}
                          placeholder="メモ"
                          onChange={(e) =>
                            setDocs((prev) =>
                              prev.map((x) => (x.id === d.id ? { ...x, memo: e.target.value } : x)),
                            )
                          }
                          className="min-h-[32px] w-40 rounded-lg border border-border bg-background px-2 text-xs"
                        />
                      </div>
                    ))
                  )}
                </EditGroup>
                <EditGroup title="採用時の賃金情報">
                  {wages.length === 0 ? (
                    <p className="text-[11px] text-muted">賃金の記録がありません。</p>
                  ) : (
                    wages.map((l) => (
                      <EditRow
                        key={l.key}
                        label={l.label}
                        value={l.value}
                        onChange={(v) => editLine(setWages)(l.key, v)}
                      />
                    ))
                  )}
                </EditGroup>
                <EditGroup title="日付計算結果">
                  {dates.map((l) => (
                    <EditRow
                      key={l.key}
                      label={l.label}
                      value={l.value}
                      onChange={(v) => editLine(setDates)(l.key, v)}
                    />
                  ))}
                </EditGroup>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={printSheet}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground"
            >
              <Printer size={18} />
              印刷・PDF保存（A4縦）
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold text-muted"
            >
              <RotateCcw size={16} />
              訂正を元に戻す
            </button>
          </div>
        </div>
      </div>

      {/* ここから下が印刷される部分（A4縦1枚） */}
      <div className="mx-auto max-w-[190mm] px-4 pb-10 lg:px-0">
        <section className="text-[9pt] leading-snug text-black">
          {/* 一番上: 申請番号と申請種別 */}
          <div className="mb-2 border-2 border-black px-3 py-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="min-h-[1.2em] text-[15pt] font-bold tabular-nums">{head.todoNo}</p>
              <p className="text-[12pt] font-bold">{head.appType}</p>
            </div>
            <div className="mt-1 flex flex-wrap justify-between gap-2 text-[8.5pt]">
              <span>
                外国人: <span className="font-bold">{workerName}</span>
              </span>
              {/* 未登録のところは何も書かずに空けておく */}
              {head.tantou && <span>担当者: {head.tantou}</span>}
              <span>印刷日: {rosterJpDate(printedOn)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* 左: 所属機関の情報・外国人の情報 */}
            <div className="space-y-2">
              <SheetBlock title="所属機関の情報">
                <LineTable lines={org} />
              </SheetBlock>
              <SheetBlock title="外国人の情報">
                <LineTable lines={person} />
              </SheetBlock>
            </div>

            {/* 右: 準備チェックリスト・採用時の賃金情報・日付計算結果 */}
            <div className="space-y-2">
              <SheetBlock title="準備チェックリスト">
                {printedDocs.length > 0 && (
                  <table className="w-full border-collapse">
                    <tbody>
                      {printedDocs.map((d) => (
                        <tr key={d.id}>
                          <td className="w-[1.4em] border border-black px-1 py-0.5 text-center align-top">
                            {d.state === "完了" ? "☑" : "☐"}
                          </td>
                          <td className="border border-black px-1.5 py-0.5 align-top">{d.label}</td>
                          {/* 右側はメモ欄。空のときは手書きできるように空けておく */}
                          <td className="w-[32%] border border-black px-1.5 py-0.5 align-top">
                            {d.memo}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </SheetBlock>
              <SheetBlock title="採用時の賃金情報">
                <LineTable lines={wages} />
              </SheetBlock>
              <SheetBlock title="日付計算結果（支援計画書の日付）">
                <LineTable lines={dates} />
              </SheetBlock>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

// 印刷する枠（見出し付き）
function SheetBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="break-inside-avoid border border-black">
      <p className="border-b border-black bg-black/5 px-1.5 py-0.5 text-[9.5pt] font-bold">
        {title}
      </p>
      {/* 中身が無いときも枠を少し空けて、紙の上で書き足せるようにする */}
      <div className="min-h-[3em] p-1">{children}</div>
    </div>
  );
}

// 「ラベル: 値」の表。値が無いところは何も書かずに空けておき、紙に書き足せるようにする
function LineTable({ lines }: { lines: PrepPrintLine[] }) {
  if (lines.length === 0) return null;
  return (
    <table className="w-full border-collapse">
      <tbody>
        {lines.map((l) => (
          <tr key={l.key}>
            <th className="w-[38%] border border-black px-1.5 py-0.5 text-left align-top font-normal">
              {l.label}
            </th>
            <td className="border border-black px-1.5 py-0.5 align-top font-bold">{l.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 訂正パネルのまとまり
function EditGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background p-2">
      <p className="mb-1 text-[11px] font-bold text-muted">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// 訂正パネルの1行（ラベルと入力欄）
function EditRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="min-w-[9rem] flex-1 text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[32px] w-full flex-1 rounded-lg border border-border bg-background px-2 text-xs sm:w-auto sm:min-w-[12rem]"
      />
    </label>
  );
}
