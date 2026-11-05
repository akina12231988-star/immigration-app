"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Eye, FileText, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { saveOrShareFile } from "@/lib/file-save";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { formatYmdJa } from "@/lib/support-plan-dates";
import { todayStr } from "@/lib/ssw/calc";
import {
  ASAT_CATEGORIES,
  ASAT_EMPLOYMENT_TYPES,
  ASAT_SEIYAKUSHO_TEMPLATE,
  ASAT_SHOMEISHO_TEMPLATE,
  asatCategoryOf,
  asatFileName,
  asatIdentityIssues,
  asatPeriodsFromHistories,
  asatPeriodTokens,
  asatTotals,
  asatSeiyakushoTokens,
  asatShomeishoTokens,
  fillAsatDocx,
  type AsatCategory,
  type AsatEmploymentType,
  type AsatPeriod,
  type AsatShomeishoData,
} from "@/lib/asat-forms";
import type { Worker, WorkHistoryRow } from "@/types/db";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const INPUT = "min-h-[32px] rounded-lg border border-border bg-surface px-2 text-xs";

// ２号アプリケーションナンバーの申込で出す「実務経験に係る証明書（様式第1号）」「誓約書（様式第2号）」を
// 外国人詳細・所属機関・職歴（この申込の「職歴」でチェックした行）から Word で作る。
// 氏名・生年月日・国籍は間違えられないので、作る前に大きく出してパスポート（MRZ）と照合し、
// 食い違いがあれば作らせない。照合できない（MRZ未読み取り）ときは、見比べて確認したチェックを付けてから作る
export function AsatFormsPanel({
  worker,
  org,
  histories,
  certDate,
  setCertDate,
}: {
  worker: Worker;
  org: { name: string; address: string; contact: string; intake: unknown } | null;
  histories: WorkHistoryRow[]; // 職歴の欄でチェックが入っている行
  certDate: string; // 証明日（職歴の「書類作成日」と同じ）
  setCertDate: (v: string) => void;
}) {
  const [employment, setEmployment] = useState<AsatEmploymentType>("直接雇用");
  const [category, setCategory] = useState<AsatCategory>(() => asatCategoryOf(worker.field));
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"証明書" | "誓約書" | null>(null);
  // 発行ボタンで開くプレビュー。証明書は中身（就業期間など）をここで直してから作れる
  const [preview, setPreview] = useState<{ kind: "証明書"; draft: AsatShomeishoData } | { kind: "誓約書" } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const person = { name: worker.name ?? "", birth: worker.birth, nationality: worker.nationality ?? "" };
  const issues = asatIdentityIssues(person, worker.passport_mrz, todayStr());
  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");
  const mrzMatched = errors.length === 0 && warns.length === 0;

  // 就業期間: チェックした職歴を勤務先ごとの行にする（同じ勤務先が続けば1行）。
  // 終了日が空（在籍中）か証明日以降なら「現在に至る」
  const periods = asatPeriodsFromHistories(histories, certDate);
  const total = asatTotals(periods, certDate);

  const intake = normalizeOrganizationIntake(org?.intake);
  const orgMissing = !org ? ["所属機関"] : [!org.name && "名称", !org.address && "住所", !org.contact && "電話番号", !intake.rep_name && "代表者"].filter(Boolean);

  const canMake = errors.length === 0 && (mrzMatched || confirmed);

  // 画面の値から作った証明書の中身（プレビューの初期値）
  const initialDraft = (): AsatShomeishoData => ({
    ...person,
    certDate,
    orgName: org?.name ?? "",
    orgAddress: org?.address ?? "",
    orgTel: org?.contact ?? "",
    orgRep: intake.rep_name,
    periods,
    totalYears: total.years,
    totalMonths: total.months,
    mgrYears: total.mgrYears,
    mgrMonths: total.mgrMonths,
    mgrText: "",
    employment,
    category,
  });

  const openPreview = (kind: "証明書" | "誓約書") => {
    if (!canMake) return;
    setError(null);
    setPreview(kind === "証明書" ? { kind, draft: initialDraft() } : { kind });
  };

  // プレビューで確かめた内容で Word を作る（氏名・生年月日・国籍は外国人詳細の値のまま）
  const make = async (kind: "証明書" | "誓約書", draft?: AsatShomeishoData) => {
    if (!canMake) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === "証明書" && (!draft || draft.periods.length === 0 || draft.periods.some((p) => !p.start)))
        throw new Error("就業期間の始まりの日を入れてください（空の行は削除してください）。");
      if (kind === "証明書" && draft?.periods.some((p) => p.mgr && !p.mgrStart))
        throw new Error("管理者・監督者等としての就業期間の始まりの日を入れてください。");
      const res = await fetch(kind === "証明書" ? ASAT_SHOMEISHO_TEMPLATE : ASAT_SEIYAKUSHO_TEMPLATE);
      if (!res.ok) throw new Error(`様式のテンプレートを読み込めませんでした（${res.status}）`);
      const template = await res.arrayBuffer();
      const tokens = kind === "証明書" && draft ? asatShomeishoTokens({ ...draft, ...person }) : asatSeiyakushoTokens(person);
      const bytes =
        kind === "証明書" && draft
          ? await fillAsatDocx(template, tokens, draft.periods.map(asatPeriodTokens))
          : await fillAsatDocx(template, tokens);
      await saveOrShareFile(new Blob([bytes as BlobPart], { type: DOCX_MIME }), asatFileName(kind, person.name), DOCX_MIME);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2 text-[11px]">
      {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}

      {/* 氏名・生年月日・国籍（2つの書類の両方に入る）。大きく出して、パスポートとの照合結果を出す */}
      <div
        className={`rounded-lg border px-3 py-2 ${
          errors.length > 0 ? "border-seal/50 bg-seal/5" : mrzMatched ? "border-status-approved-fg/40 bg-status-approved-bg/40" : "border-amber-300 bg-amber-50 dark:bg-amber-950/30"
        }`}
      >
        <p className="mb-1 font-bold text-muted">書類に入る本人の情報（外国人詳細から。間違いがないか必ず確認）</p>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-3">
          <IdItem label="氏名（パスポートと同じアルファベット）" value={person.name} bad={errors.some((e) => e.field === "氏名")} />
          <IdItem label="生年月日" value={person.birth ? formatYmdJa(person.birth) : ""} bad={errors.some((e) => e.field === "生年月日")} />
          <IdItem label="国籍・地域" value={person.nationality} bad={errors.some((e) => e.field === "国籍")} />
        </dl>
        {errors.map((e) => (
          <p key={e.message} className="mt-1 flex items-start gap-1 font-bold text-seal">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            {e.field}: {e.message}
          </p>
        ))}
        {errors.length > 0 && (
          <p className="mt-1 text-seal">外国人詳細（またはパスポートのMRZ）を直してから作成してください。食い違いがあるあいだは作成できません。</p>
        )}
        {errors.length === 0 && mrzMatched && (
          <p className="mt-1 flex items-center gap-1 font-bold text-status-approved-fg">
            <CheckCircle2 size={12} />
            パスポート（MRZ）の氏名・生年月日・国籍と一致しています
          </p>
        )}
        {errors.length === 0 && !mrzMatched && (
          <>
            {warns.map((w) => (
              <p key={w.message} className="mt-1 flex items-start gap-1 text-amber-800 dark:text-amber-300">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                {w.message}
              </p>
            ))}
            <label className="mt-1 flex items-center gap-1.5 font-bold">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4" />
              パスポートと見比べて、氏名・生年月日・国籍が合っていることを確認しました
            </label>
          </>
        )}
      </div>

      {/* 証明書（様式第1号）だけに入る項目 */}
      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <p className="mb-1 font-bold text-muted">実務経験に係る証明書（様式第1号）に入る内容</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <label className="flex items-center gap-1">
            <span className="text-muted">証明日</span>
            <input type="date" value={certDate} onChange={(e) => e.target.value && setCertDate(e.target.value)} className={INPUT} />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted">雇用形態</span>
            <select value={employment} onChange={(e) => setEmployment(e.target.value as AsatEmploymentType)} className={INPUT}>
              {ASAT_EMPLOYMENT_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted">業務区分</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as AsatCategory)} className={INPUT}>
              {ASAT_CATEGORIES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-1.5">
          <span className="text-muted">就業期間: </span>
          {periods.length > 0 ? (
            <b>
              計 {total.years}年{total.months}か月（
              {periods
                .map((p) => `${p.start ? formatYmdJa(p.start) : ""}～${p.end ? formatYmdJa(p.end) : "現在に至る"}${p.org ? ` ${p.org}` : ""}`)
                .join("／")}
              ）
            </b>
          ) : (
            <span className="font-bold text-seal">職歴がありません（「職歴」で登録・チェックしてください）</span>
          )}
          <span className="ml-1 text-muted">
            … 「職歴」でチェックした{histories.length}件から（同じ勤務先が続くときは1行にまとめ、転職していれば勤務先ごとの行にします）。証明日は職歴の「書類作成日」と同じです
          </span>
        </p>
        <p className="mt-0.5">
          <span className="text-muted">実務経験を証明する者: </span>
          {org ? `${org.name}／${org.address}／${org.contact}／${intake.rep_name}` : ""}
          {orgMissing.length > 0 && <span className="ml-1 font-bold text-seal">（{orgMissing.join("・")}が未登録）</span>}
        </p>
        <p className="mt-0.5 text-muted">
          管理者・監督者等としての就業期間・業務内容は、発行のプレビューで入れられます。作成責任者の署名は自筆です。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <MakeButton label="様式第1号 実務経験に係る証明書を発行" disabled={!canMake || busy !== null} onClick={() => openPreview("証明書")} />
        <MakeButton label="様式第2号 誓約書を発行" disabled={!canMake || busy !== null} onClick={() => openPreview("誓約書")} />
      </div>
      <p className="text-muted">発行を押すと、書類のプレビューが開きます。就業期間などはプレビューで直してから Word を作れます。</p>

      {preview?.kind === "証明書" && (
        <Modal open title="様式第1号 実務経験に係る証明書（プレビュー）" wide onClose={() => setPreview(null)}>
          <ShomeishoPreview
            draft={preview.draft}
            onChange={(patch) => setPreview({ kind: "証明書", draft: { ...preview.draft, ...patch } })}
            onReset={() => setPreview({ kind: "証明書", draft: initialDraft() })}
          />
          {error && <p className="mt-2 rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
          <PreviewActions busy={busy === "証明書"} onCancel={() => setPreview(null)} onMake={() => void make("証明書", preview.draft)} />
        </Modal>
      )}
      {preview?.kind === "誓約書" && (
        <Modal open title="様式第2号 誓約書（プレビュー）" wide onClose={() => setPreview(null)}>
          <SeiyakushoPreview person={person} />
          {error && <p className="mt-2 rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
          <PreviewActions busy={busy === "誓約書"} onCancel={() => setPreview(null)} onMake={() => void make("誓約書")} />
        </Modal>
      )}
      <p className="text-muted">
        誓約書は「私＿＿は、」と国籍・地域・生年月日を入れて作ります。最後の「氏名：」の欄は本人の署名用に空けてあります。
      </p>
    </div>
  );
}

function IdItem({ label, value, bad }: { label: string; value: string; bad: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] text-muted">{label}</dt>
      <dd className={`text-sm font-black ${bad || !value ? "text-seal" : ""}`}>{value || "未登録"}</dd>
    </div>
  );
}

function MakeButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-40"
    >
      <Eye size={14} />
      {label}
    </button>
  );
}

function PreviewActions({ busy, onCancel, onMake }: { busy: boolean; onCancel: () => void; onMake: () => void }) {
  return (
    <div className="sticky bottom-0 mt-3 flex flex-wrap justify-end gap-2 border-t border-border bg-surface pt-3">
      <button type="button" onClick={onCancel} className="min-h-[44px] rounded-xl border border-border px-4 text-sm font-bold text-muted">
        閉じる
      </button>
      <button
        type="button"
        onClick={onMake}
        disabled={busy}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
        この内容で Word を作成
        {!busy && <Download size={15} />}
      </button>
    </div>
  );
}

// プレビューの入力欄（紙の記入欄に重ねたような見た目）
const FIELD_BASE = "min-h-[32px] rounded border border-brand/50 bg-brand/5 px-1.5 text-[13px] focus:border-brand focus:outline-none";
const FIELD = `${FIELD_BASE} w-full`;
const DATE = `${FIELD_BASE} w-40 shrink-0`;
const NUM = "min-h-[32px] w-14 rounded border border-brand/40 bg-brand/5 px-1 text-center text-[13px] tabular-nums focus:border-brand focus:outline-none";

// 様式第1号のプレビュー。様式と同じ並びで出し、青い枠の欄はその場で直せる。
// 氏名・生年月日・国籍は外国人詳細の値のまま（ここでは直さない。間違いを防ぐため）
function ShomeishoPreview({
  draft,
  onChange,
  onReset,
}: {
  draft: AsatShomeishoData;
  onChange: (patch: Partial<AsatShomeishoData>) => void;
  onReset: () => void;
}) {
  // 行を変えたら合計（年・か月、うち管理者）も計算し直す
  const setPeriods = (periods: AsatPeriod[]) => {
    const t = asatTotals(periods, draft.certDate);
    onChange({ periods, totalYears: t.years, totalMonths: t.months, mgrYears: t.mgrYears, mgrMonths: t.mgrMonths });
  };
  const radio = <T extends string>(options: readonly T[], value: T, set: (v: T) => void, name: string) => (
    <div className="flex flex-wrap items-center justify-center gap-6">
      {options.map((o) => (
        <label key={o} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 ${value === o ? "border-2 border-black font-bold" : "border-2 border-transparent text-muted"}`}>
          <input type="radio" name={name} checked={value === o} onChange={() => set(o)} className="sr-only" />
          {o}
        </label>
      ))}
    </div>
  );
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted">
        青い枠の欄はここで直せます（直した内容はこの書類にだけ入り、外国人詳細・所属機関・職歴は変わりません）。氏名・生年月日・国籍は外国人詳細の値です。
        <button type="button" onClick={onReset} className="ml-2 font-bold text-brand underline">
          最初の値に戻す
        </button>
      </p>
      {/* 紙の見た目（A4縦の様式第1号） */}
      <div className="mx-auto max-w-[680px] rounded-lg border border-border bg-white p-5 text-[13px] leading-relaxed text-black shadow-sm dark:bg-white">
        <p className="text-[11px]">（様式第１号）</p>
        <p className="my-3 text-center font-bold">２号特定技能外国人に求められる実務経験に係る証明書</p>
        <p>一般社団法人全国農業会議所　会長　　　殿</p>
        <div className="mt-2 flex items-center justify-end gap-1 whitespace-nowrap">
          証明日
          <input type="date" value={draft.certDate} onChange={(e) => e.target.value && onChange({ certDate: e.target.value })} className={DATE} />
        </div>
        <div className="ml-auto mt-2 w-full max-w-[340px] space-y-1">
          <p>実務経験を証明する者（特定技能所属機関等）</p>
          <input value={draft.orgName} onChange={(e) => onChange({ orgName: e.target.value })} placeholder="名称（事業者名）" className={FIELD} />
          <input value={draft.orgAddress} onChange={(e) => onChange({ orgAddress: e.target.value })} placeholder="住所" className={FIELD} />
          <input value={draft.orgTel} onChange={(e) => onChange({ orgTel: e.target.value })} placeholder="電話番号" className={FIELD} />
          <input value={draft.orgRep} onChange={(e) => onChange({ orgRep: e.target.value })} placeholder="代表者（例: 代表 井上洋介）" className={FIELD} />
        </div>
        <p className="mt-3">下記の内容は事実であることを証明します。</p>
        <p>なお、本件について、全国農業会議所から照会があった場合には、適切に対応します。</p>
        <p className="my-1 text-center">記</p>
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            <tr>
              <td rowSpan={3} className="w-24 border border-black p-1.5 text-center">対象者</td>
              <td className="w-24 border border-black p-1.5">氏名</td>
              <td className="border border-black p-1.5 text-center font-bold">{draft.name}</td>
            </tr>
            <tr>
              <td className="border border-black p-1.5">生年月日</td>
              <td className="border border-black p-1.5 text-center font-bold">{draft.birth ? formatYmdJa(draft.birth) : ""}</td>
            </tr>
            <tr>
              <td className="border border-black p-1.5">国籍・地域</td>
              <td className="border border-black p-1.5 text-center font-bold">{draft.nationality}</td>
            </tr>
            <tr>
              <td className="border border-black p-1.5 text-center align-top">
                就業期間
                <span className="block text-[10px] text-muted">（うち管理者・監督者等としての就業期間）</span>
              </td>
              <td colSpan={2} className="border border-black p-1.5">
                <div className="flex flex-wrap items-center justify-center gap-1">
                  計
                  <input type="number" min={0} value={draft.totalYears} onChange={(e) => onChange({ totalYears: Math.max(0, Number(e.target.value) || 0) })} className={NUM} aria-label="年" />
                  年
                  <input type="number" min={0} max={11} value={draft.totalMonths} onChange={(e) => onChange({ totalMonths: Math.min(11, Math.max(0, Number(e.target.value) || 0)) })} className={NUM} aria-label="か月" />
                  か月
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
                  （うち
                  <input type="number" min={0} value={draft.mgrYears ?? ""} onChange={(e) => onChange({ mgrYears: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })} className={NUM} aria-label="うち 年" />
                  年
                  <input type="number" min={0} max={11} value={draft.mgrMonths ?? ""} onChange={(e) => onChange({ mgrMonths: e.target.value === "" ? null : Math.min(11, Math.max(0, Number(e.target.value) || 0)) })} className={NUM} aria-label="うち か月" />
                  か月）
                </div>
                <p className="mt-0.5 text-center text-[10px] text-muted">合計は下の行を変えると自動で計算し直します（数字は直接直すこともできます）</p>
              </td>
            </tr>
            {draft.periods.map((p, i) => (
              <tr key={i}>
                <td className="border border-black p-1.5 text-center text-[11px] text-muted">{draft.periods.length > 1 ? `勤務先 ${i + 1}` : ""}</td>
                <td colSpan={2} className="border border-black p-1.5">
                  <PeriodEditor
                    period={p}
                    certDate={draft.certDate}
                    onChange={(patch) => setPeriods(draft.periods.map((x, k) => (k === i ? { ...x, ...patch } : x)))}
                    onRemove={draft.periods.length > 1 ? () => setPeriods(draft.periods.filter((_, k) => k !== i)) : undefined}
                  />
                </td>
              </tr>
            ))}
            <tr>
              <td className="border border-black p-1.5" />
              <td colSpan={2} className="border border-black p-1.5">
                <button
                  type="button"
                  onClick={() => setPeriods([...draft.periods, { start: null, end: null, org: "", mgr: false, mgrStart: null, mgrEnd: null }])}
                  className="rounded border border-dashed border-brand px-2 py-1 text-[11px] font-bold text-brand"
                >
                  ＋ 勤務先（就業期間の行）を追加
                </button>
                <p className="mt-1.5 text-[10px] text-muted">（管理者・監督者等としての業務内容）※３</p>
                <input
                  value={draft.mgrText}
                  onChange={(e) => onChange({ mgrText: e.target.value })}
                  placeholder="例: 管理者として栽培管理を担当（該当なければ空欄）"
                  className={FIELD}
                  aria-label="管理者・監督者等としての業務内容"
                />
              </td>
            </tr>
            <tr>
              <td className="border border-black p-1.5 text-center">雇用形態</td>
              <td colSpan={2} className="border border-black p-1.5">
                {radio(ASAT_EMPLOYMENT_TYPES, draft.employment, (v) => onChange({ employment: v }), "asat-employment")}
              </td>
            </tr>
            <tr>
              <td className="border border-black p-1.5 text-center">業務区分</td>
              <td colSpan={2} className="border border-black p-1.5">
                {radio(ASAT_CATEGORIES, draft.category, (v) => onChange({ category: v }), "asat-category")}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-6 text-right">作成責任者（署名）＿＿＿＿＿＿＿＿＿</p>
      </div>
    </div>
  );
}

// 就業期間の1行（勤務先ごと）。1段目: 西暦 始まり～終わり（現在に至る）、
// 2段目: （管理者・監督者等としての就業期間）、3段目: 勤務先の名称
function PeriodEditor({
  period: p,
  certDate,
  onChange,
  onRemove,
}: {
  period: AsatPeriod;
  certDate: string;
  onChange: (patch: Partial<AsatPeriod>) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-center gap-1">
        西暦
        <input type="date" value={p.start ?? ""} onChange={(e) => onChange({ start: e.target.value || null })} className={DATE} aria-label="就業期間の始まり" />
        ～
        {p.end === null ? (
          <span className="font-bold">現在に至る</span>
        ) : (
          <input type="date" value={p.end} onChange={(e) => e.target.value && onChange({ end: e.target.value })} className={DATE} aria-label="就業期間の終わり" />
        )}
        <label className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted">
          <input type="checkbox" checked={p.end === null} onChange={(e) => onChange({ end: e.target.checked ? null : certDate })} className="h-4 w-4" />
          現在に至る
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1 text-[12px]">
        <label className="inline-flex items-center gap-1 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={p.mgr}
            onChange={(e) => onChange({ mgr: e.target.checked, mgrStart: e.target.checked ? (p.mgrStart ?? p.start) : p.mgrStart, mgrEnd: e.target.checked ? p.end : p.mgrEnd })}
            className="h-4 w-4"
          />
          管理者・監督者等の期間あり
        </label>
        {p.mgr ? (
          <>
            （
            <input type="date" value={p.mgrStart ?? ""} onChange={(e) => onChange({ mgrStart: e.target.value || null })} className={DATE} aria-label="管理者・監督者等としての就業期間の始まり" />
            ～
            {p.mgrEnd === null ? (
              <span className="font-bold">現在に至る</span>
            ) : (
              <input type="date" value={p.mgrEnd} onChange={(e) => e.target.value && onChange({ mgrEnd: e.target.value })} className={DATE} aria-label="管理者・監督者等としての就業期間の終わり" />
            )}
            ）
            <label className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted">
              <input type="checkbox" checked={p.mgrEnd === null} onChange={(e) => onChange({ mgrEnd: e.target.checked ? null : certDate })} className="h-4 w-4" />
              現在に至る
            </label>
          </>
        ) : (
          <span className="text-muted">（　　年　　月　　日～　　年　　月　　日）</span>
        )}
      </div>
      <div className="flex items-center justify-center gap-1">
        <input value={p.org} onChange={(e) => onChange({ org: e.target.value })} placeholder="勤務先の名称（例: 有限会社 國崎青果）" className={`${FIELD} max-w-[320px] text-center`} aria-label="勤務先の名称" />
        {onRemove && (
          <button type="button" onClick={onRemove} className="shrink-0 rounded border border-border px-2 py-1 text-[11px] text-seal">
            行を削除
          </button>
        )}
      </div>
    </div>
  );
}

// 様式第2号のプレビュー（本人の情報だけ。直すところは無い）
function SeiyakushoPreview({ person }: { person: { name: string; birth: string | null; nationality: string } }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted">氏名・国籍・生年月日は外国人詳細の値です。違っていたら外国人詳細で直してから作ってください。</p>
      <div className="mx-auto max-w-[680px] rounded-lg border border-border bg-white p-6 text-[13px] leading-loose text-black shadow-sm dark:bg-white">
        <p className="text-[11px]">（様式第２号）</p>
        <p className="my-3 text-center font-bold">誓約書</p>
        <p>一般社団法人全国農業会議所　会長　　　殿</p>
        <p className="mt-4">
          私 <span className="mx-1 border-b border-black px-6 font-bold">{person.name}</span> は、
        </p>
        <p className="mt-2">
          「２号特定技能外国人に求められる実務経験に係る証明書」に記載の私の実務経験について、事実と相違がある場合には、関係法令により罰せられるほか、在留資格が取り消される可能性があることを理解した上で、記載事項に相違がないことを誓約します。
        </p>
        <dl className="ml-auto mt-6 w-full max-w-[320px] space-y-1">
          <div className="flex gap-2">
            <dt className="w-24 shrink-0">国籍・地域：</dt>
            <dd className="font-bold">{person.nationality}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0">生年月日：</dt>
            <dd className="font-bold">西暦 {person.birth ? formatYmdJa(person.birth) : ""}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0">氏　　名：</dt>
            <dd className="text-muted">（本人が署名）</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
