"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Lock, Plus, Save, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { setAppSetting } from "@/lib/supabase/queries/app-settings";
import {
  STAMP_FEE_PAYERS,
  STAMP_FEE_RULES_SETTING_KEY,
  stampFeePayerLabel,
  type StampFeeOrgRule,
  type StampFeePayer,
} from "@/lib/stamp-fee";

const SELECT =
  "min-h-[36px] w-full rounded-lg border border-border bg-surface px-2 text-xs focus:border-brand focus:outline-none";

// 最初から決まっている自動設定（画面では変えられない。参考に出す）
const BUILT_IN: { who: string; when: string; payer: string }[] = [
  { who: "すべての所属機関", when: "特定技能2号に関わる申請（2号への変更・2号の更新・2号移行準備の特定活動）。所属機関ごとの設定より優先", payer: "本人負担" },
  { who: "有限会社國崎青果", when: "特定技能1号に関わる申請（1号への変更・1号の更新・特定活動）", payer: "会社立替（実質本人負担）" },
];

// 申請準備の収入印紙代の自動設定。
// 所属機関ごとに「更新の申請」「新規の申請（変更・認定・特定活動）」の負担を登録しておくと、
// 適用開始日以降に登録した申請準備では、詳細画面でその負担に自動で設定する
export function StampFeeRulesClient({
  initialRules,
  orgNames,
  today,
}: {
  initialRules: StampFeeOrgRule[];
  orgNames: string[];
  today: string;
}) {
  const [rules, setRules] = useState(initialRules);
  const [saved, setSaved] = useState(JSON.stringify(initialRules));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const dirty = JSON.stringify(rules) !== saved;
  const names = useMemo(() => [...new Set(orgNames)].sort((a, b) => a.localeCompare(b, "ja")), [orgNames]);

  const update = (id: string, patch: Partial<StampFeeOrgRule>) =>
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () =>
    setRules((prev) => [...prev, { id: `rule-${Date.now()}`, orgName: "", renewal: "", newApp: "", from: today }]);
  const remove = (id: string) => setRules((prev) => prev.filter((r) => r.id !== id));

  const save = async () => {
    const list = rules.filter((r) => r.orgName.trim());
    setBusy(true);
    setNotice(null);
    try {
      await setAppSetting(createClient(), STAMP_FEE_RULES_SETTING_KEY, { rules: list });
      setRules(list);
      setSaved(JSON.stringify(list));
      setNotice({ ok: true, message: "保存しました。これから登録する申請準備（適用開始日以降）で自動設定されます。" });
    } catch (err) {
      setNotice({ ok: false, message: err instanceof Error ? err.message : "保存できませんでした" });
    } finally {
      setBusy(false);
    }
  };

  const payerSelect = (value: StampFeePayer | "", onChange: (v: StampFeePayer | "") => void, label: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value as StampFeePayer | "")} aria-label={label} className={SELECT}>
      <option value="">自動では決めない（申請ごとに選ぶ）</option>
      {STAMP_FEE_PAYERS.map((p) => (
        <option key={p} value={p}>
          {stampFeePayerLabel(p)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-col gap-4 px-4 py-5 lg:px-8">
      <p className="text-[11px] leading-relaxed text-muted">
        申請準備の詳細画面の「収入印紙代」（本人負担／会社負担／会社立替）を、所属機関と申請種別から自動で決める設定です。
        所属機関ごとの設定は、<span className="font-bold">適用開始日以降に登録した申請準備だけ</span>に効きます
        （それより前に登録した申請準備は自動では決めず、これまでどおり選びます）。申請準備で手で選んだ負担は、そちらが優先です。
      </p>
      {notice && (
        <p
          role={notice.ok ? "status" : "alert"}
          className={`rounded-lg px-3 py-2 text-sm ${notice.ok ? "bg-status-approved-bg text-status-approved-fg" : "bg-seal/10 text-seal"}`}
        >
          {notice.message}
        </p>
      )}

      <Card className="p-4">
        <h2 className="mb-1 text-sm font-bold">所属機関ごとの自動設定</h2>
        <p className="mb-3 text-[11px] text-muted">
          「行を追加」で所属機関を選び、更新の申請・新規の申請の負担を選んで「保存」を押してください。
          特定技能2号に関わる申請は、ここでの設定にかかわらず本人負担です（下の「最初から決まっている自動設定」）。
        </p>
        <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_8.5rem_2.5rem] gap-2 px-1 pb-1 text-[11px] font-bold text-muted md:grid">
          <span>所属機関</span>
          <span>更新の申請（在留期間の更新）</span>
          <span>新規の申請（変更・認定・特定活動）</span>
          <span>適用開始日</span>
          <span />
        </div>
        {rules.length === 0 && <p className="rounded-lg bg-background p-3 text-xs text-muted">まだ登録がありません。</p>}
        <div className="flex flex-col gap-2">
          {rules.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-background p-2 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_8.5rem_2.5rem] md:items-center"
            >
              <input
                list="stamp-fee-rule-orgs"
                value={r.orgName}
                onChange={(e) => update(r.id, { orgName: e.target.value })}
                placeholder="所属機関の名称"
                aria-label="所属機関"
                className={SELECT}
              />
              {payerSelect(r.renewal, (v) => update(r.id, { renewal: v }), "更新の申請の負担")}
              {payerSelect(r.newApp, (v) => update(r.id, { newApp: v }), "新規の申請の負担")}
              <input
                type="date"
                value={r.from}
                onChange={(e) => update(r.id, { from: e.target.value })}
                aria-label="適用開始日"
                className={SELECT}
              />
              <button
                type="button"
                onClick={() => remove(r.id)}
                aria-label={`${r.orgName || "この行"}を削除`}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-seal"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <datalist id="stamp-fee-rule-orgs">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={add}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-dashed border-brand px-3 text-xs font-bold text-brand"
          >
            <Plus size={14} />
            行を追加
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !dirty}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-brand px-4 text-xs font-bold text-brand-foreground disabled:opacity-50"
          >
            <Save size={14} />
            {busy ? "保存中…" : "保存"}
          </button>
          {dirty && <span className="text-[11px] font-bold text-amber-700">まだ保存していない変更があります</span>}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-1 text-sm font-bold">
          <Lock size={13} className="text-muted" />
          最初から決まっている自動設定
        </h2>
        <p className="mb-2 text-[11px] text-muted">アプリに組み込まれている設定です（この画面では変えられません）。</p>
        <ul className="flex flex-col gap-1.5">
          {BUILT_IN.map((b) => (
            <li key={b.who + b.when} className="rounded-lg bg-background px-3 py-2 text-xs">
              <span className="font-bold">{b.who}</span>
              <span className="text-muted">：{b.when} → </span>
              <span className="font-bold text-brand">{b.payer}</span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-[11px] text-muted">
        負担が決まっていない申請は
        <Link href="/todos/stamp-fee" className="mx-1 font-bold text-brand underline">
          収入印紙代の負担が未設定の申請
        </Link>
        で確認できます。
      </p>
    </div>
  );
}
