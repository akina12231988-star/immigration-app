"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Printer, RotateCcw, Save, Trash2 } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { dbErrorMessage } from "@/lib/errors";
import {
  jobseekerAge,
  jobseekerCardFields,
  jobseekerCardFieldsOf,
  jobseekerCardJobs,
  jobseekerReferrals,
  sortJobseekerJobs,
  JOBSEEKER_AGENT_NAME,
  type JobseekerReferral,
} from "@/lib/jobseeker-card";
import type { JobseekerCardExtras, JobseekerCardJob } from "@/types/db";

// 求職票（求職申込書）。労働局の訪問指導で求職管理簿と一緒に見せる1人分の申込内容。
// A4縦1枚。画面の上でそのまま書けて、そのまま印刷できる。

export interface JobseekerCardWorker {
  jobseekerNo: string;
  acceptedOn: string;
  validUntil: string;
  name: string;
  kana: string;
  gender: string;
  birth: string;
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
}

const B = "border border-black";
const FIELD =
  "w-full min-w-0 bg-transparent outline-none border-b border-dashed border-gray-300 focus:bg-yellow-100 print:border-0 print:bg-transparent";

function Head({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`${B} bg-gray-100 px-1.5 py-[1.5px] text-left align-middle font-bold ${className}`}>
      {children ?? " "}
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
    <td colSpan={colSpan} className={`${B} px-1.5 py-[1.5px] align-middle ${className}`}>
      {children ?? " "}
    </td>
  );
}

function Band({ children, colSpan = 4 }: { children: React.ReactNode; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className={`${B} bg-gray-200 px-1.5 py-[1.5px] font-black`}>
        {children}
      </td>
    </tr>
  );
}

export function JobseekerCardSheet({
  workerId,
  canEdit,
  worker: initialWorker,
  extras: initialExtras,
  certs,
  histories,
  referrals,
}: {
  workerId: string;
  canEdit: boolean;
  worker: JobseekerCardWorker;
  extras: JobseekerCardExtras;
  certs: { label: string; value: string }[];
  // 外国人の職歴。求職票でまだ直していないときの初期値として使う
  histories: JobseekerCardJob[];
  referrals: JobseekerReferral[];
}) {
  const router = useRouter();
  // 求職票は求職受付のときの控え。氏名・住所などは、求職票で直したぶんがあれば
  // それを出し、まだ直していなければ外国人の登録内容を出す
  const [worker, setWorker] = useState(() =>
    jobseekerCardFields(initialWorker, initialExtras.fields),
  );
  const [extras, setExtras] = useState(initialExtras);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const touched = () => {
    setDirty(true);
    setMessage(null);
  };

  // 職歴は求職票のもの。最初は外国人の職歴をそのまま出し、ここで直したら
  // 求職票のぶんとして残す（外国人詳細の職歴には書き戻さない）
  const [jobs, setJobs] = useState<JobseekerCardJob[]>(() =>
    jobseekerCardJobs(initialExtras.jobs, histories),
  );
  const setJob = (i: number, patch: Partial<JobseekerCardJob>) => {
    setJobs((list) => sortJobseekerJobs(list.map((j, k) => (k === i ? { ...j, ...patch } : j))));
    touched();
  };
  const addJob = () => {
    setJobs((list) => [...list, { start: "", end: "", org: "", role: "" }]);
    touched();
  };
  const removeJob = (i: number) => {
    setJobs((list) => list.filter((_, k) => k !== i));
    touched();
  };
  // 外国人詳細の内容を入れ直す（求職票のぶんを捨てて、登録し直したいとき）
  const resetFromWorker = () => {
    setWorker(initialWorker);
    setJobs(sortJobseekerJobs(histories));
    touched();
  };

  const set = <K extends keyof JobseekerCardWorker>(key: K, value: JobseekerCardWorker[K]) => {
    setWorker((w) => ({ ...w, [key]: value }));
    touched();
  };
  const setExtra = <K extends keyof JobseekerCardExtras>(key: K, value: string) => {
    setExtras((e) => ({ ...e, [key]: value }));
    touched();
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    try {
      await updateWorker(supabase, workerId, {
        // 求職の受付は求職管理簿と同じ記録なので、外国人の登録内容に書き戻す
        jobseeker_no: worker.jobseekerNo,
        jobseeker_accepted_on: worker.acceptedOn || null,
        jobseeker_valid_until: worker.validUntil || null,
        // 氏名・住所・在留資格・職歴は求職票のぶんとして残す
        // （外国人詳細の登録内容は変えない）
        jobseeker_card: { ...extras, jobs, fields: jobseekerCardFieldsOf(worker) },
      });
      setDirty(false);
      setMessage({ ok: true, text: "保存しました。このまま印刷できます。" });
      router.refresh();
    } catch (err) {
      setMessage({
        ok: false,
        text: dbErrorMessage(err, "0118_worker_jobseeker_card.sql", "保存に失敗しました"),
      });
    } finally {
      setBusy(false);
    }
  };

  // 入力欄（読み取りだけの人には文字のまま見せる）
  const F = (value: string, onChange: (v: string) => void, type: "text" | "date" = "text") =>
    canEdit ? (
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={FIELD}
      />
    ) : (
      <span>{value}</span>
    );

  const age = jobseekerAge(worker.birth || null, worker.acceptedOn || "");
  // 紹介の記録は求職管理簿と同じ内容なので直せない。
  // この求職受付より前の紹介（前回の求職受付のときの分）は載せず、
  // 1件も無いときだけ空の1行を出す
  const forThisCard = jobseekerReferrals(referrals, worker.acceptedOn);
  const shownReferrals =
    forThisCard.length > 0
      ? forThisCard
      : [{ appliedOn: "", acceptanceNo: "", employerName: "", result: "", resultOn: "" }];
  const shownCerts = certs.length > 0 ? certs : [{ label: "", value: "" }];

  return (
    <>
      <style>{
        // 入力欄は放っておくとブラウザ既定の大きさになり、本文より背が高くなって
        // A4縦1枚に収まらなくなる。表の文字と同じ大きさにそろえる
        ".jobseeker-sheet input{font:inherit;height:auto;padding:0;margin:0}" +
        // 期間の欄は日付が2つ並ぶので、そこだけ少し小さくする
        ".jobseeker-sheet input.date-small{font-size:7pt}" +
        "@media print{@page{size:A4 portrait;margin:10mm}" +
        "input,select{border:0!important;background:transparent!important;color:#000!important;" +
        "padding:0!important;-webkit-appearance:none!important;appearance:none!important}" +
        "input[type=date]::-webkit-calendar-picker-indicator{display:none}" +
        // 行の途中で改ページさせない
        "tr{break-inside:avoid;page-break-inside:avoid}}"
      }</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref="/jobs" />
          <h1 className="flex-1 text-lg font-bold">求職票（A4縦で印刷）</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 lg:px-8">
          {canEdit && (
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !dirty}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground disabled:opacity-50"
            >
              <Save size={18} />
              {busy ? "保存中…" : dirty ? "保存する" : "保存済み"}
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-brand px-5 text-sm font-bold text-brand"
          >
            <Printer size={18} />
            印刷・PDF保存（A4縦）
          </button>
          {dirty && (
            <span className="text-[11px] font-bold text-seal">
              保存されていない変更があります（先に保存してから印刷してください）
            </span>
          )}
          <span className="w-full text-[11px] leading-relaxed text-muted">
            求職管理簿と一緒に見せる求職票です。点線の欄はこの画面でそのまま書けて、「保存する」で外国人の登録内容に書き戻します。
            職歴は「職歴を追加」で増やせ、直すと期間の古い順に並べ直します。
            求職票は求職受付のときの控えなので、氏名・住所・在留資格・職歴をここで直しても外国人詳細は変わりません
            （最初は外国人詳細の内容を入れています。入れ直したいときは職歴の下のボタンから）。
            求職受付番号・受付年月日・有効期間だけは求職管理簿と同じ記録なので、外国人の登録内容にも書き戻します。
            作成年月日には求職の受付年月日が入ります。
            紹介の記録は、この受付年月日より後の紹介だけを出します（前回の求職受付のときの紹介は、そのときの求職票に載ります）。
            印刷の設定は用紙「A4」・向き「縦」・拡大縮小「100%（または用紙に合わせる）」にしてください。
          </span>
          {message && (
            <p
              role="status"
              className={`w-full rounded-lg px-3 py-2 text-xs ${
                message.ok ? "bg-brand/10 text-brand" : "bg-seal/10 text-seal"
              }`}
            >
              {message.text}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 pb-6 lg:px-8 print:p-0">
        <div className="jobseeker-sheet mx-auto max-w-[190mm] bg-white text-black">
          <div className="mb-2 flex items-end justify-between">
            <h2 className="text-[15pt] font-black">求職票</h2>
            {/* 作成年月日は求職の受付年月日（この日に作る書類のため） */}
            <p className="text-[8pt]">作成年月日: {worker.acceptedOn || "—"}</p>
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
                <Cell>{F(worker.jobseekerNo, (v) => set("jobseekerNo", v))}</Cell>
                <Head>受付年月日</Head>
                <Cell>{F(worker.acceptedOn, (v) => set("acceptedOn", v), "date")}</Cell>
              </tr>
              <tr>
                <Head>有効期間</Head>
                <Cell>{F(worker.validUntil, (v) => set("validUntil", v), "date")}</Cell>
                <Head>職業紹介事業者</Head>
                <Cell className="font-bold">{JOBSEEKER_AGENT_NAME}</Cell>
              </tr>

              <Band>求職者</Band>
              <tr>
                <Head>フリガナ</Head>
                <Cell colSpan={3}>{F(worker.kana, (v) => set("kana", v))}</Cell>
              </tr>
              <tr>
                <Head>氏名</Head>
                <Cell colSpan={3} className="text-[11pt] font-bold">
                  {F(worker.name, (v) => set("name", v))}
                </Cell>
              </tr>
              <tr>
                <Head>生年月日（年齢）</Head>
                <Cell>
                  <span className="flex items-center gap-1">
                    {F(worker.birth, (v) => set("birth", v), "date")}
                    <span className="shrink-0">{age && `（${age}歳）`}</span>
                  </span>
                </Cell>
                <Head>性別</Head>
                <Cell>{F(worker.gender, (v) => set("gender", v))}</Cell>
              </tr>
              <tr>
                <Head>国籍</Head>
                <Cell>{F(worker.nationality, (v) => set("nationality", v))}</Cell>
                <Head>電話番号</Head>
                <Cell>{F(extras.phone, (v) => setExtra("phone", v))}</Cell>
              </tr>
              <tr>
                <Head>住所（日本）</Head>
                <Cell colSpan={3}>{F(worker.address, (v) => set("address", v))}</Cell>
              </tr>
              <tr>
                <Head>住所（本国）</Head>
                <Cell colSpan={3}>{F(worker.homeAddress, (v) => set("homeAddress", v))}</Cell>
              </tr>

              <Band>現在所持している在留資格</Band>
              <tr>
                <Head>在留資格</Head>
                <Cell>{F(worker.residenceStatus, (v) => set("residenceStatus", v))}</Cell>
                <Head>在留期間</Head>
                <Cell>{F(worker.residencePeriod, (v) => set("residencePeriod", v))}</Cell>
              </tr>
              <tr>
                <Head>在留期限</Head>
                <Cell>{F(worker.residenceExpiry, (v) => set("residenceExpiry", v), "date")}</Cell>
                <Head>在留カード番号</Head>
                <Cell>{F(worker.residenceCardNo, (v) => set("residenceCardNo", v))}</Cell>
              </tr>
              <tr>
                <Head>旅券番号</Head>
                <Cell>{F(worker.passportNo, (v) => set("passportNo", v))}</Cell>
                <Head>旅券有効期限</Head>
                <Cell>{F(worker.passportExpiry, (v) => set("passportExpiry", v), "date")}</Cell>
              </tr>

              <Band>希望する仕事</Band>
              <tr>
                <Head>希望職種</Head>
                <Cell>{F(worker.field, (v) => set("field", v))}</Cell>
                <Head>希望勤務地</Head>
                <Cell>
                  {F(extras.desired_location, (v) => setExtra("desired_location", v))}
                </Cell>
              </tr>
              <tr>
                <Head>希望賃金</Head>
                <Cell>{F(extras.desired_wage, (v) => setExtra("desired_wage", v))}</Cell>
                <Head>就業できる時期</Head>
                <Cell>{F(extras.available_from, (v) => setExtra("available_from", v))}</Cell>
              </tr>
              <tr>
                <Head>その他の希望</Head>
                <Cell colSpan={3}>{F(extras.other_wish, (v) => setExtra("other_wish", v))}</Cell>
              </tr>
            </tbody>
          </table>

          <table className="mt-2 w-full table-fixed border-collapse text-[8.5pt] leading-tight">
            <colgroup>
              <col style={{ width: "30%" }} />
              <col style={{ width: "70%" }} />
            </colgroup>
            <tbody>
              <Band colSpan={2}>資格・試験</Band>
              {shownCerts.map((c, i) => (
                <tr key={`${c.label}-${i}`}>
                  <Head>{c.label || " "}</Head>
                  <Cell>{c.value}</Cell>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="mt-2 w-full table-fixed border-collapse text-[8.5pt] leading-tight">
            <colgroup>
              <col style={{ width: "28%" }} />
              <col style={{ width: "36%" }} />
              <col style={{ width: "36%" }} />
            </colgroup>
            <tbody>
              <Band colSpan={3}>職歴</Band>
              <tr>
                <Head>期間</Head>
                <Head>勤務先</Head>
                <Head>仕事内容</Head>
              </tr>
              {jobs.map((j, i) => (
                <tr key={i}>
                  <Cell>
                    {canEdit ? (
                      <span className="flex items-center gap-0.5">
                        <input
                          type="date"
                          value={j.start}
                          onChange={(e) => setJob(i, { start: e.target.value })}
                          className={`${FIELD} date-small`}
                        />
                        <span className="shrink-0">〜</span>
                        <input
                          type="date"
                          value={j.end}
                          onChange={(e) => setJob(i, { end: e.target.value })}
                          className={`${FIELD} date-small`}
                        />
                      </span>
                    ) : (
                      `${j.start} 〜 ${j.end || "現在"}`
                    )}
                  </Cell>
                  <Cell>{F(j.org, (v) => setJob(i, { org: v }))}</Cell>
                  <Cell>
                    <span className="flex items-center gap-1">
                      {F(j.role, (v) => setJob(i, { role: v }))}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => removeJob(i)}
                          aria-label="この職歴を消す"
                          className="shrink-0 text-gray-400 hover:text-red-700 print:hidden"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </span>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
          {canEdit && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 print:hidden">
              <button
                type="button"
                onClick={addJob}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-400 px-2.5 py-1 text-[8pt] font-bold text-gray-600"
              >
                <Plus size={12} />
                職歴を追加
              </button>
              <button
                type="button"
                onClick={resetFromWorker}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-400 px-2.5 py-1 text-[8pt] font-bold text-gray-600"
              >
                <RotateCcw size={12} />
                外国人詳細の内容を入れ直す
              </button>
              <span className="text-[8pt] text-gray-500">
                ここで直した内容は求職票だけに残ります（外国人詳細は変わりません）。
              </span>
            </div>
          )}

          <table className="mt-2 w-full table-fixed border-collapse text-[8.5pt] leading-tight">
            <colgroup>
              <col style={{ width: "16%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "34%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "17%" }} />
            </colgroup>
            <tbody>
              <Band colSpan={5}>紹介の記録（求職管理簿と同じ内容）</Band>
              <tr>
                <Head>紹介年月日</Head>
                <Head>求人受理番号</Head>
                <Head>求人者の氏名又は名称</Head>
                <Head>採否結果</Head>
                <Head>採用年月日</Head>
              </tr>
              {shownReferrals.map((r, i) => (
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
        </div>
      </div>
    </>
  );
}
