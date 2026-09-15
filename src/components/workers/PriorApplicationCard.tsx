"use client";

import { useEffect, useState } from "react";
import { FileClock, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { listApplicationsByWorker } from "@/lib/supabase/queries/applications";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { todayStr } from "@/lib/application-alerts";
import { dbErrorMessage } from "@/lib/errors";
import {
  priorApplication,
  priorApplicationText,
  type PriorApplication,
  type PriorApplicationSource,
} from "@/lib/prior-application";
import { CopyButton } from "@/components/ui/CopyButton";

const INPUT =
  "min-h-[36px] rounded-lg border border-border bg-surface px-2 text-sm focus:border-brand focus:outline-none disabled:opacity-60";

// 前回の申請（1年以内）の申請日・申請番号。
// 申請一覧から自動で拾い、無ければ外国人情報に手で入れた値を使う。
// 申請準備（書類の行の案内）と外国人詳細（入管申請の欄）の両方で同じものを使う
export function usePriorApplication({
  workerId,
  applications,
  manualOn,
  manualNo,
}: {
  workerId: string;
  applications?: PriorApplicationSource[]; // 渡さなければこの中で読む
  manualOn?: string | null; // 渡さなければこの中で読む
  manualNo?: string | null;
}) {
  const [apps, setApps] = useState<PriorApplicationSource[]>(applications ?? []);
  const [on, setOn] = useState(manualOn ?? "");
  const [no, setNo] = useState(manualNo ?? "");
  const needApps = applications === undefined;
  const needManual = manualOn === undefined && manualNo === undefined;

  useEffect(() => {
    if (!needApps && !needManual) return;
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      if (needApps) {
        const rows = await listApplicationsByWorker(supabase, workerId).catch(() => []);
        if (!cancelled) setApps(rows);
      }
      if (needManual) {
        const { data } = await supabase
          .from("workers")
          .select("prior_application_on, prior_application_no")
          .eq("id", workerId)
          .maybeSingle();
        const w = data as { prior_application_on: string | null; prior_application_no: string } | null;
        if (!cancelled && w) {
          setOn(w.prior_application_on ?? "");
          setNo(w.prior_application_no ?? "");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workerId, needApps, needManual]);

  const prior = priorApplication(apps, { on, no }, todayStr());
  return { prior, manualOn: on, manualNo: no, setManualOn: setOn, setManualNo: setNo };
}

export type PriorApplicationState = ReturnType<typeof usePriorApplication>;

export function PriorApplicationCard({
  workerId,
  state,
  canEdit,
  onSaved,
}: {
  workerId: string;
  state: PriorApplicationState;
  canEdit: boolean;
  onSaved?: (on: string | null, no: string) => void;
}) {
  const { prior, manualOn, manualNo, setManualOn, setManualNo } = state;
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const on = manualOn || null;
      const no = manualNo.trim();
      await updateWorker(createClient(), workerId, {
        prior_application_on: on,
        prior_application_no: no,
      });
      setManualNo(no);
      setSaved(true);
      onSaved?.(on, no);
    } catch (err) {
      setError(dbErrorMessage(err, "0158_worker_prior_application.sql"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2.5 text-xs">
      <p className="flex items-center gap-1.5 font-bold text-muted">
        <FileClock size={13} />
        前回の申請（1年以内）の申請日・申請番号
      </p>
      <p className="mt-0.5 text-[11px] text-muted">
        課税証明書・納税証明書（市県民税／国保税）・源泉徴収票・保険証・年金記録は、1年以内の申請で提出していれば
        この申請日と申請番号を書くことで再提出を省けます。
      </p>
      {prior?.source === "auto" ? (
        <AutoLine prior={prior} />
      ) : (
        <>
          <p className="mt-1.5 text-[11px] text-seal">
            申請一覧に1年以内の申請がありません。前回の申請が分かれば手で入れてください（外国人詳細・申請準備の両方に出ます）。
          </p>
          {prior?.source === "manual" && (
            <p className="mt-1 flex flex-wrap items-center gap-2 font-bold">
              <span>{priorApplicationText(prior)}</span>
              {prior.applicationNo && <CopyButton value={prior.applicationNo} label="申請番号をコピー" />}
            </p>
          )}
          {canEdit && (
            <div className="mt-1.5 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-muted">申請日</span>
                <input
                  type="date"
                  value={manualOn}
                  onChange={(e) => {
                    setManualOn(e.target.value);
                    setSaved(false);
                  }}
                  disabled={busy}
                  className={INPUT}
                />
              </label>
              <label className="flex min-w-[10rem] flex-1 flex-col gap-0.5">
                <span className="text-[10px] font-bold text-muted">申請番号</span>
                <input
                  value={manualNo}
                  onChange={(e) => {
                    setManualNo(e.target.value);
                    setSaved(false);
                  }}
                  disabled={busy}
                  placeholder="例: 1234567890"
                  className={INPUT}
                />
              </label>
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className="flex min-h-[36px] items-center gap-1 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-50"
              >
                <Save size={13} />
                {busy ? "保存中…" : saved ? "保存しました" : "保存"}
              </button>
            </div>
          )}
          {error && <p className="mt-1 text-[11px] text-seal">{error}</p>}
        </>
      )}
    </div>
  );
}

function AutoLine({ prior }: { prior: PriorApplication }) {
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-2 font-bold">
      <span>申請日 {prior.applicationOn}</span>
      <span>申請番号 {prior.applicationNo}</span>
      <CopyButton value={prior.applicationNo} label="申請番号をコピー" />
      <span className="text-[10px] font-normal text-muted">（申請一覧から自動表示）</span>
    </p>
  );
}
