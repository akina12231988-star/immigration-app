"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft, Printer, UserRound } from "lucide-react";
import type { Organization } from "@/types/db";

export interface PrintWorker {
  id: string;
  name: string;
  kana: string;
  nationality: string;
  birth: string | null;
  residenceCardNo: string;
  field: string;
  specialtyGrade: string;
  otherQualifications: string;
  residenceStatus: string;
  residencePermitDate: string | null;
  residenceExpiryDate: string | null;
  messengerLink: string;
  orgName: string;
  photoUrl: string;
  residenceCardUrl: string;
  designationUrl: string;
}

export function PrintClient({
  organizations,
  selectedOrg,
  orgName,
  individual,
  workers,
}: {
  organizations: Organization[];
  selectedOrg: string;
  orgName: string;
  individual: boolean;
  workers: PrintWorker[];
}) {
  const router = useRouter();
  const printDate = new Date().toLocaleDateString("ja-JP");

  return (
    <>
      {/* 画面用ツールバー（印刷時は非表示） */}
      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <Link href="/workers" aria-label="戻る" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-brand-foreground/10">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="flex-1 text-lg font-bold">A4印刷{individual ? "（個人）" : ""}</h1>
        </div>

        <div className="space-y-3 px-4 py-4 lg:px-8">
          {!individual && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">所属機関で絞り込み</span>
              <select
                value={selectedOrg}
                onChange={(e) => router.push(`/workers/print?org=${e.target.value}`)}
                className="min-h-[44px] w-full max-w-md rounded-xl border border-border bg-surface px-3 text-sm"
              >
                <option value="">選択してください</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {workers.length > 0 && (
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-foreground"
            >
              <Printer size={18} />
              印刷する（{workers.length}名）
            </button>
          )}
          {!individual && selectedOrg && workers.length === 0 && (
            <p className="text-sm text-muted">この所属機関の外国人は登録されていません。</p>
          )}
        </div>
      </div>

      {/* 印刷本体: 1人1ページ */}
      <div className="print-root">
        {workers.map((w) => (
          <WorkerSheet key={w.id} worker={w} orgName={w.orgName || orgName} printDate={printDate} />
        ))}
      </div>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 0;
        }
        @media print {
          .print-root {
            display: block;
          }
          .worker-sheet {
            width: 210mm;
            min-height: 297mm;
            page-break-after: always;
            box-sizing: border-box;
          }
        }
      `}</style>
    </>
  );
}

function WorkerSheet({
  worker,
  orgName,
  printDate,
}: {
  worker: PrintWorker;
  orgName: string;
  printDate: string;
}) {
  const [qr, setQr] = useState("");

  useEffect(() => {
    if (worker.messengerLink) {
      QRCode.toDataURL(worker.messengerLink, { margin: 1, width: 240 })
        .then(setQr)
        .catch(() => setQr(""));
    }
  }, [worker.messengerLink]);

  return (
    <div className="worker-sheet mx-auto mb-6 max-w-[210mm] border border-border bg-white p-[12mm] text-black print:mb-0 print:border-0">
      <div className="mb-4 flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <h2 className="text-2xl font-black">{worker.name}</h2>
          <p className="text-sm">{orgName}</p>
        </div>
        <p className="text-xs text-gray-500">印刷日: {printDate}</p>
      </div>

      <div className="flex gap-6">
        {/* 顔写真 */}
        <div className="flex h-[40mm] w-[32mm] shrink-0 items-center justify-center overflow-hidden border border-gray-400 bg-gray-50">
          {worker.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={worker.photoUrl} alt="顔写真" className="h-full w-full object-cover" />
          ) : (
            <UserRound size={48} className="text-gray-300" />
          )}
        </div>

        {/* 外国人情報 */}
        <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <Row label="フリガナ" value={worker.kana} />
          <Row label="国籍" value={worker.nationality} />
          <Row label="生年月日" value={worker.birth} />
          <Row label="分野・職種" value={worker.field} />
          <Row label="専門級の合格名" value={worker.specialtyGrade} />
          <Row label="その他の資格・合格名" value={worker.otherQualifications} />
          <Row label="在留資格" value={worker.residenceStatus} />
          <Row label="在留カード番号" value={worker.residenceCardNo} />
          <Row label="許可日" value={worker.residencePermitDate} />
          <Row label="在留期限" value={worker.residenceExpiryDate} />
        </dl>

        {/* MessengerリンクQRコード */}
        <div className="flex w-[30mm] shrink-0 flex-col items-center">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Messenger QR" className="w-[28mm]" />
          ) : (
            <div className="flex h-[28mm] w-[28mm] items-center justify-center border border-dashed border-gray-300 text-[9px] text-gray-400">
              Messenger未登録
            </div>
          )}
          <span className="mt-1 text-[9px] text-gray-500">Messenger</span>
        </div>
      </div>

      {/* 最新在留カード画像・指定書画像 */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <DocBox label="最新 在留カード" url={worker.residenceCardUrl} />
        <DocBox label="最新 指定書" url={worker.designationUrl} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col border-b border-gray-200 pb-1">
      <dt className="text-[10px] font-bold text-gray-500">{label}</dt>
      <dd className="text-sm font-bold">{value || "—"}</dd>
    </div>
  );
}

function DocBox({ label, url }: { label: string; url: string }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold text-gray-500">{label}</p>
      <div className="flex h-[70mm] items-center justify-center overflow-hidden border border-gray-400 bg-gray-50">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="h-full w-full object-contain" />
        ) : (
          <span className="text-[10px] text-gray-400">未登録</span>
        )}
      </div>
    </div>
  );
}
