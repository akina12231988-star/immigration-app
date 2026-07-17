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
import {
  buildRequiredDocs,
  collectionLabel,
  fiscalYearLabel,
  formatDateJP,
  formatYen,
  judgeNhiYear,
  judgeTiming,
  judgeYear,
  paymentStatusLabel,
  todayISO,
  yearWithReiwa,
  type CollectionType,
  type JudgmentRecord,
  type Municipality,
  type MunicipalityInput,
  type RecipientType,
  type RequestMethod,
} from "@/lib/tax-cert";

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
  workers?: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<"judge" | "muni" | "records">("judge");
  const [municipalities, setMunicipalities] = useState(initialMunicipalities);
  const [records, setRecords] = useState(initialRecords);
  const [importOpen, setImportOpen] = useState(false);
  const [showToast, toastNode] = useToast();

  const tabs = [
    { key: "judge" as const, label: "判定フォーム" },
    { key: "muni" as const, label: `自治体マスタ (${municipalities.length})` },
    { key: "records" as const, label: `判定記録一覧 (${records.length})` },
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
          records={records}
          setRecords={setRecords}
          workers={workers}
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
  records,
  setRecords,
  workers,
  canEdit,
  showToast,
}: {
  municipalities: Municipality[];
  records: JudgmentRecord[];
  setRecords: (r: JudgmentRecord[]) => void;
  workers: { id: string; name: string }[];
  canEdit: boolean;
  showToast: (m: string) => void;
}) {
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

  const [nhiSameAsMain, setNhiSameAsMain] = useState(true);
  const [nhiMethod, setNhiMethod] = useState<RequestMethod>("window");
  const [nhiMailDate, setNhiMailDate] = useState(todayISO());
  const [nhiRecipient, setNhiRecipient] = useState<RecipientType>("self");
  const [nhiAgent, setNhiAgent] = useState("");

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
              <MethodToggleSection title="受領方法" method={method} setMethod={setMethod} mailDate={mailDate} setMailDate={setMailDate} recipient={recipient} setRecipient={setRecipient} agent={agent} setAgent={setAgent} />
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
    </div>
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
      ? { name: initial.name, cert_name: initial.cert_name, has_income: initial.has_income, has_tax: initial.has_tax, needs_tax_payment_cert: initial.needs_tax_payment_cert, show_asterisk: initial.show_asterisk, note: initial.note }
      : { name: "", cert_name: "課税証明書", has_income: true, has_tax: true, needs_tax_payment_cert: false, show_asterisk: false, note: "" },
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
  canEdit,
  showToast,
}: {
  records: JudgmentRecord[];
  setRecords: (r: JudgmentRecord[]) => void;
  canEdit: boolean;
  showToast: (m: string) => void;
}) {
  const [deleteTarget, setDeleteTarget] = useState<JudgmentRecord | null>(null);
  const [editTarget, setEditTarget] = useState<JudgmentRecord | null>(null);
  const [busy, setBusy] = useState(false);

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
      if (fMuni && r.municipalityName !== fMuni) return false;
      if (fCollection && r.collectionType !== fCollection) return false;
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
  }, [records, fMuni, fCollection, fKeyword, fAgent, fMailOnly]);

  const hasFilter = !!(fMuni || fCollection || fKeyword || fAgent || fMailOnly);

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
                <button type="button" onClick={() => { setFMuni(""); setFCollection(""); setFKeyword(""); setFAgent(""); setFMailOnly(false); }} className="font-bold text-brand">クリア</button>
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

      {editTarget && (
        <RecipientEditModal record={editTarget} busy={busy} onClose={() => setEditTarget(null)} onSave={persistUpdate} />
      )}
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
}: {
  record: JudgmentRecord;
  busy: boolean;
  onClose: () => void;
  onSave: (r: JudgmentRecord) => void;
}) {
  const [method, setMethod] = useState<RequestMethod>(record.requestMethod || "window");
  const [mailDate, setMailDate] = useState(record.mailRequestDate || todayISO());
  const [recipient, setRecipient] = useState<RecipientType>(record.recipientType || "self");
  const [agent, setAgent] = useState(record.agentName || "");
  const [mainAlt, setMainAlt] = useState(record.mainAlternativeNote || "");

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
        <MethodToggleSection title={record.hasNhi ? "課税証明書・市県民税納税証明書" : undefined} method={method} setMethod={setMethod} mailDate={mailDate} setMailDate={setMailDate} recipient={recipient} setRecipient={setRecipient} agent={agent} setAgent={setAgent} />
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

        <Button fullWidth className="mt-3" disabled={!canSave || busy} onClick={submit}>
          {busy ? "保存中…" : "保存する"}
        </Button>
      </div>
    </Modal>
  );
}
