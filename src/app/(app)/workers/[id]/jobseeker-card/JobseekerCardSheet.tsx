"use client";

import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { jobseekerAge, type JobseekerJob } from "@/lib/jobseeker-card";

// 求職票（求職申込書）。労働局の訪問指導で求職管理簿と一緒に見せる1人分の申込内容。
// A4縦1枚。登録がないところは手書きできるよう空欄のまま出す。

export interface JobseekerCardData {
  jobseekerNo: string;
  acceptedOn: string;
  validUntil: string;
  name: string;
  kana: string;
  gender: string;
  birth: string | null;
  nationality: string;
  address: string;
  homeAddress: string;
  residenceStatus: string;
  residencePeriod: string;
  residenceExpiry: string;
  residenceCardNo: string;
  passportNo: string;
  passportExpiry: string;
  field: string;
  certs: { label: string; value: string }[];
  jobs: JobseekerJob[];
  referrals: {
    appliedOn: string;
    acceptanceNo: string;
    employerName: string;
    result: string;
    resultOn: string;
  }[];
}

const B = "border border-black";

function Head({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`${B} bg-gray-100 px-1.5 py-1 text-left align-middle font-bold ${className}`}>
      {children}
    </td>
  );
}

function Cell({
  children,
  colSpan,
  className = "",
}: {
  children?: React.ReactNode;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td colSpan={colSpan} className={`${B} px-1.5 py-1 align-middle ${className}`}>
      {children || " "}
    </td>
  );
}

function Band({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={4} className={`${B} bg-gray-200 px-1.5 py-1 font-black`}>
        {children}
      </td>
    </tr>
  );
}

export function JobseekerCardSheet({ data, today }: { data: JobseekerCardData; today: string }) {
  const age = jobseekerAge(data.birth, today);
  // 職歴・紹介の記録は、少なくとも3行・2行は枠を出して手書きできるようにする
  const jobs = [...data.jobs];
  while (jobs.length < 3) jobs.push({ period: "", orgName: "", role: "" });
  const referrals = [...data.referrals];
  while (referrals.length < 2) {
    referrals.push({ appliedOn: "", acceptanceNo: "", employerName: "", result: "", resultOn: "" });
  }

  return (
    <>
      <style>{"@media print{@page{size:A4 portrait;margin:10mm}}"}</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref="/workers" />
          <h1 className="flex-1 text-lg font-bold">求職票（A4縦で印刷）</h1>
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
            求職管理簿と一緒に見せる求職票です。登録のないところは空欄で出るので、印刷してから手書きで足せます。
            求職受付番号・受付年月日・有効期間は外国人詳細の「求職」の欄、氏名・住所・在留資格は在留カードの欄が元になっています。
            印刷の設定は用紙「A4」・向き「縦」・拡大縮小「100%（または用紙に合わせる）」にしてください。
          </span>
        </div>
      </div>

      <div className="px-4 pb-6 lg:px-8 print:p-0">
        <div className="mx-auto max-w-[190mm] bg-white text-black">
          <div className="mb-2 flex items-end justify-between">
            <h2 className="text-[15pt] font-black">求職票</h2>
            <p className="text-[8pt]">作成日: {today}</p>
          </div>

          <table className="w-full table-fixed border-collapse text-[8.5pt] leading-tight">
            <colgroup>
              <col style={{ width: "18%" }} />
              <col style={{ width: "32%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "32%" }} />
            </colgroup>
            <tbody>
              <Band>求職の受付</Band>
              <tr>
                <Head>求職受付番号</Head>
                <Cell>{data.jobseekerNo}</Cell>
                <Head>受付年月日</Head>
                <Cell>{data.acceptedOn}</Cell>
              </tr>
              <tr>
                <Head>有効期間</Head>
                <Cell>{data.validUntil}</Cell>
                {/* 職業紹介事業者（自社）は登録がないので、名前を書く・判を押す欄として空けておく */}
                <Head>職業紹介事業者</Head>
                <Cell />
              </tr>
              <tr>
                <Head>事業所所在地</Head>
                <Cell colSpan={3} />
              </tr>

              <Band>求職者</Band>
              <tr>
                <Head>フリガナ</Head>
                <Cell colSpan={3}>{data.kana}</Cell>
              </tr>
              <tr>
                <Head>氏名</Head>
                <Cell colSpan={3} className="text-[11pt] font-bold">
                  {data.name}
                </Cell>
              </tr>
              <tr>
                <Head>生年月日（年齢）</Head>
                <Cell>
                  {data.birth ?? ""}
                  {age && `（${age}歳）`}
                </Cell>
                <Head>性別</Head>
                <Cell>{data.gender}</Cell>
              </tr>
              <tr>
                <Head>国籍</Head>
                <Cell>{data.nationality}</Cell>
                <Head>電話番号</Head>
                <Cell />
              </tr>
              <tr>
                <Head>住所（日本）</Head>
                <Cell colSpan={3}>{data.address}</Cell>
              </tr>
              <tr>
                <Head>住所（本国）</Head>
                <Cell colSpan={3}>{data.homeAddress}</Cell>
              </tr>

              <Band>在留資格</Band>
              <tr>
                <Head>在留資格</Head>
                <Cell>{data.residenceStatus}</Cell>
                <Head>在留期間</Head>
                <Cell>{data.residencePeriod}</Cell>
              </tr>
              <tr>
                <Head>在留期限</Head>
                <Cell>{data.residenceExpiry}</Cell>
                <Head>在留カード番号</Head>
                <Cell>{data.residenceCardNo}</Cell>
              </tr>
              <tr>
                <Head>旅券番号</Head>
                <Cell>{data.passportNo}</Cell>
                <Head>旅券有効期限</Head>
                <Cell>{data.passportExpiry}</Cell>
              </tr>

              <Band>希望する仕事</Band>
              <tr>
                <Head>希望職種</Head>
                <Cell>{data.field}</Cell>
                <Head>希望勤務地</Head>
                <Cell />
              </tr>
              <tr>
                <Head>希望賃金</Head>
                <Cell />
                <Head>就業できる時期</Head>
                <Cell />
              </tr>
              <tr>
                <Head>その他の希望</Head>
                <Cell colSpan={3} className="h-[12mm] align-top" />
              </tr>
            </tbody>
          </table>

          <table className="mt-2 w-full table-fixed border-collapse text-[8.5pt] leading-tight">
            <colgroup>
              <col style={{ width: "30%" }} />
              <col style={{ width: "70%" }} />
            </colgroup>
            <tbody>
              <tr>
                <td colSpan={2} className={`${B} bg-gray-200 px-1.5 py-1 font-black`}>
                  資格・試験
                </td>
              </tr>
              {(data.certs.length > 0
                ? data.certs
                : [{ label: "", value: "" }, { label: "", value: "" }]
              ).map((c, i) => (
                <tr key={`${c.label}-${i}`}>
                  <Head>{c.label || " "}</Head>
                  <Cell>{c.value}</Cell>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="mt-2 w-full table-fixed border-collapse text-[8.5pt] leading-tight">
            <colgroup>
              <col style={{ width: "26%" }} />
              <col style={{ width: "40%" }} />
              <col style={{ width: "34%" }} />
            </colgroup>
            <tbody>
              <tr>
                <td colSpan={3} className={`${B} bg-gray-200 px-1.5 py-1 font-black`}>
                  職歴
                </td>
              </tr>
              <tr>
                <Head>期間</Head>
                <Head>勤務先</Head>
                <Head>仕事内容</Head>
              </tr>
              {jobs.map((j, i) => (
                <tr key={i}>
                  <Cell>{j.period}</Cell>
                  <Cell>{j.orgName}</Cell>
                  <Cell>{j.role}</Cell>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="mt-2 w-full table-fixed border-collapse text-[8.5pt] leading-tight">
            <colgroup>
              <col style={{ width: "16%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "34%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "17%" }} />
            </colgroup>
            <tbody>
              <tr>
                <td colSpan={5} className={`${B} bg-gray-200 px-1.5 py-1 font-black`}>
                  紹介の記録（求職管理簿と同じ内容）
                </td>
              </tr>
              <tr>
                <Head>紹介年月日</Head>
                <Head>求人受理番号</Head>
                <Head>求人者の氏名又は名称</Head>
                <Head>採否結果</Head>
                <Head>採用年月日</Head>
              </tr>
              {referrals.map((r, i) => (
                <tr key={i}>
                  <Cell>{r.appliedOn}</Cell>
                  <Cell>{r.acceptanceNo}</Cell>
                  <Cell>{r.employerName}</Cell>
                  <Cell>{r.result}</Cell>
                  <Cell>{r.resultOn}</Cell>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-3 text-[8pt] leading-relaxed">
            上記のとおり求職を申し込みます。
          </p>
          <div className="mt-1 flex items-end gap-6 text-[8.5pt]">
            <span className="flex-1">
              求職者署名：
              <span className="ml-1 inline-block w-[60mm] border-b border-black">&nbsp;</span>
            </span>
            <span>
              年月日：
              <span className="ml-1 inline-block w-[35mm] border-b border-black">&nbsp;</span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
