"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Combobox } from "@/components/ui/Combobox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import {
  insertMunicipality,
  updateMunicipality,
  deleteMunicipality,
  insertJudgmentRecord,
  updateJudgmentRecord,
  deleteJudgmentRecord,
  importMailingData,
} from "@/lib/supabase/queries/tax-cert";
import { updateWorker } from "@/lib/supabase/queries/workers";
import {
  applicantLabel,
  buildRequiredDocs,
  collectionLabel,
  fiscalYearLabel,
  isSelfOnlyMunicipality,
  formatDateJP,
  formatYen,
  judgeNhiYear,
  judgeTiming,
  judgeYear,
  juminhyoTitle,
  mailedDocTitles,
  mainMailedTitles,
  moneyOrderNo,
  moneyOrderSummary,
  nhiMailedTitles,
  paymentStatusLabel,
  requestKindLabel,
  todayISO,
  yearWithReiwa,
  type ApplicantType,
  type CollectionType,
  type JudgmentRecord,
  type JuminhyoMethod,
  type MoneyOrder,
  type Municipality,
  type MunicipalityInput,
  type RecipientType,
  type RequestKind,
  type RequestMethod,
} from "@/lib/tax-cert";
import { MailingFileAttachments } from "./MailingFileAttachments";
import { MoneyOrderFields } from "./MoneyOrderFields";

// 郵送請求ツールで扱う外国人（現在の住所は転出届・住民票の請求先判断に表示する）
interface MailingWorker {
  id: string;
  name: string;
  address: string;
}

const INPUT =
  "min-h-[42px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";
const LABEL = "text-xs font-bold text-muted";

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
        active
          ? "border-brand bg-brand text-brand-foreground"
          : "border-border bg-surface text-muted hover:border-muted"
      }`}
    >
      {children}
    </button>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 border-b border-border py-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}

function YNBadge({ on, yes, no }: { on: boolean; yes: string; no: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${on ? "bg-status-reported-bg text-status-reported-fg" : "bg-background text-muted"}`}>
      {on ? yes : no}
    </span>
  );
}

function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const show = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2600);
  };
  const node = msg ? (
    <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-bold text-background shadow-lg">
      {msg}
    </div>
  ) : null;
  return [show, node] as const;
}

export function MailingClient({
  initialMunicipalities,
  initialRecords,
  workers = [],
  canEdit,
}: {
  initialMunicipalities: Municipality[];
  initialRecords: JudgmentRecord[];
  workers?: MailingWorker[];
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<"judge" | "muni" | "records">("judge");
  const [municipalities, setMunicipalities] = useState(initialMunicipalities);
  const [records, setRecords] = useState(initialRecords);
  // 外国人の現在の住所（未登録なら請求フォームから登録でき、外国人詳細にも反映される）
  const [workerList, setWorkerList] = useState(workers);
  const updateWorkerAddressLocal = (id: string, address: string) =>
    setWorkerList((ws) => ws.map((w) => (w.id === id ? { ...w, address } : w)));
  const [importOpen, setImportOpen] = useState(false);
  const [showToast, toastNode] = useToast();

  const tabs = [
    { key: "judge" as const, label: "請求フォーム" },
    { key: "muni" as const, label: `自治体マスタ (${municipalities.length})` },
    { key: "records" as const, label: `記録一覧 (${records.length})` },
  ];

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            旧ツールのデータを取込
          </Button>
        </div>
      )}
      {importOpen && (
        <ImportDialog onClose={() => setImportOpen(false)} showToast={showToast} />
      )}
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-bold ${
              tab === t.key ? "border-brand text-brand" : "border-transparent text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "judge" && (
        <JudgeTab
          municipalities={municipalities}
          setMunicipalities={setMunicipalities}
          records={records}
          setRecords={setRecords}
          workers={workerList}
          onWorkerAddressSaved={updateWorkerAddressLocal}
          canEdit={canEdit}
          showToast={showToast}
        />
      )}
      {tab === "muni" && (
        <MunicipalityTab
          municipalities={municipalities}
          setMunicipalities={setMunicipalities}
          canEdit={canEdit}
          showToast={showToast}
        />
      )}
      {tab === "records" && (
        <RecordsTab
          records={records}
          setRecords={setRecords}
          municipalities={municipalities}
          setMunicipalities={setMunicipalities}
          canEdit={canEdit}
          showToast={showToast}
        />
      )}

      <p className="rounded-xl bg-background p-3 text-[11px] leading-relaxed text-muted">
        ※ 本ツールは課税・納税証明書の取得年度・タイミングの参考整理用です。最終判断は最新の入管庁案内・各自治体窓口でご確認ください。
        <br />
        ※ 氏名等の個人情報を含む記録が保存されます。取り扱いにご注意ください。
      </p>
      {toastNode}
    </div>
  );
}

/* ============================ データ取込 ============================ */
function ImportDialog({ onClose, showToast }: { onClose: () => void; showToast: (m: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    let payload: { municipalities?: unknown[]; judgment_records?: unknown[] };
    try {
      payload = JSON.parse(text);
    } catch {
      setError("JSONの形式が正しくありません。書き出したデータをそのまま貼り付けてください。");
      return;
    }
    setBusy(true);
    try {
      const res = await importMailingData(createClient(), payload as never);
      showToast(`自治体${res.muniCount}件・記録${res.recCount}件を取り込みました`);
      onClose();
      // 反映のため再読み込み
      window.location.reload();
    } catch (e) {
      setError("取り込みに失敗しました: " + (e instanceof Error ? e.message : String(e)));
      setBusy(false);
    }
  };

  return (
    <Modal open title="旧ツールのデータを取込" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error && <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">{error}</p>}
        <div className="rounded-xl bg-background p-3 text-xs leading-relaxed text-muted">
          旧ツール（Artifact）の画面を開き、ブラウザのコンソールで書き出したJSONを貼り付けてください。
          <br />
          <span className="font-bold text-foreground">{"{ municipalities: [...], judgment_records: [...] }"}</span>
          の形式です。取り込みは追加のみで、既存データは消えません。
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{"municipalities":[...],"judgment_records":[...]}'
          className={`${INPUT} min-h-[180px] py-2 font-mono text-xs`}
        />
        <Button fullWidth disabled={busy || !text.trim()} onClick={run}>
          {busy ? "取込中…" : "この内容を取り込む"}
        </Button>
      </div>
    </Modal>
  );
}

/* ============================ 共通UI ============================ */
function PhoneLogFields({
  contact,
  setContact,
  content,
  setContent,
  needed,
  setNeeded,
  unpaidAmount,
  setUnpaidAmount,
  paymentStatus,
  setPaymentStatus,
}: {
  contact: string;
  setContact: (v: string) => void;
  content: string;
  setContent: (v: string) => void;
  needed: string;
  setNeeded: (v: string) => void;
  unpaidAmount: string;
  setUnpaidAmount: (v: string) => void;
  paymentStatus: string;
  setPaymentStatus: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex flex-col gap-1">
        <span className={LABEL}>対応した自治体担当者名</span>
        <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="例：熊本市役所 税務課 田中様" className={INPUT} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>電話の内容</span>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="例：令和7年度分に未納があり、納付後の再発行が必要と案内された" className={`${INPUT} min-h-[56px] py-2`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>本人に送ってもらう必要があるもの</span>
        <textarea value={needed} onChange={(e) => setNeeded(e.target.value)} placeholder="例：未納分の納付済証明書のコピーを送ってもらう必要あり" className={`${INPUT} min-h-[56px] py-2`} />
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>未納額（円）</span>
          <input type="number" value={unpaidAmount} onChange={(e) => setUnpaidAmount(e.target.value)} placeholder="例：30000" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>納付・領収証送付状況</span>
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className={INPUT}>
            <option value="">未設定</option>
            <option value="unpaid">未納</option>
            <option value="paid">納付済</option>
            <option value="receipt_sent">領収証送付済み</option>
          </select>
        </label>
      </div>
    </div>
  );
}

interface MethodState {
  method: RequestMethod;
  setMethod: (v: RequestMethod) => void;
  mailDate: string;
  setMailDate: (v: string) => void;
  recipient: RecipientType;
  setRecipient: (v: RecipientType) => void;
  agent: string;
  setAgent: (v: string) => void;
  title?: string;
  // 郵送請求のときに出す定額小為替の入力（証明書1枚につき1枚）
  orderTitles?: string[];
  orders?: MoneyOrder[];
  setOrders?: (o: MoneyOrder[]) => void;
}

function MethodToggleSection(p: MethodState) {
  return (
    <div className="mt-4 border-t border-dashed border-border pt-4">
      {p.title && <p className="mb-2 text-sm font-bold text-muted">{p.title}</p>}
      <div className="mb-3 flex flex-wrap gap-2">
        <Pill active={p.method === "window"} onClick={() => p.setMethod("window")}>本人が窓口で取得</Pill>
        <Pill active={p.method === "agent_window"} onClick={() => p.setMethod("agent_window")}>代理人が窓口で取得</Pill>
        <Pill active={p.method === "mail"} onClick={() => p.setMethod("mail")}>郵送請求した</Pill>
      </div>
      {p.method === "agent_window" && (
        <label className="flex flex-col gap-1">
          <span className={LABEL}>代理人の氏名・宛先</span>
          <input value={p.agent} onChange={(e) => p.setAgent(e.target.value)} placeholder="例：山田太郎（行政書士事務所）" className={INPUT} />
        </label>
      )}
      {p.method === "mail" && (
        <div className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>郵送請求した日</span>
            <input type="date" value={p.mailDate} onChange={(e) => p.setMailDate(e.target.value)} className={INPUT} />
          </label>
          <div className="flex gap-2">
            <Pill active={p.recipient === "self"} onClick={() => p.setRecipient("self")}>本人宛に届く</Pill>
            <Pill active={p.recipient === "agent"} onClick={() => p.setRecipient("agent")}>代理人宛に届く</Pill>
          </div>
          {p.recipient === "agent" && (
            <label className="flex flex-col gap-1">
              <span className={LABEL}>代理人の氏名・宛先</span>
              <input value={p.agent} onChange={(e) => p.setAgent(e.target.value)} placeholder="例：山田太郎（行政書士事務所）" className={INPUT} />
            </label>
          )}
          {p.orders && p.setOrders && (
            <div className="mt-1">
              <p className="mb-1.5 text-sm font-bold text-muted">同封した定額小為替</p>
              <MoneyOrderFields
                titles={p.orderTitles ?? []}
                orders={p.orders}
                onChange={p.setOrders}
                group="main"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function checkMethodValid(method: RequestMethod, mDate: string, rType: RecipientType, aName: string): boolean {
  return (
    method === "window" ||
    (method === "agent_window" && aName.trim() !== "") ||
    (method === "mail" && mDate !== "" && (rType === "self" || (rType === "agent" && aName.trim() !== "")))
  );
}

function buildMethodInfo(method: RequestMethod, mDate: string, rType: RecipientType, aName: string) {
  if (method === "mail") {
    return { requestMethod: "mail" as RequestMethod, mailRequestDate: mDate, recipientType: rType, agentName: rType === "agent" ? aName.trim() : "" };
  }
  if (method === "agent_window") {
    return { requestMethod: "agent_window" as RequestMethod, mailRequestDate: "", recipientType: "agent" as RecipientType, agentName: aName.trim() };
  }
  return { requestMethod: "window" as RequestMethod, mailRequestDate: "", recipientType: "self" as RecipientType, agentName: "" };
}

/* ============================ 判定フォーム ============================ */
function JudgeTab({
  municipalities,
  setMunicipalities,
  records,
  setRecords,
  workers,
  onWorkerAddressSaved,
  canEdit,
  showToast,
}: {
  municipalities: Municipality[];
  setMunicipalities: (m: Municipality[]) => void;
  records: JudgmentRecord[];
  setRecords: (r: JudgmentRecord[]) => void;
  workers: MailingWorker[];
  onWorkerAddressSaved: (id: string, address: string) => void;
  canEdit: boolean;
  showToast: (m: string) => void;
}) {
  // 請求する書類の種別（課税・納税証明書 / 転出届 / 住民票）
  const [requestKind, setRequestKind] = useState<RequestKind>("tax");
  const [muniId, setMuniId] = useState(municipalities[0]?.id ?? "");
  const [collectionType, setCollectionType] = useState<CollectionType>("special");
  const [appDate, setAppDate] = useState(todayISO());
  const [hasNhi, setHasNhi] = useState(false);
  const [nhiMuniId, setNhiMuniId] = useState("");
  const [result, setResult] = useState<JudgmentRecord | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const [personName, setPersonName] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [todoNumber, setTodoNumber] = useState("");

  const workerOptions = useMemo(() => workers.map((w) => ({ id: w.id, label: w.name })), [workers]);
  const selectedWorker = workers.find((w) => w.id === workerId) ?? null;
  const onSelectPerson = (id: string) => {
    setWorkerId(id);
    const w = workers.find((x) => x.id === id);
    setPersonName(w?.name ?? "");
  };
  const [mainAlt, setMainAlt] = useState("");
  const [nhiAlt, setNhiAlt] = useState("");

  const [method, setMethod] = useState<RequestMethod>("window");
  const [mailDate, setMailDate] = useState(todayISO());
  const [recipient, setRecipient] = useState<RecipientType>("self");
  const [agent, setAgent] = useState("");

  // 郵送請求に同封する定額小為替（証明書1枚につき1枚）
  const [moneyOrders, setMoneyOrders] = useState<MoneyOrder[]>([]);

  const [nhiSameAsMain, setNhiSameAsMain] = useState(true);
  const [nhiMethod, setNhiMethod] = useState<RequestMethod>("window");
  const [nhiMailDate, setNhiMailDate] = useState(todayISO());
  const [nhiRecipient, setNhiRecipient] = useState<RecipientType>("self");
  const [nhiAgent, setNhiAgent] = useState("");

  // 国保税納税証明書の分の定額小為替（郵送で受け取るときだけ）
  const nhiOrderTitles = result
    ? nhiMailedTitles({
        requestMethod: method,
        hasNhi: result.hasNhi,
        nhiSameAsMain,
        nhiRequestMethod: nhiMethod,
        docs: result.docs,
      })
    : [];

  const selectedMuni = municipalities.find((m) => m.id === muniId) ?? null;
  const selectedNhiMuni = municipalities.find((m) => m.id === nhiMuniId) ?? null;
  const canJudge = !!selectedMuni && !!appDate && (!hasNhi || !!selectedNhiMuni);
  const resetResult = () => setResult(null);

  const runJudge = () => {
    if (!selectedMuni || !canJudge) return;
    const dateObj = new Date(appDate + "T00:00:00");
    const y = judgeYear(selectedMuni.show_asterisk, collectionType, dateObj);
    const timing = judgeTiming(collectionType, y.yearType, dateObj);
    const docs = buildRequiredDocs(selectedMuni, y.yearType, hasNhi, dateObj, selectedNhiMuni);
    const nhiYear = hasNhi ? judgeNhiYear(dateObj) : null;
    setResult({
      id: "",
      createdAt: "",
      municipalityId: selectedMuni.id,
      municipalityName: selectedMuni.name,
      collectionType,
      appDate,
      hasNhi,
      nhiMunicipalityId: hasNhi && selectedNhiMuni ? selectedNhiMuni.id : "",
      nhiMunicipalityName: hasNhi && selectedNhiMuni ? selectedNhiMuni.name : "",
      nhiFiscalStartYear: hasNhi && nhiYear ? nhiYear.fiscalStartYear : null,
      yearType: y.yearType,
      fiscalStartYear: y.fiscalStartYear,
      yearReason: y.reason,
      timingStatus: timing.status,
      timingLabel: timing.label,
      timingDetail: timing.detail,
      docs,
      personName: "",
      todoNumber: "",
      mainAlternativeNote: "",
      nhiAlternativeNote: "",
      requestMethod: "window",
      mailRequestDate: "",
      recipientType: "self",
      agentName: "",
      nhiRequestMethod: "window",
      nhiMailRequestDate: "",
      nhiRecipientType: "self",
      nhiAgentName: "",
      nhiSameAsMain: true,
    });
    setSaved(false);
  };

  const save = async () => {
    if (!result) return;
    if (!personName.trim()) return showToast("対象者の氏名を入力してください");
    if (!checkMethodValid(method, mailDate, recipient, agent))
      return showToast("代理人の氏名・宛先を入力してください");
    if (hasNhi && !nhiSameAsMain && !checkMethodValid(nhiMethod, nhiMailDate, nhiRecipient, nhiAgent))
      return showToast("国保税納税証明書の代理人の氏名・宛先を入力してください");

    const mainInfo = buildMethodInfo(method, mailDate, recipient, agent);
    let nhiInfoFields: Record<string, unknown> = {
      nhiRequestMethod: "window",
      nhiMailRequestDate: "",
      nhiRecipientType: "self",
      nhiAgentName: "",
      nhiSameAsMain: true,
    };
    if (result.hasNhi) {
      if (nhiSameAsMain) {
        nhiInfoFields = {
          nhiRequestMethod: mainInfo.requestMethod,
          nhiMailRequestDate: mainInfo.mailRequestDate,
          nhiRecipientType: mainInfo.recipientType,
          nhiAgentName: mainInfo.agentName,
          nhiSameAsMain: true,
        };
      } else {
        const b = buildMethodInfo(nhiMethod, nhiMailDate, nhiRecipient, nhiAgent);
        nhiInfoFields = {
          nhiRequestMethod: b.requestMethod,
          nhiMailRequestDate: b.mailRequestDate,
          nhiRecipientType: b.recipientType,
          nhiAgentName: b.agentName,
          nhiSameAsMain: false,
        };
      }
    }

    const record: JudgmentRecord = {
      ...result,
      personName: personName.trim(),
      workerId: workerId || undefined,
      todoNumber: todoNumber.trim(),
      mainAlternativeNote: mainAlt.trim(),
      nhiAlternativeNote: result.hasNhi ? nhiAlt.trim() : "",
      ...mainInfo,
      ...nhiInfoFields,
      moneyOrders,
    } as JudgmentRecord;

    setBusy(true);
    try {
      const saved = await insertJudgmentRecord(createClient(), record);
      setRecords([saved, ...records]);
      setSaved(true);
      showToast("判定結果を記録しました");
    } catch (e) {
      showToast("保存に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="mb-1 text-sm font-bold">対象者情報</p>
        <p className="mb-3 text-xs text-muted">記録として残すための情報です（判定ロジックには使用しません）</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className={LABEL}>外国人の氏名</span>
            <Combobox
              options={workerOptions}
              value={workerId}
              onChange={onSelectPerson}
              placeholder="氏名を入力して検索"
            />
            {!workerId && (
              <Link href="/workers/new" className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-brand">
                <Plus size={13} />
                一覧にいない場合は新規登録
              </Link>
            )}
          </div>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>TODO番号</span>
            <input value={todoNumber} onChange={(e) => setTodoNumber(e.target.value)} placeholder="管理しているTODO番号" className={INPUT} />
          </label>
        </div>
      </Card>

      {/* 請求する書類の選択（課税・納税証明書 / 転出届 / 住民票） */}
      <Card className="p-4">
        <p className="mb-1 text-sm font-bold">請求する書類</p>
        <p className="mb-3 text-xs text-muted">どの書類を郵送請求するか選んでください</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Pill active={requestKind === "tax"} onClick={() => setRequestKind("tax")}>
            課税証明書と納税証明書を郵送請求
          </Pill>
          <Pill active={requestKind === "tenshutsu"} onClick={() => setRequestKind("tenshutsu")}>
            転出届を郵送請求
          </Pill>
          <Pill active={requestKind === "juminhyo"} onClick={() => setRequestKind("juminhyo")}>
            住民票を郵送請求
          </Pill>
        </div>
      </Card>

      {requestKind !== "tax" ? (
        <ExtraRequestForm
          key={requestKind}
          kind={requestKind}
          personName={personName}
          workerId={workerId}
          todoNumber={todoNumber}
          workerAddress={selectedWorker ? selectedWorker.address : null}
          onWorkerAddressSaved={onWorkerAddressSaved}
          municipalities={municipalities}
          setMunicipalities={setMunicipalities}
          records={records}
          setRecords={setRecords}
          canEdit={canEdit}
          showToast={showToast}
        />
      ) : (
        <>
      <Card className="p-4">
        <p className="mb-1 text-sm font-bold">判定フォーム</p>
        <p className="mb-3 text-xs text-muted">自治体・徴収区分・申請予定日を選んで判定してください</p>
        {municipalities.length === 0 ? (
          <p className="rounded-xl bg-background p-6 text-center text-sm text-muted">
            自治体マスタが未登録です。「自治体マスタ」タブで追加してください。
          </p>
        ) : (
          <div className="space-y-3">
            <label className="flex flex-col gap-1">
              <span className={LABEL}>自治体</span>
              <select value={muniId} onChange={(e) => { setMuniId(e.target.value); resetResult(); }} className={INPUT}>
                {municipalities.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1">
              <span className={LABEL}>徴収区分</span>
              <div className="flex gap-2">
                <Pill active={collectionType === "special"} onClick={() => { setCollectionType("special"); resetResult(); }}>特別徴収</Pill>
                <Pill active={collectionType === "normal"} onClick={() => { setCollectionType("normal"); resetResult(); }}>普通徴収</Pill>
              </div>
            </div>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>申請予定日</span>
              <input type="date" value={appDate} onChange={(e) => { setAppDate(e.target.value); resetResult(); }} className={INPUT} />
              <span className="text-[11px] text-muted">在留資格変更申請を行う予定の日付を選択してください</span>
            </label>
            <label className="flex items-center gap-2 rounded-xl bg-background px-3 py-2.5 text-sm">
              <input type="checkbox" checked={hasNhi} onChange={(e) => { setHasNhi(e.target.checked); resetResult(); }} className="h-4 w-4" />
              国民健康保険に加入している（国保税の納税証明書も必要）
            </label>
            {hasNhi && (
              <label className="flex flex-col gap-1">
                <span className={LABEL}>国保税納税証明書の取得先自治体（現在お住まいの自治体）</span>
                <select value={nhiMuniId} onChange={(e) => { setNhiMuniId(e.target.value); resetResult(); }} className={INPUT}>
                  <option value="">選択してください</option>
                  {municipalities.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <span className="text-[11px] text-muted">課税証明書の取得先と異なる場合があります。郵送請求時は特に注意してください。</span>
              </label>
            )}
            <Button fullWidth disabled={!canJudge} onClick={runJudge}>判定する</Button>
          </div>
        )}
      </Card>

      {result && (
        <Card className="p-4">
          <p className="mb-3 text-sm font-bold">判定結果</p>

          {/* 課税証明書・市県民税納税証明書 */}
          <div className="mb-4 overflow-hidden rounded-xl border border-border">
            <div className="border-b border-border bg-brand/10 px-4 py-2.5 text-sm font-bold text-brand">
              課税証明書・市県民税納税証明書の場合
            </div>
            <div className="p-4">
              <ResultStamp
                warn={result.timingStatus === "warn"}
                title={`${result.municipalityName}：${result.yearType === "prev" ? "前年度" : "新年度"}（${fiscalYearLabel(result.fiscalStartYear)}）の証明書を取得`}
                label={result.timingLabel}
                notes={[result.timingDetail, result.yearReason]}
              />
              <DocList docs={result.docs.filter((d) => !d.isNhi)} />
              <label className="mt-4 flex flex-col gap-1 border-t border-dashed border-border pt-4">
                <span className={LABEL}>代替対応の備考</span>
                <span className="text-[11px] text-muted">例：令和7年度の1月1日時点で対象者が国外転出していたため発行不可。今回は令和6年度で対応した、など</span>
                <textarea value={mainAlt} onChange={(e) => setMainAlt(e.target.value)} placeholder="判定年度で発行できなかった場合の対応内容（任意）" className={`${INPUT} min-h-[56px] py-2`} />
              </label>
              <MethodToggleSection
                title="受領方法"
                method={method}
                setMethod={setMethod}
                mailDate={mailDate}
                setMailDate={setMailDate}
                recipient={recipient}
                setRecipient={setRecipient}
                agent={agent}
                setAgent={setAgent}
                orderTitles={mainMailedTitles({
                  requestMethod: method,
                  yearType: result.yearType,
                  docs: result.docs,
                })}
                orders={moneyOrders}
                setOrders={setMoneyOrders}
              />
            </div>
          </div>

          {/* 国保税納税証明書 */}
          {result.hasNhi && (
            <div className="mb-4 overflow-hidden rounded-xl border border-border">
              <div className="border-b border-border bg-status-notice-bg px-4 py-2.5 text-sm font-bold text-status-notice-fg">
                国民健康保険税納税証明書の場合
              </div>
              <div className="p-4">
                <ResultStamp
                  warn={false}
                  title={`${result.nhiMunicipalityName || "未選択"}：新年度（${fiscalYearLabel(result.nhiFiscalStartYear ?? 0)}）の証明書を取得`}
                  label="通常通り取得可能"
                  notes={["国民健康保険税は6月になると常に最新年度に切り替わるため、6月以降は新年度の納税証明書を取得します。"]}
                />
                <DocList docs={result.docs.filter((d) => d.isNhi)} />
                <label className="mt-4 flex flex-col gap-1 border-t border-dashed border-border pt-4">
                  <span className={LABEL}>代替対応の備考</span>
                  <textarea value={nhiAlt} onChange={(e) => setNhiAlt(e.target.value)} placeholder="国保税納税証明書について判定通りに発行できなかった場合の対応内容（任意）" className={`${INPUT} min-h-[56px] py-2`} />
                </label>
                <div className="mt-4 border-t border-dashed border-border pt-4">
                  <p className="mb-2 text-sm font-bold text-muted">受領方法</p>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Pill active={nhiSameAsMain} onClick={() => setNhiSameAsMain(true)}>課税証明書と同じ受領方法</Pill>
                    <Pill active={!nhiSameAsMain} onClick={() => setNhiSameAsMain(false)}>別の受領方法</Pill>
                  </div>
                  {!nhiSameAsMain && (
                    <MethodToggleSection method={nhiMethod} setMethod={setNhiMethod} mailDate={nhiMailDate} setMailDate={setNhiMailDate} recipient={nhiRecipient} setRecipient={setNhiRecipient} agent={nhiAgent} setAgent={setNhiAgent} />
                  )}
                  {nhiOrderTitles.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-sm font-bold text-muted">同封した定額小為替</p>
                      <MoneyOrderFields
                        titles={nhiOrderTitles}
                        orders={moneyOrders}
                        onChange={setMoneyOrders}
                        group="nhi"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {canEdit && (
            <Button fullWidth variant="secondary" disabled={saved || busy} onClick={save}>
              {busy ? "保存中…" : saved ? "記録済み" : "この結果を記録として保存"}
            </Button>
          )}
        </Card>
      )}
        </>
      )}
    </div>
  );
}

// 領収書の添付に使う種別名（後日届く手数料の領収書）
const RECEIPT_KIND = "領収書";

/* ============================ 転出届・住民票の郵送請求 ============================ */

// 転出届・住民票の請求フォームの入力値
interface ExtraFormValues {
  muniId: string; // 請求先の市役所（自治体マスタから選択）
  movingDate: string; // 転出日（転出届）
  newAddress: string; // 転入先の住所（転出届）
  postDate: string; // ポスト投函日（郵送請求）
  applicantType: ApplicantType; // 本人申請 / 代理人
  agentName: string; // 代理人の名前
  juminhyoMethod: JuminhyoMethod; // 住民票: 郵送請求 / 窓口発行
  juminhyoMyNumber: boolean; // 個人番号の記載あり/なし
  juminhyoPurpose: string; // 住民票を発行する目的
  juminhyoCopies: number; // 住民票の請求通数（1通につき定額小為替1枚）
  moneyOrders: MoneyOrder[]; // 同封した定額小為替（証明書1枚につき1枚）
}

function emptyExtraValues(): ExtraFormValues {
  return {
    muniId: "",
    movingDate: "",
    newAddress: "",
    postDate: todayISO(),
    applicantType: "self",
    agentName: "",
    juminhyoMethod: "mail",
    juminhyoMyNumber: false,
    juminhyoPurpose: "",
    juminhyoCopies: 1,
    moneyOrders: [],
  };
}

// 記録から編集用の入力値へ。古い記録（自由入力の市役所名）は名前で自治体マスタと突き合わせる
function extraValuesFromRecord(r: JudgmentRecord, municipalities: Municipality[]): ExtraFormValues {
  const byName = municipalities.find((m) => m.name === (r.cityOffice ?? r.municipalityName));
  return {
    muniId: r.cityOfficeId ?? byName?.id ?? "",
    movingDate: r.movingDate ?? "",
    newAddress: r.newAddress ?? "",
    postDate: r.postDate ?? todayISO(),
    applicantType: r.applicantType ?? "self",
    agentName: r.applicantAgentName ?? "",
    juminhyoMethod: r.juminhyoMethod ?? "mail",
    juminhyoMyNumber: !!r.juminhyoMyNumber,
    juminhyoPurpose: r.juminhyoPurpose ?? "",
    juminhyoCopies: r.juminhyoCopies ?? 1,
    moneyOrders: r.moneyOrders ?? [],
  };
}

// 郵送での請求か（転出届は常に郵送。住民票は発行方法による）
function isMailExtra(kind: "tenshutsu" | "juminhyo", v: ExtraFormValues): boolean {
  return kind === "tenshutsu" || v.juminhyoMethod === "mail";
}

// 入力チェック。問題があればエラーメッセージ、無ければ null
function extraFormError(
  kind: "tenshutsu" | "juminhyo",
  v: ExtraFormValues,
  muni: Municipality | null,
): string | null {
  if (!muni) return "請求先の市役所を自治体マスタから選択してください";
  const selfOnly = isSelfOnlyMunicipality(kind, muni);
  if (!selfOnly && v.applicantType === "agent" && !v.agentName.trim()) {
    return "代理人の名前を入力してください";
  }
  return null;
}

// フォーム入力から記録へ反映する項目一式。既存の受領方法の項目
// （requestMethod など）にも反映して、記録一覧のフィルタ・表示と互換にする。
// 本人申請のみの自治体では申請者を強制的に本人にする
function extraRecordPatch(
  kind: "tenshutsu" | "juminhyo",
  v: ExtraFormValues,
  muni: Municipality | null,
): Partial<JudgmentRecord> {
  const isMail = isMailExtra(kind, v);
  const selfOnly = isSelfOnlyMunicipality(kind, muni);
  const applicant: ApplicantType = selfOnly ? "self" : v.applicantType;
  const agent = applicant === "agent" ? v.agentName.trim() : "";
  return {
    requestKind: kind,
    municipalityId: muni?.id ?? "",
    municipalityName: muni?.name ?? "",
    cityOffice: muni?.name ?? "",
    cityOfficeId: muni?.id ?? "",
    movingDate: kind === "tenshutsu" ? v.movingDate : "",
    newAddress: kind === "tenshutsu" ? v.newAddress.trim() : "",
    juminhyoMethod: kind === "juminhyo" ? v.juminhyoMethod : undefined,
    juminhyoMyNumber: kind === "juminhyo" ? v.juminhyoMyNumber : undefined,
    juminhyoPurpose: kind === "juminhyo" ? v.juminhyoPurpose.trim() : undefined,
    juminhyoCopies: kind === "juminhyo" ? Math.max(1, v.juminhyoCopies) : undefined,
    postDate: isMail ? v.postDate : "",
    moneyOrders: isMail ? v.moneyOrders : [],
    applicantType: applicant,
    applicantAgentName: agent,
    requestMethod: isMail ? "mail" : "window",
    mailRequestDate: isMail ? v.postDate : "",
    recipientType: applicant,
    agentName: agent,
    docs: [
      kind === "tenshutsu"
        ? { title: "転出届", meta: "郵送請求", starred: false }
        : {
            title: juminhyoTitle(v.juminhyoMyNumber),
            meta: v.juminhyoMethod === "mail" ? "郵送請求" : "窓口発行",
            starred: false,
          },
    ],
  };
}

// 請求先の市役所の選択（自治体マスタ）。未登録ならこの場で追加できる
function CityOfficeSelect({
  label,
  municipalities,
  value,
  onChange,
  onCreated,
  canEdit,
  showToast,
}: {
  label: string;
  municipalities: Municipality[];
  value: string;
  onChange: (id: string) => void;
  onCreated: (m: Municipality) => void;
  canEdit: boolean;
  showToast: (m: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const create = async (form: MunicipalityInput) => {
    setBusy(true);
    try {
      const created = await insertMunicipality(createClient(), form);
      onCreated(created);
      onChange(created.id);
      setAddOpen(false);
      showToast(`自治体マスタに「${created.name}」を追加しました`);
    } catch (e) {
      showToast("自治体の追加に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <span className={LABEL}>{label}</span>
      {municipalities.length === 0 ? (
        <p className="rounded-xl bg-background p-3 text-xs text-muted">
          自治体マスタが未登録です。「＋ 自治体マスタに追加」から登録してください。
        </p>
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
          <option value="">選択してください</option>
          {municipalities.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      )}
      <span className="text-[11px] text-muted">
        上に表示している「外国人の現在の住所」から請求先の自治体を判断して選択してください。
      </span>
      {canEdit && (
        <button type="button" onClick={() => setAddOpen(true)} className="self-start text-xs font-bold text-brand">
          ＋ 自治体マスタに追加
        </button>
      )}
      {addOpen && (
        <MunicipalityModal
          initial={null}
          busy={busy}
          onClose={() => setAddOpen(false)}
          onSave={(form) => void create(form)}
        />
      )}
    </div>
  );
}

// 転出届・住民票の入力欄（新規請求フォームと記録の編集モーダルで共用）
function ExtraRequestFields({
  kind,
  v,
  set,
  municipalities,
  onCreated,
  canEdit,
  showToast,
}: {
  kind: "tenshutsu" | "juminhyo";
  v: ExtraFormValues;
  set: (patch: Partial<ExtraFormValues>) => void;
  municipalities: Municipality[];
  onCreated: (m: Municipality) => void;
  canEdit: boolean;
  showToast: (m: string) => void;
}) {
  const isMail = isMailExtra(kind, v);
  const muni = municipalities.find((m) => m.id === v.muniId) ?? null;
  const selfOnly = isSelfOnlyMunicipality(kind, muni);
  return (
    <div className="space-y-3">
      {kind === "juminhyo" && (
        <div className="flex flex-col gap-1">
          <span className={LABEL}>発行方法</span>
          <div className="flex gap-2">
            <Pill active={v.juminhyoMethod === "mail"} onClick={() => set({ juminhyoMethod: "mail" })}>郵送請求</Pill>
            <Pill active={v.juminhyoMethod === "window"} onClick={() => set({ juminhyoMethod: "window" })}>窓口発行</Pill>
          </div>
        </div>
      )}
      <CityOfficeSelect
        label={kind === "tenshutsu" ? "請求先の市役所（自治体マスタから選択）" : "請求先・発行場所の市役所（自治体マスタから選択）"}
        municipalities={municipalities}
        value={v.muniId}
        onChange={(id) => set({ muniId: id })}
        onCreated={onCreated}
        canEdit={canEdit}
        showToast={showToast}
      />
      {kind === "tenshutsu" && (
        <>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>転出日</span>
            <input type="date" value={v.movingDate} onChange={(e) => set({ movingDate: e.target.value })} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>転入先の住所</span>
            <input value={v.newAddress} onChange={(e) => set({ newAddress: e.target.value })} placeholder="例：熊本県八代市◯◯1-2-3" className={INPUT} />
          </label>
        </>
      )}
      {kind === "juminhyo" && (
        <>
          <div className="flex flex-col gap-1">
            <span className={LABEL}>個人番号（マイナンバー）の記載</span>
            <div className="flex gap-2">
              <Pill active={!v.juminhyoMyNumber} onClick={() => set({ juminhyoMyNumber: false })}>記載なし</Pill>
              <Pill active={v.juminhyoMyNumber} onClick={() => set({ juminhyoMyNumber: true })}>記載あり</Pill>
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>請求する通数</span>
            <input
              type="number"
              min={1}
              value={v.juminhyoCopies}
              onChange={(e) => set({ juminhyoCopies: Math.max(1, Number(e.target.value) || 1) })}
              className={`${INPUT} tabular-nums`}
            />
            <span className="text-[11px] text-muted">
              郵送請求では、1通につき定額小為替を1枚同封します（通数を変えると下の枚数も変わります）。
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>住民票を発行する目的</span>
            <input value={v.juminhyoPurpose} onChange={(e) => set({ juminhyoPurpose: e.target.value })} placeholder="例：在留資格変更許可申請の添付書類のため" className={INPUT} />
          </label>
        </>
      )}
      {isMail && (
        <>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>ポスト投函日（郵送で送った日）</span>
            <input type="date" value={v.postDate} onChange={(e) => set({ postDate: e.target.value })} className={INPUT} />
          </label>
          <div className="flex flex-col gap-1">
            <span className={LABEL}>同封した定額小為替</span>
            <MoneyOrderFields
              titles={mailedDocTitles({
                requestKind: kind,
                juminhyoMethod: v.juminhyoMethod,
                juminhyoMyNumber: v.juminhyoMyNumber,
                juminhyoCopies: v.juminhyoCopies,
                requestMethod: "mail",
              })}
              orders={v.moneyOrders}
              onChange={(moneyOrders) => set({ moneyOrders })}
              canEdit={canEdit}
            />
          </div>
        </>
      )}
      {/* 申請者（郵送・窓口共通）。本人申請のみの自治体では代理人を選べない */}
      <div className="flex flex-col gap-1">
        <span className={LABEL}>申請者</span>
        {selfOnly ? (
          <p className="rounded-xl bg-status-notice-bg px-3 py-2.5 text-xs font-bold text-status-notice-fg">
            この自治体は本人申請のみです（自治体マスタの設定により代理人申請はできません）
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <Pill active={v.applicantType === "self"} onClick={() => set({ applicantType: "self" })}>本人申請</Pill>
              <Pill active={v.applicantType === "agent"} onClick={() => set({ applicantType: "agent" })}>代理人</Pill>
            </div>
            {v.applicantType === "agent" && (
              <input value={v.agentName} onChange={(e) => set({ agentName: e.target.value })} placeholder="代理人の名前" className={INPUT} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// 転出届・住民票の請求フォーム。保存すると記録一覧に載り、画像を添付できる
function ExtraRequestForm({
  kind,
  personName,
  workerId,
  todoNumber,
  workerAddress,
  onWorkerAddressSaved,
  municipalities,
  setMunicipalities,
  records,
  setRecords,
  canEdit,
  showToast,
}: {
  kind: "tenshutsu" | "juminhyo";
  personName: string;
  workerId: string;
  todoNumber: string;
  workerAddress: string | null;
  onWorkerAddressSaved: (id: string, address: string) => void;
  municipalities: Municipality[];
  setMunicipalities: (m: Municipality[]) => void;
  records: JudgmentRecord[];
  setRecords: (r: JudgmentRecord[]) => void;
  canEdit: boolean;
  showToast: (m: string) => void;
}) {
  const [v, setV] = useState<ExtraFormValues>(emptyExtraValues);
  const set = (patch: Partial<ExtraFormValues>) => setV((x) => ({ ...x, ...patch }));
  const [busy, setBusy] = useState(false);
  const [savedRecord, setSavedRecord] = useState<JudgmentRecord | null>(null);
  const label = requestKindLabel(kind);
  const muni = municipalities.find((m) => m.id === v.muniId) ?? null;
  const addMunicipality = (m: Municipality) =>
    setMunicipalities([...municipalities, m].sort((a, b) => a.name.localeCompare(b.name, "ja")));

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

  const save = async () => {
    if (!personName.trim()) return showToast("対象者の氏名を入力してください");
    const err = extraFormError(kind, v, muni);
    if (err) return showToast(err);

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
      recipientType: "self",
      agentName: "",
      nhiRequestMethod: "window",
      nhiMailRequestDate: "",
      nhiRecipientType: "self",
      nhiAgentName: "",
      nhiSameAsMain: true,
      workerAddress: workerAddress ?? "",
      ...extraRecordPatch(kind, v, muni),
    } as JudgmentRecord;

    setBusy(true);
    try {
      const saved = await insertJudgmentRecord(createClient(), record);
      setRecords([saved, ...records]);
      setSavedRecord(saved);
      showToast(`${label}の請求を記録しました`);
    } catch (e) {
      showToast("保存に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <p className="mb-1 text-sm font-bold">{label}の郵送請求</p>
      <p className="mb-3 text-xs text-muted">
        {kind === "tenshutsu"
          ? "転出届の郵送先（転出元の自治体）を現在の住所から確認し、自治体マスタから選択してください"
          : "住民票の郵送先・窓口発行場所を現在の住所から確認し、自治体マスタから選択してください"}
      </p>

      {/* 請求先判断のための現在の住所（外国人マスタの住所）。未登録ならこの場で登録できる */}
      <div className="mb-3 rounded-xl bg-background p-3">
        <p className="text-[11px] font-bold text-muted">外国人の現在の住所</p>
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
                placeholder="例：熊本県八代市◯◯1-2-3"
                className={INPUT}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={addressBusy || !addressDraft.trim()}
                onClick={saveAddress}
              >
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
            <p className="font-bold text-status-reported-fg">記録しました（請求先: {savedRecord.cityOffice}）</p>
            <p className="mt-0.5 text-xs text-muted">内容の修正は「記録一覧」タブの編集から行えます。</p>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-muted">{label}・申請書のデータ（複数可）</p>
            <MailingFileAttachments
              recordId={savedRecord.id}
              kind={label}
              filterKind={label}
              addLabel={`申請書・${label}のデータを追加（画像・PDF）`}
              canEdit={canEdit}
            />
          </div>
          <Button fullWidth variant="secondary" onClick={() => { setV(emptyExtraValues()); setSavedRecord(null); }}>
            続けて別の請求を入力
          </Button>
        </div>
      ) : (
        <>
          <ExtraRequestFields
            kind={kind}
            v={v}
            set={set}
            municipalities={municipalities}
            onCreated={addMunicipality}
            canEdit={canEdit}
            showToast={showToast}
          />
          {canEdit && (
            <Button fullWidth className="mt-4" disabled={busy} onClick={save}>
              {busy ? "保存中…" : "この請求を記録として保存"}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

// 転出届・住民票の記録の編集モーダル（画像の添付もここから）
function ExtraEditModal({
  record,
  municipalities,
  setMunicipalities,
  busy,
  onClose,
  onSave,
  canEdit,
  showToast,
}: {
  record: JudgmentRecord;
  municipalities: Municipality[];
  setMunicipalities: (m: Municipality[]) => void;
  busy: boolean;
  onClose: () => void;
  onSave: (r: JudgmentRecord) => void;
  canEdit: boolean;
  showToast: (m: string) => void;
}) {
  const kind: "tenshutsu" | "juminhyo" = record.requestKind === "juminhyo" ? "juminhyo" : "tenshutsu";
  const [v, setV] = useState<ExtraFormValues>(() => extraValuesFromRecord(record, municipalities));
  const set = (patch: Partial<ExtraFormValues>) => setV((x) => ({ ...x, ...patch }));
  const label = requestKindLabel(record.requestKind);
  const muni = municipalities.find((m) => m.id === v.muniId) ?? null;
  const canSave = extraFormError(kind, v, muni) === null;
  const addMunicipality = (m: Municipality) =>
    setMunicipalities([...municipalities, m].sort((a, b) => a.name.localeCompare(b.name, "ja")));

  return (
    <Modal open title={`${label}の請求を編集`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {record.workerAddress && (
          <div className="rounded-xl bg-background p-3">
            <p className="text-[11px] font-bold text-muted">記録時点の外国人の住所</p>
            <p className="mt-0.5 text-sm">{record.workerAddress}</p>
          </div>
        )}
        <ExtraRequestFields
          kind={kind}
          v={v}
          set={set}
          municipalities={municipalities}
          onCreated={addMunicipality}
          canEdit={canEdit}
          showToast={showToast}
        />
        <div className="border-t border-dashed border-border pt-3">
          <p className="mb-2 text-sm font-bold text-muted">{label}・申請書のデータ（複数可）</p>
          <MailingFileAttachments
            recordId={record.id}
            kind={label}
            filterKind={label}
            addLabel={`申請書・${label}のデータを追加（画像・PDF）`}
            canEdit={canEdit}
          />
        </div>
        <div className="border-t border-dashed border-border pt-3">
          <p className="mb-1 text-sm font-bold text-muted">領収書（後日届いたら添付）</p>
          <p className="mb-2 text-[11px] text-muted">
            手数料の領収書が郵送で届いたら、ここに画像・PDFを添付してください。
          </p>
          <MailingFileAttachments
            recordId={record.id}
            kind={RECEIPT_KIND}
            filterKind={RECEIPT_KIND}
            addLabel="領収書を添付（画像・PDF）"
            canEdit={canEdit}
          />
        </div>
        <Button
          fullWidth
          disabled={!canSave || busy}
          onClick={() => onSave({ ...record, ...extraRecordPatch(kind, v, muni) } as JudgmentRecord)}
        >
          {busy ? "保存中…" : "保存する"}
        </Button>
      </div>
    </Modal>
  );
}

function ResultStamp({ warn, title, label, notes }: { warn: boolean; title: string; label: string; notes: string[] }) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${warn ? "border-status-notice-fg/40 bg-status-notice-bg" : "border-status-reported-fg/30 bg-status-reported-bg"}`}>
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-base font-black ${warn ? "border-status-notice-fg text-status-notice-fg" : "border-status-reported-fg text-status-reported-fg"}`}>
        {warn ? "！" : "OK"}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className={`mt-1 text-sm font-bold ${warn ? "text-status-notice-fg" : "text-status-reported-fg"}`}>{label}</p>
        {notes.filter(Boolean).map((n, i) => (
          <p key={i} className="mt-1 text-xs leading-relaxed text-muted">{n}</p>
        ))}
      </div>
    </div>
  );
}

function DocList({ docs }: { docs: { title: string; meta: string; starred: boolean }[] }) {
  if (docs.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {docs.map((d, i) => (
        <div key={i} className="flex items-start gap-2.5 rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-brand-foreground">{i + 1}</span>
          <div>
            <p className="font-bold">
              {d.title}
              {d.starred && <span className="text-seal"> ＊表示あり</span>}
            </p>
            <p className="mt-0.5 text-[11.5px] text-muted">{d.meta}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================ 自治体マスタ ============================ */
function MunicipalityTab({
  municipalities,
  setMunicipalities,
  canEdit,
  showToast,
}: {
  municipalities: Municipality[];
  setMunicipalities: (m: Municipality[]) => void;
  canEdit: boolean;
  showToast: (m: string) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Municipality | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Municipality | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (form: MunicipalityInput) => {
    setBusy(true);
    try {
      if (editing) {
        const updated = await updateMunicipality(createClient(), editing.id, form);
        setMunicipalities(municipalities.map((m) => (m.id === editing.id ? updated : m)));
        showToast("自治体情報を更新しました");
      } else {
        const created = await insertMunicipality(createClient(), form);
        setMunicipalities([...municipalities, created].sort((a, b) => a.name.localeCompare(b.name, "ja")));
        showToast("自治体を追加しました");
      }
      setModalOpen(false);
      setEditing(null);
    } catch (e) {
      showToast("保存に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteMunicipality(createClient(), deleteTarget.id);
      setMunicipalities(municipalities.filter((m) => m.id !== deleteTarget.id));
      showToast("自治体を削除しました");
      setDeleteTarget(null);
    } catch (e) {
      showToast("削除に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {canEdit && (
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>＋ 自治体を追加</Button>
      )}
      {municipalities.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          自治体が登録されていません。「自治体を追加」から登録してください。
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {municipalities.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{m.name}</p>
                  <p className="truncate text-xs text-muted">{m.cert_name}</p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1.5">
                    <button type="button" onClick={() => { setEditing(m); setModalOpen(true); }} className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-muted">編集</button>
                    <button type="button" onClick={() => setDeleteTarget(m)} className="rounded-lg border border-seal/40 px-2.5 py-1 text-xs font-bold text-seal">削除</button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <YNBadge on={m.has_income} yes="所得額あり" no="所得額なし" />
                <YNBadge on={m.has_tax} yes="課税額あり" no="課税額なし" />
                <YNBadge on={m.needs_tax_payment_cert} yes="納税証明書要" no="納税証明書不要" />
                <YNBadge on={m.show_asterisk} yes="＊表示する" no="＊表示しない" />
                <YNBadge on={m.tenshutsu_self_only} yes="転出届 本人のみ" no="転出届 代理可" />
                <YNBadge on={m.juminhyo_self_only} yes="住民票 本人のみ" no="住民票 代理可" />
              </div>
              {m.note && <p className="mt-2 text-xs text-muted">{m.note}</p>}
            </Card>
          ))}
        </div>
      )}

      {modalOpen && (
        <MunicipalityModal
          initial={editing}
          busy={busy}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={save}
        />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        title="自治体を削除しますか？"
        message={`「${deleteTarget?.name}」を自治体マスタから削除します。この操作は元に戻せません。`}
        busy={busy}
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function MunicipalityModal({
  initial,
  busy,
  onClose,
  onSave,
}: {
  initial: Municipality | null;
  busy: boolean;
  onClose: () => void;
  onSave: (form: MunicipalityInput) => void;
}) {
  const [form, setForm] = useState<MunicipalityInput>(
    initial
      ? { name: initial.name, cert_name: initial.cert_name, has_income: initial.has_income, has_tax: initial.has_tax, needs_tax_payment_cert: initial.needs_tax_payment_cert, show_asterisk: initial.show_asterisk, note: initial.note, tenshutsu_self_only: initial.tenshutsu_self_only ?? false, juminhyo_self_only: initial.juminhyo_self_only ?? false }
      : { name: "", cert_name: "課税証明書", has_income: true, has_tax: true, needs_tax_payment_cert: false, show_asterisk: false, note: "", tenshutsu_self_only: false, juminhyo_self_only: false },
  );
  const set = <K extends keyof MunicipalityInput>(k: K, v: MunicipalityInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const canSave = form.name.trim() !== "" && form.cert_name.trim() !== "";

  return (
    <Modal open title={initial ? "自治体情報を編集" : "自治体を追加"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>自治体名</span>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="例：熊本市" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>証明書名称</span>
          <input value={form.cert_name} onChange={(e) => set("cert_name", e.target.value)} placeholder="例：市民税・県民税 課税証明書" className={INPUT} />
        </label>
        <div>
          <CheckRow checked={form.has_income} onChange={(v) => set("has_income", v)} label="所得額の記載がある" />
          <CheckRow checked={form.has_tax} onChange={(v) => set("has_tax", v)} label="課税額の記載がある" />
          <CheckRow checked={form.needs_tax_payment_cert} onChange={(v) => set("needs_tax_payment_cert", v)} label="納税証明書が別途必要" />
          <CheckRow checked={form.show_asterisk} onChange={(v) => set("show_asterisk", v)} label="納期未到来額・未納額を「＊」表示する" />
          <CheckRow checked={form.tenshutsu_self_only} onChange={(v) => set("tenshutsu_self_only", v)} label="転出届は本人申請のみ（代理人申請不可）" />
          <CheckRow checked={form.juminhyo_self_only} onChange={(v) => set("juminhyo_self_only", v)} label="住民票は個人番号なしでも本人申請のみ（代理人申請不可）" />
        </div>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>備考</span>
          <textarea value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="窓口情報、注意事項など" className={`${INPUT} min-h-[56px] py-2`} />
        </label>
        <Button fullWidth disabled={!canSave || busy} onClick={() => onSave({ ...form, name: form.name.trim(), cert_name: form.cert_name.trim() })}>
          {busy ? "保存中…" : "保存する"}
        </Button>
      </div>
    </Modal>
  );
}

/* ============================ 判定記録一覧 ============================ */
function methodText(method?: string, mailDate?: string, recipient?: string, agent?: string): string {
  if (!method || method === "window") return "本人が窓口で取得";
  if (method === "agent_window") return `代理人が窓口で取得（${agent || "未入力"}）`;
  const dateLabel = mailDate ? formatDateJP(mailDate) : "請求日未記録";
  if (recipient === "agent") return `郵送請求（${dateLabel}・代理人「${agent || "未入力"}」宛）`;
  return `郵送請求（${dateLabel}・本人宛）`;
}

function RecordsTab({
  records,
  setRecords,
  municipalities,
  setMunicipalities,
  canEdit,
  showToast,
}: {
  records: JudgmentRecord[];
  setRecords: (r: JudgmentRecord[]) => void;
  municipalities: Municipality[];
  setMunicipalities: (m: Municipality[]) => void;
  canEdit: boolean;
  showToast: (m: string) => void;
}) {
  const [deleteTarget, setDeleteTarget] = useState<JudgmentRecord | null>(null);
  const [editTarget, setEditTarget] = useState<JudgmentRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const [fKind, setFKind] = useState("");
  const [fMuni, setFMuni] = useState("");
  const [fCollection, setFCollection] = useState("");
  const [fKeyword, setFKeyword] = useState("");
  const [fAgent, setFAgent] = useState("");
  const [fMailOnly, setFMailOnly] = useState(false);

  const muniOptions = useMemo(() => {
    const names = Array.from(new Set(records.map((r) => r.municipalityName).filter(Boolean)));
    return names.sort((a, b) => a.localeCompare(b, "ja"));
  }, [records]);

  const filtered = useMemo(() => {
    const kw = fKeyword.trim().toLowerCase();
    const ag = fAgent.trim().toLowerCase();
    return records.filter((r) => {
      if (fKind && (r.requestKind ?? "tax") !== fKind) return false;
      if (fMuni && r.municipalityName !== fMuni) return false;
      if (fCollection && (r.requestKind ?? "tax") === "tax" && r.collectionType !== fCollection) return false;
      if (kw && !`${r.personName ?? ""} ${r.todoNumber ?? ""}`.toLowerCase().includes(kw)) return false;
      if (ag) {
        const mainAgent = (r.agentName ?? "").toLowerCase();
        const nhiAgent = (r.hasNhi && !r.nhiSameAsMain ? r.nhiAgentName ?? "" : "").toLowerCase();
        if (!mainAgent.includes(ag) && !nhiAgent.includes(ag)) return false;
      }
      if (fMailOnly) {
        const mainMail = r.requestMethod === "mail";
        const nhiMail = r.hasNhi && (r.nhiSameAsMain ? r.requestMethod === "mail" : r.nhiRequestMethod === "mail");
        if (!mainMail && !nhiMail) return false;
      }
      return true;
    });
  }, [records, fKind, fMuni, fCollection, fKeyword, fAgent, fMailOnly]);

  const hasFilter = !!(fKind || fMuni || fCollection || fKeyword || fAgent || fMailOnly);

  const persistUpdate = async (updated: JudgmentRecord) => {
    setBusy(true);
    try {
      await updateJudgmentRecord(createClient(), updated.id, updated);
      setRecords(records.map((r) => (r.id === updated.id ? updated : r)));
      showToast("更新しました");
      setEditTarget(null);
    } catch (e) {
      showToast("保存に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteJudgmentRecord(createClient(), deleteTarget.id);
      setRecords(records.filter((r) => r.id !== deleteTarget.id));
      showToast("記録を削除しました");
      setDeleteTarget(null);
    } catch (e) {
      showToast("削除に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {records.length > 0 && (
        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={LABEL}>請求書類</span>
              <select value={fKind} onChange={(e) => setFKind(e.target.value)} className={INPUT}>
                <option value="">すべて</option>
                <option value="tax">課税・納税証明書</option>
                <option value="tenshutsu">転出届</option>
                <option value="juminhyo">住民票</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>自治体</span>
              <select value={fMuni} onChange={(e) => setFMuni(e.target.value)} className={INPUT}>
                <option value="">すべて</option>
                {muniOptions.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>徴収区分</span>
              <select value={fCollection} onChange={(e) => setFCollection(e.target.value)} className={INPUT}>
                <option value="">すべて</option>
                <option value="special">特別徴収</option>
                <option value="normal">普通徴収</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>氏名・TODO番号で検索</span>
              <input value={fKeyword} onChange={(e) => setFKeyword(e.target.value)} placeholder="キーワード" className={INPUT} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>代理人名で検索</span>
              <input value={fAgent} onChange={(e) => setFAgent(e.target.value)} placeholder="代理人名" className={INPUT} />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={fMailOnly} onChange={(e) => setFMailOnly(e.target.checked)} className="h-4 w-4" />
              郵送請求したものだけ表示
            </label>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span>全{records.length}件中 <strong className="text-foreground">{filtered.length}</strong>件</span>
              {hasFilter && (
                <button type="button" onClick={() => { setFKind(""); setFMuni(""); setFCollection(""); setFKeyword(""); setFAgent(""); setFMailOnly(false); }} className="font-bold text-brand">クリア</button>
              )}
            </div>
          </div>
        </Card>
      )}

      {records.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          まだ記録がありません。「判定フォーム」タブで判定後、結果を保存してください。
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">条件に一致する記録がありません。</Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {r.workerId ? (
                    <Link href={`/workers/${r.workerId}`} className="truncate font-bold text-brand hover:underline">
                      {r.personName || "（氏名未入力）"}
                    </Link>
                  ) : (
                    <p className="truncate font-bold">{r.personName || "（氏名未入力）"}</p>
                  )}
                  <p className="truncate text-xs text-muted">
                    {r.todoNumber ? `TODO ${r.todoNumber} ・ ` : ""}
                    {new Date(r.createdAt).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1.5">
                    <button type="button" onClick={() => setEditTarget(r)} className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-muted">編集</button>
                    <button type="button" onClick={() => setDeleteTarget(r)} className="rounded-lg border border-seal/40 px-2.5 py-1 text-xs font-bold text-seal">削除</button>
                  </div>
                )}
              </div>

              {r.requestKind === "tenshutsu" || r.requestKind === "juminhyo" ? (
                /* 転出届・住民票の請求記録 */
                <div className="rounded-xl bg-background p-3 text-xs leading-relaxed">
                  <p className="font-bold">
                    {requestKindLabel(r.requestKind)}
                    <span className="font-medium text-muted">（請求先: {r.cityOffice || "未入力"}）</span>
                  </p>
                  {r.requestKind === "tenshutsu" && (
                    <>
                      {r.movingDate && <p className="text-muted">転出日：{formatDateJP(r.movingDate)}</p>}
                      {r.newAddress && <p className="text-muted">転入先：{r.newAddress}</p>}
                    </>
                  )}
                  {r.requestKind === "juminhyo" && (
                    <>
                      <p className="text-muted">
                        {juminhyoTitle(!!r.juminhyoMyNumber)}
                        {(r.juminhyoCopies ?? 1) > 1 ? `　${r.juminhyoCopies}通` : ""}
                      </p>
                      {r.juminhyoPurpose && <p className="text-muted">目的：{r.juminhyoPurpose}</p>}
                    </>
                  )}
                  {r.requestKind === "juminhyo" && r.juminhyoMethod === "window" ? (
                    <p className="mt-1">窓口発行：{applicantLabel(r.applicantType, r.applicantAgentName)}</p>
                  ) : (
                    <p className="mt-1">
                      郵送請求：{applicantLabel(r.applicantType, r.applicantAgentName)}
                      {r.postDate ? `（投函日 ${formatDateJP(r.postDate)}）` : "（投函日未記録）"}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-background p-3 text-xs leading-relaxed">
                  <p className="font-bold">
                    {r.municipalityName}
                    <span className="font-medium text-muted">（{collectionLabel(r.collectionType)}）</span>
                  </p>
                  <p className="text-muted">{r.yearType === "prev" ? "前年度" : "新年度"}：{yearWithReiwa(r.fiscalStartYear)}</p>
                  <p className="mt-1">受領：{methodText(r.requestMethod, r.mailRequestDate, r.recipientType, r.agentName)}</p>
                  {r.mainAlternativeNote && <p className="mt-1 text-status-notice-fg">代替：{r.mainAlternativeNote}</p>}
                  <PhoneLogView prefix="main" r={r} />
                </div>
              )}

              {/* 郵送請求に同封した定額小為替と、後日届く領収書 */}
              <MoneyOrderReceiptView record={r} canEdit={canEdit} />

              {r.hasNhi && (
                <div className="mt-2 rounded-xl border-l-2 border-status-notice-fg bg-background p-3 text-xs leading-relaxed">
                  <p className="font-bold">国保：{r.nhiMunicipalityName || "未選択"}</p>
                  <p className="text-muted">新年度：{yearWithReiwa(r.nhiFiscalStartYear ?? 0)}</p>
                  <p className="mt-1">
                    受領：{r.nhiSameAsMain ? "課税証明書と同じ" : methodText(r.nhiRequestMethod, r.nhiMailRequestDate, r.nhiRecipientType, r.nhiAgentName)}
                  </p>
                  {r.nhiAlternativeNote && <p className="mt-1 text-status-notice-fg">代替：{r.nhiAlternativeNote}</p>}
                  <PhoneLogView prefix="nhi" r={r} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {editTarget &&
        (editTarget.requestKind === "tenshutsu" || editTarget.requestKind === "juminhyo" ? (
          <ExtraEditModal
            record={editTarget}
            municipalities={municipalities}
            setMunicipalities={setMunicipalities}
            busy={busy}
            onClose={() => setEditTarget(null)}
            onSave={persistUpdate}
            canEdit={canEdit}
            showToast={showToast}
          />
        ) : (
          <RecipientEditModal record={editTarget} busy={busy} onClose={() => setEditTarget(null)} onSave={persistUpdate} canEdit={canEdit} />
        ))}
      <ConfirmDialog
        open={!!deleteTarget}
        title="記録を削除しますか？"
        message={`${deleteTarget?.municipalityName ?? ""} の判定記録（${deleteTarget ? formatDateJP(deleteTarget.appDate) : ""}）を削除します。元に戻せません。`}
        busy={busy}
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// 記録一覧のカードに出す「定額小為替」と「領収書」。
// 郵送請求した記録だけに出す（窓口で受け取るものは小為替も領収書も無い）
function MoneyOrderReceiptView({
  record,
  canEdit,
}: {
  record: JudgmentRecord;
  canEdit: boolean;
}) {
  const orders = record.moneyOrders ?? [];
  const mailed =
    record.requestMethod === "mail" ||
    (record.requestKind === "tenshutsu" && record.requestMethod !== "window") ||
    (record.requestKind === "juminhyo" && record.juminhyoMethod !== "window");
  if (!mailed) return null;
  return (
    <div className="mt-2 rounded-xl bg-background p-3 text-xs leading-relaxed">
      <p className="font-bold">{moneyOrderSummary(orders) || "定額小為替 未登録"}</p>
      {orders.map((o) => (
        <p key={o.id} className="text-muted">
          <span className="tabular-nums">{moneyOrderNo(o) || "番号未入力"}</span>
          {o.amount ? `　${Number(o.amount).toLocaleString("ja-JP")}円` : ""}
          {o.docTitle ? `（${o.docTitle}）` : ""}
        </p>
      ))}
      {orders.length === 0 && (
        <p className="text-muted">「編集」から為替証書の番号を登録できます。</p>
      )}
      <div className="mt-2 border-t border-dashed border-border pt-2">
        <p className="mb-1 font-bold">領収書（後日届いたら添付）</p>
        <MailingFileAttachments
          recordId={record.id}
          kind={RECEIPT_KIND}
          filterKind={RECEIPT_KIND}
          addLabel="領収書を添付（画像・PDF）"
          canEdit={canEdit}
        />
      </div>
    </div>
  );
}

function PhoneLogView({ prefix, r }: { prefix: "main" | "nhi"; r: JudgmentRecord }) {
  const contact = r[`${prefix}PhoneContact`] as string | undefined;
  const content = r[`${prefix}PhoneContent`] as string | undefined;
  const needed = r[`${prefix}PhoneNeeded`] as string | undefined;
  const unpaid = r[`${prefix}UnpaidAmount`] as string | undefined;
  const status = r[`${prefix}PaymentStatus`] as string | undefined;
  if (!contact && !content && !needed && !unpaid && !status) return null;
  return (
    <div className="mt-2 rounded-lg bg-status-notice-bg/50 p-2 text-[11px] text-status-notice-fg">
      {contact && <p><span className="font-bold">担当者：</span>{contact}</p>}
      {content && <p><span className="font-bold">内容：</span>{content}</p>}
      {needed && <p><span className="font-bold">送付依頼：</span>{needed}</p>}
      {unpaid && <p><span className="font-bold">未納額：</span>{formatYen(unpaid)}</p>}
      {status && <p><span className="font-bold">状況：</span>{paymentStatusLabel(status)}</p>}
    </div>
  );
}

function RecipientEditModal({
  record,
  busy,
  onClose,
  onSave,
  canEdit,
}: {
  record: JudgmentRecord;
  busy: boolean;
  onClose: () => void;
  onSave: (r: JudgmentRecord) => void;
  canEdit: boolean;
}) {
  const [method, setMethod] = useState<RequestMethod>(record.requestMethod || "window");
  const [mailDate, setMailDate] = useState(record.mailRequestDate || todayISO());
  const [recipient, setRecipient] = useState<RecipientType>(record.recipientType || "self");
  const [agent, setAgent] = useState(record.agentName || "");
  const [mainAlt, setMainAlt] = useState(record.mainAlternativeNote || "");
  const [moneyOrders, setMoneyOrders] = useState<MoneyOrder[]>(record.moneyOrders ?? []);

  const [nhiSameAsMain, setNhiSameAsMain] = useState(record.hasNhi ? record.nhiSameAsMain !== false : true);
  const [nhiMethod, setNhiMethod] = useState<RequestMethod>(record.nhiRequestMethod || "window");
  const [nhiMailDate, setNhiMailDate] = useState(record.nhiMailRequestDate || todayISO());
  const [nhiRecipient, setNhiRecipient] = useState<RecipientType>(record.nhiRecipientType || "self");
  const [nhiAgent, setNhiAgent] = useState(record.nhiAgentName || "");
  const [nhiAlt, setNhiAlt] = useState(record.nhiAlternativeNote || "");

  const [mpc, setMpc] = useState((record.mainPhoneContact as string) || "");
  const [mpn, setMpn] = useState((record.mainPhoneContent as string) || "");
  const [mpd, setMpd] = useState((record.mainPhoneNeeded as string) || "");
  const [mua, setMua] = useState((record.mainUnpaidAmount as string) || "");
  const [mps, setMps] = useState((record.mainPaymentStatus as string) || "");
  const [npc, setNpc] = useState((record.nhiPhoneContact as string) || "");
  const [npn, setNpn] = useState((record.nhiPhoneContent as string) || "");
  const [npd, setNpd] = useState((record.nhiPhoneNeeded as string) || "");
  const [nua, setNua] = useState((record.nhiUnpaidAmount as string) || "");
  const [nps, setNps] = useState((record.nhiPaymentStatus as string) || "");

  // 国保税納税証明書の分の定額小為替（郵送で受け取るときだけ）
  const nhiOrderTitles = nhiMailedTitles({
    requestMethod: method,
    hasNhi: record.hasNhi,
    nhiSameAsMain,
    nhiRequestMethod: nhiMethod,
    docs: record.docs,
  });

  const canSave =
    checkMethodValid(method, mailDate, recipient, agent) &&
    (!record.hasNhi || nhiSameAsMain || checkMethodValid(nhiMethod, nhiMailDate, nhiRecipient, nhiAgent));

  const submit = () => {
    if (!canSave) return;
    const mainInfo = buildMethodInfo(method, mailDate, recipient, agent);
    const updated: JudgmentRecord = {
      ...record,
      ...mainInfo,
      mainAlternativeNote: mainAlt.trim(),
      mainPhoneContact: mpc.trim(),
      mainPhoneContent: mpn.trim(),
      mainPhoneNeeded: mpd.trim(),
      mainUnpaidAmount: mua,
      mainPaymentStatus: mps as JudgmentRecord["mainPaymentStatus"],
      moneyOrders,
    };
    if (record.hasNhi) {
      updated.nhiAlternativeNote = nhiAlt.trim();
      updated.nhiPhoneContact = npc.trim();
      updated.nhiPhoneContent = npn.trim();
      updated.nhiPhoneNeeded = npd.trim();
      updated.nhiUnpaidAmount = nua;
      updated.nhiPaymentStatus = nps as JudgmentRecord["nhiPaymentStatus"];
      if (nhiSameAsMain) {
        updated.nhiSameAsMain = true;
        updated.nhiRequestMethod = mainInfo.requestMethod;
        updated.nhiMailRequestDate = mainInfo.mailRequestDate;
        updated.nhiRecipientType = mainInfo.recipientType;
        updated.nhiAgentName = mainInfo.agentName;
      } else {
        const b = buildMethodInfo(nhiMethod, nhiMailDate, nhiRecipient, nhiAgent);
        updated.nhiSameAsMain = false;
        updated.nhiRequestMethod = b.requestMethod;
        updated.nhiMailRequestDate = b.mailRequestDate;
        updated.nhiRecipientType = b.recipientType;
        updated.nhiAgentName = b.agentName;
      }
    }
    onSave(updated);
  };

  return (
    <Modal open title="受領方法・メモを編集" onClose={onClose}>
      <div className="flex flex-col gap-2">
        <MethodToggleSection
          title={record.hasNhi ? "課税証明書・市県民税納税証明書" : undefined}
          method={method}
          setMethod={setMethod}
          mailDate={mailDate}
          setMailDate={setMailDate}
          recipient={recipient}
          setRecipient={setRecipient}
          agent={agent}
          setAgent={setAgent}
          orderTitles={mainMailedTitles({
            requestMethod: method,
            yearType: record.yearType,
            docs: record.docs,
          })}
          orders={moneyOrders}
          setOrders={setMoneyOrders}
        />
        <label className="mt-3 flex flex-col gap-1">
          <span className={LABEL}>代替対応の備考（課税証明書等）</span>
          <textarea value={mainAlt} onChange={(e) => setMainAlt(e.target.value)} className={`${INPUT} min-h-[48px] py-2`} />
        </label>
        <div className="mt-3 border-t border-dashed border-border pt-3">
          <p className="mb-2 text-sm font-bold text-muted">電話連絡メモ（課税証明書等）</p>
          <PhoneLogFields contact={mpc} setContact={setMpc} content={mpn} setContent={setMpn} needed={mpd} setNeeded={setMpd} unpaidAmount={mua} setUnpaidAmount={setMua} paymentStatus={mps} setPaymentStatus={setMps} />
        </div>

        {record.hasNhi && (
          <>
            <div className="mt-3 border-t border-dashed border-border pt-3">
              <p className="mb-2 text-sm font-bold text-muted">国保税納税証明書</p>
              <div className="mb-2 flex flex-wrap gap-2">
                <Pill active={nhiSameAsMain} onClick={() => setNhiSameAsMain(true)}>課税証明書と同じ受領方法</Pill>
                <Pill active={!nhiSameAsMain} onClick={() => setNhiSameAsMain(false)}>別の受領方法</Pill>
              </div>
              {!nhiSameAsMain && (
                <MethodToggleSection method={nhiMethod} setMethod={setNhiMethod} mailDate={nhiMailDate} setMailDate={setNhiMailDate} recipient={nhiRecipient} setRecipient={setNhiRecipient} agent={nhiAgent} setAgent={setNhiAgent} />
              )}
              {nhiOrderTitles.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-sm font-bold text-muted">同封した定額小為替</p>
                  <MoneyOrderFields
                    titles={nhiOrderTitles}
                    orders={moneyOrders}
                    onChange={setMoneyOrders}
                    group="nhi"
                  />
                </div>
              )}
            </div>
            <label className="mt-3 flex flex-col gap-1">
              <span className={LABEL}>代替対応の備考（国保税納税証明書）</span>
              <textarea value={nhiAlt} onChange={(e) => setNhiAlt(e.target.value)} className={`${INPUT} min-h-[48px] py-2`} />
            </label>
            <div className="mt-3 border-t border-dashed border-border pt-3">
              <p className="mb-2 text-sm font-bold text-muted">電話連絡メモ（国保税納税証明書）</p>
              <PhoneLogFields contact={npc} setContact={setNpc} content={npn} setContent={setNpn} needed={npd} setNeeded={setNpd} unpaidAmount={nua} setUnpaidAmount={setNua} paymentStatus={nps} setPaymentStatus={setNps} />
            </div>
          </>
        )}

        <div className="mt-3 border-t border-dashed border-border pt-3">
          <p className="mb-1 text-sm font-bold text-muted">領収書（後日届いたら添付）</p>
          <p className="mb-2 text-[11px] text-muted">
            手数料の領収書が郵送で届いたら、ここに画像・PDFを添付してください。
          </p>
          <MailingFileAttachments
            recordId={record.id}
            kind={RECEIPT_KIND}
            filterKind={RECEIPT_KIND}
            addLabel="領収書を添付（画像・PDF）"
            canEdit={canEdit}
          />
        </div>

        <Button fullWidth className="mt-3" disabled={!canSave || busy} onClick={submit}>
          {busy ? "保存中…" : "保存する"}
        </Button>
      </div>
    </Modal>
  );
}
