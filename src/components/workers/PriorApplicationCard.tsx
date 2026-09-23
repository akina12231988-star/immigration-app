"use client";

import { useEffect, useState } from "react";
import { FileClock, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { listApplicationsByWorker } from "@/lib/supabase/queries/applications";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { todayStr } from "@/lib/application-alerts";
import { dbErrorMessage } from "@/lib/errors";
import { PREP_DOC_DEFS } from "@/lib/application-prep";
import {
  isNonTransferable,
  PRIOR_CONTENT_OPTIONS,
  PRIOR_YEAR_DOC_IDS,
  priorApplication,
  sswChangeApplicationFor,
  type PriorApplication,
  type PriorApplicationSource,
  type PriorDocYears,
} from "@/lib/prior-application";
import { CopyButton } from "@/components/ui/CopyButton";

const INPUT =
  "min-h-[36px] rounded-lg border border-border bg-surface px-2 text-sm focus:border-brand focus:outline-none disabled:opacity-60";

// 前回の申請（1年以内）の申請日・申請番号・申請内容。
// 申請一覧から自動で拾い、無ければ外国人情報に手で入れた値を使う。
// 申請準備（書類の行の案内）と外国人詳細（入管申請の欄）の両方で同じものを使う
export function usePriorApplication({
  workerId,
  applications,
  manualOn,
  manualNo,
  manualContent,
  manualOrgId,
  manualDocYears,
}: {
  workerId: string;
  applications?: PriorApplicationSource[]; // 渡さなければこの中で読む
  manualOn?: string | null; // 渡さなければこの中で読む
  manualNo?: string | null;
  manualContent?: string | null;
  manualOrgId?: string | null;
  manualDocYears?: PriorDocYears | null;
}) {
  const [apps, setApps] = useState<PriorApplicationSource[]>(applications ?? []);
  const [on, setOn] = useState(manualOn ?? "");
  const [no, setNo] = useState(manualNo ?? "");
  const [content, setContent] = useState(manualContent ?? "");
  const [orgId, setOrgId] = useState(manualOrgId ?? "");
  const [docYears, setDocYears] = useState<PriorDocYears>(manualDocYears ?? {});
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
        // 0166 未適用の環境でも読めるように * で読む
        const { data } = await supabase.from("workers").select("*").eq("id", workerId).maybeSingle();
        const w = data as {
          prior_application_on?: string | null;
          prior_application_no?: string;
          prior_application_content?: string;
          prior_application_org_id?: string | null;
          prior_application_doc_years?: PriorDocYears | null;
        } | null;
        if (!cancelled && w) {
          setOn(w.prior_application_on ?? "");
          setNo(w.prior_application_no ?? "");
          setContent(w.prior_application_content ?? "");
          setOrgId(w.prior_application_org_id ?? "");
          setDocYears(w.prior_application_doc_years ?? {});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workerId, needApps, needManual]);

  const manual = { on, no, content, orgId };
  const prior = priorApplication(apps, manual, todayStr());
  // 参考様式1-25号を転用できる申請（申請準備の所属機関と同じ所属機関の在留資格の変更許可（特定技能））
  const sswChangeFor = (organizationId: string | null) => sswChangeApplicationFor(apps, organizationId, manual);
  return {
    prior,
    sswChangeFor,
    manualDocYears: docYears,
    form: { on, no, content, orgId, docYears },
    setForm: {
      on: setOn,
      no: setNo,
      content: setContent,
      orgId: setOrgId,
      docYears: setDocYears,
    },
  };
}

export type PriorApplicationState = ReturnType<typeof usePriorApplication>;

// 前回の申請で使った書類の年度の欄（課税証明書・納税証明書・源泉徴収票）
const YEAR_DOCS = PREP_DOC_DEFS.filter((d) => (PRIOR_YEAR_DOC_IDS as readonly string[]).includes(d.id));

export function PriorApplicationCard({
  workerId,
  state,
  canEdit,
  prepOrganization,
  organizations = [],
  autoDocYears = {},
}: {
  workerId: string;
  state: PriorApplicationState;
  canEdit: boolean;
  // 申請準備の所属機関（1-25号を転用できる申請を探すのに使う）
  prepOrganization?: { id: string; name: string } | null;
  organizations?: { id: string; name: string }[]; // 手入力の所属機関の選択肢
  // 前回の準備リストから分かる書類の年度（書類ID → 令和年）。手入力より優先して出す
  autoDocYears?: Record<string, number | null>;
}) {
  const { prior, form, setForm } = state;
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touch = () => setSaved(false);
  const orgOptions = organizations.length > 0 ? organizations : prepOrganization ? [prepOrganization] : [];
  const orgName = (id: string | null) => orgOptions.find((o) => o.id === id)?.name ?? "";

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const no = form.no.trim();
      const docYears = Object.fromEntries(
        Object.entries(form.docYears).filter(([, v]) => typeof v === "number" && v > 0),
      ) as PriorDocYears;
      await updateWorker(createClient(), workerId, {
        prior_application_on: form.on || null,
        prior_application_no: no,
        prior_application_content: form.content.trim(),
        prior_application_org_id: form.orgId || null,
        prior_application_doc_years: docYears,
      });
      setForm.no(no);
      setForm.docYears(docYears);
      setSaved(true);
    } catch (err) {
      setError(dbErrorMessage(err, "0166_worker_prior_application_detail.sql"));
    } finally {
      setBusy(false);
    }
  };

  const ssw = prepOrganization ? state.sswChangeFor(prepOrganization.id) : null;
  // 特定活動の申請は申請番号を転用できないので、前回使った書類の年度は出さない
  const blocked = isNonTransferable(prior);

  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2.5 text-xs">
      <p className="flex items-center gap-1.5 font-bold text-muted">
        <FileClock size={13} />
        前回の申請（1年以内）の申請日・申請番号・申請内容
      </p>
      <p className="mt-0.5 text-[11px] text-muted">
        課税証明書・納税証明書（市県民税／国保税）・源泉徴収票・保険証・年金記録は、1年以内の申請で提出していれば
        この申請日と申請番号を書くことで再提出を省けます（特定活動の申請の申請番号は転用できません）。
        申請準備では各書類の行に、前回どの年度の書類を使ったかとあわせて出ます。
      </p>

      {prior?.source === "auto" ? (
        <PriorLine prior={prior} orgName={orgName(prior.organizationId)} note="申請一覧から自動表示" />
      ) : (
        <>
          <p className="mt-1.5 text-[11px] text-seal">
            申請一覧に1年以内の申請がありません。前回の申請が分かれば手で入れてください（外国人詳細・申請準備の両方に出ます）。
          </p>
          {prior?.source === "manual" && (
            <PriorLine prior={prior} orgName={orgName(prior.organizationId)} note="手入力" />
          )}
        </>
      )}

      {/* 前回使った書類の年度（特定活動の申請は転用できないので出さない） */}
      {!blocked && (
        <div className="mt-2 rounded-lg bg-surface px-2.5 py-2">
          <p className="text-[11px] font-bold text-muted">前回の申請で使った書類の年度</p>
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {YEAR_DOCS.map((d) => {
              const auto = autoDocYears[d.id];
              const manual = form.docYears[d.id];
              const year = auto ?? manual ?? null;
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-2">
                  <span className="min-w-[10rem]">{d.label}</span>
                  {year ? (
                    <span className="font-bold">
                      令和{year}
                      {d.yearKind}
                      <span className="ml-1 text-[10px] font-normal text-muted">
                        （{auto != null ? "前回の申請準備から" : "手入力"}）
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted">不明（下で入力できます）</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 参考様式1-25号（支援委託契約書）は同じ所属機関の変更許可（特定技能）でだけ転用できる */}
      {prepOrganization && (
        <div className="mt-2 rounded-lg bg-surface px-2.5 py-2">
          <p className="text-[11px] font-bold text-muted">
            参考様式1-25号（支援委託契約書）：{prepOrganization.name || "申請準備の所属機関"}の「在留資格の変更許可（特定技能）」
          </p>
          {ssw ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-2 font-bold">
              <span>申請日 {ssw.applicationOn || "未入力"}</span>
              <span>申請番号 {ssw.applicationNo || "未入力"}</span>
              {ssw.applicationNo && <CopyButton value={ssw.applicationNo} label="申請番号をコピー" />}
              <span className="text-[10px] font-normal text-muted">
                （{ssw.source === "auto" ? "申請一覧から自動表示" : "手入力"}）
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-seal">
              この所属機関での在留資格の変更許可（特定技能）の申請が見つかりません。1-25号は転用できないので提出が必要です。
            </p>
          )}
        </div>
      )}

      {canEdit && (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-dashed border-border pt-2">
          {prior?.source !== "auto" && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-muted">申請日</span>
                <input
                  type="date"
                  value={form.on}
                  onChange={(e) => {
                    setForm.on(e.target.value);
                    touch();
                  }}
                  disabled={busy}
                  className={INPUT}
                />
              </label>
              <label className="flex min-w-[10rem] flex-1 flex-col gap-0.5">
                <span className="text-[10px] font-bold text-muted">申請番号</span>
                <input
                  value={form.no}
                  onChange={(e) => {
                    setForm.no(e.target.value);
                    touch();
                  }}
                  disabled={busy}
                  placeholder="例: 1234567890"
                  className={INPUT}
                />
              </label>
              <label className="flex min-w-[14rem] flex-1 flex-col gap-0.5">
                <span className="text-[10px] font-bold text-muted">申請内容</span>
                <input
                  list="prior-content-options"
                  value={form.content}
                  onChange={(e) => {
                    setForm.content(e.target.value);
                    touch();
                  }}
                  disabled={busy}
                  placeholder="例: 在留資格の変更許可（特定技能）"
                  className={INPUT}
                />
                <datalist id="prior-content-options">
                  {PRIOR_CONTENT_OPTIONS.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </label>
              {orgOptions.length > 0 && (
                <label className="flex min-w-[12rem] flex-1 flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-muted">所属機関</span>
                  <select
                    value={form.orgId}
                    onChange={(e) => {
                      setForm.orgId(e.target.value);
                      touch();
                    }}
                    disabled={busy}
                    className={INPUT}
                  >
                    <option value="">（未選択）</option>
                    {orgOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            {!blocked && YEAR_DOCS.map((d) => (
              <label key={d.id} className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-muted">
                  {d.label}（令和○{d.yearKind}）
                </span>
                <input
                  type="number"
                  min={1}
                  value={form.docYears[d.id] ?? ""}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setForm.docYears({ ...form.docYears, [d.id]: e.target.value && n > 0 ? n : null });
                    touch();
                  }}
                  disabled={busy}
                  placeholder="例: 7"
                  className={`${INPUT} w-28 tabular-nums`}
                />
              </label>
            ))}
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
          {error && <p className="text-[11px] text-seal">{error}</p>}
        </div>
      )}
    </div>
  );
}

function PriorLine({ prior, orgName, note }: { prior: PriorApplication; orgName: string; note: string }) {
  const blocked = isNonTransferable(prior);
  return (
    <div className="mt-1.5">
      <p className="flex flex-wrap items-center gap-2 font-bold">
        <span>申請日 {prior.applicationOn || "未入力"}</span>
        <span>申請番号 {prior.applicationNo || "未入力"}</span>
        {prior.applicationNo && !blocked && <CopyButton value={prior.applicationNo} label="申請番号をコピー" />}
        <span className="text-[10px] font-normal text-muted">（{note}）</span>
      </p>
      <p className="mt-0.5">
        申請内容：<span className="font-bold">{prior.content || "未入力"}</span>
        {orgName && <span className="ml-2 text-muted">所属機関：{orgName}</span>}
      </p>
      {blocked && (
        <p className="mt-0.5 rounded bg-seal/10 px-2 py-1 text-[11px] font-bold text-seal">
          特定活動の申請のため、この申請番号は転用できません。書類を提出してください。
        </p>
      )}
    </div>
  );
}
