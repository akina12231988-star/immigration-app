"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { PROMETRIC_PHONE, type PrometricAddress } from "@/lib/address-romaji";

// プロメトリックID取得の「電話番号・住所」の画面に入れる値（英字）。
// 本人の日本での住所を、市区町村・町域の読み仮名（郵便番号の検索と同じ /api/postal）から英字に直して欄ごとに出す。
// 電話番号はこちらの連絡先（PROMETRIC_PHONE）を入れる
export function PrometricAddressCopy({ address }: { address: string | null | undefined }) {
  const a = (address ?? "").trim();
  const [state, setState] = useState<{ key: string; en: PrometricAddress | null; failed: boolean } | null>(null);

  useEffect(() => {
    if (!a) return;
    let cancelled = false;
    fetch(`/api/postal?en=1&address=${encodeURIComponent(a)}`)
      .then((r) => r.json() as Promise<{ en?: PrometricAddress }>)
      .then((j) => !cancelled && setState({ key: a, en: j.en ?? null, failed: !j.en }))
      .catch(() => !cancelled && setState({ key: a, en: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [a]);

  const loading = !!a && state?.key !== a;
  const en = state?.key === a ? state.en : null;

  const row = (label: string, value: string, note?: string) => (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-border bg-background px-2.5 py-1.5">
      <span className="w-[110px] shrink-0 text-[11px] font-bold text-muted">{label}</span>
      {value ? (
        <>
          <span className="min-w-0 flex-1 break-all font-mono text-xs font-bold">{value}</span>
          <CopyButton value={value} label={`${label}をコピー`} size={12} />
        </>
      ) : (
        <span className="min-w-0 flex-1 text-[11px] text-muted">{note ?? "（空欄）"}</span>
      )}
    </li>
  );

  return (
    <div className="mt-2 border-t border-dashed border-border pt-1.5">
      <p className="mb-1 text-[11px] font-bold text-muted">
        プロメトリックID取得の電話番号・住所（英字。半角英数字・1項目30文字以内）
      </p>
      {!a ? (
        <p className="text-[11px] text-seal">日本での住所が未登録です。外国人詳細で住所を登録してください。</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {row("電話番号", PROMETRIC_PHONE)}
            {loading ? (
              <li className="text-[11px] text-muted">住所を英字に直しています…</li>
            ) : en ? (
              <>
                {row("ビル名/階", en.building, "建物名・部屋番号が無ければ空欄")}
                {row("町村番地", en.street)}
                {row("市区", en.city)}
                {row("都道府県/州", en.prefecture)}
                {row("郵便番号", en.postal)}
              </>
            ) : (
              <li className="text-[11px] text-seal">
                住所を英字に直せませんでした（住所の書き方を確認するか、時間をおいて開き直してください）。
              </li>
            )}
          </ul>
          {en && en.warnings.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {en.warnings.map((w) => (
                <li key={w} className="text-[11px] font-bold text-seal">⚠ {w}</li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[10px] text-muted">
            市区町村・町域の読み仮名から自動で英字にしています（長音は書かないヘボン式）。日本での住所: {a}
          </p>
        </>
      )}
    </div>
  );
}
