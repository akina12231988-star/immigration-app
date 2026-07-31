"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, Download, Loader2, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import {
  deleteSalesEntry,
  listSalesEntries,
  setSalesEntryStatus,
  type SalesEntryWithRefs,
} from "@/lib/supabase/queries/sales";
import { formatSalesYen } from "@/lib/sales";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import { todayStr } from "@/lib/ssw/calc";
import type { SalesEntryStatus } from "@/types/db";

const TABS: { key: SalesEntryStatus | "all"; label: string }[] = [
  { key: "未登録", label: "登録待ち" },
  { key: "登録済み", label: "登録済み" },
  { key: "対象外", label: "対象外" },
  { key: "all", label: "すべて" },
];

// freee販売への売上登録の管理（第1段階）。
// 在留カード受領後・退職時に作った明細をここで確認し、freee販売に登録したら
// 「登録済み」にして伝票番号を残す（登録漏れの防止）。CSVで書き出して取込にも使える。
export function SalesClient({ canEdit }: { canEdit: boolean }) {
  const today = todayStr();
  const [rows, setRows] = useState<SalesEntryWithRefs[]>([]);
  const [tab, setTab] = useState<SalesEntryStatus | "all">("未登録");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // レンダー中の同期setStateを避けるため、読み込みはマイクロタスクで開始する
    void Promise.resolve().then(() =>
      listSalesEntries(createClient())
        .then((data) => {
          if (!cancelled) setRows(data);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(dbErrorMessage(err, "0061_sales_entries.sql", "読み込みに失敗しました"));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== "all" && r.status !== tab) return false;
      if (!kw) return true;
      return (
        (r.workers?.name ?? "").toLowerCase().includes(kw) ||
        (r.organizations?.name ?? "").toLowerCase().includes(kw) ||
        r.item_name.toLowerCase().includes(kw) ||
        r.description.toLowerCase().includes(kw)
      );
    });
  }, [rows, tab, keyword]);

  // 所属機関ごとにまとめる（freee販売は機関ごとの案件に登録するため）
  const grouped = useMemo(() => {
    const map = new Map<string, { orgName: string; items: SalesEntryWithRefs[] }>();
    for (const r of filtered) {
      const key = r.organization_id ?? "none";
      const orgName = r.organizations?.name ?? "所属機関未設定";
      if (!map.has(key)) map.set(key, { orgName, items: [] });
      map.get(key)!.items.push(r);
    }
    return [...map.values()].sort((a, b) => a.orgName.localeCompare(b.orgName, "ja"));
  }, [filtered]);

  const total = filtered.reduce((sum, r) => sum + r.amount, 0);

  const mark = async (id: string, status: SalesEntryStatus) => {
    setBusyId(id);
    setError(null);
    try {
      await setSalesEntryStatus(createClient(), id, status, {
        registered_on: status === "登録済み" ? today : null,
      });
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status, registered_on: status === "登録済み" ? today : null }
            : r,
        ),
      );
    } catch (err) {
      setError(errorMessage(err, "更新に失敗しました"));
    } finally {
      setBusyId(null);
    }
  };

  const setFreeeNo = async (id: string, freee_no: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, freee_no } : r)));
    try {
      await setSalesEntryStatus(createClient(), id, rows.find((r) => r.id === id)!.status, {
        freee_no,
      });
    } catch {
      /* 保存失敗時は次回の読み込みで元に戻る */
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("この売上明細を削除します。よろしいですか？")) return;
    setBusyId(id);
    try {
      await deleteSalesEntry(createClient(), id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(errorMessage(err, "削除に失敗しました"));
    } finally {
      setBusyId(null);
    }
  };

  // freee販売への取込・確認用のCSV（表示中の明細）
  const csv = () => {
    const head = [
      "所属機関",
      "外国人",
      "種類",
      "品目",
      "内容",
      "金額",
      "課税区分",
      "対象開始",
      "対象終了",
      "状態",
      "伝票番号",
    ];
    const lines = filtered.map((r) =>
      [
        r.organizations?.name ?? "",
        r.workers?.name ?? "",
        r.kind,
        r.item_name,
        r.description,
        String(r.amount),
        r.taxable ? "課税" : "非課税",
        r.period_from ?? "",
        r.period_to ?? "",
        r.status,
        r.freee_no,
      ]
        .map((v) => `"${v.replace(/"/g, '""')}"`)
        .join(","),
    );
    return [head.join(","), ...lines].join("\r\n");
  };

  const downloadCsv = () => {
    // Excelで文字化けしないよう BOM 付きにする
    const blob = new Blob([`﻿${csv()}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `freee販売_売上明細_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyText = async () => {
    const text = filtered
      .map((r) => `${r.description}　${formatSalesYen(r.amount)}${r.taxable ? "" : "（非課税）"}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };

  const INPUT =
    "min-h-[40px] rounded-xl border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none";

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-muted">
        在留カード受領後に申請詳細で作成した売上明細と、退職時の精算明細が集まります。
        freee販売（所属機関ごとの案件 → 見積書・受注・販売・請求書）に登録したら「登録済み」にして伝票番号を残してください。
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
              tab === t.key
                ? "border-brand bg-brand text-brand-foreground"
                : "border-border bg-surface text-muted"
            }`}
          >
            {t.label}
            {t.key !== "all" && (
              <span className="ml-1 tabular-nums">
                {rows.filter((r) => r.status === t.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="外国人・所属機関・品目で検索"
          className={`${INPUT} min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={downloadCsv}
          disabled={filtered.length === 0}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-40"
        >
          <Download size={14} />
          CSV
        </button>
        <button
          type="button"
          onClick={copyText}
          disabled={filtered.length === 0}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-40"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "コピーしました" : "内容をコピー"}
        </button>
      </div>

      <p className="text-sm font-bold text-muted">
        {filtered.length}件 ・ 合計 {formatSalesYen(total)}
      </p>

      {loading ? (
        <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" />
          読み込み中…
        </p>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          該当する売上明細はありません。
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <Card key={g.orgName} className="overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-border bg-background px-3.5 py-2.5">
                <p className="text-sm font-bold">{g.orgName}</p>
                <p className="text-xs font-bold tabular-nums text-muted">
                  {g.items.length}件 ・{" "}
                  {formatSalesYen(g.items.reduce((s, r) => s + r.amount, 0))}
                </p>
              </div>
              <div className="divide-y divide-border">
                {g.items.map((r) => (
                  <div key={r.id} className="p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
                          {r.description || r.item_name}
                          <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-bold text-muted ring-1 ring-border">
                            {r.kind}
                          </span>
                          {!r.taxable && (
                            <span className="rounded-full bg-status-notice-bg px-2 py-0.5 text-[10px] font-bold text-status-notice-fg">
                              非課税
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          品目 {r.item_name}
                          {(r.period_from || r.period_to) && (
                            <>
                              {" ・ 対象期間 "}
                              {r.period_from ?? "—"}
                              {" 〜 "}
                              {r.period_to ?? "（継続）"}
                            </>
                          )}
                          {r.workers?.name && (
                            <>
                              {" ・ "}
                              <Link
                                href={`/workers/${r.worker_id}`}
                                className="font-bold text-brand hover:underline"
                              >
                                {r.workers.name}
                              </Link>
                            </>
                          )}
                        </p>
                      </div>
                      <p className="shrink-0 text-base font-black tabular-nums">
                        {formatSalesYen(r.amount)}
                      </p>
                    </div>

                    {canEdit && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {r.status !== "登録済み" && (
                          <button
                            type="button"
                            onClick={() => void mark(r.id, "登録済み")}
                            disabled={busyId === r.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-foreground disabled:opacity-50"
                          >
                            <Check size={13} />
                            freeeに登録済みにする
                          </button>
                        )}
                        {r.status === "登録済み" && (
                          <>
                            <span className="inline-flex items-center gap-1 rounded-full bg-status-approved-bg px-2.5 py-1 text-[11px] font-bold text-status-approved-fg">
                              <Check size={12} />
                              登録済み{r.registered_on && `（${r.registered_on}）`}
                            </span>
                            <input
                              value={r.freee_no}
                              onChange={(e) => void setFreeeNo(r.id, e.target.value)}
                              placeholder="freeeの伝票番号"
                              className="min-h-[32px] w-40 rounded-lg border border-border bg-surface px-2 text-xs focus:border-brand focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => void mark(r.id, "未登録")}
                              className="text-[11px] font-bold text-muted underline"
                            >
                              登録待ちに戻す
                            </button>
                          </>
                        )}
                        {r.status !== "対象外" ? (
                          <button
                            type="button"
                            onClick={() => void mark(r.id, "対象外")}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-muted"
                          >
                            <X size={12} />
                            対象外
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void mark(r.id, "未登録")}
                            className="text-[11px] font-bold text-muted underline"
                          >
                            登録待ちに戻す
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void remove(r.id)}
                          disabled={busyId === r.id}
                          aria-label="この明細を削除"
                          className="ml-auto text-seal disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
