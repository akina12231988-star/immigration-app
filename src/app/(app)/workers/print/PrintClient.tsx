"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import QRCode from "qrcode";
import { Printer, UserRound } from "lucide-react";
import type { Organization } from "@/types/db";

export interface PrintWorker {
  id: string;
  workerCode: string;
  name: string;
  kana: string;
  nationality: string;
  birth: string | null;
  gender: string;
  residenceCardNo: string;
  field: string;
  specialtyGrade: string;
  otherQualifications: string;
  residenceStatus: string;
  residencePermitDate: string | null;
  residenceExpiryDate: string | null;
  employmentStartOn: string | null;
  leavingOn: string | null;
  assignedOffice: string;
  residenceNote: string;
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
  from,
  to,
  forCompany,
  forList,
  listForCompany,
  workers,
}: {
  organizations: Organization[];
  selectedOrg: string;
  orgName: string;
  individual: boolean;
  from: string;
  to: string;
  forCompany: boolean;
  forList: boolean;
  listForCompany: boolean;
  workers: PrintWorker[];
}) {
  const router = useRouter();
  const printDate = new Date().toLocaleDateString("ja-JP");

  // 条件変更でURLを組み立て直す（個人単位は worker パラメータを維持）
  const buildUrl = (patch: Partial<{ org: string; from: string; to: string; mode: string }>) => {
    const p = new URLSearchParams();
    const nextOrg = patch.org ?? selectedOrg;
    if (nextOrg) p.set("org", nextOrg);
    const nextFrom = patch.from ?? from;
    const nextTo = patch.to ?? to;
    if (nextFrom) p.set("from", nextFrom);
    if (nextTo) p.set("to", nextTo);
    const nextMode =
      patch.mode ??
      (forList ? (listForCompany ? "list-company" : "list") : forCompany ? "company" : "internal");
    p.set("mode", nextMode);
    return `/workers/print?${p.toString()}`;
  };

  return (
    <>
      {/* 画面用ツールバー（印刷時は非表示） */}
      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref="/workers" />
          <h1 className="flex-1 text-lg font-bold">A4印刷{individual ? "（個人）" : ""}</h1>
        </div>

        <div className="space-y-3 px-4 py-4 lg:px-8">
          {/* 印刷用途の切替（社内用=QRあり / 会社提出用=QRなし / 一覧表=まとめて1表） */}
          {!individual && (
            <div className="flex rounded-xl border border-border p-0.5">
              <button
                type="button"
                onClick={() => router.push(buildUrl({ mode: "internal" }))}
                className={`flex-1 rounded-lg py-2 text-sm font-bold ${!forCompany && !forList ? "bg-brand text-brand-foreground" : "text-muted"}`}
              >
                社内用（QRあり）
              </button>
              <button
                type="button"
                onClick={() => router.push(buildUrl({ mode: "company" }))}
                className={`flex-1 rounded-lg py-2 text-sm font-bold ${forCompany ? "bg-brand text-brand-foreground" : "text-muted"}`}
              >
                会社提出用（QRなし）
              </button>
              <button
                type="button"
                onClick={() => router.push(buildUrl({ mode: "list" }))}
                className={`flex-1 rounded-lg py-2 text-sm font-bold ${forList ? "bg-brand text-brand-foreground" : "text-muted"}`}
              >
                一覧表
              </button>
            </div>
          )}
          {/* 個人単位のときは用途切替（社内/会社提出）だけ表示 */}
          {individual && (
            <div className="flex rounded-xl border border-border p-0.5">
              <button
                type="button"
                onClick={() => router.push(buildUrl({ mode: "internal" }))}
                className={`flex-1 rounded-lg py-2 text-sm font-bold ${!forCompany ? "bg-brand text-brand-foreground" : "text-muted"}`}
              >
                社内用（QRあり）
              </button>
              <button
                type="button"
                onClick={() => router.push(buildUrl({ mode: "company" }))}
                className={`flex-1 rounded-lg py-2 text-sm font-bold ${forCompany ? "bg-brand text-brand-foreground" : "text-muted"}`}
              >
                会社提出用（QRなし）
              </button>
            </div>
          )}

          {forList && (
            <div className="flex max-w-md rounded-xl border border-border p-0.5">
              <button
                type="button"
                onClick={() => router.push(buildUrl({ mode: "list" }))}
                className={`flex-1 rounded-lg py-2 text-sm font-bold ${!listForCompany ? "bg-brand text-brand-foreground" : "text-muted"}`}
              >
                社内用（IDあり）
              </button>
              <button
                type="button"
                onClick={() => router.push(buildUrl({ mode: "list-company" }))}
                className={`flex-1 rounded-lg py-2 text-sm font-bold ${listForCompany ? "bg-brand text-brand-foreground" : "text-muted"}`}
              >
                会社提出用（IDなし）
              </button>
            </div>
          )}

          {!individual && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-muted">所属機関で絞り込み</span>
                <select
                  value={selectedOrg}
                  onChange={(e) => router.push(buildUrl({ org: e.target.value }))}
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
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-muted">在留許可日（開始）</span>
                  <input type="date" value={from} onChange={(e) => router.push(buildUrl({ from: e.target.value }))} className="min-h-[40px] rounded-xl border border-border bg-surface px-3 text-sm" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-muted">在留許可日（終了）</span>
                  <input type="date" value={to} onChange={(e) => router.push(buildUrl({ to: e.target.value }))} className="min-h-[40px] rounded-xl border border-border bg-surface px-3 text-sm" />
                </label>
                {(from || to) && (
                  <button type="button" onClick={() => router.push(buildUrl({ from: "", to: "" }))} className="text-xs font-bold text-brand">
                    期間クリア
                  </button>
                )}
              </div>
            </>
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
          {!individual && (selectedOrg || from || to) && workers.length === 0 && (
            <p className="text-sm text-muted">条件に合う外国人が見つかりません。</p>
          )}
          {forList && !selectedOrg && !from && !to && (
            <p className="text-sm text-muted">所属機関または在留許可日の期間を指定すると、一覧表を作成できます。</p>
          )}
        </div>
      </div>

      {/* 印刷本体 */}
      {forList ? (
        <div className="print-root">
          {workers.length > 0 && (
            <WorkerListSheet
              workers={workers}
              orgName={orgName}
              from={from}
              to={to}
              printDate={printDate}
              showId={!listForCompany}
            />
          )}
        </div>
      ) : (
        <div className="print-root">
          {workers.map((w) => (
            <WorkerSheet key={w.id} worker={w} orgName={w.orgName || orgName} printDate={printDate} forCompany={forCompany} />
          ))}
        </div>
      )}

      <style jsx global>{`
        @page {
          size: ${forList ? "A4 landscape" : "A4 portrait"};
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
          .list-sheet {
            width: 297mm;
            box-sizing: border-box;
          }
        }
      `}</style>
    </>
  );
}

const LIST_COLS = [
  "No.",
  "ID",
  "氏名",
  "フリガナ",
  "生年月日",
  "性別",
  "現在の在留資格",
  "在留許可日",
  "在留期限",
  "国籍",
  "雇用開始年月日",
  "退職年月日",
  "配属先営業所",
  "居住先",
];

// 在留許可日の期間で絞った外国人の一覧表（A4縦・1表にまとめる）
function WorkerListSheet({
  workers,
  orgName,
  from,
  to,
  printDate,
  showId,
}: {
  workers: PrintWorker[];
  orgName: string;
  from: string;
  to: string;
  printDate: string;
  showId: boolean;
}) {
  const fmt = (d: string | null) => (d ? d.replace(/-/g, "/") : "");
  const period = from || to ? `${fmt(from) || "…"} 〜 ${fmt(to) || "…"}` : "全期間";
  const TD = "border border-gray-400 px-1 py-0.5 align-top";
  // ID列は社内用のみ。会社提出用（showId=false）では出さない
  const cols = showId ? LIST_COLS : LIST_COLS.filter((c) => c !== "ID");

  return (
    <div className="list-sheet mx-auto max-w-[297mm] bg-white p-[8mm] text-black">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[10px] leading-tight">
          {/* thead はページをまたぐと各ページ先頭に繰り返し表示される（見出し＋列名を毎ページに） */}
          <thead>
            <tr>
              <th colSpan={cols.length} className="border border-gray-400 p-0">
                <div className="flex items-end justify-between border-b-2 border-black px-1.5 py-1">
                  <div className="text-left">
                    <span className="text-base font-black">外国人 一覧表</span>
                    <span className="ml-2 text-[10px] font-normal">
                      {orgName ? `所属機関: ${orgName}　` : ""}在留許可日: {period}　該当 {workers.length} 名
                    </span>
                  </div>
                  <span className="text-[10px] font-normal text-gray-500">印刷日: {printDate}</span>
                </div>
              </th>
            </tr>
            <tr className="bg-gray-100">
              {cols.map((h) => (
                <th key={h} className="border border-gray-400 px-1 py-0.5 text-left font-bold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workers.map((w, i) => (
              <tr key={w.id}>
                <td className={`${TD} text-right tabular-nums`}>{i + 1}</td>
                {showId && <td className={`${TD} font-bold tabular-nums`}>{w.workerCode}</td>}
                <td className={`${TD} font-bold`}>{w.name}</td>
                <td className={TD}>{w.kana}</td>
                <td className={`${TD} tabular-nums`}>{fmt(w.birth)}</td>
                <td className={`${TD} text-center`}>{w.gender}</td>
                <td className={TD}>{w.residenceStatus}</td>
                <td className={`${TD} tabular-nums`}>{fmt(w.residencePermitDate)}</td>
                <td className={`${TD} tabular-nums`}>{fmt(w.residenceExpiryDate)}</td>
                <td className={TD}>{w.nationality}</td>
                <td className={`${TD} tabular-nums`}>{fmt(w.employmentStartOn)}</td>
                <td className={`${TD} tabular-nums`}>{fmt(w.leavingOn)}</td>
                <td className={TD}>{w.assignedOffice}</td>
                <td className={TD}>{w.residenceNote}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorkerSheet({
  worker,
  orgName,
  printDate,
  forCompany,
}: {
  worker: PrintWorker;
  orgName: string;
  printDate: string;
  forCompany: boolean;
}) {
  const [qr, setQr] = useState("");

  useEffect(() => {
    // 会社提出用は Messenger QR を出さない（描画側でも非表示）
    if (forCompany || !worker.messengerLink) return;
    let cancelled = false;
    QRCode.toDataURL(worker.messengerLink, { margin: 1, width: 240 })
      .then((u) => {
        if (!cancelled) setQr(u);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [worker.messengerLink, forCompany]);

  return (
    <div className="worker-sheet mx-auto mb-6 max-w-[210mm] border border-border bg-white p-[12mm] text-black print:mb-0 print:border-0">
      <div className="mb-4 flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <h2 className="text-2xl font-black">
            {worker.name}
            {!forCompany && worker.workerCode && `（${worker.workerCode}）`}
          </h2>
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

        {/* MessengerリンクQRコード（社内用のみ） */}
        {!forCompany && (
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
        )}
      </div>

      {/* 最新在留カード画像・指定書画像（下半分を目いっぱい使う） */}
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
      <div className="flex h-[125mm] items-center justify-center overflow-hidden border border-gray-400 bg-gray-50">
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
