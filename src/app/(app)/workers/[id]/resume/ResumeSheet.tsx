"use client";

import Link from "next/link";
import { ArrowLeft, Printer, UserRound } from "lucide-react";

interface ResumeWorker {
  name: string;
  kana: string;
  birth: string | null;
  nationality: string;
  residenceStatus: string;
  field: string;
  specialtyGrade: string;
  otherQualifications: string;
}

interface ResumeHistory {
  id: string;
  visa: string;
  start: string;
  end: string | null;
  org: string;
  role: string;
}

export function ResumeSheet({
  photoUrl,
  worker,
  histories,
}: {
  photoUrl: string;
  worker: ResumeWorker;
  histories: ResumeHistory[];
}) {
  const today = new Date().toLocaleDateString("ja-JP");

  return (
    <>
      {/* 画面用ツールバー（印刷時は非表示） */}
      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <Link href="/workers" aria-label="戻る" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-brand-foreground/10">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="flex-1 text-lg font-bold">履歴書</h1>
        </div>
        <div className="px-4 py-4 lg:px-8">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-foreground"
          >
            <Printer size={18} />
            印刷・PDF保存
          </button>
        </div>
      </div>

      <div className="print-root">
        <div className="worker-sheet mx-auto mb-6 max-w-[210mm] border border-border bg-white p-[12mm] text-black print:mb-0 print:border-0">
          <div className="mb-4 flex items-start justify-between border-b-2 border-black pb-2">
            <h2 className="text-2xl font-black">履歴書</h2>
            <p className="text-xs text-gray-500">作成日: {today}</p>
          </div>

          {/* 氏名・写真 */}
          <div className="mb-5 flex gap-6">
            <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Row label="氏名" value={worker.name} big />
              <Row label="フリガナ" value={worker.kana} />
              <Row label="生年月日" value={worker.birth} />
              <Row label="国籍" value={worker.nationality} />
              <Row label="現在の在留資格" value={worker.residenceStatus} />
              <Row label="分野・職種" value={worker.field} />
            </dl>
            <div className="flex h-[40mm] w-[32mm] shrink-0 items-center justify-center overflow-hidden border border-gray-400 bg-gray-50">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="顔写真" className="h-full w-full object-cover" />
              ) : (
                <UserRound size={48} className="text-gray-300" />
              )}
            </div>
          </div>

          {/* 職歴 */}
          <h3 className="mb-2 border-b border-black pb-1 text-base font-bold">職歴</h3>
          {histories.length === 0 ? (
            <p className="mb-5 text-sm text-gray-500">職歴の登録はありません。</p>
          ) : (
            <table className="mb-5 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-400 text-left text-xs text-gray-600">
                  <th className="py-1 pr-2">期間</th>
                  <th className="py-1 pr-2">在留資格</th>
                  <th className="py-1 pr-2">勤務先・受入機関</th>
                  <th className="py-1">職種・仕事内容</th>
                </tr>
              </thead>
              <tbody>
                {histories.map((h) => (
                  <tr key={h.id} className="border-b border-gray-200 align-top">
                    <td className="py-1.5 pr-2 tabular-nums">
                      {h.start} 〜 {h.end ?? "現在"}
                    </td>
                    <td className="py-1.5 pr-2">{h.visa}</td>
                    <td className="py-1.5 pr-2">{h.org || "—"}</td>
                    <td className="py-1.5">{h.role || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 資格 */}
          <h3 className="mb-2 border-b border-black pb-1 text-base font-bold">資格・合格</h3>
          <dl className="grid grid-cols-1 gap-y-1.5 text-sm">
            <Row label="専門級の合格名" value={worker.specialtyGrade} />
            <Row label="その他の資格・合格名" value={worker.otherQualifications} />
          </dl>
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

function Row({ label, value, big = false }: { label: string; value: string | null; big?: boolean }) {
  return (
    <div className="flex flex-col border-b border-gray-200 pb-1">
      <dt className="text-[10px] font-bold text-gray-500">{label}</dt>
      <dd className={big ? "text-lg font-black" : "text-sm font-bold"}>{value || "—"}</dd>
    </div>
  );
}
