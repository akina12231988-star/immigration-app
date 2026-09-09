"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { listWorkerAddresses } from "@/lib/supabase/queries/worker-addresses";
import { addressOnDate, type WorkerAddress } from "@/lib/worker-address";
import { suggestMunicipalityForAddress } from "@/lib/prefectures";
import { yearWithReiwa, type Municipality } from "@/lib/tax-cert";

// 郵送請求 ＞ 判定フォーム: 氏名を選んだら、その人の住所を年度ごとに案内する。
// 課税証明書は「その年度の1月1日時点の住所地」の自治体が発行するので、
// 最新年度・前年度それぞれの1月1日時点の住所（住所歴から）と、当てはまる自治体を出す。
export function WorkerAddressGuide({
  workerId,
  currentAddress,
  latestFiscalStartYear,
  municipalities,
  selectedNewId,
  selectedPrevId,
  onPick,
}: {
  workerId: string;
  currentAddress: string;
  latestFiscalStartYear: number; // 最新年度（西暦の開始年）
  municipalities: Municipality[];
  selectedNewId: string;
  selectedPrevId: string;
  onPick: (year: "new" | "prev", municipalityId: string) => void;
}) {
  const [addresses, setAddresses] = useState<WorkerAddress[] | null>(null);

  // 住所歴を読む（人を切り替えたら読み直す）
  useEffect(() => {
    let cancelled = false;
    listWorkerAddresses(createClient(), workerId)
      .then((rows) => {
        if (!cancelled) setAddresses(rows);
      })
      .catch(() => {
        if (!cancelled) setAddresses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  const years: { key: "new" | "prev"; fiscal: number; label: string; selectedId: string }[] = [
    { key: "new", fiscal: latestFiscalStartYear, label: "最新年度", selectedId: selectedNewId },
    { key: "prev", fiscal: latestFiscalStartYear - 1, label: "前年度", selectedId: selectedPrevId },
  ];

  return (
    <div className="rounded-xl border border-border bg-background p-3 text-xs leading-relaxed">
      <p className="mb-1 flex items-center gap-1 text-sm font-bold">
        <MapPin size={14} />
        この人の住所（請求先の自治体の目安）
      </p>
      <p className="mb-2 text-muted">
        課税・納税証明書は、その年度の1月1日時点に住んでいた自治体が発行します。
        最新年度と前年度で住所が違うときは、年度ごとに請求先を分けてください。
      </p>
      <p>
        <span className="font-bold">現在の住所：</span>
        {currentAddress || <span className="text-muted">未登録</span>}
      </p>
      {addresses === null ? (
        <p className="mt-1 text-muted">住所歴を読み込み中…</p>
      ) : (
        <div className="mt-1.5 space-y-1.5">
          {years.map((y) => {
            const on = `${y.fiscal}-01-01`;
            const hit = addressOnDate(addresses, on);
            // 住所歴に無ければ現在の住所で代用（要確認として出す）
            const address = hit?.address ?? (addresses.length === 0 ? currentAddress : "");
            const fallback = !hit && !!address;
            const suggested = address ? suggestMunicipalityForAddress(address, municipalities) : null;
            const already = suggested && suggested.id === y.selectedId;
            return (
              <div key={y.key} className="rounded-lg bg-surface px-2.5 py-2">
                <p className="font-bold">
                  {y.label}（{yearWithReiwa(y.fiscal)}）＝{y.fiscal}年1月1日時点の住所
                </p>
                <p className={address ? "" : "text-muted"}>
                  {address || "住所歴に該当する住所がありません（外国人詳細の住所歴で転入日を登録してください）"}
                  {fallback && <span className="text-status-notice-fg">（住所歴が未登録のため現在の住所。要確認）</span>}
                </p>
                {suggested ? (
                  <p className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span>
                      当てはまる自治体：<span className="font-bold">{suggested.name}</span>
                    </span>
                    {already ? (
                      <span className="text-status-reported-fg">選択済み</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onPick(y.key, suggested.id)}
                        className="rounded-lg border border-brand px-2 py-0.5 text-[11px] font-bold text-brand"
                      >
                        {y.label}の自治体に選ぶ
                      </button>
                    )}
                  </p>
                ) : (
                  address && <p className="mt-0.5 text-muted">自治体マスタに当てはまるものが無いので、下で選んでください（無ければ自治体マスタに追加）。</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
