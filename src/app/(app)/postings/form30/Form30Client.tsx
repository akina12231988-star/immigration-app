"use client";

import { useMemo, useState } from "react";
import { FileText, Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { buildDocx } from "@/lib/docx-export";
import { downloadBlob } from "@/lib/xlsx-export";
import {
  FORM30_MAX_ROWS,
  buildForm30Candidates,
  buildForm30Doc,
  defaultSelection,
  isEligible,
  oneYearBefore,
  type Form30Candidate,
  type Form30Fee,
  type Form30PayStatus,
} from "@/lib/form30";

// 様式30に載せる求人1件分（画面へ渡す形）
export interface Form30Row {
  postingId: string;
  organizationId: string | null;
  received_on: string;
  org_name: string;
  org_address: string;
  job_type: string;
  note: string;
  referred_dates: string[];
}

// 入金の状況の見せ方。載せてよいのは「入金済み」だけ
const STATUS_STYLE: Record<Form30PayStatus, string> = {
  入金済み: "bg-brand/10 text-brand",
  "請求済み・未入金": "bg-seal/10 text-seal",
  未請求: "bg-seal/10 text-seal",
  台帳に無し: "bg-seal/10 text-seal",
};

export function Form30Client({
  postings,
  fees,
  orgReferredDates,
  today,
  agencyName: initialAgencyName,
}: {
  postings: Form30Row[];
  fees: Form30Fee[];
  orgReferredDates: Record<string, string[]>;
  today: string;
  agencyName: string;
}) {
  // 訪問予定日。ここから過去1年間の実績を見る
  const [baseDate, setBaseDate] = useState(today);
  const [agencyName, setAgencyName] = useState(initialAgencyName);
  const [busy, setBusy] = useState(false);

  const candidates = useMemo(
    () => buildForm30Candidates(postings, fees, baseDate, orgReferredDates),
    [postings, fees, baseDate, orgReferredDates],
  );

  // 選んだ求人。訪問予定日を変えたら入金済みのものを選び直す
  const [selected, setSelected] = useState<string[]>(() =>
    defaultSelection(buildForm30Candidates(postings, fees, today, orgReferredDates)),
  );
  const [touched, setTouched] = useState(false);
  const effectiveSelected = useMemo(() => {
    const ids = new Set(candidates.map((c) => c.postingId));
    const base = touched ? selected : defaultSelection(candidates);
    return base.filter((id) => ids.has(id));
  }, [candidates, selected, touched]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const base = touched ? prev : defaultSelection(candidates);
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
    setTouched(true);
  };

  const selectedRows = useMemo(
    () =>
      candidates.filter((c) => effectiveSelected.includes(c.postingId)),
    [candidates, effectiveSelected],
  );

  const eligibleCount = candidates.filter(isEligible).length;
  const overflow = selectedRows.length > FORM30_MAX_ROWS;
  const notPaidSelected = selectedRows.filter((c) => !isEligible(c));

  const exportDocx = async () => {
    setBusy(true);
    try {
      const blob = await buildDocx(buildForm30Doc(selectedRows, { agencyName, baseDate }));
      downloadBlob(blob, `様式30_求人者リスト_${baseDate}.docx`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* A4横で刷る。印刷のときは様式のプレビューだけを出す */}
      <style>{"@media print{@page{size:A4 landscape;margin:15mm}}"}</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref="/postings" />
          <h1 className="flex-1 text-lg font-bold">様式30 求人者リスト</h1>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4 lg:px-8">
          <p className="text-xs leading-relaxed text-muted">
            訪問予定日から過去1年間に紹介実績のある求人を出しています。
            様式に載せるのは<b>手数料管理簿で入金済みの企業</b>だけなので、
            入金済みのものに最初からチェックが入っています（{FORM30_MAX_ROWS}件まで）。
            選び直したら「Wordで出力」または「印刷」してください。
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">訪問予定日</span>
              <input
                type="date"
                value={baseDate}
                onChange={(e) => {
                  setBaseDate(e.target.value);
                  setTouched(false); // 期間が変わるので選び直す
                }}
                className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-bold text-muted">紹介事業所名称</span>
              <input
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </label>
          </div>
          <p className="-mt-2 text-[11px] text-muted">
            対象期間: {oneYearBefore(baseDate)} 〜 {baseDate}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void exportDocx()}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground disabled:opacity-50"
            >
              <FileText size={18} />
              {busy ? "作成中…" : "Wordで出力（.docx）"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-5 text-sm font-bold text-brand"
            >
              <Printer size={18} />
              印刷・PDF保存
            </button>
            <span className="text-xs text-muted">
              載せられる求人 {eligibleCount}件 ／ 選択中 {selectedRows.length}件
            </span>
          </div>

          {overflow && (
            <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
              様式に入るのは{FORM30_MAX_ROWS}件までです。今は{selectedRows.length}件選ばれているので、
              {selectedRows.length - FORM30_MAX_ROWS}件を外してください
              （このまま出力すると上から{FORM30_MAX_ROWS}件だけになります）。
            </p>
          )}
          {notPaidSelected.length > 0 && (
            <p role="alert" className="rounded-lg bg-status-notice-bg px-3 py-2 text-xs text-status-notice-fg">
              入金済みでない求人が{notPaidSelected.length}件選ばれています（
              {notPaidSelected.map((c) => c.org_name).join("・")}）。
              入金済みの企業だけを載せる場合は外してください。
            </p>
          )}

          {candidates.length === 0 ? (
            <p className="rounded-xl bg-background p-4 text-sm text-muted">
              この期間に紹介実績のある求人はありません。
              様式には「実績なし」と入れて提出します（そのまま出力できます）。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <th className="py-2 pr-2 font-bold">載せる</th>
                    <th className="py-2 pr-2 font-bold">入金の状況</th>
                    <th className="py-2 pr-2 font-bold">求人受付年月日</th>
                    <th className="py-2 pr-2 font-bold">求人事業所名</th>
                    <th className="py-2 pr-2 font-bold">所在地</th>
                    <th className="py-2 pr-2 font-bold">求人職種</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.postingId} className="border-b border-border/60 align-top">
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          aria-label={`${c.org_name} を様式に載せる`}
                          checked={effectiveSelected.includes(c.postingId)}
                          onChange={() => toggle(c.postingId)}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[c.payStatus]}`}
                        >
                          {c.payStatus}
                        </span>
                        {c.paidOn && (
                          <span className="block text-[10px] text-muted">入金 {c.paidOn}</span>
                        )}
                        {c.paidWorkers.length > 0 && (
                          <span className="block text-[10px] text-muted">
                            {c.paidWorkers.join("・")}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-2 tabular-nums">
                        {c.received_on}
                        {c.matchedBy === "会社" && (
                          <span className="block text-[10px] text-status-notice-fg">
                            求人票との紐付けなし（会社で判定）
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-2 font-bold">{c.org_name}</td>
                      <td className="py-2 pr-2 text-muted">{c.org_address}</td>
                      <td className="py-2 pr-2 text-muted">{c.job_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted">
            提出先: 熊本労働局需給調整事業室　kuma-jukyu@mhlw.go.jp
          </p>
        </div>
      </div>

      {/* 様式のプレビュー（そのまま印刷される） */}
      <div className="print-root px-4 pb-8 lg:px-8">
        <Form30Sheet rows={selectedRows} agencyName={agencyName} />
      </div>
    </>
  );
}

// 様式30の見た目（A4横）。Wordで出力するものと同じ並び
function Form30Sheet({
  rows,
  agencyName,
}: {
  rows: Form30Candidate[];
  agencyName: string;
}) {
  const shown = rows.slice(0, FORM30_MAX_ROWS);
  const blanks = Math.max(0, FORM30_MAX_ROWS - Math.max(shown.length, 1));
  return (
    <div className="mx-auto max-w-[267mm] border border-border bg-white p-4 text-black print:border-0 print:p-0">
      <p className="mb-2 flex flex-wrap justify-between gap-2 text-[13px] font-bold">
        <span>■求人者リスト（訪問予定日から過去１年間の実績）</span>
        <span>紹介事業所名称（　{agencyName}　）</span>
      </p>
      <table className="w-full table-fixed border-collapse text-[11px]">
        <thead>
          <tr>
            {[
              ["No.", "w-[5%]"],
              ["求人受付年月日", "w-[12%]"],
              ["求人事業所名又は求人者氏名", "w-[24%]"],
              ["所在地", "w-[29%]"],
              ["求人職種", "w-[13%]"],
              ["備考", "w-[17%]"],
            ].map(([label, w]) => (
              <th key={label} className={`${w} border border-black px-1 py-1 text-center font-bold`}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr>
              <td className="border border-black px-1 py-1 text-center">1</td>
              <td className="border border-black px-1 py-1 text-center">実績なし</td>
              <td className="border border-black px-1 py-1" />
              <td className="border border-black px-1 py-1" />
              <td className="border border-black px-1 py-1" />
              <td className="border border-black px-1 py-1" />
            </tr>
          ) : (
            shown.map((r, i) => (
              <tr key={r.postingId}>
                <td className="border border-black px-1 py-1 text-center tabular-nums">{i + 1}</td>
                <td className="border border-black px-1 py-1 text-center tabular-nums">
                  {r.received_on}
                </td>
                <td className="border border-black px-1 py-1">{r.org_name}</td>
                <td className="border border-black px-1 py-1">{r.org_address}</td>
                <td className="border border-black px-1 py-1">{r.job_type}</td>
                <td className="border border-black px-1 py-1">{r.note}</td>
              </tr>
            ))
          )}
          {Array.from({ length: blanks }, (_, i) => (
            <tr key={`blank-${i}`}>
              <td className="border border-black px-1 py-1 text-center tabular-nums">
                {Math.max(shown.length, 1) + i + 1}
              </td>
              <td className="border border-black px-1 py-1">&nbsp;</td>
              <td className="border border-black px-1 py-1" />
              <td className="border border-black px-1 py-1" />
              <td className="border border-black px-1 py-1" />
              <td className="border border-black px-1 py-1" />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px]">
        実績がない場合は「実績なし」と記入してください。　　提出先：熊本労働局需給調整事業室　kuma-jukyu@mhlw.go.jp
      </p>
      <p className="mt-1 text-right text-[10px]">（様式30）</p>
    </div>
  );
}
