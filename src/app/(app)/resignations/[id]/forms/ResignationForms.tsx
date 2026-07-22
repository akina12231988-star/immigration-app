"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, Download, ExternalLink, FileSpreadsheet, FileText } from "lucide-react";
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
  FORM_TEMPLATE_PATHS,
  INTENTION_OPTIONS_34,
  MEASURE_OPTIONS_34,
  type EndReason312Code,
  type FormFillData,
  defaultEndReason312,
  endReasonOptions312,
  fill312,
  fill34,
  fill511,
  genderMark,
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
  const [businessCategory, setBusinessCategory] = useState(resignation.businessCategory);
  const [orgPhone, setOrgPhone] = useState(resignation.orgContact);
  const [orgStaff, setOrgStaff] = useState("");
  const [contactStatus, setContactStatus] = useState<string>(CONTACT_STATUSES_34[0].value);
  const [intention, setIntention] = useState<string>("活動継続の意思なし（転職希望）");
  const [measure, setMeasure] = useState<string>("転職支援実施予定");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 委託契約をしていた登録支援機関の情報は毎回同じなのでブラウザに保存して再利用する
  const supportOrg = useSyncExternalStore(
    subscribeSupportOrg,
    getSupportOrgSnapshot,
    getSupportOrgServerSnapshot,
  );
  const setSupport = (patch: Partial<SupportOrgInfo>) =>
    saveSupportOrg({ ...supportOrg, ...patch });

  const fillData: FormFillData = useMemo(
    () => ({
      kind: resignation.kind,
      workerName: worker.name,
      gender: worker.gender,
      birth: worker.birth,
      nationality: worker.nationality,
      address: worker.address,
      residenceCardNo: worker.residenceCardNo,
      field: worker.field,
      businessCategory,
      leavingOn: resignation.leavingOn,
      reason: reasonText.trim(),
      endReason,
      supportRegNo: supportOrg.regNo,
      supportName: supportOrg.name,
      supportAddress: supportOrg.address,
      orgName: resignation.orgName,
      orgAddress: resignation.orgAddress,
      orgPhone,
      orgStaff,
      contactStatus,
      intention,
      measure,
      reportOn,
    }),
    [
      resignation,
      worker,
      businessCategory,
      reasonText,
      endReason,
      supportOrg,
      orgPhone,
      orgStaff,
      contactStatus,
      intention,
      measure,
      reportOn,
    ],
  );

  const download = async (
    key: "form312" | "form34" | "form511",
  ) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(FORM_TEMPLATE_PATHS[key]);
      if (!res.ok) throw new Error(`テンプレートを取得できませんでした（${res.status}）`);
      const buf = await res.arrayBuffer();
      let bytes: Uint8Array;
      let fileName: string;
      if (key === "form312") {
        bytes = await fill312(buf, fillData);
        fileName = `参考様式第3-1-2号_${worker.name}.xlsx`;
      } else if (key === "form34") {
        bytes = await fill34(buf, fillData);
        fileName = `参考様式第3-4号_${worker.name}.xlsx`;
      } else {
        bytes = await fill511(buf, fillData);
        fileName = `参考様式第5-11号_${worker.name}.docx`;
      }
      const mime =
        key === "form511"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
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

  const mark = genderMark(worker.gender);
  const reasonOptions = endReasonOptions312(resignation.kind);

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-4 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground md:-mx-8 lg:px-8">
        <Link
          href="/resignations"
          aria-label="戻る"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-brand-foreground/10"
        >
          <ArrowLeft size={20} />
        </Link>
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

      {/* 転記される外国人情報の確認 */}
      <Card className="p-4">
        <p className="mb-2 text-sm font-bold">届出の対象者（外国人情報から転記）</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm md:grid-cols-3">
          <Fact label="氏名（ローマ字）" value={worker.name} />
          <Fact label="性別" value={mark || "未設定（様式で選択）"} warn={!mark} />
          <Fact label="生年月日" value={jpDate(worker.birth)} warn={!worker.birth} />
          <Fact label="国籍・地域" value={worker.nationality} warn={!worker.nationality} />
          <Fact label="住居地" value={worker.address} warn={!worker.address} />
          <Fact
            label="在留カード番号"
            value={worker.residenceCardNo}
            warn={worker.residenceCardNo.replace(/\s/g, "").length !== 12}
          />
          <Fact label="特定産業分野" value={worker.field} warn={!worker.field} />
        </dl>
        <p className="mt-2 text-[11px] text-muted">
          間違いがある場合は外国人情報を修正してから作成してください。
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
            <span className="text-xs font-bold text-muted">業務区分</span>
            <input
              value={businessCategory}
              onChange={(e) => setBusinessCategory(e.target.value)}
              placeholder="例: 耕種農業全般"
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
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">
              理由（その他の括弧内{isCompany ? "・3-4号の事案の概要（全角20文字以内）" : ""}）
            </span>
            <input
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder={isCompany ? "例: 経営悪化により事業所を閉鎖" : "例: 家庭の事情により帰国"}
              className={INPUT}
            />
          </label>
        </div>
        {isCompany && reasonText.trim().length > 20 && (
          <p className="text-[11px] font-bold text-seal">
            3-4号の「事案の概要」は全角20文字以内です（現在{reasonText.trim().length}文字）。
          </p>
        )}
      </Card>

      {/* 届出機関（退職元）と登録支援機関 */}
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-sm font-bold">届出機関（退職元の特定技能所属機関）</p>
        <dl className="grid grid-cols-1 gap-x-3 gap-y-1.5 text-sm sm:grid-cols-2">
          <Fact label="氏名又は名称" value={resignation.orgName} warn={!resignation.orgName} />
          <Fact label="住所" value={resignation.orgAddress} warn={!resignation.orgAddress} />
        </dl>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      <Download size={16} className="shrink-0 text-muted" />
      {busy && <span className="text-xs text-muted">作成中…</span>}
    </button>
  );
}
