"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BackButton } from "@/components/BackButton";
import { Download, ExternalLink, FileSpreadsheet, FileText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { updateOrganization } from "@/lib/supabase/queries/organizations";
import { updateResignation } from "@/lib/supabase/queries/resignations";
import type { ResignationStatus } from "@/types/db";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import {
  FORM_14,
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
import { saveOrShareFile } from "@/lib/file-save";

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
  organizationId: string | null;
  orgCorporateNo: string;
  businessCategory: string;
  orgReportStaff: string; // 所属機関に登録した定期報告書・随時報告書の担当者名
  status: ResignationStatus; // 今の進み具合（0086）
}

interface FormsWorker {
  id: string;
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
// 本人が提出する「契約機関に関する届出（契約の終了）」（1の4）はどちらの区分でも作成する。
// 作成年月日は署名してもらった日を手書きするため、どの様式にも記載しない。
export function ResignationForms({
  resignation,
  worker,
  canEdit,
}: {
  resignation: FormsResignation;
  worker: FormsWorker;
  canEdit: boolean;
}) {
  const isCompany = resignation.kind === "会社都合";
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
  // 担当者は所属機関の「定期報告書・随時報告書の担当者名」を初期値にする（画面で修正可）
  const [orgStaff, setOrgStaff] = useState(resignation.orgReportStaff);
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
    ],
  );

  // 画面で訂正・補完した内容を外国人情報・所属機関情報にも反映する（ダウンロード時に保存）。
  // 空欄への上書きはしない（値を入力・変更したものだけ書き戻す）。
  const lastSyncedRef = useRef<string>("");
  const syncMasters = async () => {
    if (!canEdit) return;
    const supabase = createClient();

    const workerPatch: { gender?: string; address?: string; field?: string } = {};
    if (gender && gender !== genderMark(worker.gender)) workerPatch.gender = gender;
    if (address.trim() && address.trim() !== worker.address) workerPatch.address = address.trim();
    const composedField = field ? (category ? `${field}・${category}` : field) : "";
    if (composedField && composedField !== worker.field) workerPatch.field = composedField;

    const orgPatch: { corporate_no?: string; business_category?: string } = {};
    const corpDigits = corporateNo.replace(/\D/g, "");
    if (corpDigits && corpDigits !== resignation.orgCorporateNo) orgPatch.corporate_no = corpDigits;
    if (category && category !== resignation.businessCategory) orgPatch.business_category = category;

    const phone = orgPhone.trim();
    const contactChanged = phone !== "" && phone !== resignation.orgContact;

    // 担当者名は所属機関の「定期報告書・随時報告書の担当者名」へ書き戻す
    const staff = orgStaff.trim();
    const staffChanged = staff !== "" && staff !== resignation.orgReportStaff;

    const snapshot = JSON.stringify([
      workerPatch,
      orgPatch,
      contactChanged ? phone : "",
      staffChanged ? staff : "",
    ]);
    if (snapshot === lastSyncedRef.current) return;

    if (Object.keys(workerPatch).length > 0) await updateWorker(supabase, worker.id, workerPatch);
    if (resignation.organizationId && Object.keys(orgPatch).length > 0) {
      await updateOrganization(supabase, resignation.organizationId, orgPatch);
    }
    if (resignation.organizationId && staffChanged) {
      // intake（JSONB）内の項目のため、現在の内容を読み出してから担当者名だけ更新する
      const { data } = await supabase
        .from("organizations")
        .select("intake")
        .eq("id", resignation.organizationId)
        .maybeSingle();
      const intake = normalizeOrganizationIntake((data as { intake?: unknown } | null)?.intake);
      await updateOrganization(supabase, resignation.organizationId, {
        intake: { ...intake, report_staff: staff },
      });
    }
    if (contactChanged) {
      await updateResignation(supabase, resignation.id, { org_contact: phone });
    }
    lastSyncedRef.current = snapshot;
  };

  // 様式を作った＝会社・本人へ署名をお願いする段階。退職一覧のタブを進める。
  // 一度進めたら（署名依頼中・投函完了）そのままにする
  const [signatureMarked, setSignatureMarked] = useState(resignation.status !== "準備中");
  const markSignatureRequested = async () => {
    if (signatureMarked) return;
    setSignatureMarked(true);
    try {
      await updateResignation(createClient(), resignation.id, {
        status: "署名依頼中",
        forms_downloaded_at: new Date().toISOString(),
      });
    } catch {
      // 0086 が未適用でも様式の作成そのものは続けられるようにする
      setSignatureMarked(false);
    }
  };

  const download = async (key: "form312" | "form34" | "form511" | "form14") => {
    setBusy(key);
    setError(null);
    try {
      // 訂正した外国人情報・所属機関情報を先にマスタへ反映する（失敗しても作成は続ける）
      await syncMasters().catch((err) => {
        setError(
          `外国人情報・所属機関情報への反映に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
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
      const fallbackLabel =
        key === "form511"
          ? "参考様式第5-11号"
          : key === "form34"
            ? "参考様式第3-4号"
            : key === "form14"
              ? "契約機関に関する届出"
              : "参考様式第3-1-2号";
      const fileName = m ? decodeURIComponent(m[1]) : `${fallbackLabel}_${worker.name}`;
      // スマホは共有シートにPDFそのものを渡す（iOS Safari は download 属性が効かない）
      await saveOrShareFile(blob, fileName, "application/pdf");

      // 様式を作った＝会社・本人へ署名をお願いする段階。退職一覧のタブを進める
      await markSignatureRequested();
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
    await download("form14");
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
          性別・住居地・分野はここで訂正・補完できます。訂正・入力した内容は、様式のダウンロード時に外国人情報にも反映されます。
        </p>
      </Card>

      {/* 届出内容の入力 */}
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-sm font-bold">届出内容</p>
        <p className="text-[11px] text-muted">
          作成年月日・届出年月日は署名してもらった日を手書きするため、様式には記載されません。
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <span className="text-[11px] leading-relaxed text-muted">
              所属機関の「定期報告書・随時報告書の担当者名」が初期値です。修正するとダウンロード時に所属機関の情報にも反映されます。
            </span>
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
          会社・機関マスタ）。ここで訂正・入力した法人番号・業務区分は、ダウンロード時に会社・機関マスタにも反映されます。
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
        <FormButton
          icon={<FileSpreadsheet size={18} />}
          label={`${FORM_14}（Excel）契約機関に関する届出（契約の終了） ※本人が提出`}
          busy={busy === "form14"}
          onClick={() => download("form14")}
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={downloadAll}
          className="mt-1 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-base font-bold text-brand-foreground transition hover:bg-brand-strong active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
        >
          <Download size={18} />
          {isCompany ? "4様式をまとめてダウンロード" : "2様式をまとめてダウンロード"}
        </button>
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
