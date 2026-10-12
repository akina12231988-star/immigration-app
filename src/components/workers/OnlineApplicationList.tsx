"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import { ONLINE_FORMAT_LABELS, onlineSectionText, type OnlineSection } from "@/lib/online-application";

// 在留申請オンラインシステムの「手続き申込」画面に貼るためのデータ。
// 画面の項目順に並べ、画面の入力形式（8桁の日付・数字のみ・全角）にした値を1項目ずつコピーできる。
// 郵便番号は住所から自動で検索して入れる（/api/postal）。
export function OnlineApplicationList({ sections }: { sections: OnlineSection[] }) {
  const [openSection, setOpenSection] = useState(0);
  const [copiedSection, setCopiedSection] = useState<number | null>(null);
  // 住所 → 郵便番号の検索結果（住所ごと）。まだ無ければ検索中、""=見つからない
  const [postals, setPostals] = useState<Record<string, string>>({});

  const addresses = Array.from(
    new Set(sections.flatMap((s) => s.items.map((i) => i.postalFor ?? "")).filter(Boolean)),
  ).join("\n");
  useEffect(() => {
    const list = addresses.split("\n").filter(Boolean);
    if (list.length === 0) return;
    let cancelled = false;
    for (const a of list) {
      void fetch(`/api/postal?address=${encodeURIComponent(a)}`)
        .then((r) => (r.ok ? r.json() : { postal: "" }))
        .then((j: { postal?: string }) => {
          if (!cancelled) setPostals((prev) => ({ ...prev, [a]: j.postal ?? "" }));
        })
        .catch(() => {
          if (!cancelled) setPostals((prev) => ({ ...prev, [a]: "" }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [addresses]);

  const withPostal = sections.map((s) => ({
    ...s,
    items: s.items.map((i) => (i.postalFor ? { ...i, value: postals[i.postalFor] ?? "" } : i)),
  }));
  const filled = withPostal.reduce((n, s) => n + s.items.filter((i) => i.value).length, 0);
  const total = withPostal.reduce((n, s) => n + s.items.filter((i) => !i.manual || i.postalFor).length, 0);

  const copyAll = async (i: number) => {
    try {
      await navigator.clipboard.writeText(onlineSectionText(withPostal[i]));
      setCopiedSection(i);
      setTimeout(() => setCopiedSection(null), 1500);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };

  const current = withPostal[openSection];

  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-relaxed text-muted">
        在留申請オンラインシステムの「手続き申込」画面の項目順です。日付は8桁（19940710）、職歴の年月は6桁、金額・電話番号・郵便番号は数字のみ、
        住所など「全角」の欄は全角にそろえてあります。「画面で選ぶ」の項目はアプリに元の値が無いので、案内を見て画面で選んでください。
        郵便番号は住所から自動で検索します（見つからないときは画面の「住所検索」で確認）。
        値を直すときは「紙の申請書の順」に切り替えて編集してください。
        <span className="ml-1 font-bold text-foreground">
          {filled} / {total}項目
        </span>
      </p>
      <div className="flex flex-wrap gap-1">
        {withPostal.map((s, i) => (
          <button
            key={s.title}
            type="button"
            onClick={() => setOpenSection(i)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
              openSection === i ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface text-muted"
            }`}
          >
            {s.title.replace(/（.*$/, "")}
          </button>
        ))}
      </div>
      {current && (
        <div className="rounded-lg bg-surface p-2">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
            <p className="text-[11px] font-bold">{current.title}</p>
            <button
              type="button"
              onClick={() => void copyAll(openSection)}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-[11px] font-bold text-muted"
            >
              {copiedSection === openSection ? <Check size={12} className="text-status-reported-fg" /> : <Copy size={12} />}
              {copiedSection === openSection ? "コピーしました" : "この欄をまとめてコピー"}
            </button>
          </div>
          <div className="divide-y divide-border">
            {current.items.map((item, i) => {
              const searching = !!item.postalFor && !(item.postalFor in postals);
              const fmt = ONLINE_FORMAT_LABELS[item.format];
              return (
                <div key={`${item.no}-${item.label}-${i}`} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 py-1 text-[11px]">
                  <span className="w-full text-muted sm:w-[17rem] sm:shrink-0">
                    {item.no && <span className="mr-1 font-bold tabular-nums text-foreground">{item.no}</span>}
                    {item.label}
                    {fmt && (
                      <span className="ml-1 rounded border border-border px-1 py-px text-[10px] text-muted">{fmt}</span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 items-start gap-1">
                    {item.value ? (
                      <>
                        <span className="min-w-0 break-all font-bold">{item.value}</span>
                        <CopyButton value={item.value} label={`${item.label}をコピー`} size={13} className="mt-0.5" />
                      </>
                    ) : searching ? (
                      <span className="flex items-center gap-1 text-muted">
                        <Loader2 size={12} className="animate-spin" />
                        郵便番号を検索中…
                      </span>
                    ) : item.postalFor ? (
                      <span className="text-seal">見つかりません（画面の「住所検索」で確認）</span>
                    ) : item.manual ? (
                      <span className="rounded bg-background px-1.5 py-0.5 text-muted">画面で選ぶ・入力</span>
                    ) : (
                      <span className="text-seal">未登録</span>
                    )}
                  </span>
                  {item.note && <span className="w-full text-[10px] text-muted sm:pl-[17.5rem]">{item.note}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
