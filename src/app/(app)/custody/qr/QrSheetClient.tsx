"use client";

import { useMemo, useState } from "react";
import { Download, Printer, QrCode, Tag } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { CustodyWithWorker } from "@/lib/supabase/queries/custody";
import { STORAGE_NO_MAX, STORAGE_NO_MIN, formatStorageNo } from "@/lib/custody";
import { QrImage, QrLinkCopyButton, QrSaveButton, TepraSaveButton, custodyQrUrl, useOrigin } from "../QrImage";

const inputCls =
  "min-h-[44px] w-20 rounded-xl border border-border bg-surface px-3 text-center text-base font-bold tabular-nums focus:border-brand focus:outline-none";

export function QrSheetClient({ records }: { records: CustodyWithWorker[] }) {
  const origin = useOrigin();
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("30");

  // 番号 → 現在預かり中の人（QRシートの参考表示用）
  const activeNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of records) {
      if (r.status !== "返却済み") map.set(r.storage_no, r.workers?.name ?? "");
    }
    return map;
  }, [records]);

  const start = Math.max(STORAGE_NO_MIN, Number.parseInt(from, 10) || STORAGE_NO_MIN);
  const end = Math.min(STORAGE_NO_MAX, Number.parseInt(to, 10) || start);
  const nos = useMemo(() => {
    const list: number[] = [];
    for (let n = start; n <= Math.max(start, end); n++) list.push(n);
    return list.slice(0, 200); // 一度に印刷する上限
  }, [start, end]);

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted print:hidden">
        <QrCode size={14} className="mt-0.5 shrink-0" />
        番号ごとのQRコードです。印刷して付箋・ボックスの仕切りに貼っておくと、スマホのカメラで読み取るだけで
        その番号の持出・返却の登録画面が開きます。番号は使い回しなので、一度貼れば貼り替え不要です。
      </p>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <input value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" className={inputCls} />
          <span className="text-sm text-muted">〜</span>
          <input value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" className={inputCls} />
          <span className="text-xs text-muted">番</span>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-brand-foreground"
        >
          <Printer size={16} />
          この一覧を印刷
        </button>
      </div>

      {!origin ? null : (
        <div className="qr-grid grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4 print:gap-2">
          {nos.map((no) => {
            const url = custodyQrUrl(origin, no);
            const holder = activeNames.get(no);
            return (
              <Card key={no} className="qr-card flex flex-col items-center gap-1.5 p-3 print:rounded-none print:border print:border-black/40 print:shadow-none">
                <span className="rounded border-2 border-seal px-2 text-lg font-black tabular-nums tracking-widest text-seal">
                  {formatStorageNo(no)}
                </span>
                <QrImage text={url} size={120} className="rounded bg-white p-1" />
                <p className="h-4 truncate text-[10px] text-muted">{holder ?? ""}</p>
                <div className="flex flex-wrap justify-center gap-2 print:hidden">
                  <QrSaveButton
                    text={url}
                    filename={`保管QR_No${formatStorageNo(no)}.png`}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-brand"
                  >
                    <Download size={12} />
                    QRを保存
                  </QrSaveButton>
                  <QrLinkCopyButton
                    url={url}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-brand"
                  />
                  <TepraSaveButton
                    text={url}
                    numberLabel={formatStorageNo(no)}
                    filename={`テプラQR_No${formatStorageNo(no)}.png`}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-brand"
                  >
                    <Tag size={12} />
                    テプラ用
                  </TepraSaveButton>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <style jsx global>{`
        @media print {
          .qr-card {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
