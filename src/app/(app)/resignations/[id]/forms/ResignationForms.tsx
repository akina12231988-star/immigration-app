"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Printer } from "lucide-react";
import { todayStr } from "@/lib/application-alerts";
import {
  END_REASONS,
  FORM_312,
  FORM_34,
  FORM_511,
  FORM_TITLES,
  type EndReasonCode,
  type SupportOrgInfo,
  defaultEndReason,
  formsForKind,
  getSupportOrgServerSnapshot,
  getSupportOrgSnapshot,
  jpDate,
  saveSupportOrg,
  subscribeSupportOrg,
} from "@/lib/resignation";
import type { ResignationKind } from "@/types/db";

// 法務省「特定技能所属機関による届出」ページ（参考様式の最新版はここで確認する）
const MOJ_URL = "https://www.moj.go.jp/isa/applications/ssw/nyuukokukanri10_00002.html";

interface FormsResignation {
  id: string;
  kind: ResignationKind;
  reason: string;
  leavingOn: string;
  todoNo: string;
  orgName: string;
  orgAddress: string;
  orgContact: string;
}

interface FormsWorker {
  name: string;
  kana: string;
  gender: string;
  birth: string | null;
  nationality: string;
  residenceCardNo: string;
  residenceStatus: string;
}

// 退職記録から随時届出の参考様式へデータを転記して印刷するシート。
// 会社都合: 3-1-2号・3-4号・5-11号の3枚 / 自己都合: 3-1-2号のみ。
export function ResignationForms({
  resignation,
  worker,
}: {
  resignation: FormsResignation;
  worker: FormsWorker;
}) {
  const [reportOn, setReportOn] = useState(todayStr());
  const [endReason, setEndReason] = useState<EndReasonCode>(defaultEndReason(resignation.kind));
  const [reasonText, setReasonText] = useState(resignation.reason);
  // 委託契約をしていた登録支援機関の情報は毎回同じなのでブラウザに保存して再利用する
  const supportOrg = useSyncExternalStore(
    subscribeSupportOrg,
    getSupportOrgSnapshot,
    getSupportOrgServerSnapshot,
  );
  const setSupport = (patch: Partial<SupportOrgInfo>) =>
    saveSupportOrg({ ...supportOrg, ...patch });

  const forms = formsForKind(resignation.kind);
  const INPUT =
    "min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

  return (
    <>
      {/* 画面用ツールバー（印刷時は非表示） */}
      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <Link
            href="/resignations"
            aria-label="戻る"
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-brand-foreground/10"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="flex-1 text-lg font-bold">
            随時届出の作成（{resignation.kind}・{forms.length}様式）
          </h1>
        </div>

        <div className="flex flex-col gap-3 px-4 py-4 lg:px-8">
          <p className="text-xs leading-relaxed text-muted">
            {worker.name} さん（退職日 {jpDate(resignation.leavingOn)}）の退職記録を下の様式に転記しています。
            作成様式: {forms.join("・")}。印刷前に内容を確認し、最新の様式は
            <a
              href={MOJ_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mx-1 inline-flex items-center gap-0.5 font-bold text-brand"
            >
              法務省のページ
              <ExternalLink size={11} />
            </a>
            と照合してください。
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">届出年月日</span>
              <input
                type="date"
                value={reportOn}
                onChange={(e) => setReportOn(e.target.value)}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">終了の事由（3-1-2号）</span>
              <select
                value={endReason}
                onChange={(e) => setEndReason(e.target.value as EndReasonCode)}
                className={INPUT}
              >
                {END_REASONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code} {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-64 flex-1 flex-col gap-1">
              <span className="text-xs font-bold text-muted">
                事由の詳細（05その他の括弧内・理由説明に使用）
              </span>
              <input
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="例: 経営悪化により事業所を閉鎖したため"
                className={`${INPUT} w-full`}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-3">
            <p className="w-full text-xs font-bold text-muted">
              委託契約をしていた登録支援機関（毎回同じ内容・この端末に保存されます）
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">登録番号</span>
              <input
                value={supportOrg.regNo}
                onChange={(e) => setSupport({ regNo: e.target.value })}
                placeholder="例: 19登-000000"
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">氏名または名称</span>
              <input
                value={supportOrg.name}
                onChange={(e) => setSupport({ name: e.target.value })}
                className={INPUT}
              />
            </label>
            <label className="flex min-w-64 flex-1 flex-col gap-1">
              <span className="text-xs font-bold text-muted">住所</span>
              <input
                value={supportOrg.address}
                onChange={(e) => setSupport({ address: e.target.value })}
                className={`${INPUT} w-full`}
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] w-fit items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-foreground"
          >
            <Printer size={18} />
            印刷・PDF保存
          </button>
        </div>
      </div>

      <div className="print-root">
        <Form312
          resignation={resignation}
          worker={worker}
          reportOn={reportOn}
          endReason={endReason}
          reasonText={reasonText}
          supportOrg={supportOrg}
        />
        {resignation.kind === "会社都合" && (
          <>
            <Form34
              resignation={resignation}
              worker={worker}
              reportOn={reportOn}
              reasonText={reasonText}
            />
            <Form511
              resignation={resignation}
              worker={worker}
              reportOn={reportOn}
              reasonText={reasonText}
            />
          </>
        )}
      </div>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 0;
        }
        @media print {
          .resignation-sheet {
            width: 210mm;
            min-height: 297mm;
            box-sizing: border-box;
            break-after: page;
          }
          .resignation-sheet:last-child {
            break-after: auto;
          }
        }
      `}</style>
    </>
  );
}

// ---- 共通パーツ ----

function Sheet({
  formNo,
  title,
  subtitle,
  children,
}: {
  formNo: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="resignation-sheet mx-auto mb-6 max-w-[210mm] border border-border bg-white p-[14mm] text-black print:mb-0 print:border-0">
      <p className="text-xs">{formNo}</p>
      <h2 className="mt-2 text-center text-lg font-black tracking-wide">{title}</h2>
      {subtitle && <p className="text-center text-sm font-bold">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function CheckMark({ checked }: { checked: boolean }) {
  return <span className="mr-1 inline-block w-4 text-center">{checked ? "■" : "□"}</span>;
}

// 届出の対象者（3様式で共通の表）
function TargetPersonTable({ worker }: { worker: FormsWorker }) {
  return (
    <table className="mb-4 w-full border-collapse text-sm">
      <tbody>
        <Tr label="氏　名" value={worker.kana ? `${worker.name}（${worker.kana}）` : worker.name} />
        <Tr label="性　別" value={worker.gender} />
        <Tr label="生年月日" value={jpDate(worker.birth)} />
        <Tr label="国籍・地域" value={worker.nationality} />
        <Tr label="在留カード番号" value={worker.residenceCardNo} />
      </tbody>
    </table>
  );
}

function Tr({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th className="w-44 border border-black bg-gray-100 px-2 py-1.5 text-left font-bold">
        {label}
      </th>
      <td className="border border-black px-2 py-1.5">{value || "　"}</td>
    </tr>
  );
}

// 届出機関（特定技能所属機関）欄
function ReportingOrgTable({
  resignation,
  reportOn,
}: {
  resignation: FormsResignation;
  reportOn: string;
}) {
  return (
    <div className="mt-6">
      <p className="mb-1 text-sm font-bold">【届出機関（特定技能所属機関）】</p>
      <table className="w-full border-collapse text-sm">
        <tbody>
          <Tr label="届出年月日" value={jpDate(reportOn)} />
          <Tr label="氏名又は名称" value={resignation.orgName} />
          <Tr label="住　所" value={resignation.orgAddress} />
          <Tr label="連絡先" value={resignation.orgContact} />
          <Tr label="作成担当者 氏名" value="" />
        </tbody>
      </table>
      <p className="mt-2 text-right text-xs text-gray-500">署名・押印欄は様式に従って記入してください</p>
    </div>
  );
}

// ---- 参考様式第3-1-2号 ----

function Form312({
  resignation,
  worker,
  reportOn,
  endReason,
  reasonText,
  supportOrg,
}: {
  resignation: FormsResignation;
  worker: FormsWorker;
  reportOn: string;
  endReason: EndReasonCode;
  reasonText: string;
  supportOrg: SupportOrgInfo;
}) {
  return (
    <Sheet
      formNo={FORM_312}
      title="特定技能雇用契約に係る届出書"
      subtitle="（契約を終了した又は新たに締結した場合）"
    >
      <p className="mb-3 text-xs leading-relaxed">
        出入国管理及び難民認定法第19条の18第1項第1号の規定により、特定技能雇用契約の変更等について、下記のとおり届け出ます。
      </p>

      <p className="mb-1 text-sm font-bold">① 届出の対象者</p>
      <TargetPersonTable worker={worker} />

      <p className="mb-1 text-sm font-bold">② 届出の事由</p>
      <div className="mb-4 border border-black p-3 text-sm leading-relaxed">
        <p className="font-bold">
          <CheckMark checked />
          特定技能雇用契約の終了
        </p>
        <div className="ml-5 mt-2 space-y-2">
          <p>
            a　雇用契約終了年月日：
            <span className="font-bold underline underline-offset-2">
              {jpDate(resignation.leavingOn)}
            </span>
          </p>
          <div>
            <p>b　終了の事由：</p>
            <div className="ml-4">
              {END_REASONS.map((r) => (
                <p key={r.code}>
                  <CheckMark checked={endReason === r.code} />
                  {r.code}　{r.label}
                  {r.code === "05" && (
                    <span>
                      （
                      <span className="underline underline-offset-2">
                        {endReason === "05" ? reasonText || "　　　　　　　　　　" : "　　　　　　　　　　"}
                      </span>
                      ）
                    </span>
                  )}
                </p>
              ))}
            </div>
          </div>
          <div>
            <p>
              c　支援委託契約終了年月日：
              <span className="font-bold underline underline-offset-2">
                {jpDate(resignation.leavingOn)}
              </span>
            </p>
            <p className="mt-1">　　委託契約をしていた登録支援機関：</p>
            <table className="ml-4 mt-1 w-[calc(100%-1rem)] border-collapse text-sm">
              <tbody>
                <Tr label="登録番号" value={supportOrg.regNo} />
                <Tr label="氏名又は名称" value={supportOrg.name} />
                <Tr label="住　所" value={supportOrg.address} />
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-gray-600">
          <CheckMark checked={false} />
          新たな特定技能雇用契約の締結（該当なし）
        </p>
      </div>

      <ReportingOrgTable resignation={resignation} reportOn={reportOn} />
    </Sheet>
  );
}

// ---- 参考様式第3-4号（会社都合のみ） ----

function Form34({
  resignation,
  worker,
  reportOn,
  reasonText,
}: {
  resignation: FormsResignation;
  worker: FormsWorker;
  reportOn: string;
  reasonText: string;
}) {
  return (
    <Sheet formNo={FORM_34} title={FORM_TITLES[FORM_34]}>
      <p className="mb-3 text-xs leading-relaxed">
        特定技能外国人の受入れを継続することが困難となったため、下記のとおり届け出ます。
      </p>

      <p className="mb-1 text-sm font-bold">① 届出の対象者</p>
      <TargetPersonTable worker={worker} />

      <p className="mb-1 text-sm font-bold">② 受入れ困難となった時期</p>
      <table className="mb-4 w-full border-collapse text-sm">
        <tbody>
          <Tr label="時　期" value={jpDate(resignation.leavingOn)} />
        </tbody>
      </table>

      <p className="mb-1 text-sm font-bold">③ 受入れ困難となった事由</p>
      <div className="mb-4 border border-black p-3 text-sm leading-relaxed">
        <p>
          <CheckMark checked />
          特定技能所属機関の都合（会社都合）
        </p>
        <p className="ml-5 mt-1">
          事由の詳細：
          <span className="underline underline-offset-2">{reasonText || "　"}</span>
        </p>
        <p className="mt-2 text-gray-600">
          <CheckMark checked={false} />
          特定技能外国人の都合
        </p>
      </div>

      <p className="mb-1 text-sm font-bold">④ 特定技能外国人の現状・活動継続のための措置</p>
      <div className="mb-4 min-h-24 border border-black p-3 text-sm leading-relaxed">
        転職支援（求人情報の提供・職業紹介事業者の案内等）を実施予定。
      </div>

      <ReportingOrgTable resignation={resignation} reportOn={reportOn} />
    </Sheet>
  );
}

// ---- 参考様式第5-11号（会社都合のみ） ----

function Form511({
  resignation,
  worker,
  reportOn,
  reasonText,
}: {
  resignation: FormsResignation;
  worker: FormsWorker;
  reportOn: string;
  reasonText: string;
}) {
  return (
    <Sheet formNo={FORM_511} title={FORM_TITLES[FORM_511]}>
      <p className="mb-1 text-sm font-bold">① 対象の特定技能外国人</p>
      <TargetPersonTable worker={worker} />

      <p className="mb-1 text-sm font-bold">② 受入れ困難となるに至った経緯</p>
      <div className="mb-4 min-h-56 whitespace-pre-wrap border border-black p-3 text-sm leading-relaxed">
        {[
          `${jpDate(resignation.leavingOn)}付で、当機関の都合（会社都合）により ${worker.name} さんとの特定技能雇用契約を終了することとなった。`,
          reasonText ? `経緯・理由: ${reasonText}` : "",
        ]
          .filter(Boolean)
          .join("\n\n")}
      </div>

      <ReportingOrgTable resignation={resignation} reportOn={reportOn} />
    </Sheet>
  );
}
