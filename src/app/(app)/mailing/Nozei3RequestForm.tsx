"use client";

import { useState } from "react";
import { ExternalLink, FileText, Printer } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Combobox } from "@/components/ui/Combobox";
import { createClient } from "@/lib/supabase/client";
import { insertJudgmentRecord } from "@/lib/supabase/queries/tax-cert";
import { insertTaxOffice, updateTaxOffice } from "@/lib/supabase/queries/tax-office";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { formatDateJP, todayISO, type JudgmentRecord } from "@/lib/tax-cert";
import {
  autoMailingProgress,
  findTaxOfficeForAddress,
  isMyNumberFillable,
  MAILING_PROGRESS_OPTIONS,
  NOZEI3_DOC_META,
  NOZEI3_DOC_TITLE,
  taxOfficeMailingLines,
  type MailingProgress,
  type TaxOffice,
  type TaxOfficeInput,
} from "@/lib/tax-office";
import { nozei3SaveBlockers } from "@/lib/mailing-save-check";
import { dbErrorMessage } from "@/lib/errors";
import { SaveBlockers } from "@/components/mailing/SaveBlockers";
import { ProgressBadge, TrackingLink } from "@/components/mailing/MailingRecordSummary";
import { MailingFileAttachments } from "./MailingFileAttachments";
import { TAX_OFFICE_MIGRATION, TaxOfficeModal, sortTaxOffices } from "./TaxOfficeTab";
import { INPUT, LABEL, Pill, type MailingWorker } from "./ui";

// ---- 納税証明書その3（国税）の税務署への郵送請求 ----
// 課税・納税証明書（市区町村）とは別に、税務署に「納税証明書交付請求書」と委任状を郵送して取り寄せる。
// 請求書は外国人の登録内容を自動入力したPDF、委任状は様式のまま印刷して本人に署名してもらう。

// 添付の種別（郵送請求した書類・届いた証明書）
const NOZEI3_SENT_KIND = "郵送請求した書類";
const NOZEI3_RECEIVED_KIND = "届いた納税証明書";

// 委任状（様式のまま印刷）
export const NOZEI3_ININJO_URL = "/forms/nozei-ininjo.pdf";

// 自動入力した交付請求書を新しいタブで開く（印刷用）
export function nozei3FormUrl(workerId: string, taxOfficeId: string): string {
  const q = new URLSearchParams({ workerId, taxOfficeId });
  return `/api/nozei3-form?${q.toString()}`;
}

export interface Nozei3Values {
  taxOfficeId: string; // 投函先の税務署（空なら住所からの自動判定に任せる）
  postDate: string; // 投函日
  trackingNumber: string; // 追跡番号
  progress: MailingProgress; // 準備中 / 税務署からの郵送待ち / 完了
  receivedDate: string; // 証明書が届いた日
  note: string;
}

export function emptyNozei3Values(): Nozei3Values {
  return { taxOfficeId: "", postDate: "", trackingNumber: "", progress: "preparing", receivedDate: "", note: "" };
}

export function nozei3ValuesFromRecord(r: JudgmentRecord): Nozei3Values {
  return {
    taxOfficeId: r.taxOfficeId ?? "",
    postDate: r.postDate ?? "",
    trackingNumber: r.trackingNumber ?? "",
    progress: r.mailingProgress ?? "preparing",
    receivedDate: r.receivedDate ?? "",
    note: r.mailingNote ?? "",
  };
}

// フォーム入力から記録へ反映する項目一式（既存の受領方法の項目にも反映して一覧のフィルタと互換にする）
export function nozei3RecordPatch(
  v: Nozei3Values,
  office: TaxOffice | null,
  workerAddress: string,
): Partial<JudgmentRecord> {
  const progress = autoMailingProgress(v.progress, v.postDate, v.trackingNumber);
  return {
    requestKind: "nozei3",
    taxOfficeId: office?.id ?? "",
    taxOfficeName: office?.name ?? "",
    municipalityId: "",
    municipalityName: office?.name ?? "",
    workerAddress,
    postDate: v.postDate,
    trackingNumber: v.trackingNumber.trim(),
    mailingProgress: progress,
    receivedDate: progress === "done" ? v.receivedDate : "",
    mailingNote: v.note.trim(),
    requestMethod: "mail",
    mailRequestDate: v.postDate,
    recipientType: "agent",
    agentName: "",
    applicantType: "agent",
    moneyOrders: [],
    docs: [{ title: NOZEI3_DOC_TITLE, meta: NOZEI3_DOC_META, starred: false }],
  };
}

// 住所から判定した税務署と、手で選んだ税務署のどちらを使うか
export function effectiveTaxOffice(
  v: Nozei3Values,
  taxOffices: TaxOffice[],
  workerAddress: string,
): { office: TaxOffice | null; suggested: TaxOffice | null } {
  const suggested = findTaxOfficeForAddress(workerAddress, taxOffices);
  const picked = v.taxOfficeId ? (taxOffices.find((o) => o.id === v.taxOfficeId) ?? null) : null;
  return { office: picked ?? suggested, suggested };
}

/* ============================ 入力欄（新規・編集で共用） ============================ */
export function Nozei3Fields({
  v,
  set,
  worker,
  workerAddress,
  taxOffices,
  setTaxOffices,
  canEdit,
  showToast,
}: {
  v: Nozei3Values;
  set: (patch: Partial<Nozei3Values>) => void;
  worker: MailingWorker | null; // 請求書の自動入力の元（編集モーダルでは無いこともある）
  workerAddress: string;
  taxOffices: TaxOffice[];
  setTaxOffices: (o: TaxOffice[]) => void;
  canEdit: boolean;
  showToast: (m: string) => void;
}) {
  const { office, suggested } = effectiveTaxOffice(v, taxOffices, workerAddress);
  const [officeModal, setOfficeModal] = useState<"add" | "edit" | null>(null);
  const [officeBusy, setOfficeBusy] = useState(false);

  const saveOffice = async (form: TaxOfficeInput) => {
    setOfficeBusy(true);
    try {
      if (officeModal === "edit" && office) {
        const updated = await updateTaxOffice(createClient(), office.id, form);
        setTaxOffices(taxOffices.map((o) => (o.id === office.id ? updated : o)));
        showToast("税務署の情報を更新しました");
      } else {
        const created = await insertTaxOffice(createClient(), form);
        setTaxOffices([...taxOffices, created]);
        set({ taxOfficeId: created.id });
        showToast(`税務署マスタに「${created.name}」を追加しました`);
      }
      setOfficeModal(null);
    } catch (e) {
      showToast(dbErrorMessage(e, TAX_OFFICE_MIGRATION, "税務署の保存に失敗しました"));
    } finally {
      setOfficeBusy(false);
    }
  };

  const workerId = worker?.id ?? "";
  const kanaMissing = !!worker && !(worker.kana ?? "").trim();
  const myNumberMissing = !!worker && !isMyNumberFillable(worker.my_number ?? "");

  return (
    <div className="space-y-4">
      {/* 投函先の税務署 */}
      <div className="space-y-2">
        <span className={LABEL}>投函先の税務署（現在の住所を管轄する税務署）</span>
        <div className="rounded-xl bg-background p-3 text-xs leading-relaxed">
          {suggested ? (
            <p>
              住所から判定：<span className="text-sm font-bold text-brand">{suggested.name}</span>
            </p>
          ) : workerAddress ? (
            <p className="font-bold text-seal">
              住所「{workerAddress}」から管轄の税務署を判定できませんでした。下で選ぶか、税務署マスタの「管轄区域」に市区町村名を登録してください。
            </p>
          ) : (
            <p className="text-muted">外国人の現在の住所が入ると、管轄の税務署を自動で判定します。</p>
          )}
        </div>
        {taxOffices.length === 0 ? (
          <p className="rounded-xl bg-seal/10 p-3 text-xs font-bold text-seal">
            税務署マスタが未登録です。「＋ 税務署マスタに追加」か「税務署マスタ」タブで登録してください（{TAX_OFFICE_MIGRATION} を適用すると熊本県の税務署が入ります）。
          </p>
        ) : (
          <Combobox
            options={sortTaxOffices(taxOffices).map((o) => ({ id: o.id, label: o.name }))}
            value={office?.id ?? ""}
            onChange={(id) => set({ taxOfficeId: id })}
            placeholder="税務署名を入力して検索"
          />
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {v.taxOfficeId && suggested && v.taxOfficeId !== suggested.id && (
            <button type="button" onClick={() => set({ taxOfficeId: "" })} className="text-xs font-bold text-brand">
              住所からの自動判定（{suggested.name}）に戻す
            </button>
          )}
          {canEdit && (
            <button type="button" onClick={() => setOfficeModal("add")} className="text-xs font-bold text-brand">
              ＋ 税務署マスタに追加
            </button>
          )}
        </div>
        {office && (
          <div className="rounded-xl border border-border p-3 text-xs leading-relaxed">
            <p className="text-sm font-bold">{office.name}</p>
            {office.address ? (
              <>
                <p className="mt-0.5 font-bold text-muted">郵送の宛名</p>
                {taxOfficeMailingLines(office).map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </>
            ) : (
              <p className="mt-0.5 font-bold text-seal">
                所在地が未登録です。郵送の宛名に使うので、国税庁の案内で確認して税務署マスタに登録してください。
              </p>
            )}
            {office.phone && <p className="text-muted">TEL {office.phone}</p>}
            {office.note && <p className="text-muted">{office.note}</p>}
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {office.website_url && (
                <a href={office.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-brand underline">
                  <ExternalLink size={11} />
                  案内ページを開く
                </a>
              )}
              {canEdit && (
                <button type="button" onClick={() => setOfficeModal("edit")} className="font-bold text-brand">
                  税務署の情報を編集（所在地など）
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 送る書類 */}
      <div className="space-y-2 border-t border-dashed border-border pt-4">
        <span className={LABEL}>税務署に送る書類（印刷して郵送）</span>
        <div className="rounded-xl bg-background p-3 text-xs leading-relaxed">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <span className="font-bold">納税証明書交付請求書（その3）</span>
              ：外国人の住所・フリガナ・氏名・個人番号と税務署名を自動入力したPDFを作ります。
              収入印紙（手数料）を貼ってください。
            </li>
            <li>
              <span className="font-bold">委任状</span>：様式のまま印刷して、本人に住所・氏名を書いてもらいます（代理人欄も手書き）。
            </li>
            <li>本人確認書類の写し（在留カードなど）と、返信用封筒（切手を貼る）。</li>
          </ol>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            disabled={!workerId}
            onClick={() => window.open(nozei3FormUrl(workerId, office?.id ?? ""), "_blank", "noopener")}
          >
            <span className="inline-flex items-center gap-1.5">
              <FileText size={15} />
              交付請求書を作る（自動入力・印刷用）
            </span>
          </Button>
          <Button type="button" variant="secondary" onClick={() => window.open(NOZEI3_ININJO_URL, "_blank", "noopener")}>
            <span className="inline-flex items-center gap-1.5">
              <Printer size={15} />
              委任状を印刷する（様式のまま）
            </span>
          </Button>
        </div>
        {!workerId && (
          <p className="text-xs font-bold text-seal">上の「対象者情報」で外国人を選ぶと、交付請求書に自動入力できます。</p>
        )}
        {worker && (
          <div className="rounded-xl border border-border p-3 text-xs leading-relaxed">
            <p className="font-bold text-muted">交付請求書に入る内容（外国人詳細の登録内容）</p>
            <p>住所（納税地）：{workerAddress || <span className="font-bold text-seal">未登録（住所を登録してください）</span>}</p>
            <p>
              フリガナ：{(worker.kana ?? "").trim() || <span className="font-bold text-status-notice-fg">未登録（空欄で出ます）</span>}
            </p>
            <p>氏名：{worker.name}</p>
            <p>
              個人番号：
              {isMyNumberFillable(worker.my_number ?? "") ? (
                "登録済み（12桁を1マスずつ入れます）"
              ) : (
                <span className="font-bold text-status-notice-fg">未登録または12桁でない（空欄で出ます。手書きしてください）</span>
              )}
            </p>
            {(kanaMissing || myNumberMissing) && (
              <p className="mt-1 text-muted">外国人詳細で登録してから作ると、そのまま印刷できます。</p>
            )}
          </div>
        )}
      </div>

      {/* 投函・進捗 */}
      <div className="space-y-3 border-t border-dashed border-border pt-4">
        <div className="flex flex-col gap-1">
          <span className={LABEL}>進捗</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            {MAILING_PROGRESS_OPTIONS.map((o) => (
              <Pill key={o.value} active={v.progress === o.value} onClick={() => set({ progress: o.value })}>
                {o.label}
              </Pill>
            ))}
          </div>
          <span className="text-[11px] text-muted">投函日と追跡番号を入れて保存すると、準備中は自動で「税務署からの郵送待ち」になります。</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>税務署へ投函した日</span>
            <div className="flex gap-2">
              <input type="date" value={v.postDate} onChange={(e) => set({ postDate: e.target.value })} className={INPUT} />
              <Button type="button" variant="secondary" className="shrink-0 whitespace-nowrap" onClick={() => set({ postDate: todayISO() })}>今日</Button>
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>投函した郵便の追跡番号（書留・レターパックなど）</span>
            <input
              value={v.trackingNumber}
              onChange={(e) => set({ trackingNumber: e.target.value })}
              placeholder="例：1234-5678-9012"
              inputMode="numeric"
              className={`${INPUT} tabular-nums`}
            />
          </label>
        </div>
        {v.progress === "done" && (
          <label className="flex flex-col gap-1 sm:max-w-xs">
            <span className={LABEL}>証明書が届いた日</span>
            <input type="date" value={v.receivedDate} onChange={(e) => set({ receivedDate: e.target.value })} className={INPUT} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className={LABEL}>メモ</span>
          <textarea value={v.note} onChange={(e) => set({ note: e.target.value })} placeholder="例：収入印紙400円貼付・返信用レターパック同封" className={`${INPUT} min-h-[56px] py-2`} />
        </label>
      </div>

      {officeModal && (
        <TaxOfficeModal
          initial={officeModal === "edit" ? office : null}
          busy={officeBusy}
          onClose={() => setOfficeModal(null)}
          onSave={(form) => void saveOffice(form)}
        />
      )}
    </div>
  );
}

/* ============================ 新規の請求フォーム ============================ */
export function Nozei3RequestForm({
  personName,
  workerId,
  todoNumber,
  worker,
  onWorkerAddressSaved,
  taxOffices,
  setTaxOffices,
  records,
  setRecords,
  canEdit,
  showToast,
}: {
  personName: string;
  workerId: string;
  todoNumber: string;
  worker: MailingWorker | null;
  onWorkerAddressSaved: (id: string, address: string) => void;
  taxOffices: TaxOffice[];
  setTaxOffices: (o: TaxOffice[]) => void;
  records: JudgmentRecord[];
  setRecords: (r: JudgmentRecord[]) => void;
  canEdit: boolean;
  showToast: (m: string) => void;
}) {
  const [v, setV] = useState<Nozei3Values>(emptyNozei3Values);
  const set = (patch: Partial<Nozei3Values>) => setV((x) => ({ ...x, ...patch }));
  const [busy, setBusy] = useState(false);
  const [savedRecord, setSavedRecord] = useState<JudgmentRecord | null>(null);
  const workerAddress = worker?.address ?? "";
  const { office } = effectiveTaxOffice(v, taxOffices, workerAddress);

  // 住所が未登録なら、この場で入力して外国人詳細（workers.address）にも反映する
  const [addressDraft, setAddressDraft] = useState("");
  const [addressBusy, setAddressBusy] = useState(false);
  const saveAddress = async () => {
    const address = addressDraft.trim();
    if (!workerId || !address) return;
    setAddressBusy(true);
    try {
      await updateWorker(createClient(), workerId, { address });
      onWorkerAddressSaved(workerId, address);
      setAddressDraft("");
      showToast("住所を保存しました（外国人詳細にも反映されます）");
    } catch (e) {
      showToast("住所の保存に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAddressBusy(false);
    }
  };

  const blockers = nozei3SaveBlockers({
    canEdit,
    personName,
    taxOfficeSelected: !!office,
    hasTaxOffices: taxOffices.length > 0,
  });

  const save = async () => {
    if (blockers.length > 0) return;
    const record: JudgmentRecord = {
      id: "",
      createdAt: "",
      municipalityId: "",
      municipalityName: "",
      collectionType: "normal",
      appDate: todayISO(),
      hasNhi: false,
      nhiMunicipalityId: "",
      nhiMunicipalityName: "",
      nhiFiscalStartYear: null,
      yearType: "new",
      fiscalStartYear: 0,
      yearReason: "",
      timingStatus: "ok",
      timingLabel: "",
      timingDetail: "",
      docs: [],
      personName: personName.trim(),
      workerId: workerId || undefined,
      todoNumber: todoNumber.trim(),
      mainAlternativeNote: "",
      nhiAlternativeNote: "",
      requestMethod: "mail",
      mailRequestDate: "",
      recipientType: "agent",
      agentName: "",
      nhiRequestMethod: "window",
      nhiMailRequestDate: "",
      nhiRecipientType: "self",
      nhiAgentName: "",
      nhiSameAsMain: true,
      ...nozei3RecordPatch(v, office, workerAddress),
    } as JudgmentRecord;

    setBusy(true);
    try {
      const saved = await insertJudgmentRecord(createClient(), record);
      setRecords([saved, ...records]);
      setSavedRecord(saved);
      showToast("納税証明書その3の郵送請求を記録しました");
    } catch (e) {
      showToast("保存に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <p className="mb-1 text-sm font-bold">納税証明書その3の郵送請求（税務署）</p>
      <p className="mb-3 text-xs text-muted">
        未納の税額がないことの証明（その3）を、現在の住所を管轄する税務署に郵送で請求します。
        投函したら、投函日・追跡番号を記録すると申請準備にも表示されます。
      </p>

      {/* 請求先判断のための現在の住所（外国人マスタの住所）。未登録ならこの場で登録できる */}
      <div className="mb-3 rounded-xl bg-background p-3">
        <p className="text-[11px] font-bold text-muted">外国人の現在の住所（納税地）</p>
        {workerAddress ? (
          <p className="mt-0.5 text-sm">{workerAddress}</p>
        ) : !workerId ? (
          <p className="mt-0.5 text-sm">上の「対象者情報」で外国人を選ぶと表示されます</p>
        ) : canEdit ? (
          <div className="mt-1.5 flex flex-col gap-1.5">
            <p className="text-sm">住所が未登録です。ここで入力すると外国人詳細にも反映されます。</p>
            <div className="flex gap-2">
              <input
                value={addressDraft}
                onChange={(e) => setAddressDraft(e.target.value)}
                placeholder="例：熊本県熊本市東区◯◯1-2-3"
                className={INPUT}
              />
              <Button type="button" variant="secondary" disabled={addressBusy || !addressDraft.trim()} onClick={saveAddress}>
                {addressBusy ? "保存中…" : "住所を保存"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 text-sm">住所が未登録です（外国人詳細の住所歴・住所欄で登録できます）</p>
        )}
      </div>

      {savedRecord ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-status-reported-bg p-3 text-sm">
            <p className="font-bold text-status-reported-fg">記録しました（投函先: {savedRecord.taxOfficeName}）</p>
            <p className="mt-0.5 text-xs text-muted">投函日・追跡番号・進捗の変更は「記録一覧」タブの編集から行えます。</p>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-muted">郵送請求した書類のデータ（作った請求書のPDFなど・複数可）</p>
            <MailingFileAttachments
              recordId={savedRecord.id}
              kind={NOZEI3_SENT_KIND}
              filterKind={NOZEI3_SENT_KIND}
              addLabel="郵送請求した書類を添付（画像・PDF）"
              canEdit={canEdit}
            />
          </div>
          <Button fullWidth variant="secondary" onClick={() => { setV(emptyNozei3Values()); setSavedRecord(null); }}>
            続けて別の請求を入力
          </Button>
        </div>
      ) : (
        <>
          <Nozei3Fields
            v={v}
            set={set}
            worker={worker}
            workerAddress={workerAddress}
            taxOffices={taxOffices}
            setTaxOffices={setTaxOffices}
            canEdit={canEdit}
            showToast={showToast}
          />
          {canEdit && (
            <Button fullWidth className="mt-4" disabled={busy || blockers.length > 0} onClick={save}>
              {busy ? "保存中…" : "この請求を記録として保存"}
            </Button>
          )}
          <SaveBlockers reasons={blockers} className="mt-2" />
        </>
      )}
    </Card>
  );
}

/* ============================ 記録の編集モーダル ============================ */
export function Nozei3EditModal({
  record,
  worker,
  taxOffices,
  setTaxOffices,
  busy,
  onClose,
  onSave,
  canEdit,
  showToast,
}: {
  record: JudgmentRecord;
  worker: MailingWorker | null;
  taxOffices: TaxOffice[];
  setTaxOffices: (o: TaxOffice[]) => void;
  busy: boolean;
  onClose: () => void;
  onSave: (r: JudgmentRecord) => void;
  canEdit: boolean;
  showToast: (m: string) => void;
}) {
  const [v, setV] = useState<Nozei3Values>(() => nozei3ValuesFromRecord(record));
  const set = (patch: Partial<Nozei3Values>) => setV((x) => ({ ...x, ...patch }));
  // 住所は記録時点のもの（外国人の登録が変わっていれば新しい方）
  const workerAddress = worker?.address || record.workerAddress || "";
  const { office } = effectiveTaxOffice(v, taxOffices, workerAddress);
  const blockers = nozei3SaveBlockers({
    canEdit,
    personName: record.personName || "-",
    taxOfficeSelected: !!office,
    hasTaxOffices: taxOffices.length > 0,
  });

  return (
    <Modal open title="納税証明書その3の請求を編集" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {workerAddress && (
          <div className="rounded-xl bg-background p-3">
            <p className="text-[11px] font-bold text-muted">外国人の現在の住所（納税地）</p>
            <p className="mt-0.5 text-sm">{workerAddress}</p>
          </div>
        )}
        <Nozei3Fields
          v={v}
          set={set}
          worker={worker ?? (record.workerId ? { id: record.workerId, name: record.personName, address: workerAddress } : null)}
          workerAddress={workerAddress}
          taxOffices={taxOffices}
          setTaxOffices={setTaxOffices}
          canEdit={canEdit}
          showToast={showToast}
        />
        <div className="border-t border-dashed border-border pt-3">
          <p className="mb-2 text-sm font-bold text-muted">郵送請求した書類のデータ（作った請求書のPDFなど）</p>
          <MailingFileAttachments
            recordId={record.id}
            kind={NOZEI3_SENT_KIND}
            filterKind={NOZEI3_SENT_KIND}
            addLabel="郵送請求した書類を添付（画像・PDF）"
            canEdit={canEdit}
          />
        </div>
        <div className="border-t border-dashed border-border pt-3">
          <p className="mb-1 text-sm font-bold text-muted">届いた納税証明書（届いたら添付）</p>
          <p className="mb-2 text-[11px] text-muted">税務署から証明書が届いたら、ここに画像・PDFを添付して進捗を「完了」にしてください。</p>
          <MailingFileAttachments
            recordId={record.id}
            kind={NOZEI3_RECEIVED_KIND}
            filterKind={NOZEI3_RECEIVED_KIND}
            addLabel="届いた納税証明書を添付（画像・PDF）"
            canEdit={canEdit}
          />
        </div>
        <Button
          fullWidth
          disabled={blockers.length > 0 || busy}
          onClick={() => onSave({ ...record, ...nozei3RecordPatch(v, office, workerAddress) } as JudgmentRecord)}
        >
          {busy ? "保存中…" : "保存する"}
        </Button>
        <SaveBlockers reasons={blockers} />
      </div>
    </Modal>
  );
}

/* ============================ 記録一覧のカードの中身 ============================ */
export function Nozei3RecordView({ record: r, canEdit }: { record: JudgmentRecord; canEdit: boolean }) {
  return (
    <>
      <div className="rounded-xl bg-background p-3 text-xs leading-relaxed">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold">
            納税証明書その3
            <span className="font-medium text-muted">（投函先: {r.taxOfficeName || "税務署未選択"}）</span>
          </p>
          <ProgressBadge progress={r.mailingProgress} />
        </div>
        <p className="mt-1">
          投函日：{r.postDate ? formatDateJP(r.postDate) : <span className="text-muted">未記録（準備中）</span>}
        </p>
        <p>
          追跡番号：<TrackingLink trackingNumber={r.trackingNumber} />
        </p>
        {r.mailingProgress === "done" && r.receivedDate && <p>届いた日：{formatDateJP(r.receivedDate)}</p>}
        {r.mailingNote && <p className="mt-1 text-muted">{r.mailingNote}</p>}
      </div>
      <div className="mt-2 rounded-xl bg-background p-3 text-xs leading-relaxed">
        <p className="mb-1 font-bold">郵送請求した書類（請求書のPDFなど）</p>
        <MailingFileAttachments
          recordId={r.id}
          kind={NOZEI3_SENT_KIND}
          filterKind={NOZEI3_SENT_KIND}
          addLabel="郵送請求した書類を添付（画像・PDF）"
          canEdit={canEdit}
        />
        <div className="mt-2 border-t border-dashed border-border pt-2">
          <p className="mb-1 font-bold">届いた納税証明書（届いたら添付）</p>
          <MailingFileAttachments
            recordId={r.id}
            kind={NOZEI3_RECEIVED_KIND}
            filterKind={NOZEI3_RECEIVED_KIND}
            addLabel="届いた納税証明書を添付（画像・PDF）"
            canEdit={canEdit}
          />
        </div>
      </div>
    </>
  );
}
