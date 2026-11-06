"use client";

import { useState } from "react";
import { Scissors } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { insertJudgmentRecord, updateJudgmentRecord } from "@/lib/supabase/queries/tax-cert";
import { nhiInOtherMunicipality, splitNhiRecord } from "@/lib/mailing-split";
import { todayISO, type JudgmentRecord, type RecipientType, type RequestMethod } from "@/lib/tax-cert";
import { MethodToggleSection, buildMethodInfo, checkMethodValid } from "../../tax-parts";

// 1つの記録で請求している国保税の納税証明書を、別の記録に分ける（受け取り方を変えて）。
// 国保の自治体が課税証明書と違う（別の市役所へ郵送する）ときなどに、記録の詳細から直せるようにする
export function NhiSplitPanel({
  record,
  onSplit,
}: {
  record: JudgmentRecord;
  onSplit: (main: JudgmentRecord | null, nhi: JudgmentRecord) => void;
}) {
  const otherMuni = nhiInOtherMunicipality(record);
  const [open, setOpen] = useState(otherMuni);
  const [method, setMethod] = useState<RequestMethod>(otherMuni ? "mail" : "agent_window");
  const [mailDate, setMailDate] = useState(todayISO());
  const [recipient, setRecipient] = useState<RecipientType>("self");
  const [agent, setAgent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nhiMunis = (record.nhiYears ?? []).map((n) => n.municipalityName).join("・");

  const split = async () => {
    if (!checkMethodValid(method, mailDate, recipient, agent)) {
      setError("国保税の納税証明書の受領方法の入力を確認してください（郵送なら請求した日、代理人なら氏名）。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { main, nhi } = splitNhiRecord(record, buildMethodInfo(method, mailDate, recipient, agent));
      const supabase = createClient();
      const createdNhi = await insertJudgmentRecord(supabase, nhi);
      if (main) await updateJudgmentRecord(supabase, record.id, main);
      onSplit(main, createdNhi);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分けられませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-2xl border-2 p-4 ${otherMuni ? "border-status-notice-fg/50 bg-status-notice-bg/40" : "border-border bg-surface"}`}>
      <p className="flex items-center gap-1.5 text-sm font-bold">
        <Scissors size={15} />
        国民健康保険税の納税証明書（{nhiMunis}）を別の記録に分ける
      </p>
      <p className="mt-1 text-xs text-muted">
        {otherMuni
          ? `国保に加入していた自治体（${nhiMunis}）は課税証明書の自治体と違うので、別の市役所への請求として別の記録に分けるのがおすすめです。`
          : "国保税の納税証明書だけ受け取り方を変えたいときに使います。"}
        分けると、進捗（郵送待ち／代理人の発行待ち）・添付が記録ごとに別になります。
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 rounded-lg border border-brand px-3 py-1.5 text-xs font-bold text-brand"
        >
          分ける
        </button>
      ) : (
        <>
          <MethodToggleSection
            title="国保税の納税証明書の受領方法"
            method={method}
            setMethod={setMethod}
            mailDate={mailDate}
            setMailDate={setMailDate}
            recipient={recipient}
            setRecipient={setRecipient}
            agent={agent}
            setAgent={setAgent}
          />
          {error && <p className="mt-2 rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => void split()}
            className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground disabled:opacity-50"
          >
            <Scissors size={15} />
            {busy ? "分けています…" : "国保税の納税証明書を別の記録にする"}
          </button>
          <p className="mt-1 text-[11px] text-muted">
            すでにこの記録に添付したファイルは、この記録に残ります（国保税の分は、分けたあとの記録に添付し直してください）。
          </p>
        </>
      )}
    </div>
  );
}
