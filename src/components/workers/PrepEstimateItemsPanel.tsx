"use client";

import { useState } from "react";
import Link from "next/link";
import { parseAmount } from "@/lib/organization-intake";
import type { OrgSalesItem } from "@/types/db";

// 申請準備の詳細（新規準備・更新準備）で、見積書と許可後の請求に使う明細（明細項目と金額）を登録する欄。
// はじめは所属機関の情報の「申請種別ごとの売上明細」を出し、「この明細で登録」で準備リストに保存する。
// 保存した明細は、この申請だけの内容として見積書・請求書作成の当月許可者リストに使う
// （所属機関の売上明細をあとから変えても、登録済みの申請の明細は変わらない）。
export function PrepEstimateItemsPanel({
  saved,
  orgItems,
  orgId,
  orgName,
  salesKind,
  orgUsesDefault,
  canEdit,
  estimateHref,
  onSave,
}: {
  saved: OrgSalesItem[] | null; // 登録済みの明細（null = 未登録）
  orgItems: OrgSalesItem[]; // 所属機関の売上明細（この申請種別のぶん）
  orgId: string | null;
  orgName: string;
  salesKind: string; // 売上明細の申請種別（特定技能申請 など。'' = 申請種別が未選択）
  orgUsesDefault: boolean; // 所属機関でこの申請種別の明細を登録しておらず、既定の明細を出しているか
  canEdit: boolean;
  estimateHref: string;
  onSave: (items: OrgSalesItem[] | null) => Promise<void>;
}) {
  const registered = saved !== null;
  const [draft, setDraft] = useState<OrgSalesItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = draft ?? saved ?? orgItems;
  const editing = draft !== null;
  const total = rows.reduce((n, r) => n + (parseAmount(r.amount) ?? 0), 0);

  async function save(items: OrgSalesItem[] | null) {
    setBusy(true);
    try {
      await onSave(items ? items.filter((r) => r.name.trim() || r.amount.trim()) : null);
      setDraft(null);
    } finally {
      setBusy(false);
    }
  }

  if (!salesKind) {
    return (
      <div className="rounded-xl border border-border p-3 text-xs text-muted">
        <p className="mb-1 font-bold text-foreground">見積・請求の明細</p>
        申請種別を選ぶと、所属機関の売上明細から明細項目と金額を読み込みます。
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-3 ${registered ? "border-border" : "border-seal/50 bg-seal/5"}`}>
      <p className="mb-1 flex flex-wrap items-center gap-2 text-sm font-bold">
        見積・請求の明細（{salesKind}）
        {registered ? (
          <span className="rounded-full bg-status-approved-bg px-2 py-0.5 text-[10px] font-bold text-status-approved-fg">登録済み</span>
        ) : (
          <span className="rounded-full bg-seal/10 px-2 py-0.5 text-[10px] font-bold text-seal">未登録</span>
        )}
      </p>
      <p className="mb-2 text-[11px] leading-relaxed text-muted">
        {registered
          ? "この申請の明細として登録済みです。見積書と、許可が下りたあとの請求書作成（当月許可者リスト）にこの明細を使います。"
          : `${orgName || "所属機関"} の「申請種別ごとの売上明細」を出しています。内容を確かめて「この明細で登録」を押してください（この申請だけ金額を直すこともできます）。`}
        収入印紙代は上の負担の選び方と、許可のときに入れた金額で自動で足します。
        <span className="mt-1 block font-bold text-foreground">
          ここで直して登録した明細はこの人（このTODO）だけのものです。所属機関の売上明細は変わりません。
        </span>
      </p>
      {orgUsesDefault && !registered && (
        <p className="mb-2 rounded-lg bg-status-notice-bg px-2 py-1.5 text-[11px] text-status-notice-fg">
          {orgName || "この所属機関"} は「{salesKind}」の売上明細が未登録のため、全所属機関共通の既定の明細を出しています。
          {orgId && (
            <Link href={`/organizations/${orgId}`} className="ml-1 font-bold underline">
              所属機関の情報で登録
            </Link>
          )}
          <Link href="/organizations/sales-items" className="ml-2 font-bold underline">
            未登録の機関の一覧
          </Link>
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-xs text-seal">
          所属機関の情報に「{salesKind}」の売上明細がありません。
          {orgId && (
            <Link href={`/organizations/${orgId}`} className="ml-1 font-bold text-brand underline">
              所属機関の情報で登録する
            </Link>
          )}
        </p>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className="py-1 pr-2">
                  {editing ? (
                    <input
                      value={r.name}
                      onChange={(e) => setDraft(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      className="min-h-[36px] w-full rounded-lg border border-border bg-background px-2 text-xs"
                      aria-label="明細項目"
                    />
                  ) : (
                    r.name || "（項目名なし）"
                  )}
                </td>
                <td className="w-32 py-1 text-right tabular-nums">
                  {editing ? (
                    <input
                      inputMode="numeric"
                      value={r.amount}
                      onChange={(e) => setDraft(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                      className="min-h-[36px] w-full rounded-lg border border-border bg-background px-2 text-right text-xs"
                      aria-label="金額（税抜）"
                    />
                  ) : (
                    `${(parseAmount(r.amount) ?? 0).toLocaleString()}円`
                  )}
                </td>
                {editing && (
                  <td className="w-10 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => setDraft(rows.filter((_, j) => j !== i))}
                      className="text-[11px] font-bold text-seal"
                    >
                      削除
                    </button>
                  </td>
                )}
              </tr>
            ))}
            <tr className="border-t border-border font-bold">
              <td className="py-1 pr-2">小計（税抜）</td>
              <td className="py-1 text-right tabular-nums">{total.toLocaleString()}円</td>
              {editing && <td />}
            </tr>
          </tbody>
        </table>
      )}
      {editing && (
        <button
          type="button"
          onClick={() => setDraft([...rows, { name: "", amount: "" }])}
          className="mt-1 text-xs font-bold text-brand"
        >
          ＋ 明細を追加
        </button>
      )}
      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(rows)}
                className="min-h-[36px] rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-60"
              >
                {busy ? "保存中…" : "この人だけの明細として登録"}
              </button>
              <button type="button" onClick={() => setDraft(null)} className="min-h-[36px] px-2 text-xs font-bold text-muted">
                やめる
              </button>
            </>
          ) : (
            <>
              {!registered && rows.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save(rows)}
                  className="min-h-[36px] rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-60"
                >
                  {busy ? "保存中…" : "この明細で登録"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setDraft(rows.map((r) => ({ ...r })))}
                className="min-h-[36px] rounded-lg border border-border px-3 text-xs font-bold"
              >
                明細を直す
              </button>
              {registered && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save(orgItems)}
                  className="min-h-[36px] rounded-lg border border-border px-3 text-xs font-bold"
                  title="所属機関の情報の売上明細をもう一度読み込んで登録し直します"
                >
                  所属機関の売上明細で登録し直す
                </button>
              )}
            </>
          )}
          <Link
            href={estimateHref}
            className="inline-flex min-h-[36px] items-center rounded-lg border border-brand px-3 text-xs font-bold text-brand hover:bg-brand/5"
          >
            🧾 見積書を作る
          </Link>
        </div>
      )}
    </div>
  );
}
