"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { listWorkerAddresses } from "@/lib/supabase/queries/worker-addresses";
import { usePostalCode } from "@/components/workers/PostalCode";
import {
  addressPeriods,
  birthSeireki,
  birthWareki,
  periodLabel,
  personCopyText,
} from "@/lib/person-copy";
import type { WorkerAddress } from "@/lib/worker-address";

interface PersonRow {
  name: string;
  kana: string | null;
  birth: string | null;
  address: string | null;
}

// 申請書に書く本人の情報（押すとコピー）。証明書類の請求の「住所の確認」・記録一覧・記録の詳細で使う。
// 氏名・フリガナ・生年月日（西暦と和暦）・現在の住所（郵便番号つき）・住所歴を外国人詳細から読み、
// years（年度の開始年）を渡すと、その年度の1月1日時点の住所に印を付ける
export function PersonCopyPanel({
  workerId,
  years = [],
  compact = false,
}: {
  workerId: string;
  years?: number[];
  compact?: boolean; // 記録一覧の中で開くときは見出しを小さくする
}) {
  const [person, setPerson] = useState<PersonRow | null>(null);
  const [addresses, setAddresses] = useState<WorkerAddress[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      supabase.from("workers").select("name, kana, birth, address").eq("id", workerId).maybeSingle(),
      listWorkerAddresses(supabase, workerId).catch(() => [] as WorkerAddress[]),
    ])
      .then(([w, addrs]) => {
        if (cancelled) return;
        if (w.error) throw w.error;
        setPerson((w.data as PersonRow | null) ?? null);
        setAddresses(addrs);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "読み込みに失敗しました");
      });
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  const postal = usePostalCode(person?.address);
  if (error) return <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>;
  if (!person || !addresses) return <p className="text-xs text-muted">本人の情報を読み込み中…</p>;

  const periods = addressPeriods(addresses, years);
  const birth = birthSeireki(person.birth);
  const wareki = birthWareki(person.birth);
  const all = personCopyText(
    { name: person.name, kana: person.kana ?? "", birth: person.birth, address: person.address ?? "", postal },
    periods,
  );

  return (
    <div className="space-y-1.5 text-xs">
      {!compact && <p className="text-sm font-bold">申請書に書く本人の情報（押すとコピー）</p>}
      <dl className="divide-y divide-dashed divide-border">
        <Row label="氏名（ローマ字）" value={person.name} />
        <Row label="フリガナ" value={person.kana ?? ""} />
        <Row label="生年月日" value={birth} extra={wareki ? <CopyChip value={wareki} label={wareki} /> : null} />
        {postal && <Row label="郵便番号" value={postal} />}
        <Row label="現在の住所" value={person.address ?? ""} />
      </dl>
      <p className="pt-1 font-bold">住所歴（転入日ごと）</p>
      {periods.length === 0 ? (
        <p className="text-muted">住所歴が未登録です（外国人詳細の「住所歴」で転入日ごとに登録できます）。</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {periods.map((p, i) => (
            <li key={p.id} className={`flex items-start gap-2 px-2.5 py-1.5 ${i === 0 && !p.to ? "bg-status-approved-bg/40" : ""}`}>
              <span className="w-40 shrink-0 tabular-nums text-muted">{periodLabel(p)}</span>
              <span className="min-w-0 flex-1 break-words font-bold">
                {p.address}
                {p.marks.length > 0 && (
                  <span className="ml-1.5 inline-block rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                    {p.marks.join("・")}の住所
                  </span>
                )}
              </span>
              <CopyChip value={p.address} label="コピー" />
            </li>
          ))}
        </ul>
      )}
      <div className="pt-1">
        <CopyChip value={all} label="まとめてコピー（氏名・生年月日・現在の住所・住所歴）" strong />
      </div>
    </div>
  );
}

function Row({ label, value, extra }: { label: string; value: string; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5">
      <dt className="w-28 shrink-0 text-[11px] text-muted">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {value ? (
          <>
            <span className="break-all text-[13px] font-black">{value}</span>
            <CopyChip value={value} label="コピー" />
            {extra}
          </>
        ) : (
          <span className="text-seal">未登録</span>
        )}
      </dd>
    </div>
  );
}

// 押すとコピーする小さなボタン（文字つき）
function CopyChip({ value, label, strong = false }: { value: string; label: string; strong?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* クリップボードが使えないときは何もしない */
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={value}
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-bold ${
        strong ? "min-h-[36px] border-brand px-3 text-brand" : "border-border text-brand"
      } ${copied ? "border-status-approved-fg text-status-approved-fg" : ""}`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "コピーしました" : label}
    </button>
  );
}
