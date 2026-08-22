"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Copy } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import {
  computePlanDates,
  planDatesText,
  recommendedApplyDate,
  recommendedContractDate,
  recommendedDocDate,
} from "@/lib/support-plan-dates";

// 特定技能 支援計画書 日付計算（HTML版ツールの移植）。
// 申請人・所属機関・TODO番号と、ステップカレンダーで選んだ日付から
// 各書類の日付を自動算出する。あっせん有りの採用は、求職管理簿の
// 求人申込日・求職申込日・面接日・採用日もカレンダーに表示する。

const STEP_LABELS = ["雇用開始日", "申請予定日", "雇用契約日", "書類作成日", "健診受診日"];

interface RecruitMark {
  date: string; // YYYY-MM-DD
  label: string; // 求人申込日 など
}

const ymdOf = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const fmtSlash = (ymd: string | null) => (ymd ? ymd.replaceAll("-", "/") : "―");

export function PlanDatesClient({
  initialName,
  initialOrg,
  initialTodo,
  workerId,
}: {
  initialName: string;
  initialOrg: string;
  initialTodo: string;
  workerId: string;
}) {
  const [name, setName] = useState(initialName);
  const [org, setOrg] = useState(initialOrg);
  const [todo, setTodo] = useState(initialTodo);
  const [isLegal, setIsLegal] = useState(false); // 既定は個人（1年）

  const [step, setStep] = useState(0);
  // 各ステップの選択日（YYYY-MM-DD）: 雇用開始日 / 申請予定日 / 雇用契約日 / 書類作成日 / 健診受診日
  const [selected, setSelected] = useState<(string | null)[]>([null, null, null, null, null]);
  const [skipped, setSkipped] = useState<boolean[]>([false, false, false, false, false]);
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [copied, setCopied] = useState(false);

  // あっせん有りのとき: 求職管理簿から求人申込日・求職申込日・面接日・採用日を出す
  const [recruitMarks, setRecruitMarks] = useState<RecruitMark[]>([]);
  useEffect(() => {
    if (!workerId) return;
    void createClient()
      .from("job_applications")
      .select("applied_on, interview_on, result_on, result, organizations(name), job_postings(received_on)")
      .eq("worker_id", workerId)
      .order("applied_on", { ascending: false })
      .then(({ data }) => {
        const rows =
          (data as unknown as {
            applied_on: string;
            interview_on: string | null;
            result_on: string | null;
            result: string;
            organizations: { name: string } | null;
            job_postings: { received_on: string | null } | null;
          }[]) ?? [];
        const marks: RecruitMark[] = [];
        for (const r of rows) {
          const org = r.organizations?.name ?? "";
          if (r.job_postings?.received_on)
            marks.push({ date: r.job_postings.received_on, label: `求人申込日（${org}）` });
          marks.push({ date: r.applied_on, label: `求職申込日（${org}）` });
          if (r.interview_on) marks.push({ date: r.interview_on, label: `面接日（${org}）` });
          if (r.result_on)
            marks.push({ date: r.result_on, label: `${r.result === "採用" ? "採用日" : r.result}（${org}）` });
        }
        setRecruitMarks(marks);
      });
  }, [workerId]);

  const [es, ap, ci, di, hi] = selected;

  // ステップごとの選択ルール（HTML版と同じ）
  const disabledFn = (ymd: string): boolean => {
    switch (step) {
      case 1:
        return es ? ymd >= es : false;
      case 2: {
        const limit = ap ?? es;
        return limit ? ymd >= limit : false;
      }
      case 3: {
        const min = ci ? computeAdd(ci, 1) : null;
        const max = ap ? computeAdd(ap, -1) : es ? computeAdd(es, -1) : null;
        if (min && ymd < min) return true;
        if (max && ymd > max) return true;
        return false;
      }
      default:
        return false;
    }
  };
  const recommendedYmd = useMemo((): string | null => {
    switch (step) {
      case 1:
        return es ? recommendedApplyDate(es) : null;
      case 2:
        return es || ap ? recommendedContractDate(ap, es ?? ap ?? "") : null;
      case 3:
        return es ? recommendedDocDate(ap, es) : null;
      default:
        return null;
    }
  }, [step, es, ap]);

  const result = useMemo(
    () => (es ? computePlanDates({ employStart: es, applyDate: ap, contractDate: ci, docDate: di, healthDate: hi, isLegal }) : null),
    [es, ap, ci, di, hi, isLegal],
  );

  const select = (ymd: string) => {
    if (disabledFn(ymd)) return;
    setSelected((prev) => prev.map((v, i) => (i === step ? ymd : v)));
    setSkipped((prev) => prev.map((v, i) => (i === step ? false : v)));
    if (step < 4) setStep(step + 1);
  };
  const skip = () => {
    setSelected((prev) => prev.map((v, i) => (i === step ? null : v)));
    setSkipped((prev) => prev.map((v, i) => (i === step ? true : v)));
    if (step < 4) setStep(step + 1);
  };

  // ガイド文（HTML版と同じ内容）
  const guide = (() => {
    switch (step) {
      case 0:
        return (
          <>
            <b>雇用開始日</b>を選んでください。選んだ日付より前の日付のみ、以降のステップで選択できます。
          </>
        );
      case 1:
        return (
          <>
            <b>申請予定日</b>（入管への申請日）を選んでください。雇用開始日の<b>1ヶ月前</b>頃を推奨します。
            {recommendedYmd && <Rec date={recommendedYmd} />}
          </>
        );
      case 2:
        return (
          <>
            <b>雇用契約日</b>を選んでください。申請予定日の<b>1週間以上前</b>にして、事前ガイダンスの日程を確保しましょう。
            {recommendedYmd && <Rec date={recommendedYmd} />}
          </>
        );
      case 3: {
        const from = ci ? computeAdd(ci, 3) : null;
        const to = ap ? computeAdd(ap, -1) : es ? computeAdd(es, -3) : null;
        return (
          <>
            <b>書類作成日</b>を選んでください。雇用契約日の後、事前ガイダンスを挟んで<b>申請予定日の前日まで</b>に設定します。
            {from && to && (
              <>
                <br />目安：<Rec date={`${fmtSlash(from)} 〜 ${fmtSlash(to)}`} raw />
              </>
            )}
          </>
        );
      }
      default:
        return (
          <>
            <b>健康診断の受診日</b>が決まっていれば選んでください。未受診・未定の場合は「スキップ」してください。受診日をもとに署名日を自動調整します。
          </>
        );
    }
  })();

  // カレンダーの月グリッド
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayYmd = ymdOf(today.getFullYear(), today.getMonth(), today.getDate());
  const markMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of recruitMarks) m.set(r.date, [...(m.get(r.date) ?? []), r.label]);
    return m;
  }, [recruitMarks]);

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(planDatesText({ name, org, todo }, result, ap));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
        <CalendarDays size={14} className="mt-0.5 shrink-0" />
        申請者情報と雇用開始日を入力すると、支援計画書など各書類の日付を自動算出します。あっせん有りの採用は、求職管理簿の求人申込日・求職申込日・面接日・採用日もカレンダーに表示されます。
      </p>

      {/* 申請者情報 */}
      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">申請人の名前</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="NGUYEN VAN A" className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">所属機関</span>
          <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="例: 國崎青果" className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm" />
          <span className="flex gap-3 text-xs font-bold">
            <label className="flex items-center gap-1">
              <input type="radio" checked={isLegal} onChange={() => setIsLegal(true)} className="accent-brand" />
              法人（2年）
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={!isLegal} onChange={() => setIsLegal(false)} className="accent-brand" />
              個人（1年）
            </label>
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">TODO番号</span>
          <input value={todo} onChange={(e) => setTodo(e.target.value)} placeholder="例: 812" className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm" />
        </label>
      </Card>

      {/* ステップカレンダー */}
      <Card className="overflow-hidden p-0">
        <div className="flex overflow-x-auto border-b border-border">
          {STEP_LABELS.map((label, i) => {
            const active = step === i;
            const done = !!selected[i];
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStep(i)}
                className={`min-w-[90px] flex-1 border-r border-border/60 px-1 py-2 text-center text-[10px] font-bold last:border-r-0 ${
                  active ? "bg-brand/10 text-brand" : done ? "bg-status-reported-bg/50 text-status-reported-fg" : "text-muted"
                }`}
              >
                <span className="block text-base font-black">{i + 1}</span>
                {label}
                <span className="mt-0.5 block text-[9px] font-semibold">
                  {selected[i] ? fmtSlash(selected[i]) : skipped[i] ? "スキップ" : "未選択"}
                  {done && " ✓"}
                </span>
              </button>
            );
          })}
        </div>
        <div className="p-4">
          <div className="mb-3 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-xs leading-relaxed">
            {guide}
          </div>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => (calMonth === 0 ? (setCalMonth(11), setCalYear(calYear - 1)) : setCalMonth(calMonth - 1))} className="rounded-lg border border-border px-3 py-1.5 text-sm">
              ←
            </button>
            <span className="text-sm font-bold">{calYear}年{calMonth + 1}月</span>
            <button type="button" onClick={() => (calMonth === 11 ? (setCalMonth(0), setCalYear(calYear + 1)) : setCalMonth(calMonth + 1))} className="rounded-lg border border-border px-3 py-1.5 text-sm">
              →
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {["日", "月", "火", "水", "木", "金", "土"].map((d, i) => (
              <div key={d} className={`pb-1 text-center text-[10px] font-bold ${i === 0 ? "text-seal" : i === 6 ? "text-brand" : "text-muted"}`}>
                {d}
              </div>
            ))}
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`e${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const d = i + 1;
              const ymd = ymdOf(calYear, calMonth, d);
              const dow = (firstDay + i) % 7;
              const disabled = disabledFn(ymd);
              const sel = selected[step] === ymd;
              const rec = !disabled && recommendedYmd === ymd;
              const marks = markMap.get(ymd) ?? [];
              return (
                <button
                  key={d}
                  type="button"
                  disabled={disabled}
                  onClick={() => select(ymd)}
                  title={marks.join(" / ")}
                  className={`relative flex aspect-square items-center justify-center rounded-full text-[13px] transition ${
                    disabled
                      ? "cursor-not-allowed text-border"
                      : sel
                        ? "bg-brand font-bold text-brand-foreground"
                        : rec
                          ? "bg-status-notice-bg font-bold text-status-notice-fg"
                          : dow === 0
                            ? "text-seal hover:bg-brand/10"
                            : dow === 6
                              ? "text-brand hover:bg-brand/10"
                              : "hover:bg-brand/10"
                  }`}
                >
                  {d}
                  {ymd === todayYmd && !sel && (
                    <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brand" />
                  )}
                  {marks.length > 0 && (
                    <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-seal" />
                  )}
                </button>
              );
            })}
          </div>
          {/* あっせん有り: 求人への採用の流れの日付 */}
          {recruitMarks.length > 0 && (
            <div className="mt-3 rounded-lg bg-background p-2 text-[11px] text-muted">
              <p className="mb-1 font-bold">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-seal align-middle" />
                求人への採用の流れ（求職管理簿から）
              </p>
              {recruitMarks.map((m, i) => (
                <p key={i} className="tabular-nums">{fmtSlash(m.date)}　{m.label}</p>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)} className="flex-1 rounded-lg border border-border py-2 text-sm font-bold text-muted">
                ← 戻る
              </button>
            )}
            {step > 0 && (
              <button type="button" onClick={skip} className="flex-1 rounded-lg bg-brand py-2 text-sm font-bold text-brand-foreground">
                スキップ →
              </button>
            )}
          </div>
        </div>
      </Card>

      {result && result.errors.length > 0 && (
        <p className="rounded-lg bg-seal/10 px-3 py-2 text-xs font-bold text-seal">
          ⚠️ {result.errors.join(" / ")}
        </p>
      )}

      {/* 算出結果 */}
      {!result ? (
        <Card className="p-8 text-center text-sm text-muted">雇用開始日を選んでください</Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {(name || org || todo) && (
            <div className="flex flex-wrap items-center gap-3 bg-brand px-4 py-2 text-xs text-brand-foreground">
              <span><span className="mr-1 opacity-70">申請人</span><b>{name || "—"}</b></span>
              <span><span className="mr-1 opacity-70">所属</span><b>{org || "—"}</b></span>
              {todo && <span className="ml-auto rounded-full bg-brand-foreground/20 px-2.5 py-0.5 font-bold">TODO {todo}</span>}
            </div>
          )}
          <table className="w-full text-[13px]">
            <tbody>
              <SectionRow title="▼ 書類作成・契約" />
              {ap && <ResultRow badge="入力" label="申請予定日（入管）" date={ap} note="入力値" />}
              <ResultRow badge="確定" label="雇用条件書の作成日" sub="参考様式1-6号" date={result.cond} note="雇用契約日よりも前の日付" />
              <ResultRow badge={result.conEstimated ? "推定" : "入力"} label="雇用契約日" sub="参考様式1-6号 / 支援計画書" date={result.con} note={result.conEstimated ? "雇用開始日の14日前（推定）" : "入力値"} />
              <ResultRow badge="確定" label="登録支援機関 支援委託契約日" sub="参考様式1-25号" date={result.con} note={`雇用契約日から5年間（〜 ${fmtSlash(result.scEnd)} まで）`} />
              <ResultRow badge={result.docEstimated ? "推定" : "入力"} label="書類作成日（支援計画書）" sub="参考様式1-17号 / 全様式共通" date={result.doc} note={result.docEstimated ? (ap ? "申請予定日の1日前（推定）" : "雇用開始日の3日前（推定）") : "入力値"} />
              <SectionRow title="▼ 雇用・支援実施" />
              <ResultRow badge="確定" label="雇用開始日" sub="参考様式1-6号 / 支援計画書" date={result.es} note="雇用契約期間の初日" />
              <ResultRow badge="確定" label={`雇用終了日（${result.eeYears}年後）`} sub="参考様式1-6号 / 支援計画書" date={result.eeEnd} note={`契約期間${result.eeYears}年の場合`} />
              <ResultRow badge="推定" label="事前ガイダンス実施日" sub="参考様式1-17号" date={result.guid} note="雇用契約日〜書類作成日の間（中間値・要調整）" />
              <ResultRow badge="確定" label="生活オリエンテーション実施日" sub="参考様式1-17号" date={result.orient} note="雇用開始から2週間後" />
              <ResultRow
                badge={result.signBasis === "health" ? "入力" : "推定"}
                label="署名日"
                sub="参考様式1-17号 / 全様式共通"
                date={result.sign}
                note={
                  result.signBasis === "health"
                    ? `健康診断受診日（${fmtSlash(hi)}）以降`
                    : result.signBasis === "mid"
                      ? "書類作成日〜申請予定日の中間（推定）"
                      : "書類作成日の翌日（推定）"
                }
              />
            </tbody>
          </table>
          <div className="p-3">
            <button type="button" onClick={() => void copy()} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-sm font-bold text-brand-foreground">
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "コピーしました" : "テキストをコピー"}
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

function computeAdd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function Rec({ date, raw = false }: { date: string; raw?: boolean }) {
  return (
    <span className="ml-1.5 inline-block rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold text-brand-foreground">
      推奨: {raw ? date : date.replaceAll("-", "/")}
    </span>
  );
}

function SectionRow({ title }: { title: string }) {
  return (
    <tr>
      <td colSpan={3} className="bg-background px-4 pb-1 pt-2 text-[10px] font-bold tracking-wider text-muted">
        {title}
      </td>
    </tr>
  );
}

function ResultRow({
  badge,
  label,
  sub,
  date,
  note,
}: {
  badge: "確定" | "推定" | "入力";
  label: string;
  sub?: string;
  date: string;
  note: string;
}) {
  const badgeCls =
    badge === "確定"
      ? "bg-brand/10 text-brand"
      : badge === "推定"
        ? "bg-status-notice-bg text-status-notice-fg"
        : "bg-status-reported-bg text-status-reported-fg";
  return (
    <tr className="border-b border-border/60">
      <td className="w-[46%] px-4 py-2.5 font-bold">
        <span className={`mr-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold ${badgeCls}`}>{badge}</span>
        {label}
        {sub && <span className="block text-[10px] font-normal text-muted">{sub}</span>}
      </td>
      <td className="w-[26%] px-2 py-2.5 font-bold tabular-nums">{fmtSlash2(date)}</td>
      <td className="px-3 py-2.5 text-[11px] leading-snug text-muted">{note}</td>
    </tr>
  );
}

function fmtSlash2(ymd: string): string {
  return ymd.replaceAll("-", "/");
}
