"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, Printer, Save, Trash2 } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { createClient } from "@/lib/supabase/client";
import { deleteQuote, updateQuote } from "@/lib/supabase/queries/quotes";
import { dbErrorMessage } from "@/lib/errors";
import { parseAmount } from "@/lib/organization-intake";
import { estimateDateText, estimateYen, STAMP_FEE_BANDS } from "@/lib/estimate";
import type { CustodianInfo } from "@/lib/custody";
import {
  defaultQuoteItems,
  QUOTE_EVENT_KINDS,
  QUOTE_MIGRATION,
  QUOTE_STATUSES,
  onlineFeeWithCharge,
  printedQuoteItems,
  quoteAddressee,
  quotePriceText,
  type QuoteEvent,
  type QuoteItem,
  type QuoteRow,
} from "@/lib/quote";
import { HonorificPicker, QuoteStatusBadge } from "../QuotesClient";
import { QuoteItemsEditor } from "../QuoteItemsEditor";
import { QuoteAttachmentsPanel, QuoteAttachmentPages } from "./QuoteAttachments";
import type { QuoteAttachment } from "@/lib/supabase/queries/quotes";

interface OrgOption {
  id: string;
  name: string;
  address: string;
  repName: string;
}

const input = "min-h-[40px] rounded-lg border border-border bg-background px-2 text-sm";

// 見積書1通の編集（宛先・項目・備考・状況）と印刷、やりとりの記録。
// 項目・宛先などは「保存」で保存する。やりとりの記録は追加・削除した時点で保存する
export function QuoteEditor({
  initial,
  copySources,
  organizations,
  attachmentLibrary,
  custodian,
  canEdit,
  today,
}: {
  initial: QuoteRow;
  attachmentLibrary: QuoteAttachment[];
  copySources: { id: string; label: string; items: QuoteItem[] }[];
  organizations: OrgOption[];
  custodian: CustodianInfo;
  canEdit: boolean;
  today: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState<QuoteRow>(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copyFrom, setCopyFrom] = useState("");
  const [library, setLibrary] = useState<QuoteAttachment[]>(attachmentLibrary);
  const [attachLoading, setAttachLoading] = useState(false);
  const [ev, setEv] = useState<{ on: string; kind: string; body: string }>({ on: today, kind: "送付", body: "" });

  const patch = (p: Partial<QuoteRow>) => {
    setQ((prev) => ({ ...prev, ...p }));
    setDirty(true);
    setMessage(null);
  };
  const save = async (): Promise<boolean> => {
    setBusy(true);
    setMessage(null);
    try {
      await updateQuote(createClient(), q.id, {
        organization_id: q.organization_id,
        addressee_name: q.addressee_name,
        addressee_person: q.addressee_person,
        addressee_address: q.addressee_address,
        issued_on: q.issued_on || null,
        number: q.number,
        subject: q.subject,
        items: q.items,
        notes: q.notes,
        show_stamp_table: q.show_stamp_table,
        status: q.status,
        honorific: q.honorific,
        online_fee: q.online_fee,
        attachment_ids: q.attachment_ids,
      });
      setDirty(false);
      setMessage({ ok: true, text: "保存しました" });
      router.refresh();
      return true;
    } catch (e) {
      setMessage({ ok: false, text: dbErrorMessage(e, QUOTE_MIGRATION, "保存できませんでした") });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveEvents = async (events: QuoteEvent[], extra: Partial<QuoteRow> = {}) => {
    setBusy(true);
    setMessage(null);
    try {
      await updateQuote(createClient(), q.id, { events, ...(extra.status ? { status: extra.status } : {}) });
      setQ((prev) => ({ ...prev, events, ...extra }));
      return true;
    } catch (e) {
      setMessage({ ok: false, text: dbErrorMessage(e, QUOTE_MIGRATION, "やりとりを保存できませんでした") });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addEvent = async () => {
    if (!ev.body.trim() && ev.kind !== "送付") {
      setMessage({ ok: false, text: "やりとりの内容を入力してください" });
      return;
    }
    const next: QuoteEvent = {
      id: crypto.randomUUID(),
      on: ev.on || today,
      kind: ev.kind,
      body: ev.body.trim() || (ev.kind === "送付" ? "見積書を送付" : ""),
    };
    const events = [next, ...q.events].sort((a, b) => (a.on === b.on ? 0 : a.on < b.on ? 1 : -1));
    // 作成中の見積書を送ったら、状況を「送付済」にする
    const extra: Partial<QuoteRow> = ev.kind === "送付" && q.status === "作成中" ? { status: "送付済" } : {};
    if (await saveEvents(events, extra)) setEv({ on: today, kind: "電話", body: "" });
  };

  const removeEvent = async (id: string) => {
    if (!window.confirm("このやりとりの記録を削除しますか？")) return;
    await saveEvents(q.events.filter((e) => e.id !== id));
  };

  const copyItems = () => {
    const src = copySources.find((s) => s.id === copyFrom);
    if (!src) return;
    if (!window.confirm(`いまの項目を「${src.label}」の項目に置き換えますか？`)) return;
    patch({ items: src.items.map((i) => ({ ...i })) });
  };

  const remove = async () => {
    if (!window.confirm("この見積書を削除しますか？（やりとりの記録も消えます）")) return;
    setBusy(true);
    try {
      await deleteQuote(createClient(), q.id);
      router.push("/quotes");
    } catch (e) {
      setMessage({ ok: false, text: dbErrorMessage(e, QUOTE_MIGRATION, "削除できませんでした") });
      setBusy(false);
    }
  };

  const print = async () => {
    if (dirty && canEdit && !(await save())) return;
    window.print();
  };

  const selectOrg = (id: string) => {
    const o = organizations.find((x) => x.id === id);
    if (!o) {
      patch({ organization_id: null });
      return;
    }
    patch({
      organization_id: o.id,
      addressee_name: o.name,
      addressee_address: o.address || q.addressee_address,
      addressee_person: o.repName || q.addressee_person,
    });
  };

  const addressee = quoteAddressee(q.addressee_name, q.addressee_person, q.honorific);
  const printed = printedQuoteItems(q.items);
  const hasStampItem = printed.some((i) => i.kind === "item" && /収入印紙/.test(i.name));
  const showStampTable = q.show_stamp_table && hasStampItem;
  const blankRows = Math.max(0, 6 - printed.length);

  return (
    <>
      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref="/quotes" />
          <h1 className="flex-1 truncate text-lg font-bold">見積書（{q.addressee_name || "宛先なし"}）</h1>
          <QuoteStatusBadge status={q.status} />
        </div>

        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 lg:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={print}
              disabled={busy || attachLoading}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground disabled:opacity-60"
            >
              <Printer size={18} />
              {attachLoading ? "別紙を読み込み中…" : dirty && canEdit ? "保存して印刷・PDF保存" : "印刷・PDF保存"}
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={save}
                disabled={busy || !dirty}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-brand bg-background px-5 text-sm font-bold text-brand disabled:opacity-50"
              >
                <Save size={16} />
                {busy ? "保存中…" : dirty ? "保存" : "保存済み"}
              </button>
            )}
            {message && (
              <span role={message.ok ? "status" : "alert"} className={`text-xs font-bold ${message.ok ? "text-emerald-700" : "text-seal"}`}>
                {message.text}
              </span>
            )}
            {q.organization_id && (
              <Link href={`/organizations/${q.organization_id}`} className="ml-auto text-xs font-bold text-brand underline-offset-2 hover:underline">
                所属機関の情報を開く
              </Link>
            )}
          </div>
          <p className="text-[11px] text-muted">
            印刷設定は<b>用紙: A4</b>・<b>余白: なし</b>・<b>倍率: 100%</b>にしてください。合計金額は出さず、項目ごとの金額（税抜）を一覧にします。
          </p>

          <fieldset disabled={!canEdit} className="flex flex-col gap-4">
            {/* 宛先・見積日など */}
            <section className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-bold text-muted">
                登録済みの所属機関（未登録の会社なら「なし」）
                <select value={q.organization_id ?? ""} onChange={(e) => selectOrg(e.target.value)} className={input}>
                  <option value="">なし（まだ登録していない会社）</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-bold text-muted">
                状況
                <select value={q.status} onChange={(e) => patch({ status: e.target.value })} className={input}>
                  {QUOTE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-bold text-muted">
                宛先の会社名
                <input value={q.addressee_name} onChange={(e) => patch({ addressee_name: e.target.value })} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-bold text-muted">
                担当者・代表者（例: 代表取締役 山田太郎）
                <input value={q.addressee_person} onChange={(e) => patch({ addressee_person: e.target.value })} className={input} />
              </label>
              <div className="flex flex-wrap items-end gap-3 sm:col-span-2">
                <HonorificPicker value={q.honorific} onChange={(honorific) => patch({ honorific })} />
                <p className="pb-3 text-xs text-muted">
                  宛名の印字: <b className="text-foreground">{addressee.orgLine}</b>
                  {addressee.personLine && <b className="ml-2 text-foreground">{addressee.personLine}</b>}
                </p>
              </div>
              <label className="flex flex-col gap-1 text-xs font-bold text-muted sm:col-span-2">
                宛先の住所
                <input value={q.addressee_address} onChange={(e) => patch({ addressee_address: e.target.value })} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-bold text-muted">
                見積日
                <input type="date" value={q.issued_on ?? ""} onChange={(e) => patch({ issued_on: e.target.value || null })} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-bold text-muted">
                見積書番号
                <input value={q.number} onChange={(e) => patch({ number: e.target.value })} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-bold text-muted sm:col-span-2">
                件名
                <input value={q.subject} onChange={(e) => patch({ subject: e.target.value })} className={input} />
              </label>
            </section>

            {/* 項目 */}
            <section className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-2 text-sm font-bold">項目（金額は税抜）</h2>
              <QuoteItemsEditor items={q.items} onChange={(items) => patch({ items })} />
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => window.confirm("項目を既定の内容に戻しますか？") && patch({ items: defaultQuoteItems() })}
                  className="min-h-[36px] rounded-lg border border-border bg-background px-3 text-xs font-bold text-muted"
                >
                  既定の項目に戻す
                </button>
                {copySources.length > 0 && (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} aria-label="複製元の見積書" className={`${input} text-xs`}>
                      <option value="">ほかの会社の見積書から複製…</option>
                      {copySources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={copyItems}
                      disabled={!copyFrom}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-brand bg-background px-3 text-xs font-bold text-brand disabled:opacity-50"
                    >
                      <Copy size={14} />
                      項目を複製
                    </button>
                  </span>
                )}
              </div>
            </section>

            {/* 備考 */}
            <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
              <label className="flex flex-col gap-1 text-xs font-bold text-muted">
                備考（1行ごとに箇条書きで印字）
                <textarea value={q.notes} onChange={(e) => patch({ notes: e.target.value })} rows={4} className={`${input} py-2`} />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={q.show_stamp_table} onChange={(e) => patch({ show_stamp_table: e.target.checked })} />
                収入印紙代（申請手数料）の在留期間ごとの表を載せる
                {!hasStampItem && <span className="text-muted">（項目に収入印紙代があるときだけ載ります）</span>}
              </label>
              <label className="flex flex-wrap items-center gap-2 text-xs">
                オンライン申請の決済手数料（1件）
                <input
                  value={q.online_fee == null ? "" : String(q.online_fee)}
                  onChange={(e) => patch({ online_fee: e.target.value.trim() === "" ? null : parseAmount(e.target.value) })}
                  inputMode="numeric"
                  placeholder="例: 330"
                  aria-label="オンライン申請の決済手数料"
                  className={`${input} w-24 text-right tabular-nums`}
                />
                円
                <span className="text-muted">入れると、表のオンラインの金額を決済手数料込みにします（次に作る見積書にも引き継ぎます）。</span>
              </label>
            </section>
          </fieldset>

          <QuoteAttachmentsPanel
            library={library}
            onLibraryChange={setLibrary}
            selected={q.attachment_ids}
            onSelectedChange={(attachment_ids) => patch({ attachment_ids })}
            canEdit={canEdit}
          />

          {/* やりとりの記録 */}
          <section className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="text-sm font-bold">やりとりの記録</h2>
            <p className="mt-1 text-[11px] text-muted">
              見積書を送った日、電話・メール・訪問の内容などを残します。追加・削除した時点で保存されます。「送付」を記録すると、作成中の見積書は「送付済」になります。
            </p>
            {canEdit && (
              <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input type="date" value={ev.on} onChange={(e) => setEv({ ...ev, on: e.target.value })} aria-label="やりとりの日付" className={input} />
                  <select value={ev.kind} onChange={(e) => setEv({ ...ev, kind: e.target.value })} aria-label="やりとりの種類" className={input}>
                    {QUOTE_EVENT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={ev.body}
                  onChange={(e) => setEv({ ...ev, body: e.target.value })}
                  rows={3}
                  placeholder="内容（例: 代表の山田様に電話。来月2名の受入れを検討中、支援代の金額を相談したいとのこと）"
                  aria-label="やりとりの内容"
                  className={`${input} py-2`}
                />
                <button
                  type="button"
                  onClick={addEvent}
                  disabled={busy}
                  className="inline-flex min-h-[40px] items-center gap-1 self-start rounded-lg bg-brand px-4 text-xs font-bold text-brand-foreground disabled:opacity-60"
                >
                  <Plus size={14} />
                  記録する
                </button>
              </div>
            )}
            {q.events.length === 0 ? (
              <p className="mt-3 text-xs text-muted">まだ記録はありません。</p>
            ) : (
              <ol className="mt-3 flex flex-col gap-2">
                {q.events.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 rounded-xl border border-border bg-background px-3 py-2">
                    <div className="shrink-0 text-xs">
                      <p className="font-bold tabular-nums">{e.on ? estimateDateText(e.on) : "日付なし"}</p>
                      <p className="text-muted">{e.kind}</p>
                    </div>
                    <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm">{e.body}</p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removeEvent(e.id)}
                        aria-label="このやりとりを削除"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-seal hover:bg-seal/10"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {canEdit && (
            <button type="button" onClick={remove} disabled={busy} className="self-start text-xs font-bold text-seal underline-offset-2 hover:underline">
              この見積書を削除する
            </button>
          )}
          <p className="text-xs font-bold text-muted">印刷のイメージ</p>
        </div>
      </div>

      {/* 印刷するA4縦1枚 */}
      <div className="print-root">
        <div className="quote-sheet mx-auto mb-6 max-w-[210mm] border border-border bg-white px-[16mm] py-[14mm] text-black print:mb-0 print:border-0">
          <div className="flex items-start justify-between gap-6 text-[11px] leading-relaxed">
            <div className="min-w-0">
              {q.addressee_address && <p>{q.addressee_address}</p>}
              <p className="mt-1 text-base font-bold">{addressee.orgLine}</p>
              {addressee.personLine && <p className="text-sm font-bold">{addressee.personLine}</p>}
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <div className="text-right">
                <p className="font-bold">登録支援機関 {custodian.officeName}</p>
                <p>{custodian.headOfficeAddress || custodian.address}</p>
                <p>TEL {custodian.tel}</p>
                <p>登録番号 {custodian.registrationNo}</p>
                <p>登録番号（インボイス） {custodian.invoiceRegistrationNo}</p>
              </div>
              <div className="quote-stamp shrink-0">
                {/* 角印（帳票内のため next/image は使わない） */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/azk-stamp.png" alt={`${custodian.officeName} 角印`} />
              </div>
            </div>
          </div>

          <h2 className="mt-10 text-center text-2xl font-bold tracking-[0.5em]">御見積書</h2>

          <div className="mt-6 flex items-end justify-between gap-6">
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex items-baseline gap-3 border-b border-black pb-1">
                <span className="shrink-0 text-[11px] text-neutral-600">件名</span>
                <span className="font-bold">{q.subject}</span>
              </div>
              <p className="mt-2 text-[11px]">下記のとおり御見積申し上げます。（金額はすべて税抜です）</p>
            </div>
            <table className="shrink-0 text-[11px]">
              <tbody>
                <tr>
                  <td className="pr-4 text-neutral-600">見積日</td>
                  <td className="text-right">{q.issued_on ? estimateDateText(q.issued_on) : ""}</td>
                </tr>
                {q.number && (
                  <tr>
                    <td className="pr-4 text-neutral-600">見積書番号</td>
                    <td className="text-right">{q.number}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <table className="quote-items mt-5 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-neutral-100">
                <th className="border border-black px-2 py-1.5 text-left font-bold">項目</th>
                <th className="w-[28mm] border border-black px-2 py-1.5 font-bold">金額（税抜）</th>
                <th className="w-[22mm] border border-black px-2 py-1.5 font-bold">単位</th>
                <th className="w-[52mm] border border-black px-2 py-1.5 font-bold">備考</th>
              </tr>
            </thead>
            <tbody>
              {printed.map((it, i) =>
                it.kind === "text" ? (
                  <tr key={i}>
                    <td colSpan={4} className="border border-black bg-neutral-50 px-2 py-1.5 font-bold">
                      {it.name}
                    </td>
                  </tr>
                ) : (
                  <tr key={i}>
                    <td className="border border-black px-2 py-1.5">
                      {it.name}
                      {it.taxFree && <span className="ml-1 text-[9px] text-neutral-600">（非課税）</span>}
                    </td>
                    <td className="border border-black px-2 py-1.5 text-right tabular-nums">{quotePriceText(it.price)}</td>
                    <td className="border border-black px-2 py-1.5 text-center">{it.unit}</td>
                    <td className="border border-black px-2 py-1.5 text-[10px]">{it.note}</td>
                  </tr>
                ),
              )}
              {Array.from({ length: blankRows }).map((_, i) => (
                <tr key={`blank-${i}`}>
                  <td className="border border-black px-2 py-1.5">&nbsp;</td>
                  <td className="border border-black px-2 py-1.5" />
                  <td className="border border-black px-2 py-1.5" />
                  <td className="border border-black px-2 py-1.5" />
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-5 border border-black px-3 py-2 text-[10.5px] leading-relaxed">
            <p className="font-bold">備考</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {q.notes
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
            </ul>
            {showStampTable && (
              <div className="mt-2">
                <p className="font-bold">申請手数料（収入印紙代）の額：許可される在留期間ごと（2026年10月1日改定）</p>
                <table className="quote-stamp-table mt-1 w-full border-collapse text-center text-[10px]">
                  <thead>
                    <tr className="bg-neutral-100">
                      <th className="border border-black px-1 py-0.5">許可される在留期間</th>
                      <th className="border border-black px-1 py-0.5">窓口（収入印紙）</th>
                      <th className="border border-black px-1 py-0.5">
                        {q.online_fee ? `オンライン（決済手数料${q.online_fee.toLocaleString("ja-JP")}円込み）` : "オンライン"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {STAMP_FEE_BANDS.map((b) => (
                      <tr key={b.key}>
                        <td className="border border-black px-1 py-0.5">{b.key}</td>
                        <td className="border border-black px-1 py-0.5">{estimateYen(b.counter)}</td>
                        <td className="border border-black px-1 py-0.5">{estimateYen(onlineFeeWithCharge(b.online, q.online_fee))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-[9.5px] text-neutral-700">
                  {q.online_fee
                    ? `※収入印紙代は非課税・実費です。オンライン申請はコンビニ決済・銀行決済での納付のみで、オンラインの金額は決済手数料（${q.online_fee.toLocaleString("ja-JP")}円）を含みます。`
                    : "※収入印紙代は非課税・実費です。オンライン申請はコンビニ決済・銀行決済での納付のみで、別途決済手数料がかかります。"}
                </p>
              </div>
            )}
          </div>
        </div>
        <QuoteAttachmentPages
          attachments={q.attachment_ids
            .map((id) => library.find((a) => a.id === id))
            .filter((a): a is QuoteAttachment => !!a)}
          onLoadingChange={setAttachLoading}
        />
      </div>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 0;
        }
        .quote-sheet {
          width: 210mm;
          min-height: 297mm;
          box-sizing: border-box;
        }
        .quote-stamp img {
          width: 20mm;
          height: 20mm;
          object-fit: contain;
        }
        .quote-attach-page {
          width: 210mm;
          height: 297mm;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
          break-before: page;
          overflow: hidden;
        }
        .quote-attach-page img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
        @media print {
          .quote-sheet {
            height: 297mm;
            overflow: hidden;
          }
          .quote-stamp img,
          .quote-items th,
          .quote-stamp-table th {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </>
  );
}
