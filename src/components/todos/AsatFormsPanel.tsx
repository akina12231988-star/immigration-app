"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2 } from "lucide-react";
import { saveOrShareFile } from "@/lib/file-save";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { formatYmdJa } from "@/lib/support-plan-dates";
import { sumHistoryDays, todayStr, toYMD } from "@/lib/ssw/calc";
import {
  ASAT_CATEGORIES,
  ASAT_EMPLOYMENT_TYPES,
  ASAT_SEIYAKUSHO_TEMPLATE,
  ASAT_SHOMEISHO_TEMPLATE,
  asatCategoryOf,
  asatFileName,
  asatIdentityIssues,
  asatSeiyakushoTokens,
  asatShomeishoTokens,
  fillAsatDocx,
  type AsatCategory,
  type AsatEmploymentType,
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
  const [error, setError] = useState<string | null>(null);

  const person = { name: worker.name ?? "", birth: worker.birth, nationality: worker.nationality ?? "" };
  const issues = asatIdentityIssues(person, worker.passport_mrz, todayStr());
  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");
  const mrzMatched = errors.length === 0 && warns.length === 0;

  // 就業期間: チェックした職歴のいちばん古い開始日から。終了日が空（在籍中）か証明日以降なら「現在に至る」
  const starts = histories.map((h) => h.start_date).filter(Boolean).sort();
  const periodStart = starts[0] ?? null;
  const ongoing = histories.some((h) => !h.end_date || h.end_date >= certDate);
  const lastEnd = histories.map((h) => h.end_date ?? "").filter(Boolean).sort().at(-1) ?? null;
  const periodEnd = ongoing ? null : lastEnd;
  const total = toYMD(sumHistoryDays(histories.map((h) => ({ start: h.start_date, end: h.end_date })), certDate));

  const intake = normalizeOrganizationIntake(org?.intake);
  const orgMissing = !org ? ["所属機関"] : [!org.name && "名称", !org.address && "住所", !org.contact && "電話番号", !intake.rep_name && "代表者"].filter(Boolean);

  const canMake = errors.length === 0 && (mrzMatched || confirmed);

  const make = async (kind: "証明書" | "誓約書") => {
    if (!canMake) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === "証明書" && !periodStart) throw new Error("就業期間に使う職歴がありません。「職歴」で職歴を登録・チェックしてください。");
      const res = await fetch(kind === "証明書" ? ASAT_SHOMEISHO_TEMPLATE : ASAT_SEIYAKUSHO_TEMPLATE);
      if (!res.ok) throw new Error(`様式のテンプレートを読み込めませんでした（${res.status}）`);
      const template = await res.arrayBuffer();
      const tokens =
        kind === "証明書"
          ? asatShomeishoTokens({
              ...person,
              certDate,
              orgName: org?.name ?? "",
              orgAddress: org?.address ?? "",
              orgTel: org?.contact ?? "",
              orgRep: intake.rep_name,
              periodStart,
              periodEnd,
              totalYears: total.y,
              totalMonths: total.m,
              employment,
              category,
            })
          : asatSeiyakushoTokens(person);
      const bytes = await fillAsatDocx(template, tokens);
      await saveOrShareFile(new Blob([bytes as BlobPart], { type: DOCX_MIME }), asatFileName(kind, person.name), DOCX_MIME);
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
          {periodStart ? (
            <b>
              計 {total.y}年{total.m}か月（{formatYmdJa(periodStart)}～{periodEnd ? formatYmdJa(periodEnd) : "現在に至る"}）
            </b>
          ) : (
            <span className="font-bold text-seal">職歴がありません（「職歴」で登録・チェックしてください）</span>
          )}
          <span className="ml-1 text-muted">… 「職歴」でチェックした{histories.length}件から。証明日は職歴の「書類作成日」と同じです</span>
        </p>
        <p className="mt-0.5">
          <span className="text-muted">実務経験を証明する者: </span>
          {org ? `${org.name}／${org.address}／${org.contact}／${intake.rep_name}` : ""}
          {orgMissing.length > 0 && <span className="ml-1 font-bold text-seal">（{orgMissing.join("・")}が未登録）</span>}
        </p>
        <p className="mt-0.5 text-muted">
          管理者・監督者としての就業期間・業務内容は空欄のまま出します（該当するときはWordで書き足してください）。作成責任者の署名は自筆です。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <MakeButton label="様式第1号 実務経験に係る証明書（Word）" busy={busy === "証明書"} disabled={!canMake || busy !== null} onClick={() => void make("証明書")} />
        <MakeButton label="様式第2号 誓約書（Word）" busy={busy === "誓約書"} disabled={!canMake || busy !== null} onClick={() => void make("誓約書")} />
      </div>
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

function MakeButton({ label, busy, disabled, onClick }: { label: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-40"
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
      {label}
      {!busy && <Download size={13} />}
    </button>
  );
}
