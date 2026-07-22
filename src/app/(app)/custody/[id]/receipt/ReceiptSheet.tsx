"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import type { CustodyWithWorker } from "@/lib/supabase/queries/custody";
import { CUSTODIAN_INFO, formatStorageNo, receiptTranslation } from "@/lib/custody";

function fmtJP(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}

// azk-receipt の預かり証様式を踏襲した印刷ページ（A4縦）
export function ReceiptSheet({
  record,
  residenceCardUrl,
}: {
  record: CustodyWithWorker;
  residenceCardUrl: string;
}) {
  const w = record.workers!;
  const t = receiptTranslation(w.nationality);
  const c = CUSTODIAN_INFO;

  const th = "w-[9.5em] bg-[#f4f1ea] px-3 py-1.5 text-left text-[11px] font-bold text-[#5b6b66] align-top";
  const td = "px-3 py-1.5 text-[13px]";

  return (
    <>
      {/* 画面用の操作バー（印刷時は消える） */}
      <div className="mb-4 flex items-center gap-2 print:hidden">
        <Link
          href="/custody"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-bold"
        >
          <ArrowLeft size={16} />
          保管ボックスへ
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-foreground"
        >
          <Printer size={18} />
          印刷 / PDF保存
        </button>
      </div>

      <div className="receipt-sheet mx-auto max-w-[210mm] bg-white p-8 text-[#1f2421] shadow-sm print:shadow-none">
        {/* タイトル */}
        <div className="mb-4 border-b-2 border-[#1f2421] pb-3 text-center">
          <h1 className="font-serif text-3xl font-bold tracking-[0.3em]">預かり証</h1>
          {t && <p className="mt-1.5 text-[11px] font-bold leading-snug">{t.title}</p>}
        </div>

        {/* 保管番号バッジ＋整理番号 */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="rounded border-2 border-[#a8332a] px-3 py-0.5 font-serif text-2xl font-bold tracking-[0.1em] text-[#a8332a]">
              {formatStorageNo(record.storage_no)}
            </span>
            <span className="text-[10px] leading-snug text-[#5b6b66]">
              保管番号
              <br />
              （パスポート付箋の番号）
            </span>
          </div>
          <span className="text-[10px] text-[#5b6b66]">整理番号：{record.ref_no || "—"}</span>
        </div>

        {/* 預かり内容 */}
        <table className="mb-4 w-full border-collapse border border-[#cfc9bb] [&_td]:border [&_td]:border-[#e7e3d8] [&_th]:border [&_th]:border-[#e7e3d8]">
          <tbody>
            <tr>
              <th className={th}>預かっている書類</th>
              <td className={`${td} font-bold`}>{record.items}</td>
            </tr>
            <tr>
              <th className={th}>預かった日</th>
              <td className={td}>{fmtJP(record.received_on)}</td>
            </tr>
            <tr>
              <th className={th}>有効年月日</th>
              <td className={td}>{fmtJP(record.expire_on)}</td>
            </tr>
            <tr>
              <th className={th}>申請内容</th>
              <td className={td}>{record.content || "—"}</td>
            </tr>
          </tbody>
        </table>

        {/* 名義人情報 */}
        <p className="mb-1 text-[11px] font-bold tracking-wider text-[#5b6b66]">名義人情報</p>
        <table className="mb-4 w-full border-collapse border border-[#cfc9bb] [&_td]:border [&_td]:border-[#e7e3d8] [&_th]:border [&_th]:border-[#e7e3d8]">
          <tbody>
            <tr>
              <th className={th}>氏名</th>
              <td className={td}>{w.name}</td>
              <th className={th}>国籍・地域</th>
              <td className={td}>{w.nationality || "—"}</td>
            </tr>
            <tr>
              <th className={th}>生年月日</th>
              <td className={td}>{fmtJP(w.birth)}</td>
              <th className={th}>在留カード番号</th>
              <td className={td}>{w.residence_card_no || "—"}</td>
            </tr>
            <tr>
              <th className={th}>在留資格</th>
              <td className={td}>{w.residence_status || "—"}</td>
              <th className={th}>在留期間（満了日）</th>
              <td className={td}>{fmtJP(w.residence_expiry_date)}</td>
            </tr>
            <tr>
              <th className={th}>パスポート番号</th>
              <td className={td}>{w.passport_no || "—"}</td>
              <th className={th}>パスポート有効期限</th>
              <td className={td}>{fmtJP(w.passport_expiry_date)}</td>
            </tr>
          </tbody>
        </table>

        {/* 在留カード画像（登録があれば） */}
        {residenceCardUrl && (
          <>
            <p className="mb-1 text-[11px] font-bold tracking-wider text-[#5b6b66]">預かっている在留カード</p>
            {/* 署名付きURLの外部画像のため next/image ではなく img を使う */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={residenceCardUrl}
              alt="在留カード"
              className="mb-4 max-h-48 rounded border border-[#e7e3d8]"
            />
          </>
        )}

        {/* 本文 */}
        <p className="mb-3 text-[12px] leading-relaxed">
          本預り証は、当職が貴殿からの上記の受任業務遂行上必要である為、貴殿の{record.items}
          をお預かりしていることを証明するものです。
          <br />
          お預かりしている書類は、所要の手続きが完了次第、本預り証と引き換えに速やかに返却しますので、
          それまで本預り証を適切に保管し、常時携帯してください。
        </p>

        {t && (
          <div className="mb-4 rounded border border-[#e6d2cd] bg-[#f3e3df]/50 p-3">
            <p className="text-[12px] font-bold leading-relaxed">{t.title}</p>
            <p className="text-[12px] leading-relaxed">{t.legal}</p>
          </div>
        )}

        {/* 預かり者・申請取次者 */}
        <p className="mb-1 text-[11px] font-bold tracking-wider text-[#5b6b66]">預かり者・申請取次者</p>
        <table className="w-full border-collapse border border-[#cfc9bb] [&_td]:border [&_td]:border-[#e7e3d8] [&_th]:border [&_th]:border-[#e7e3d8]">
          <tbody>
            <tr>
              <th className={th}>事業所名</th>
              <td className={td}>{c.officeName}</td>
            </tr>
            <tr>
              <th className={th}>登録番号</th>
              <td className={td}>{c.registrationNo}</td>
            </tr>
            <tr>
              <th className={th}>所在地</th>
              <td className={td}>{c.address}</td>
            </tr>
            <tr>
              <th className={th}>電話番号</th>
              <td className={td}>
                {c.tel} ／ 携帯（代表） {c.mobile}
              </td>
            </tr>
            <tr>
              <th className={th}>申請取次者</th>
              <td className={td}>
                {c.agentName}（証明書番号 {c.agentCertNo}／有効期限 {fmtJP(c.agentCertExpiry)}）
              </td>
            </tr>
          </tbody>
        </table>

        <p className="mt-4 text-right text-[11px] text-[#5b6b66]">発行日：{fmtJP(record.received_on)}</p>
      </div>

      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
        @media print {
          .receipt-sheet {
            width: 100%;
            max-width: none;
          }
        }
      `}</style>
    </>
  );
}
