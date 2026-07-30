"use client";

import { useState } from "react";
import { BackButton } from "@/components/BackButton";
import { Printer } from "lucide-react";
import {
  dependentCategories,
  isSpouseRelation,
  warekiDate,
} from "@/lib/dependents";
import { todayStr } from "@/lib/ssw/calc";
import type { WorkerDependent } from "@/types/db";

interface FormWorker {
  name: string;
  kana: string;
  birth: string | null;
  address: string;
  myNumber: string;
  hasSpouse: string;
}

// 給与所得者の扶養控除等（異動）申告書（同等様式・A4横）。
// 公式の入力用PDFと同じ記載項目を、外国人詳細の扶養家族データから自動で埋めて印刷する
export function DependentsFormSheet({
  org,
  worker,
  dependents,
}: {
  org: { name: string; corporate_no: string; address: string };
  worker: FormWorker;
  dependents: WorkerDependent[];
}) {
  const today = todayStr();
  // 年分（令和）。既定は今年（例: 2026年 → 令和8年分）。年末調整で配る年に合わせて変更できる
  const [reiwaYear, setReiwaYear] = useState(() => new Date().getFullYear() - 2018);
  const [householdHead, setHouseholdHead] = useState(worker.name);
  const [headRelation, setHeadRelation] = useState("本人");

  const spouse = dependents.find((d) => isSpouseRelation(d.relation));
  const over16 = dependents.filter(
    (d) => !isSpouseRelation(d.relation) && !dependentCategories(d, today).under16,
  );
  const under16 = dependents.filter((d) => dependentCategories(d, today).under16);
  const hasSpouse = !!spouse || worker.hasSpouse === "有";

  const TOOL_INPUT =
    "min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

  return (
    <>
      {/* 画面用ツールバー（印刷時は非表示） */}
      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref="/workers" />
          <h1 className="flex-1 text-lg font-bold">扶養控除等（異動）申告書</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3 px-4 py-4 lg:px-8">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">年分（令和）</span>
            <input
              type="number"
              min={1}
              value={reiwaYear}
              onChange={(e) => setReiwaYear(Number(e.target.value))}
              className={`${TOOL_INPUT} w-24`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">世帯主の氏名</span>
            <input
              value={householdHead}
              onChange={(e) => setHouseholdHead(e.target.value)}
              className={TOOL_INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">あなたとの続柄</span>
            <input
              value={headRelation}
              onChange={(e) => setHeadRelation(e.target.value)}
              className={`${TOOL_INPUT} w-28`}
            />
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-foreground"
          >
            <Printer size={18} />
            印刷・PDF保存
          </button>
        </div>
        <p className="px-4 pb-3 text-[11px] leading-relaxed text-muted lg:px-8">
          外国人詳細の「扶養家族」の内容から自動で作成します（公式様式と同じ記載項目の同等様式・A4横）。
          扶養家族の追加・修正は外国人詳細で行ってください。老人扶養親族・特定扶養親族・非居住者の区分は現時点の年齢から自動判定しています。
        </p>
      </div>

      <div className="print-root">
        <div className="fuyo-sheet mx-auto mb-6 max-w-[297mm] border border-border bg-white p-[8mm] text-black print:mb-0 print:border-0">
          <h2 className="mb-2 text-center text-base font-black">
            令和{reiwaYear}年分　給与所得者の扶養控除等（異動）申告書
          </h2>

          {/* 上部: 給与の支払者・本人情報 */}
          <table className="mb-2 w-full border-collapse text-[10px]">
            <tbody>
              <tr>
                <Hd className="w-[30mm]">給与の支払者の名称（氏名）</Hd>
                <Bd className="w-[60mm]">{org.name || "　"}</Bd>
                <Hd className="w-[24mm]">（フリガナ）あなたの氏名</Hd>
                <Bd>
                  <span className="block text-[8px] text-gray-500">{worker.kana || "　"}</span>
                  <span className="font-bold">{worker.name}</span>
                </Bd>
                <Hd className="w-[22mm]">あなたの生年月日</Hd>
                <Bd className="w-[34mm]">{warekiDate(worker.birth) || "　"}</Bd>
              </tr>
              <tr>
                <Hd>給与の支払者の法人（個人）番号</Hd>
                <Bd className="tabular-nums">{org.corporate_no || "　"}</Bd>
                <Hd>あなたの個人番号</Hd>
                <Bd className="tabular-nums">{worker.myNumber || "　"}</Bd>
                <Hd>世帯主の氏名</Hd>
                <Bd>{householdHead || "　"}</Bd>
              </tr>
              <tr>
                <Hd>給与の支払者の所在地（住所）</Hd>
                <Bd>{org.address || "　"}</Bd>
                <Hd>あなたの住所又は居所</Hd>
                <Bd>{worker.address || "　"}</Bd>
                <Hd>あなたとの続柄／配偶者の有無</Hd>
                <Bd>
                  {headRelation || "　"}／{hasSpouse ? "有" : "無"}
                </Bd>
              </tr>
            </tbody>
          </table>

          {/* A欄: 源泉控除対象配偶者 */}
          <SectionLabel>A　源泉控除対象配偶者</SectionLabel>
          <DependentTable
            rows={spouse ? [spouse] : []}
            today={today}
            reiwaYear={reiwaYear}
            emptyRows={1}
            spouseTable
          />

          {/* B欄: 控除対象扶養親族（16歳以上） */}
          <SectionLabel>B　控除対象扶養親族（16歳以上）</SectionLabel>
          <DependentTable rows={over16} today={today} reiwaYear={reiwaYear} emptyRows={Math.max(0, 2 - over16.length)} />

          {/* C・D欄は該当がある場合のみ手書きで補記する */}
          <p className="mb-2 text-[9px] text-gray-500">
            C　障害者、寡婦、ひとり親又は勤労学生／D　他の所得者が控除を受ける扶養親族等
            …該当がある場合は公式様式に従って補記してください。
          </p>

          {/* 住民税に関する事項: 16歳未満の扶養親族 */}
          <SectionLabel>住民税に関する事項　16歳未満の扶養親族（平23.1.2以後生）</SectionLabel>
          <table className="mb-2 w-full border-collapse text-[10px]">
            <thead>
              <tr>
                <Hd className="w-[44mm]">（フリガナ）氏名</Hd>
                <Hd className="w-[30mm]">個人番号</Hd>
                <Hd className="w-[14mm]">あなたとの続柄</Hd>
                <Hd className="w-[26mm]">生年月日</Hd>
                <Hd>住所又は居所</Hd>
                <Hd className="w-[24mm]">控除対象外国外扶養親族</Hd>
                <Hd className="w-[26mm]">令和{reiwaYear}年中の所得の見積額</Hd>
              </tr>
            </thead>
            <tbody>
              {(under16.length > 0 ? under16 : [null]).map((d, i) => (
                <tr key={i}>
                  <Bd>
                    {d ? (
                      <>
                        <span className="block text-[8px] text-gray-500">{d.kana || "　"}</span>
                        <span className="font-bold">{d.name}</span>
                      </>
                    ) : (
                      "　"
                    )}
                  </Bd>
                  <Bd className="tabular-nums">{d?.my_number || "　"}</Bd>
                  <Bd>{d?.relation || "　"}</Bd>
                  <Bd>{d ? warekiDate(d.birth) : "　"}</Bd>
                  <Bd>{d?.address || "　"}</Bd>
                  <Bd className="text-center">{d ? "○" : "　"}</Bd>
                  <Bd>{d?.income || "　"}</Bd>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-[9px] leading-relaxed text-gray-500">
            ※ 本書式は令和{reiwaYear}年分 給与所得者の扶養控除等（異動）申告書（国税庁様式）と同じ記載項目の同等様式です。
            非居住者である親族の区分（16歳以上30歳未満又は70歳以上／38万円以上の支払）は作成日時点の年齢による自動判定のため、提出前に確認してください。
          </p>
        </div>
      </div>

      <style jsx global>{`
        @page {
          size: A4 landscape;
          margin: 0;
        }
        @media print {
          .fuyo-sheet {
            width: 297mm;
            min-height: 210mm;
            box-sizing: border-box;
          }
        }
      `}</style>
    </>
  );
}

// A欄・B欄の共通テーブル。spouseTable のときは配偶者向けの列見出しになる
function DependentTable({
  rows,
  today,
  reiwaYear,
  emptyRows,
  spouseTable = false,
}: {
  rows: WorkerDependent[];
  today: string;
  reiwaYear: number;
  emptyRows: number;
  spouseTable?: boolean;
}) {
  const blanks = Array.from({ length: emptyRows }, () => null);
  return (
    <table className="mb-2 w-full border-collapse text-[10px]">
      <thead>
        <tr>
          <Hd className="w-[44mm]">（フリガナ）氏名</Hd>
          <Hd className="w-[30mm]">個人番号</Hd>
          <Hd className="w-[14mm]">続柄</Hd>
          <Hd className="w-[26mm]">生年月日</Hd>
          {!spouseTable && (
            <Hd className="w-[30mm]">
              老人扶養親族（昭32.1.1以前生）
              <br />
              特定扶養親族・特定親族（平15.1.2〜平20.1.1生）
            </Hd>
          )}
          <Hd className="w-[24mm]">令和{reiwaYear}年中の所得の見積額</Hd>
          <Hd className="w-[34mm]">非居住者である親族</Hd>
          <Hd className="w-[24mm]">生計を一にする事実（送金等）</Hd>
          <Hd>住所又は居所</Hd>
        </tr>
      </thead>
      <tbody>
        {[...rows, ...blanks].map((d, i) => {
          const c = d ? dependentCategories(d, today) : null;
          return (
            <tr key={i}>
              <Bd>
                {d ? (
                  <>
                    <span className="block text-[8px] text-gray-500">{d.kana || "　"}</span>
                    <span className="font-bold">{d.name}</span>
                  </>
                ) : (
                  "　"
                )}
              </Bd>
              <Bd className="tabular-nums">{d?.my_number || "　"}</Bd>
              <Bd>{d?.relation || "　"}</Bd>
              <Bd>{d ? warekiDate(d.birth) : "　"}</Bd>
              {!spouseTable && (
                <Bd>
                  {c ? (
                    <span className="flex flex-col gap-0.5">
                      <span>{c.elderly ? "☑" : "☐"} 老人扶養親族（その他）</span>
                      <span>{c.specific ? "☑" : "☐"} 特定扶養親族・特定親族</span>
                    </span>
                  ) : (
                    "　"
                  )}
                </Bd>
              )}
              <Bd>{d?.income || "　"}</Bd>
              <Bd>
                {d ? (
                  spouseTable ? (
                    "○（非居住者）"
                  ) : (
                    <span className="flex flex-col gap-0.5">
                      <span>
                        {c?.youngOrElderly ? "☑" : "☐"} 16歳以上30歳未満又は70歳以上
                      </span>
                      <span>{c?.remittanceRequired ? "☑" : "☐"} 38万円以上の支払</span>
                    </span>
                  )
                ) : (
                  "　"
                )}
              </Bd>
              {/* 生計を一にする事実（送金額）は提出時に手書き・確認するため空欄にしておく */}
              <Bd>{"　"}</Bd>
              <Bd>{d?.address || "　"}</Bd>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 bg-gray-100 px-2 py-0.5 text-[10px] font-bold">{children}</p>;
}

function Hd({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`border border-gray-400 bg-gray-50 px-1.5 py-1 text-left text-[8px] font-bold leading-tight text-gray-600 ${className}`}
    >
      {children}
    </th>
  );
}

function Bd({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`border border-gray-400 px-1.5 py-1 align-top leading-tight ${className}`}>
      {children}
    </td>
  );
}
