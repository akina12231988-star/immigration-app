"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { BackButton } from "@/components/BackButton";
import { Download, ExternalLink, FileSpreadsheet, FileText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { todayStr } from "@/lib/application-alerts";
import {
  FORM_312,
  FORM_34,
  FORM_511,
  type SupportOrgInfo,
  getSupportOrgServerSnapshot,
  getSupportOrgSnapshot,
  jpDate,
  saveSupportOrg,
  subscribeSupportOrg,
} from "@/lib/resignation";
import {
  CONTACT_STATUSES_34,
  FORM_INDUSTRY_CATEGORIES,
  INTENTION_OPTIONS_34,
  MEASURE_OPTIONS_34,
  type EndReason312Code,
  type FormFillData,
  categoriesForField,
  defaultEndReason312,
  endReasonOptions312,
  genderMark,
  matchFormField,
} from "@/lib/resignation-forms";
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
  orgCorporateNo: string;
  businessCategory: string;
}

interface FormsWorker {
  name: string;
  kana: string;
  gender: string;
  birth: string | null;
  nationality: string;
  address: string;
  residenceCardNo: string;
  field: string;
}

const INPUT =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

// 退職記録を公式の参考様式ファイル（Excel/Word）へ転記してダウンロードする画面。
// 生成はサーバー側（/api/resignation-forms）で行う。
// 会社都合: 3-1-2号・3-4号・5-11号 / 自己都合: 3-1-2号のみ。
export function ResignationForms({
  resignation,
  worker,
}: {
  resignation: FormsResignation;
  worker: FormsWorker;
}) {
  const isCompany = resignation.kind === "会社都合";
  const [reportOn, setReportOn] = useState(todayStr());
  const [endReason, setEndReason] = useState<EndReason312Code>(defaultEndReason312(resignation.kind));
  const [reasonText, setReasonText] = useState(resignation.reason);
  const [caseSummary, setCaseSummary] = useState(resignation.reason);
  const [gender, setGender] = useState(genderMark(worker.gender));
  const [address, setAddress] = useState(worker.address);
  const [field, setField] = useState(() => matchFormField(worker.field));
  const [category, setCategory] = useState(() => {
    const matched = matchFormField(worker.field);
    const cats = categoriesForField(matched);
    if (cats.length === 1) return cats[0];
    return cats.find((c) => resignation.businessCategory.includes(c) || worker.field.includes(c)) ?? "";
  });
  const [orgPhone, setOrgPhone] = useState(resignation.orgContact);
  const [orgStaff, setOrgStaff] = useState("");
  const [corporateNo, setCorporateNo] = useState(resignation.orgCorporateNo);
  const [contactStatus, setContactStatus] = useState<string>(CONTACT_STATUSES_34[0].value);
  const [intention, setIntention] = useState<string>("活動継続の意思なし（転職希望）");
  const [measure, setMeasure] = useState<string>("転職支援実施予定");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // その他（05/11）を選んだときだけ「その他の理由」を記入する
  const needsOtherReason = endReason === "05" || endReason === "11";

  // 委託契約をしていた登録支援機関の情報は毎回同じなのでブラウザに保存して再利用する
  const supportOrg = useSyncExternalStore(
    subscribeSupportOrg,
    getSupportOrgSnapshot,
    getSupportOrgServerSnapshot,
  );
  const setSupport = (patch: Partial<SupportOrgInfo>) =>
    saveSupportOrg({ ...supportOrg, ...patch });

  const categories = categoriesForField(field);

  const fillData: FormFillData = useMemo(
    () => ({
      kind: resignation.kind,
      workerName: worker.name,
      gender,
      birth: worker.birth,
      nationality: worker.nationality,
      address,
      residenceCardNo: worker.residenceCardNo,
      field,
      businessCategory: category,
      leavingOn: resignation.leavingOn,
      reason: needsOtherReason ? reasonText.trim() : "",
      caseSummary: caseSummary.trim(),
      endReason,
      supportRegNo: supportOrg.regNo,
      supportName: supportOrg.name,
      supportAddress: supportOrg.address,
      orgName: resignation.orgName,
      orgAddress: resignation.orgAddress,
      orgPhone,
      orgStaff,
      orgCorporateNo: corporateNo,
      contactStatus,
      intention,
      measure,
      reportOn,
    }),
    [
      resignation,
      worker,
      gender,
      address,
      field,
      category,
      reasonText,
      caseSummary,
      needsOtherReason,
      endReason,
      supportOrg,
      orgPhone,
      orgStaff,
      corporateNo,
      contactStatus,
      intention,
      measure,
      reportOn,
    ],
  );

  const download = async (key: "form312" | "form34" | "form511") => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/resignation-forms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ form: key, data: fillData }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `様式の生成に失敗しました（${res.status}）`);
      }
      const blob = await res.blob();
      // ファイル名は Content-Disposition の filename*（UTF-8）から取得
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
      const fileName = m
        ? decodeURIComponent(m[1])
        : `${key === "form511" ? "参考様式第5-11号" : key === "form34" ? "参考様式第3-4号" : "参考様式第3-1-2号"}_${worker.name}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  const downloadAll = async () => {
    await download("form312");
    if (isCompany) {
      await download("form34");
      await download("form511");
    }
  };

  const reasonOptions = endReasonOptions312(resignation.kind);

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-4 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground md:-mx-8 lg:px-8">
        <BackButton fallbackHref="/resignations" />
        <h1 className="flex-1 text-lg font-bold">
          随時届出の作成（{resignation.kind}）
        </h1>
      </div>

      <p className="text-xs leading-relaxed text-muted">
        {worker.name} さん（退職日 {jpDate(resignation.leavingOn)}）の退職記録を公式の参考様式ファイルに転記してダウンロードします。
        作成後はExcel/Wordで開いて内容を確認してください。最新の様式は
        <a
          href={MOJ_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mx-1 inline-flex items-center gap-0.5 font-bold text-brand"
        >
          法務省のページ
          <ExternalLink size={11} />
        </a>
        で確認できます。
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* 転記される外国人情報の確認・補完 */}
      <Card className="p-4">
        <p className="mb-2 text-sm font-bold">届出の対象者（外国人情報から転記）</p>
        <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm md:grid-cols-3">
          <Fact label="氏名（ローマ字）" value={worker.name} />
          <Fact label="生年月日" value={jpDate(worker.birth)} warn={!worker.birth} />
          <Fact label="国籍・地域" value={worker.nationality} warn={!worker.nationality} />
          <Fact
            label="在留カード番号"
            value={worker.residenceCardNo}
            warn={worker.residenceCardNo.replace(/\s/g, "").length !== 12}
          />
        </dl>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">性別</span>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as "男" | "女" | "")}
              className={INPUT}
            >
              <option value="">未設定（様式で手書き）</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-bold text-muted">住居地</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="例: 熊本県八代市◯◯町1-2-3"
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">特定産業分野</span>
            <select
              value={field}
              onChange={(e) => {
                const next = e.target.value;
                setField(next);
                const cats = categoriesForField(next);
                setCategory(cats.length === 1 ? cats[0] : "");
              }}
              className={INPUT}
            >
              <option value="">選択してください</option>
              {FORM_INDUSTRY_CATEGORIES.map((entry) => (
                <option key={entry.field} value={entry.field}>
                  {entry.field}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-bold text-muted">業務区分（分野を選ぶと絞り込まれます）</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={!field}
              className={`${INPUT} disabled:opacity-40`}
            >
              <option value="">{field ? "選択してください" : "先に特定産業分野を選択"}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          性別・住居地はここで補完できます（外国人情報に間違いがある場合は外国人情報も修正してください）。
        </p>
      </Card>

      {/* 届出内容の入力 */}
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-sm font-bold">届出内容</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">作成年月日（届出書に記載）</span>
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
              onChange={(e) => setEndReason(e.target.value as EndReason312Code)}
              className={INPUT}
            >
              {reasonOptions.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {needsOtherReason && (
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-bold text-muted">その他の理由（括弧内に記入されます）</span>
              <input
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder={isCompany ? "例: 経営悪化により事業所を閉鎖" : "例: 家庭の事情により帰国"}
                className={INPUT}
              />
            </label>
          )}
          {isCompany && (
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-bold text-muted">事案の概要（3-4号・全角20文字以内）</span>
              <input
                value={caseSummary}
                onChange={(e) => setCaseSummary(e.target.value)}
                placeholder="例: 経営悪化により事業所を閉鎖"
                className={INPUT}
              />
              {caseSummary.trim().length > 20 && (
                <span className="text-[11px] font-bold text-seal">
                  全角20文字以内です（現在{caseSummary.trim().length}文字）。
                </span>
              )}
            </label>
          )}
        </div>
      </Card>

      {/* 届出機関（退職元）と登録支援機関 */}
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-sm font-bold">届出機関（退職元の特定技能所属機関）</p>
        <dl className="grid grid-cols-1 gap-x-3 gap-y-1.5 text-sm sm:grid-cols-2">
          <Fact label="氏名又は名称" value={resignation.orgName} warn={!resignation.orgName} />
          <Fact label="住所" value={resignation.orgAddress} warn={!resignation.orgAddress} />
        </dl>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">法人番号（13桁・法人でない場合は空欄）</span>
            <input
              value={corporateNo}
              onChange={(e) => setCorporateNo(e.target.value)}
              placeholder="1234567890123"
              inputMode="numeric"
              maxLength={13}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">担当者</span>
            <input
              value={orgStaff}
              onChange={(e) => setOrgStaff(e.target.value)}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">電話番号</span>
            <input
              value={orgPhone}
              onChange={(e) => setOrgPhone(e.target.value)}
              className={INPUT}
            />
          </label>
        </div>
        <p className="text-[11px] text-muted">
          法人番号は会社・機関マスタに登録しておくと自動で入ります（管理者メニュー →
          会社・機関マスタ）。
        </p>

        <p className="mt-1 text-sm font-bold">委託契約をしていた登録支援機関（毎回同じ・この端末に保存）</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">登録番号</span>
            <input
              value={supportOrg.regNo}
              onChange={(e) => setSupport({ regNo: e.target.value })}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">氏名又は名称</span>
            <input
              value={supportOrg.name}
              onChange={(e) => setSupport({ name: e.target.value })}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-bold text-muted">住所</span>
            <input
              value={supportOrg.address}
              onChange={(e) => setSupport({ address: e.target.value })}
              className={INPUT}
            />
          </label>
        </div>
      </Card>

      {/* 3-4号の選択欄（会社都合のみ） */}
      {isCompany && (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-sm font-bold">3-4号（受入れ困難に係る届出書）の選択欄</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">③ 外国人の現状</span>
              <select
                value={contactStatus}
                onChange={(e) => setContactStatus(e.target.value)}
                className={INPUT}
              >
                {CONTACT_STATUSES_34.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.value}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">④Ａ 活動継続の意思</span>
              <select
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
                className={INPUT}
              >
                {INTENTION_OPTIONS_34.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.value}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">④Ｂ 措置内容</span>
              <select
                value={measure}
                onChange={(e) => setMeasure(e.target.value)}
                className={INPUT}
              >
                {MEASURE_OPTIONS_34.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.value}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Card>
      )}

      {/* ダウンロード */}
      <Card className="flex flex-col gap-2 p-4">
        <p className="text-sm font-bold">様式のダウンロード</p>
        <FormButton
          icon={<FileSpreadsheet size={18} />}
          label={`${FORM_312}（Excel）特定技能雇用契約の終了に係る届出書`}
          busy={busy === "form312"}
          onClick={() => download("form312")}
        />
        {isCompany && (
          <>
            <FormButton
              icon={<FileSpreadsheet size={18} />}
              label={`${FORM_34}（Excel）受入れ困難に係る届出書`}
              busy={busy === "form34"}
              onClick={() => download("form34")}
            />
            <FormButton
              icon={<FileText size={18} />}
              label={`${FORM_511}（Word）経緯に係る説明書 ※経緯の本文はWordで記入`}
              busy={busy === "form511"}
              onClick={() => download("form511")}
            />
          </>
        )}
        {isCompany && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={downloadAll}
            className="mt-1 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-base font-bold text-brand-foreground transition hover:bg-brand-strong active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
          >
            <Download size={18} />
            3様式をまとめてダウンロード
          </button>
        )}
      </Card>
    </div>
  );
}

function Fact({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex flex-col border-b border-border pb-1">
      <dt className="text-[10px] font-bold text-muted">{label}</dt>
      <dd className={`text-sm font-bold ${warn ? "text-seal" : ""}`}>{value || "未入力"}</dd>
    </div>
  );
}

function FormButton({
  icon,
  label,
  busy,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="flex min-h-[52px] items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm font-bold transition hover:bg-background active:scale-[0.99] disabled:opacity-40"
    >
      <span className="text-brand">{icon}</span>
      <span className="flex-1">{label}</span>
      {busy ? (
        <span className="shrink-0 text-xs text-muted">作成中…</span>
      ) : (
        <Download size={16} className="shrink-0 text-muted" />
      )}
    </button>
  );
}
