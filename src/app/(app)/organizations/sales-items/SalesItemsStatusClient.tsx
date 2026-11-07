"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Copy } from "lucide-react";
import {
  ORG_SALES_STATUS_KINDS,
  copySalesSettings,
  orgSalesStatus,
  type OrgSalesKindState,
} from "@/lib/org-sales-status";
import { normalizeOrganizationIntake, parseAmount } from "@/lib/organization-intake";
import { REFERRAL_SALES_KEY, hasCustomSalesItems, salesItemsForKind } from "@/lib/sales";
import { isStampFeePayer, stampFeePayerLabel } from "@/lib/stamp-fee";
import { createClient } from "@/lib/supabase/client";
import { getOrganization, updateOrganization } from "@/lib/supabase/queries/organizations";
import { errorMessage } from "@/lib/errors";
import type { OrganizationInput } from "@/types/db";

interface OrgLite {
  id: string;
  name: string;
  intake: unknown;
}

const STATE_LABEL: Record<OrgSalesKindState, string> = {
  custom: "登録済み",
  default: "未登録（既定）",
  empty: "明細なし",
};
const STATE_CLASS: Record<OrgSalesKindState, string> = {
  custom: "bg-status-approved-bg text-status-approved-fg",
  default: "bg-seal/10 text-seal",
  empty: "bg-seal text-white",
};
const kindLabel = (k: string) => (k === REFERRAL_SALES_KEY ? "あっせん" : k);
const STAMP_KEY = "__stamp__";

// 所属機関ごとの売上明細の登録状況の一覧。
// 既定は「未登録がある機関」だけ。支援委託終了の機関は既定では出さない。
// 上の「ほかの機関の登録内容をコピー」で、コピー元の機関の明細・印紙代の負担を選んだ機関にまとめて登録できる
export function SalesItemsStatusClient({ orgs: initialOrgs }: { orgs: OrgLite[] }) {
  const [orgs, setOrgs] = useState<OrgLite[]>(initialOrgs);
  const rows = useMemo(() => orgs.map((o) => orgSalesStatus(o)), [orgs]);
  const [onlyUnregistered, setOnlyUnregistered] = useState(true);
  const [showEnded, setShowEnded] = useState(false);
  const [q, setQ] = useState("");

  // コピー
  const [sourceId, setSourceId] = useState("");
  const [copyKeys, setCopyKeys] = useState<Set<string>>(() => new Set([...ORG_SALES_STATUS_KINDS, STAMP_KEY]));
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = useMemo(() => rows.filter((r) => showEnded || !r.supportEnded), [rows, showEnded]);
  const shown = useMemo(() => {
    const needle = q.replace(/\s/g, "").toLowerCase();
    return base
      .filter((r) => !onlyUnregistered || r.unregisteredCount > 0 || targets.has(r.orgId) || r.orgId === sourceId)
      .filter((r) => !needle || r.orgName.replace(/\s/g, "").toLowerCase().includes(needle))
      .sort((a, b) => b.unregisteredCount - a.unregisteredCount || a.orgName.localeCompare(b.orgName, "ja"));
  }, [base, onlyUnregistered, q, targets, sourceId]);
  const unregisteredOrgs = base.filter((r) => r.unregisteredCount > 0).length;

  const source = orgs.find((o) => o.id === sourceId) ?? null;
  const sourceIntake = source ? normalizeOrganizationIntake(source.intake as never) : null;
  const sourcePayer = sourceIntake && isStampFeePayer(sourceIntake.stamp_fee_payer) ? sourceIntake.stamp_fee_payer : "";
  const selectedKinds = ORG_SALES_STATUS_KINDS.filter((k) => copyKeys.has(k));
  const copyStamp = copyKeys.has(STAMP_KEY) && !!sourcePayer;
  const targetList = [...targets].filter((id) => id !== sourceId);

  // コピー元を選んだら、その機関で登録済みの項目だけを初めからチェックする（既定のままの項目は外す）
  const chooseSource = (id: string) => {
    setSourceId(id);
    setTargets((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    const st = rows.find((r) => r.orgId === id);
    if (st) {
      const keys = st.kinds.filter((k) => k.state === "custom").map((k) => k.kind);
      if (st.stampFeePayer) keys.push(STAMP_KEY);
      setCopyKeys(new Set(keys));
    }
  };

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  async function runCopy() {
    if (!source || targetList.length === 0 || (selectedKinds.length === 0 && !copyStamp)) return;
    const names = targetList.map((id) => orgs.find((o) => o.id === id)?.name ?? "").join("、");
    const what = [...selectedKinds.map(kindLabel), ...(copyStamp ? ["収入印紙代の負担"] : [])].join("・");
    if (
      !window.confirm(
        `${source.name} の登録内容（${what}）を、次の${targetList.length}機関に登録します。\n${names}\n\nコピー先にすでに登録している明細は上書きされます。よろしいですか？`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const done: string[] = [];
    const failed: string[] = [];
    for (const id of targetList) {
      try {
        // ほかの人が同時に所属機関の情報を直していても消さないよう、保存の直前に読み直す
        const fresh = await getOrganization(supabase, id);
        if (!fresh) throw new Error("所属機関が見つかりません");
        const intake = copySalesSettings(source, fresh.intake, selectedKinds, copyStamp);
        const saved = await updateOrganization(supabase, id, { intake } as Partial<OrganizationInput>);
        setOrgs((list) => list.map((o) => (o.id === id ? { id: saved.id, name: saved.name, intake: saved.intake ?? {} } : o)));
        done.push(fresh.name);
      } catch (err) {
        failed.push(`${orgs.find((o) => o.id === id)?.name ?? id}（${errorMessage(err, "保存に失敗しました")}）`);
      }
    }
    setBusy(false);
    if (done.length) {
      setMessage(`${done.length}機関に登録しました: ${done.join("、")}`);
      setTargets(new Set());
    }
    if (failed.length) setError(`登録できなかった機関: ${failed.join("、")}`);
  }

  return (
    <div className="space-y-3 px-4 py-4 lg:px-8">
      <p className="text-xs leading-relaxed text-muted">
        所属機関の情報 ＞ 決算・売上の「申請種別ごとの売上明細」と「収入印紙代」の登録状況です。
        「未登録（既定）」は、その機関の明細をまだ登録しておらず全所属機関共通の既定の明細を使っている種別です。
        機関名を押すと所属機関の情報が開きます。申請準備の詳細で一人ひとり直した明細は、ここには影響しません。
      </p>

      {/* ほかの機関の登録内容をコピー */}
      <div className="rounded-xl border-2 border-brand/40 bg-surface p-3">
        <p className="mb-1 flex items-center gap-1.5 text-sm font-bold">
          <Copy size={15} />
          ほかの機関の登録内容をコピーして登録
        </p>
        <p className="mb-2 text-[11px] text-muted">
          ① コピー元の機関を選ぶ（表の「コピー元」でも選べます）→ ② コピーする項目を選ぶ → ③ 表の左のチェックでコピー先の機関を選ぶ → ④「選んだ機関に登録」。
          コピー先では「この機関だけの明細」として登録され、あとから機関ごとに直せます。
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={sourceId}
            onChange={(e) => chooseSource(e.target.value)}
            className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm sm:w-72"
            aria-label="コピー元の機関"
          >
            <option value="">コピー元の機関を選ぶ</option>
            {[...orgs]
              .sort((a, b) => a.name.localeCompare(b.name, "ja"))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </select>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {ORG_SALES_STATUS_KINDS.map((k) => (
              <label key={k} className="flex items-center gap-1">
                <input type="checkbox" checked={copyKeys.has(k)} onChange={() => setCopyKeys((s) => toggle(s, k))} />
                {kindLabel(k)}
              </label>
            ))}
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={copyKeys.has(STAMP_KEY)} onChange={() => setCopyKeys((s) => toggle(s, STAMP_KEY))} />
              収入印紙代の負担
            </label>
          </div>
        </div>
        {source && sourceIntake && (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {selectedKinds.map((k) => {
              const items = salesItemsForKind(sourceIntake, k, source.name);
              return (
                <div key={k} className="rounded-lg bg-background p-2 text-[11px]">
                  <p className="mb-0.5 font-bold">
                    {kindLabel(k)}
                    {!hasCustomSalesItems(sourceIntake, k) && (
                      <span className="ml-1 font-medium text-seal">（コピー元も未登録・既定の明細）</span>
                    )}
                  </p>
                  {items.length === 0 ? (
                    <p className="text-muted">明細なし</p>
                  ) : (
                    items.map((r, i) => (
                      <p key={i} className="flex justify-between gap-2">
                        <span className="min-w-0">{r.name || "（項目名なし）"}</span>
                        <span className="shrink-0 tabular-nums">{(parseAmount(r.amount) ?? 0).toLocaleString()}円</span>
                      </p>
                    ))
                  )}
                </div>
              );
            })}
            {copyKeys.has(STAMP_KEY) && (
              <div className="rounded-lg bg-background p-2 text-[11px]">
                <p className="mb-0.5 font-bold">収入印紙代（6,000円超）</p>
                <p className={sourcePayer ? "" : "text-muted"}>
                  {sourcePayer ? stampFeePayerLabel(sourcePayer) : "コピー元が未設定のためコピーしません"}
                </p>
              </div>
            )}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || !source || targetList.length === 0 || (selectedKinds.length === 0 && !copyStamp)}
            onClick={() => void runCopy()}
            className="min-h-[40px] rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground disabled:opacity-50"
          >
            {busy ? "登録中…" : `選んだ機関に登録（${targetList.length}機関）`}
          </button>
          {targets.size > 0 && (
            <button type="button" onClick={() => setTargets(new Set())} className="text-xs font-bold text-muted">
              選択を外す
            </button>
          )}
          {!source && <span className="text-[11px] text-muted">コピー元の機関を選んでください</span>}
        </div>
        {message && <p className="mt-2 rounded-lg bg-status-approved-bg px-2 py-1.5 text-xs font-bold text-status-approved-fg">{message}</p>}
        {error && (
          <p role="alert" className="mt-2 rounded-lg bg-seal/10 px-2 py-1.5 text-xs text-seal">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOnlyUnregistered(true)}
          className={`min-h-[40px] rounded-xl border px-3 text-xs font-bold ${onlyUnregistered ? "border-brand bg-brand text-brand-foreground" : "border-border bg-background"}`}
        >
          未登録がある機関 {unregisteredOrgs}
        </button>
        <button
          type="button"
          onClick={() => setOnlyUnregistered(false)}
          className={`min-h-[40px] rounded-xl border px-3 text-xs font-bold ${!onlyUnregistered ? "border-brand bg-brand text-brand-foreground" : "border-border bg-background"}`}
        >
          すべて {base.length}
        </button>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} />
          支援委託終了の機関も出す
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="所属機関名で検索"
          className="min-h-[40px] flex-1 rounded-xl border border-border bg-background px-3 text-sm sm:max-w-xs"
        />
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[1000px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-2 py-2 font-bold">
                <label className="flex items-center gap-1" title="表示している機関をすべてコピー先にする">
                  <input
                    type="checkbox"
                    checked={shown.length > 0 && shown.every((r) => r.orgId === sourceId || targets.has(r.orgId))}
                    onChange={(e) =>
                      setTargets(
                        e.target.checked
                          ? new Set([...targets, ...shown.map((r) => r.orgId).filter((id) => id !== sourceId)])
                          : new Set(),
                      )
                    }
                  />
                  コピー先
                </label>
              </th>
              <th className="px-2 py-2 font-bold">所属機関</th>
              {ORG_SALES_STATUS_KINDS.map((k) => (
                <th key={k} className="px-2 py-2 font-bold">
                  {kindLabel(k)}
                </th>
              ))}
              <th className="px-2 py-2 font-bold">収入印紙代（6,000円超）</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={ORG_SALES_STATUS_KINDS.length + 3} className="px-2 py-6 text-center text-muted">
                  {onlyUnregistered ? "未登録の機関はありません" : "所属機関がありません"}
                </td>
              </tr>
            )}
            {shown.map((r) => {
              const isSource = r.orgId === sourceId;
              return (
                <tr
                  key={r.orgId}
                  className={`border-b border-border/60 align-top ${isSource ? "bg-brand/5" : targets.has(r.orgId) ? "bg-status-notice-bg/60" : ""}`}
                >
                  <td className="px-2 py-2">
                    {isSource ? (
                      <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-brand-foreground">コピー元</span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={targets.has(r.orgId)}
                        onChange={() => setTargets((s) => toggle(s, r.orgId))}
                        aria-label={`${r.orgName} をコピー先にする`}
                      />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <Link href={`/organizations/${r.orgId}`} className="font-bold text-brand underline-offset-2 hover:underline">
                      {r.orgName}
                    </Link>
                    {r.supportEnded && <span className="ml-1 text-[10px] text-muted">支援委託終了</span>}
                    {r.unregisteredCount > 0 && (
                      <span className="mt-0.5 block text-[10px] font-bold text-seal">未登録 {r.unregisteredCount}件</span>
                    )}
                    {!isSource && (
                      <button
                        type="button"
                        onClick={() => chooseSource(r.orgId)}
                        className="mt-0.5 block text-[10px] font-bold text-brand underline"
                      >
                        コピー元にする
                      </button>
                    )}
                  </td>
                  {r.kinds.map((k) => (
                    <td key={k.kind} className="px-2 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${STATE_CLASS[k.state]}`}>
                        {STATE_LABEL[k.state]}
                      </span>
                      {k.total > 0 && <span className="mt-0.5 block tabular-nums text-muted">{k.total.toLocaleString()}円</span>}
                    </td>
                  ))}
                  <td className="px-2 py-2">
                    {r.stampFeePayer ? (
                      <span className="inline-block rounded-full bg-status-approved-bg px-2 py-0.5 text-[10px] font-bold text-status-approved-fg">
                        {stampFeePayerLabel(r.stampFeePayer)}
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-seal/10 px-2 py-0.5 text-[10px] font-bold text-seal">未設定</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
