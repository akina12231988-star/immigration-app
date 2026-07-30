"use client";

import { useState } from "react";
import { BackButton } from "@/components/BackButton";
import { Printer } from "lucide-react";

interface RosterWorker {
  name: string;
  kana: string;
  birth: string | null;
  gender: string;
  address: string;
  field: string;
  myNumber: string;
  employmentStartOn: string | null;
  status: string;
  leavingOn: string | null;
  leavingKind: string;
  leavingReason: string;
}

// YYYY-MM-DD → 「1999年12月12日」
function jpDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return `${y}年${m}月${d}日`;
}

// 会社へ送る労働者名簿（労働基準法107条の様式に準拠した1枚もの）。
// 会社名・業務の種類は印刷前に画面上で調整できる
export function RosterSheet({
  orgName,
  worker,
  previousJobs,
}: {
  orgName: string;
  worker: RosterWorker;
  previousJobs: { id: string; org: string }[];
}) {
  const [company, setCompany] = useState(orgName);
  const [workKind, setWorkKind] = useState(worker.field);

  const TOOL_INPUT =
    "min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

  // 履歴: 雇用開始（入社）が登録されていれば1行目に出す。残りは手書き用の空行
  const historyRows: { date: string; content: string }[] = [];
  if (worker.employmentStartOn) {
    historyRows.push({ date: jpDate(worker.employmentStartOn), content: "入社" });
  }
  while (historyRows.length < 2) historyRows.push({ date: "", content: "" });

  const isLeft = worker.status === "退職";
  const leavingReason = [worker.leavingKind, worker.leavingReason]
    .filter(Boolean)
    .join("・");

  return (
    <>
      {/* 画面用ツールバー（印刷時は非表示） */}
      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref="/workers" />
          <h1 className="flex-1 text-lg font-bold">労働者名簿</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3 px-4 py-4 lg:px-8">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">会社名（送付先）</span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="例: 有限会社◯◯"
              className={TOOL_INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">業務の種類</span>
            <input
              value={workKind}
              onChange={(e) => setWorkKind(e.target.value)}
              placeholder="例: 耕種農業の一般社員（役員なし）"
              className={`${TOOL_INPUT} min-w-[260px]`}
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
        <p className="px-4 pb-3 text-[11px] text-muted lg:px-8">
          会社名・業務の種類はこの画面で修正してから印刷できます（保存はされません）。個人番号・住所などの元データの修正は外国人詳細から行ってください。
        </p>
      </div>

      <div className="print-root">
        <div className="worker-sheet mx-auto mb-6 max-w-[210mm] border border-border bg-white p-[12mm] text-black print:mb-0 print:border-0">
          <h2 className="mb-5 text-2xl font-black">
            労働者名簿{company && `（${company}）`}
          </h2>

          {/* 基本情報 */}
          <table className="mb-5 w-[130mm] border-collapse text-sm">
            <tbody>
              <BasicRow label="名前" value={worker.name} big />
              <BasicRow label="フリガナ" value={worker.kana} />
              <BasicRow label="生年月日" value={jpDate(worker.birth)} />
              <BasicRow label="性別" value={worker.gender} />
              <BasicRow label="住所" value={worker.address} />
              <BasicRow label="業務の種類" value={workKind} />
              <BasicRow label="個人番号" value={worker.myNumber} />
              <BasicRow label="雇用開始年月日" value={jpDate(worker.employmentStartOn)} />
            </tbody>
          </table>

          {/* 履歴 */}
          <SectionHeading>履歴</SectionHeading>
          <table className="mb-5 w-full border-collapse text-sm">
            <thead>
              <tr>
                <HeaderCell className="w-[35mm]">年月日</HeaderCell>
                <HeaderCell>内容</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((row, i) => (
                <tr key={i}>
                  <BodyCell>{row.date}</BodyCell>
                  <BodyCell>{row.content}</BodyCell>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 前職 */}
          <SectionHeading>前職</SectionHeading>
          <table className="mb-5 w-full border-collapse text-sm">
            <thead>
              <tr>
                <HeaderCell>会社名</HeaderCell>
                <HeaderCell className="w-[35mm]">都道府県</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {(previousJobs.length > 0 ? previousJobs : [{ id: "blank", org: "" }]).map(
                (job) => (
                  <tr key={job.id}>
                    <BodyCell>{job.org}</BodyCell>
                    <BodyCell>{""}</BodyCell>
                  </tr>
                ),
              )}
            </tbody>
          </table>

          {/* 解雇・退職または死亡 */}
          <SectionHeading>解雇・退職または死亡</SectionHeading>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <HeaderCell className="w-[35mm]">年月日</HeaderCell>
                <HeaderCell>事由</HeaderCell>
              </tr>
            </thead>
            <tbody>
              <tr>
                <BodyCell>{isLeft ? jpDate(worker.leavingOn) : ""}</BodyCell>
                <BodyCell>{isLeft ? leavingReason : ""}</BodyCell>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 0;
        }
        @media print {
          .worker-sheet {
            width: 210mm;
            min-height: 297mm;
            box-sizing: border-box;
          }
        }
      `}</style>
    </>
  );
}

function BasicRow({
  label,
  value,
  big = false,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <tr className="border border-gray-300">
      <th className="w-[38mm] border border-gray-300 bg-gray-50 px-3 py-2 text-left text-xs font-bold text-gray-600">
        {label}
      </th>
      <td className={`border border-gray-300 px-3 py-2 ${big ? "font-black" : "font-bold"}`}>
        {value || "　"}
      </td>
    </tr>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 bg-orange-100 px-2 py-1 text-sm font-bold">{children}</p>
  );
}

function HeaderCell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`border border-gray-300 bg-gray-50 px-3 py-1.5 text-left text-xs font-bold text-gray-600 ${className}`}
    >
      {children}
    </th>
  );
}

function BodyCell({ children }: { children: React.ReactNode }) {
  return (
    <td className="min-h-[28px] border border-gray-300 px-3 py-1.5">
      {children || "　"}
    </td>
  );
}
