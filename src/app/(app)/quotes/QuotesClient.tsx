"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { insertQuote } from "@/lib/supabase/queries/quotes";
import { parseAmount } from "@/lib/organization-intake";
import { dbErrorMessage } from "@/lib/errors";
import { estimateDateText } from "@/lib/estimate";
import { QuoteItemsEditor } from "./QuoteItemsEditor";
import {
  defaultQuoteItems,
  latestOnlineFee,
  latestQuoteEvent,
  QUOTE_HONORIFICS,
  QUOTE_HONORIFIC_LABELS,
  quoteAddressee,
  nextQuoteNumber,
  QUOTE_DEFAULT_NOTES,
  QUOTE_DEFAULT_SUBJECT,
  QUOTE_MIGRATION,
  QUOTE_STATUSES,
  quoteMatches,
  type QuoteItem,
  type QuoteRow,
} from "@/lib/quote";

export interface QuoteOrgOption {
  id: string;
  name: string;
  address: string;
  repName: string;
  supportFee: string;
}

const STATUS_STYLE: Record<string, string> = {
  作成中: "bg-surface text-muted",
  送付済: "bg-brand/10 text-brand",
  検討中: "bg-amber-100 text-amber-800",
  受注: "bg-emerald-100 text-emerald-800",
  見送り: "bg-neutral-200 text-neutral-600",
};

// 登録済みの所属機関で毎月の支援代が登録されていれば、毎月の支援代の行にその金額を入れる
function withSupportFee(items: QuoteItem[], org: QuoteOrgOption | undefined): QuoteItem[] {
  const fee = org ? parseAmount(org.supportFee) : null;
  return fee ? items.map((i) => (/毎月の支援代/.test(i.name) ? { ...i, price: fee } : i)) : items;
}

// 宛先の敬称（自動 / 御中 / 様 / なし）
export function HonorificPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1 text-xs font-bold text-muted">
      敬称
      <span className="inline-flex overflow-hidden rounded-lg border border-border">
        {QUOTE_HONORIFICS.map((h) => (
          <button
            key={h || "auto"}
            type="button"
            onClick={() => onChange(h)}
            aria-pressed={value === h}
            className={`min-h-[44px] px-3 ${value === h ? "bg-brand text-brand-foreground" : "bg-background text-muted hover:bg-surface"}`}
          >
            {QUOTE_HONORIFIC_LABELS[h]}
          </button>
        ))}
      </span>
    </div>
  );
}

export function QuoteStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[status] ?? STATUS_STYLE["作成中"]}`}>
      {status}
    </span>
  );
}

// 見積書の一覧と、新しい見積書の作成（宛先は登録済みの所属機関か手入力。項目はほかの見積書から複製できる）
export function QuotesClient({
  initialQuotes,
  loadError,
  organizations,
  initialOrgId,
  canEdit,
  today,
}: {
  initialQuotes: QuoteRow[];
  loadError: string | null;
  organizations: QuoteOrgOption[];
  initialOrgId: string;
  canEdit: boolean;
  today: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [orgFilter, setOrgFilter] = useState(initialOrgId);

  // 新しい見積書
  const [mode, setMode] = useState<"org" | "manual">(initialOrgId ? "org" : "manual");
  const [orgId, setOrgId] = useState(initialOrgId);
  const [name, setName] = useState("");
  const [person, setPerson] = useState("");
  const [honorific, setHonorific] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [items, setItems] = useState<QuoteItem[]>(() => withSupportFee(defaultQuoteItems(), organizations.find((o) => o.id === initialOrgId)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgName = (id: string | null) => organizations.find((o) => o.id === id)?.name ?? "";
  const shown = useMemo(
    () =>
      initialQuotes.filter(
        (q) => (!status || q.status === status) && (!orgFilter || q.organization_id === orgFilter) && quoteMatches(q, query),
      ),
    [initialQuotes, status, orgFilter, query],
  );

  const selectedOrg = mode === "org" ? organizations.find((o) => o.id === orgId) : undefined;
  const chooseOrg = (id: string) => {
    setOrgId(id);
    const o = organizations.find((x) => x.id === id);
    if (o) setPerson(o.repName);
    if (!copyFrom) setItems((prev) => withSupportFee(prev, o));
  };
  // 項目の元を選び直したら、その内容で一覧を作り直す（複製元の行は入れる・入れないの選択もそのまま）
  const chooseSource = (id: string) => {
    setCopyFrom(id);
    const src = initialQuotes.find((q) => q.id === id);
    setItems(src ? src.items.map((i) => ({ ...i })) : withSupportFee(defaultQuoteItems(), selectedOrg));
  };
  const preview = quoteAddressee(selectedOrg ? selectedOrg.name : name, person, honorific);

  const create = async () => {
    setError(null);
    const org = selectedOrg;
    const addressee = org ? org.name : name.trim();
    if (!addressee) {
      setError(mode === "org" ? "所属機関を選んでください" : "会社名を入力してください");
      return;
    }
    if (!items.some((i) => i.on)) {
      setError("見積書に入れる行にチェックを付けてください");
      return;
    }
    const src = initialQuotes.find((q) => q.id === copyFrom);
    setBusy(true);
    try {
      const row = await insertQuote(createClient(), {
        organization_id: org?.id ?? null,
        addressee_name: addressee,
        addressee_person: person.trim(),
        addressee_address: org?.address ?? "",
        issued_on: today,
        number: nextQuoteNumber(today, initialQuotes.map((q) => q.number)),
        subject: src?.subject || QUOTE_DEFAULT_SUBJECT,
        items,
        notes: src?.notes ?? QUOTE_DEFAULT_NOTES,
        show_stamp_table: src?.show_stamp_table ?? true,
        status: "作成中",
        honorific,
        online_fee: src?.online_fee ?? latestOnlineFee(initialQuotes),
        attachment_ids: src?.attachment_ids ?? [],
      });
      router.push(`/quotes/${row.id}`);
    } catch (e) {
      setError(dbErrorMessage(e, QUOTE_MIGRATION, "見積書を作れませんでした"));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-5 lg:px-8">
      {loadError && (
        <p role="alert" className="rounded-xl bg-seal/10 px-4 py-3 text-sm font-bold text-seal">
          {loadError}
        </p>
      )}

      {canEdit && (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <FilePlus2 size={16} />
            新しい見積書を作る
          </h2>
          <p className="mt-1 text-xs text-muted">
            合計金額は出さず、手続きごとの料金（税抜）を一覧にします。作ったあとで項目・金額・備考を直して印刷できます。
          </p>
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="text-muted">宛先</span>
              <span className="inline-flex overflow-hidden rounded-lg border border-border">
                {(
                  [
                    ["manual", "まだ登録していない会社（手入力）"],
                    ["org", "登録済みの所属機関から選ぶ"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className={`min-h-[36px] px-3 ${mode === m ? "bg-brand text-brand-foreground" : "bg-background text-muted hover:bg-surface"}`}
                  >
                    {label}
                  </button>
                ))}
              </span>
            </div>
            {mode === "org" ? (
              <select
                value={orgId}
                onChange={(e) => chooseOrg(e.target.value)}
                aria-label="宛先の所属機関"
                className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm"
              >
                <option value="">所属機関を選んでください</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="会社名（例: 株式会社〇〇）"
                aria-label="宛先の会社名"
                className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm"
              />
            )}
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-bold text-muted">
                担当者・代表者（空欄でもよい）
                <input
                  value={person}
                  onChange={(e) => setPerson(e.target.value)}
                  placeholder="例: 代表取締役 山田太郎"
                  className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm font-normal text-foreground"
                />
              </label>
              <HonorificPicker value={honorific} onChange={setHonorific} />
            </div>
            {(preview.orgLine || preview.personLine) && (
              <p className="text-xs text-muted">
                宛名の印字: <b className="text-foreground">{preview.orgLine}</b>
                {preview.personLine && <b className="ml-2 text-foreground">{preview.personLine}</b>}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-xs font-bold text-muted">
                項目の元
                <select
                  value={copyFrom}
                  onChange={(e) => chooseSource(e.target.value)}
                  className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm font-normal text-foreground"
                >
                  <option value="">既定の項目</option>
                  {initialQuotes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.addressee_name}の見積書から複製（{q.issued_on ? estimateDateText(q.issued_on) : "日付なし"}）
                    </option>
                  ))}
                </select>
              </label>
              <QuoteItemsEditor items={items} onChange={setItems} />
            </div>
            {error && (
              <p role="alert" className="text-xs font-bold text-seal">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={create}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 self-start rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground disabled:opacity-60"
            >
              <FilePlus2 size={16} />
              {busy ? "作成中…" : "見積書を作る"}
            </button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold">発行した見積書（{shown.length}件）</h2>
          <label className="ml-auto flex min-h-[40px] items-center gap-2 rounded-xl border border-border bg-background px-3">
            <Search size={14} className="text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="会社名・やりとりで検索"
              aria-label="見積書を検索"
              className="w-44 bg-transparent text-sm outline-none"
            />
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="状況で絞り込む"
            className="min-h-[40px] rounded-xl border border-border bg-background px-2 text-sm"
          >
            <option value="">すべての状況</option>
            {QUOTE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {orgFilter && (
            <button
              type="button"
              onClick={() => setOrgFilter("")}
              className="min-h-[40px] rounded-xl border border-border px-3 text-xs font-bold text-brand"
            >
              {orgName(orgFilter)}だけ表示中（解除）
            </button>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            見積書はまだありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shown.map((q) => {
              const ev = latestQuoteEvent(q);
              return (
                <li key={q.id}>
                  <Link
                    href={`/quotes/${q.id}`}
                    className="flex flex-col gap-1 rounded-xl border border-border bg-background px-4 py-3 hover:bg-surface"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <QuoteStatusBadge status={q.status} />
                      <span className="text-sm font-bold">{q.addressee_name || "（宛先なし）"}</span>
                      {!q.organization_id && <span className="text-[11px] text-muted">未登録の会社</span>}
                      <span className="ml-auto text-xs text-muted">
                        {q.issued_on ? estimateDateText(q.issued_on) : ""} {q.number}
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      {ev ? `最新のやりとり ${ev.on ? estimateDateText(ev.on) : ""}【${ev.kind}】${ev.body}` : "やりとりの記録なし"}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
