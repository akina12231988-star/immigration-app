"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Coins, Loader2, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { getOrganization } from "@/lib/supabase/queries/organizations";
import {
  insertSalesEntries,
  listSalesEntriesByWorker,
} from "@/lib/supabase/queries/sales";
import {
  buildSalesEntries,
  formatSalesYen,
  guessAppKind,
  prorateFromDate,
  SALES_APP_KINDS,
  SSW_INSURANCE_AMOUNT,
  supportFeeName,
  type SalesAppKind,
} from "@/lib/sales";
import { digitsOnly, normalizeSalesItems, parseAmount } from "@/lib/organization-intake";
import { dbErrorMessage } from "@/lib/errors";
import type { Application } from "@/types/application";
import type { OrgSalesItem, OrgSalesItems, SalesEntryRow } from "@/types/db";

// 在留カード受領後の売上登録（freee販売）。所属機関マスタの
// 「申請種別ごとの売上明細」「毎月の支援代」「特定技能総合保険の負担」を読み込み、
// 申請・保険・許可日からの日割り・定期売上の明細を作って「登録待ち」に入れる。
export function SalesEntrySection({ app }: { app: Application }) {
  const permitDate = app.grantedPermitDate ?? app.approvalDate ?? "";
  const [appKind, setAppKind] = useState<SalesAppKind>(() =>
    guessAppKind(app.visaAtGrant ?? "", app.applicationContent ?? ""),
  );
  // 所属機関マスタから読み込む設定
  const [salesItems, setSalesItems] = useState<OrgSalesItems>({});
  const [orgSupportFee, setOrgSupportFee] = useState("");
  const [insuranceBurden, setInsuranceBurden] = useState("");
  const [selfJoin, setSelfJoin] = useState(false);

  const [supportFee, setSupportFee] = useState("");
  const [items, setItems] = useState<OrgSalesItem[]>([]);
  const [existing, setExisting] = useState<SalesEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      try {
        if (app.organizationId) {
          const org = await getOrganization(supabase, app.organizationId);
          if (!cancelled && org) {
            setOrgSupportFee(org.intake?.support_fee ?? "");
            setSupportFee(org.intake?.support_fee ?? "");
            setInsuranceBurden(org.intake?.ssw_insurance_burden ?? "");
            setSalesItems(normalizeSalesItems(org.intake?.sales_items));
          }
        }
        if (app.workerId) {
          const { data: w } = await supabase
            .from("workers")
            .select("ssw_insurance_self_join")
            .eq("id", app.workerId)
            .maybeSingle();
          if (!cancelled && w) {
            setSelfJoin(Boolean((w as { ssw_insurance_self_join?: boolean }).ssw_insurance_self_join));
          }
          // sales_entries 未作成でも画面は使えるように握りつぶす
          const rows = await listSalesEntriesByWorker(supabase, app.workerId).catch(() => []);
          if (!cancelled) setExisting(rows.filter((r) => r.application_id === app.id));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app.organizationId, app.workerId, app.id]);

  // 申請種別を変えたら、その種別の売上明細（所属機関マスタ）を読み直す。
  // レンダー中に同期して切り替える（申請種別 or 読み込み結果が変わったときだけ）
  const templateKey = `${appKind}|${JSON.stringify(salesItems[appKind] ?? [])}`;
  const [prevKey, setPrevKey] = useState("");
  if (templateKey !== prevKey) {
    setPrevKey(templateKey);
    const template = salesItems[appKind] ?? [];
    setItems(template.length > 0 ? template.map((t) => ({ ...t })) : [{ name: appKind, amount: "" }]);
  }

  const insuranceByCompany = insuranceBurden === "会社負担";
  const drafts = permitDate
    ? buildSalesEntries({
        workerName: app.name,
        appKind,
        permitDate,
        supportFee,
        insuranceByCompany,
        applicationItems: items,
      })
    : [];
  const prorated = prorateFromDate(parseAmount(supportFee) ?? 0, permitDate);
  const total = drafts.reduce((sum, d) => sum + d.amount, 0);

  const setItemAt = (i: number, patch: Partial<OrgSalesItem>) =>
    setItems((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!app.workerId || drafts.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const rows = await insertSalesEntries(
        createClient(),
        drafts.map((d) => ({
          worker_id: app.workerId as string,
          organization_id: app.organizationId ?? null,
          application_id: app.id,
          kind: d.kind,
          item_name: d.item_name,
          description: d.description,
          amount: d.amount,
          taxable: d.taxable,
          period_from: d.period_from,
          period_to: d.period_to,
          status: "未登録" as const,
          freee_no: "",
          registered_on: null,
          note: "",
        })),
      );
      setExisting((prev) => [...prev, ...rows]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(dbErrorMessage(err, "0061_sales_entries.sql", "保存に失敗しました"));
    } finally {
      setSaving(false);
    }
  };

  const INPUT =
    "min-h-[40px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";
  const orgLink = app.organizationId ? `/organizations/${app.organizationId}` : "/organizations";

  return (
    <Card className="p-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted">
        <Coins size={15} />
        売上登録（freee販売）
      </h3>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        所属機関の情報に登録した「申請種別ごとの売上明細」「毎月の支援代」「特定技能総合保険の負担」を読み込んで明細を作ります。作成した明細は
        <Link href="/sales" className="mx-1 font-bold text-brand hover:underline">
          売上登録
        </Link>
        の登録待ちに入ります。
      </p>

      {error && <p className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">{error}</p>}

      {loading ? (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Loader2 size={13} className="animate-spin" />
          読み込み中…
        </p>
      ) : existing.length > 0 ? (
        <div className="rounded-xl border border-status-approved-fg/40 bg-status-approved-bg/40 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-bold text-status-approved-fg">
            <Check size={13} />
            この申請の売上明細は作成済みです（{existing.length}件）
          </p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-muted">
            {existing.map((r) => (
              <li key={r.id}>
                {r.description}　{formatSalesYen(r.amount)}
                {!r.taxable && "（非課税）"}　<span className="font-bold">{r.status}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/sales"
            className="mt-1.5 inline-block text-[11px] font-bold text-brand hover:underline"
          >
            売上登録の一覧で確認する
          </Link>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">申請種別</span>
            <select
              value={appKind}
              onChange={(e) => setAppKind(e.target.value as SalesAppKind)}
              className={`${INPUT} sm:max-w-xs`}
            >
              {SALES_APP_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          {/* 申請種別ごとの売上明細（所属機関マスタの登録内容。ここでも調整できる） */}
          <div className="mt-3">
            <p className="mb-1 text-[11px] font-bold text-muted">
              {appKind}の売上明細
              {(salesItems[appKind]?.length ?? 0) === 0 && (
                <span className="ml-1.5 font-medium text-seal">
                  （所属機関の情報に未登録です。
                  <Link href={orgLink} className="font-bold text-brand hover:underline">
                    登録する
                  </Link>
                  ）
                </span>
              )}
            </p>
            <div className="space-y-1.5">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    value={it.name}
                    onChange={(e) => setItemAt(i, { name: e.target.value })}
                    placeholder="明細項目（例: 申請取次費用）"
                    className={`${INPUT} min-w-0 flex-1`}
                  />
                  <input
                    value={digitsOnly(it.amount)}
                    onChange={(e) => setItemAt(i, { amount: digitsOnly(e.target.value) })}
                    inputMode="numeric"
                    placeholder="金額"
                    className={`${INPUT} w-28 shrink-0 text-right tabular-nums`}
                  />
                  <span className="shrink-0 text-xs text-muted">円</span>
                  <button
                    type="button"
                    onClick={() => setItems((rs) => rs.filter((_, idx) => idx !== i))}
                    aria-label="この明細を削除"
                    className="shrink-0 text-seal"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setItems((rs) => [...rs, { name: "", amount: "" }])}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-brand"
            >
              <Plus size={12} />
              明細を追加
            </button>
          </div>

          {/* 所属機関マスタの支援代・保険の負担区分 */}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">
                月額の{supportFeeName(appKind)}
                {orgSupportFee ? "（所属機関の情報から）" : ""}
              </span>
              <span className="flex items-center gap-2">
                <input
                  value={digitsOnly(supportFee)}
                  onChange={(e) => setSupportFee(digitsOnly(e.target.value))}
                  inputMode="numeric"
                  placeholder="例: 20000"
                  className={`${INPUT} text-right`}
                />
                <span className="shrink-0 text-sm text-muted">円</span>
              </span>
              {!orgSupportFee && (
                <span className="text-[11px] text-seal">
                  所属機関の情報に「毎月の支援代」が未登録です。
                  <Link href={orgLink} className="font-bold text-brand hover:underline">
                    登録する
                  </Link>
                </span>
              )}
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">
                特定技能総合保険（所属機関の情報から）
              </span>
              <div className="min-h-[40px] rounded-xl border border-border bg-background px-3 py-2 text-sm">
                {insuranceBurden === "会社負担" ? (
                  <span className="font-bold">
                    会社負担 ・ 加入
                    <span className="ml-1.5 font-medium text-muted">
                      （{formatSalesYen(SSW_INSURANCE_AMOUNT)}・非課税を計上
                      {appKind !== "特定技能申請" && "／特定技能申請のみ計上"}）
                    </span>
                  </span>
                ) : insuranceBurden === "外国人負担" ? (
                  <span className="font-bold">
                    外国人負担 ・ {selfJoin ? "加入（本人が自己負担で加入）" : "未加入"}
                    <span className="ml-1.5 font-medium text-muted">（売上には計上しません）</span>
                  </span>
                ) : (
                  <span className="text-seal">
                    未設定 ・
                    <Link href={orgLink} className="ml-1 font-bold text-brand hover:underline">
                      所属機関の情報で登録する
                    </Link>
                  </span>
                )}
              </div>
            </div>
          </div>

          {!permitDate ? (
            <p className="mt-3 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
              許可日が未登録のため日割り計算ができません。「許可情報」で在留許可日を入力してください。
            </p>
          ) : (
            <>
              <div className="mt-3 overflow-hidden rounded-xl border border-border">
                {drafts.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 border-b border-border bg-background px-3 py-2 text-sm last:border-b-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{d.description}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {d.kind} ・ 品目 {d.item_name}
                        {d.period_from && ` ・ ${d.period_from}〜${d.period_to ?? "（継続）"}`}
                        {!d.taxable && " ・ 非課税"}
                      </span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">
                      {formatSalesYen(d.amount)}
                    </span>
                  </div>
                ))}
              </div>
              {prorated && (
                <p className="mt-1.5 text-[11px] text-muted">
                  日割り: {formatSalesYen(prorated.monthly)} ÷ {prorated.monthDays}日 ×{" "}
                  {prorated.days}日 = {formatSalesYen(prorated.amount)}（小数点以下切り捨て）
                </p>
              )}
              <p className="mt-1 text-sm font-bold">合計 {formatSalesYen(total)}</p>
              <Button
                fullWidth
                className="mt-3"
                disabled={saving || drafts.length === 0 || !app.workerId}
                onClick={save}
              >
                {saving ? "作成中…" : saved ? "作成しました" : "売上明細を作成（登録待ちに追加）"}
              </Button>
              {!app.workerId && (
                <p className="mt-1 text-[11px] text-seal">
                  外国人と紐づいていない申請では作成できません。
                </p>
              )}
            </>
          )}
        </>
      )}
    </Card>
  );
}
