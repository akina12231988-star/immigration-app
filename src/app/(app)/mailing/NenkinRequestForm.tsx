"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { insertJudgmentRecord } from "@/lib/supabase/queries/tax-cert";
import { NenkinOfficeDocs } from "@/components/workers/ApplicationPrepChecklist";
import { PersonCopyPanel } from "@/components/mailing/PersonCopyPanel";
import { SaveBlockers } from "@/components/mailing/SaveBlockers";
import { MailingRecordAttachments } from "@/components/mailing/MailingRecordAttachments";
import {
  MailingProgressFields,
  mailingProgressPatch,
  mailingProgressValuesFromRecord,
  type MailingProgressValues,
} from "@/components/mailing/MailingProgressFields";
import { formatDateJP, todayISO, type JudgmentRecord, type NenkinMethod } from "@/lib/tax-cert";
import { INPUT, LABEL, Pill } from "./ui";

// 年金記録（年金加入記録・国民年金保険料納付記録）を年金事務所に請求する。
// 申請準備の「年金記録」と同じく、交付申請書（自動入力）・委任状・在留カードを印刷して出す。
// 郵送で請求するか、代理人が窓口で取ってくるかを選び、記録として残す（記録の詳細で届いた年金記録を添付）

interface NenkinValues {
  method: NenkinMethod;
  office: string; // 年金事務所
  postDate: string; // 投函日（郵送）
  agentName: string; // 代理人（窓口）
}

const emptyValues = (): NenkinValues => ({ method: "mail", office: "", postDate: "", agentName: "" });

function nenkinPatch(v: NenkinValues): Partial<JudgmentRecord> {
  const mailed = v.method === "mail";
  return {
    requestKind: "nenkin",
    nenkinMethod: v.method,
    pensionOffice: v.office.trim(),
    postDate: mailed ? v.postDate : "",
    applicantType: mailed ? "self" : "agent",
    applicantAgentName: mailed ? "" : v.agentName.trim(),
    docs: [{ title: "年金記録", meta: mailed ? "年金事務所へ郵送請求" : "代理人が年金事務所の窓口で取得", starred: false }],
  } as Partial<JudgmentRecord>;
}

function NenkinFields({ v, set }: { v: NenkinValues; set: (p: Partial<NenkinValues>) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <span className={LABEL}>請求のしかた</span>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Pill active={v.method === "mail"} onClick={() => set({ method: "mail" })}>
            年金事務所へ郵送請求
          </Pill>
          <Pill active={v.method === "window"} onClick={() => set({ method: "window" })}>
            代理人が窓口で取得
          </Pill>
        </div>
      </div>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>請求先の年金事務所</span>
        <input value={v.office} onChange={(e) => set({ office: e.target.value })} placeholder="例: 八代年金事務所" className={INPUT} />
      </label>
      {v.method === "mail" ? (
        <label className="flex flex-col gap-1">
          <span className={LABEL}>投函日（投函したら入れる）</span>
          <input type="date" value={v.postDate} onChange={(e) => set({ postDate: e.target.value })} className={INPUT} />
        </label>
      ) : (
        <label className="flex flex-col gap-1">
          <span className={LABEL}>代理人の名前</span>
          <input value={v.agentName} onChange={(e) => set({ agentName: e.target.value })} placeholder="例: VU THI NGA" className={INPUT} />
        </label>
      )}
    </div>
  );
}

export function NenkinRequestForm({
  personName,
  workerId,
  todoNumber,
  workerAddress,
  records,
  setRecords,
  canEdit,
  showToast,
}: {
  personName: string;
  workerId: string;
  todoNumber: string;
  workerAddress: string;
  records: JudgmentRecord[];
  setRecords: (r: JudgmentRecord[]) => void;
  canEdit: boolean;
  showToast: (m: string) => void;
}) {
  const router = useRouter();
  const [v, setV] = useState<NenkinValues>(emptyValues);
  const set = (p: Partial<NenkinValues>) => setV((x) => ({ ...x, ...p }));
  const [busy, setBusy] = useState(false);

  const reasons = [
    !canEdit && "閲覧のみの権限では保存できません",
    !personName.trim() && "上の「対象者情報」で外国人を選んでください",
    !v.office.trim() && "請求先の年金事務所を入れてください",
    v.method === "window" && !v.agentName.trim() && "代理人の名前を入れてください",
  ].filter((x): x is string => !!x);

  const save = async () => {
    if (reasons.length > 0) return;
    const record = {
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
      requestMethod: v.method === "mail" ? "mail" : "agent_window",
      mailRequestDate: "",
      recipientType: "self",
      agentName: "",
      nhiRequestMethod: "window",
      nhiMailRequestDate: "",
      nhiRecipientType: "self",
      nhiAgentName: "",
      nhiSameAsMain: true,
      workerAddress,
      // 投函日があれば郵送待ちから始める
      mailingProgress: v.method === "mail" && v.postDate ? "waiting" : "preparing",
      ...nenkinPatch(v),
    } as JudgmentRecord;
    setBusy(true);
    try {
      const saved = await insertJudgmentRecord(createClient(), record);
      setRecords([saved, ...records]);
      showToast("年金記録の請求を記録しました");
      // 記録したら、その記録の詳細ページを開く（届いた年金記録の添付・進捗はそこで）
      router.push(`/mailing/records/${saved.id}?saved=1`);
    } catch (e) {
      showToast("保存に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4 p-4">
      <div>
        <p className="mb-1 text-sm font-bold">年金記録の請求（年金事務所）</p>
        <p className="text-xs text-muted">
          年金加入記録・国民年金保険料納付記録を年金事務所に請求します。申請準備の「年金記録」と同じ書類（交付申請書・委任状・在留カード）を印刷して出してください。
        </p>
      </div>
      {workerId ? (
        <>
          <NenkinOfficeDocs workerId={workerId} canEdit={canEdit} />
          <div className="rounded-xl border border-border bg-surface p-3">
            <PersonCopyPanel workerId={workerId} />
          </div>
        </>
      ) : (
        <p className="rounded-xl bg-background p-3 text-sm text-muted">
          上の「対象者情報」で外国人を選ぶと、交付申請書（自動入力）・委任状・在留カードの印刷と、本人の情報のコピーが出ます。
        </p>
      )}
      <NenkinFields v={v} set={set} />
      {canEdit && (
        <Button fullWidth disabled={busy || reasons.length > 0} onClick={() => void save()}>
          {busy ? "保存中…" : "この請求を記録として保存"}
        </Button>
      )}
      <SaveBlockers reasons={reasons} />
    </Card>
  );
}

// 記録一覧・詳細に出す年金記録の請求の中身
export function NenkinRecordView({ record: r }: { record: JudgmentRecord }) {
  const mailed = r.nenkinMethod !== "window";
  return (
    <div className="rounded-xl bg-background p-3 text-xs leading-relaxed">
      <p className="font-bold">
        年金記録
        <span className="font-medium text-muted">（請求先: {r.pensionOffice || "年金事務所未入力"}）</span>
      </p>
      {mailed ? (
        <p className="mt-1">郵送請求{r.postDate ? `（投函日 ${formatDateJP(r.postDate)}）` : "（投函日未記録）"}</p>
      ) : (
        <p className="mt-1">代理人が窓口で取得（{r.applicantAgentName || "代理人未入力"}）</p>
      )}
    </div>
  );
}

// 年金記録の請求の編集（請求のしかた・年金事務所・投函日／代理人・進捗・添付）
export function NenkinEditModal({
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
  const [v, setV] = useState<NenkinValues>({
    method: record.nenkinMethod ?? "mail",
    office: record.pensionOffice ?? "",
    postDate: record.postDate ?? "",
    agentName: record.applicantAgentName ?? "",
  });
  const set = (p: Partial<NenkinValues>) => setV((x) => ({ ...x, ...p }));
  const [prog, setProg] = useState<MailingProgressValues>(() => mailingProgressValuesFromRecord(record));
  const mailed = v.method === "mail";
  return (
    <Modal open title="年金記録の請求を編集" onClose={onClose}>
      <div className="space-y-3">
        <NenkinFields v={v} set={set} />
        <MailingProgressFields
          requestKind="nenkin"
          mailed={mailed}
          postDate={mailed ? v.postDate : ""}
          v={prog}
          set={(p) => setProg((x) => ({ ...x, ...p }))}
          canEdit={canEdit}
        />
        <MailingRecordAttachments record={record} canEdit={canEdit} />
        {canEdit && (
          <Button
            fullWidth
            disabled={busy || !v.office.trim()}
            onClick={() =>
              onSave({
                ...record,
                ...nenkinPatch(v),
                requestMethod: mailed ? "mail" : "agent_window",
                ...mailingProgressPatch(prog, { postDate: mailed ? v.postDate : "" }),
              } as JudgmentRecord)
            }
          >
            {busy ? "保存中…" : "保存する"}
          </Button>
        )}
      </div>
    </Modal>
  );
}
