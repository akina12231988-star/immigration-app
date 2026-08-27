"use client";

import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { SSW2_DUTY_FIELDS, type OrgSsw2Duties } from "@/lib/org-ssw2-duties";
import { INTERVIEW_SECTIONS, unansweredQuestions } from "@/lib/ssw2-interview";

// 特定技能2号の誓約書を書くための聞き取り質問票（A4縦で印刷）。
// 様式のお役所言葉ではなく、そのまま読み上げれば答えてもらえる言い方にしている。
export function Ssw2InterviewSheet({
  orgId,
  orgName,
  duties,
  today,
}: {
  orgId: string;
  orgName: string;
  duties: OrgSsw2Duties;
  today: string;
}) {
  const remaining = unansweredQuestions(duties);

  return (
    <>
      <style>{"@media print{@page{size:A4 portrait;margin:12mm}}"}</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref={`/organizations/${orgId}`} />
          <h1 className="flex-1 text-lg font-bold">聞き取りの質問票（A4縦で印刷）</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 lg:px-8">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground"
          >
            <Printer size={18} />
            印刷・PDF保存（A4縦）
          </button>
          <span className="text-[11px] leading-relaxed text-muted">
            特定技能２号の誓約書（参考様式第１－３２号）を書くために、会社へ聞くことをまとめた紙です。
            上から順に読み上げて、答えを書き込んでください。
            {remaining.length === 0
              ? "（この会社は業務内容の登録が済んでいます。確認用としてお使いください）"
              : `（この会社はまだ ${remaining.length} 件が未登録です）`}
          </span>
        </div>
      </div>

      {/* 以下が印刷される部分 */}
      <div className="mx-auto max-w-[190mm] px-4 pb-10 text-[11pt] leading-relaxed text-black lg:px-0">
        <h2 className="mb-1 text-center text-[14pt] font-bold">
          特定技能２号の申請にあたっての聞き取り
        </h2>
        <p className="mb-3 text-center text-[10pt]">
          （２号特定技能外国人の業務内容に関する誓約書　参考様式第１－３２号）
        </p>

        <table className="mb-4 w-full border-collapse text-[10pt]">
          <tbody>
            <tr>
              <th className="w-28 border border-black bg-black/5 p-1.5 text-left font-bold">
                会社名
              </th>
              <td className="border border-black p-1.5">{orgName}</td>
              <th className="w-24 border border-black bg-black/5 p-1.5 text-left font-bold">
                聞き取り日
              </th>
              <td className="w-32 border border-black p-1.5">{today}</td>
            </tr>
            <tr>
              <th className="border border-black bg-black/5 p-1.5 text-left font-bold">
                対象の外国人
              </th>
              <td className="border border-black p-1.5" />
              <th className="border border-black bg-black/5 p-1.5 text-left font-bold">
                答えた方
              </th>
              <td className="border border-black p-1.5" />
            </tr>
          </tbody>
        </table>

        {INTERVIEW_SECTIONS.map((section) => (
          <section key={section.title} className="mb-5">
            <h3 className="mb-1 border-b-2 border-black pb-0.5 text-[12pt] font-bold">
              {section.title}
            </h3>
            {section.lead && <p className="mb-2 text-[10pt]">{section.lead}</p>}
            <ol className="flex flex-col gap-3">
              {section.questions.map((q) => {
                // すでに登録してある内容は「今わかっていること」として下に出す
                const known = q.key ? duties[q.key].trim() : "";
                return (
                  <li key={q.no} className="break-inside-avoid">
                    <p className="font-bold">
                      {q.no}　{q.ask}
                    </p>
                    {q.why && <p className="text-[9.5pt] text-black/70">（{q.why}）</p>}
                    {q.examples && (
                      <ul className="ml-4 list-disc text-[9.5pt] text-black/70">
                        {q.examples.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    )}
                    {known && (
                      <p className="mt-0.5 text-[9.5pt]">
                        <span className="font-bold">いま登録してある内容：</span>
                        {known}
                        <span className="text-black/70">（変わっていないか確認してください）</span>
                      </p>
                    )}
                    {/* 答えを書き込む欄 */}
                    <div className="mt-1 min-h-[22mm] border border-black" />
                  </li>
                );
              })}
            </ol>
          </section>
        ))}

        <section className="break-inside-avoid">
          <h3 className="mb-1 border-b-2 border-black pb-0.5 text-[12pt] font-bold">
            ３　聞き取りが終わったら
          </h3>
          <ol className="ml-4 list-decimal text-[10pt]">
            <li>
              アプリの「所属機関の情報 ＞ 特定技能２号の指導体制」を開き、
              {SSW2_DUTY_FIELDS.map((f) => `${f.no} ${f.label}`).join(" / ")} を入れます。
            </li>
            <li>
              その下の「２号申請者ごとの指導対象者」で、教えている相手を登録します。
            </li>
            <li>
              外国人の申請準備を開き、「２号の誓約書をWordで出す」から書類を作ります。
            </li>
          </ol>
        </section>
      </div>
    </>
  );
}
