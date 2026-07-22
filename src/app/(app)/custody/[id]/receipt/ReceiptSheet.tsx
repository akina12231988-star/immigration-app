"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileDown, ImageDown, Printer } from "lucide-react";
import type { CustodyWithWorker } from "@/lib/supabase/queries/custody";
import { CUSTODIAN_INFO, formatStorageNo, receiptTranslation } from "@/lib/custody";

const DOC_WIDTH = 794; // A4幅（px, azk-receipt と同じ）

function fmtJP(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}

// azk-receipt の預かり証様式をそのまま再現した発行・印刷ページ
export function ReceiptSheet({
  record,
  frontUrl,
  backUrl,
}: {
  record: CustodyWithWorker;
  frontUrl: string;
  backUrl: string;
}) {
  const w = record.workers;
  // 発行時のスナップショットを優先し、無ければ外国人マスタの現在値
  const name = record.holder_name || w?.name || "—";
  const nationality = record.holder_nationality || w?.nationality || "";
  const birth = record.holder_birth ?? w?.birth ?? null;
  const cardNo = record.holder_card_no || w?.residence_card_no || "—";
  const status = record.holder_residence_status || w?.residence_status || "—";
  const cardExpire = record.holder_card_expire ?? w?.residence_expiry_date ?? null;
  const agentExpire = record.agent_cert_expire ?? CUSTODIAN_INFO.agentCertExpiry;
  const t = receiptTranslation(nationality);
  const c = CUSTODIAN_INFO;
  const boxno = formatStorageNo(record.storage_no);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // 画面幅に合わせて794px固定の帳票を縮小表示（azk の updateDocScale 相当）
  const updateScale = useCallback(() => {
    const wrapper = wrapperRef.current;
    const doc = docRef.current;
    if (!wrapper || !doc) return;
    const scale = Math.min(1, wrapper.clientWidth / DOC_WIDTH);
    doc.style.transform = `scale(${scale})`;
    wrapper.style.height = `${doc.offsetHeight * scale}px`;
  }, []);

  useEffect(() => {
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [updateScale]);

  const baseFilename = `預かり証_${name.replace(/[\s　]+/g, "")}_No${boxno}`;

  const capture = async () => {
    const doc = docRef.current!;
    const html2canvas = (await import("html2canvas")).default;
    const prevTransform = doc.style.transform;
    doc.style.transform = "none";
    try {
      return await html2canvas(doc, {
        scale: 2,
        width: DOC_WIDTH,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
    } finally {
      doc.style.transform = prevTransform;
      updateScale();
    }
  };

  const download = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const savePdf = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const canvas = await capture();
      const { jsPDF } = await import("jspdf");
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pageWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      let drawW = pageWidth;
      let drawH = imgHeight;
      if (drawH > pageHeight) {
        drawW = pageWidth * (pageHeight / imgHeight);
        drawH = pageHeight;
      }
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      pdf.addImage(imgData, "JPEG", 0, 0, drawW, drawH);
      download(URL.createObjectURL(pdf.output("blob")), `${baseFilename}.pdf`);
      setMessage({ ok: true, text: `${baseFilename}.pdf を保存しました` });
    } catch (err) {
      setMessage({
        ok: false,
        text: `PDFの作成に失敗しました（${err instanceof Error ? err.message.slice(0, 100) : "原因不明"}）。「ブラウザで印刷」をお試しください。`,
      });
    } finally {
      setBusy(false);
    }
  };

  const saveJpeg = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const canvas = await capture();
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.95));
      if (!blob) throw new Error("画像の変換に失敗しました");
      download(URL.createObjectURL(blob), `${baseFilename}.jpg`);
      setMessage({ ok: true, text: `${baseFilename}.jpg を保存しました` });
    } catch (err) {
      setMessage({
        ok: false,
        text: `JPEGの作成に失敗しました（${err instanceof Error ? err.message.slice(0, 100) : "原因不明"}）`,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* 操作バー（印刷時は非表示） */}
      <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
        <Link
          href="/custody"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-bold"
        >
          <ArrowLeft size={16} />
          保管ボックス
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={savePdf}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-brand-foreground disabled:opacity-50"
        >
          <FileDown size={16} />
          {busy ? "作成中…" : "PDFで保存"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={saveJpeg}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a6891] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          <ImageDown size={16} />
          JPEGで保存
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-bold"
        >
          <Printer size={16} />
          ブラウザで印刷
        </button>
      </div>
      {message && (
        <p className={`mb-3 text-sm font-bold print:hidden ${message.ok ? "text-status-reported-fg" : "text-seal"}`}>
          {message.text}
        </p>
      )}

      {/* 帳票（azk-receipt #doc の再現） */}
      <div ref={wrapperRef} className="azk-doc-wrapper">
        <div ref={docRef} className="azk-doc">
          <div className="doc-title-ja">預かり証</div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div className="boxno-badge">{boxno}</div>
            <div className="ref-no">整理番号：{record.ref_no || "—"}</div>
          </div>

          <table className="meta">
            <tbody>
              <tr>
                <td className="k">預かった日</td>
                <td className="v">{fmtJP(record.received_on)}</td>
              </tr>
              <tr>
                <td className="k">有効年月日</td>
                <td className="v">{fmtJP(record.expire_on)}</td>
              </tr>
              <tr>
                <td className="k">申請内容</td>
                <td className="v">{record.content || "—"}</td>
              </tr>
            </tbody>
          </table>

          <div className="section-label">在留カード情報</div>
          <table className="meta meta-2col" style={{ marginBottom: 10 }}>
            <tbody>
              <tr>
                <td className="k">氏名</td>
                <td className="v">{name}</td>
                <td className="k">国籍・地域</td>
                <td className="v">{nationality || "—"}</td>
              </tr>
              <tr>
                <td className="k">生年月日</td>
                <td className="v">{birth ? fmtJP(birth) : "—"}</td>
                <td className="k">在留カード番号</td>
                <td className="v">{cardNo.toUpperCase()}</td>
              </tr>
              <tr>
                <td className="k">在留資格</td>
                <td className="v">{status}</td>
                <td className="k">在留期間（満了日）</td>
                <td className="v">{cardExpire ? fmtJP(cardExpire) : "—"}</td>
              </tr>
            </tbody>
          </table>

          <div className="section-label">預かっている在留カード</div>
          <div className="card-imgs">
            <div className="slot">
              {frontUrl ? (
                // 署名付きURLの画像のため next/image は使わない
                // eslint-disable-next-line @next/next/no-img-element
                <img src={frontUrl} alt="在留カード表面" crossOrigin="anonymous" />
              ) : (
                <span className="empty">表面 未添付</span>
              )}
            </div>
            {backUrl && (
              <div className="slot">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={backUrl} alt="在留カード裏面" crossOrigin="anonymous" />
              </div>
            )}
          </div>

          <p className="legal">
            上記は、在留カードの写しであることを証明します。
            <br />
            本預り証は、当職が貴殿からの上記の受任業務遂行上必要である為、貴殿の{record.items}
            をお預かりしていることを証明するものです。
            <br />
            お預かりしている{record.items}
            等は、所要の手続きが完了次第、本預り証と引き換えに速やかに返却しますので、それまで適切に保管し、常時携帯してください。
          </p>

          {t && (
            <div className="translation-block">
              <div className="translation-title-text">{t.title}</div>
              <p className="translation-legal">{t.legal}</p>
            </div>
          )}

          <div className="section-label">預かり者 ＜届出済登録支援機関の表示＞</div>
          <div className="party-with-stamp">
            <table className="party">
              <tbody>
                <tr>
                  <td className="k">事業所名</td>
                  <td>{c.officeName}</td>
                </tr>
                <tr>
                  <td className="k">登録番号</td>
                  <td>{c.registrationNo}</td>
                </tr>
                <tr>
                  <td className="k">事業所の所在地</td>
                  <td>{c.address}</td>
                </tr>
                <tr>
                  <td className="k">電話番号</td>
                  <td>{c.tel}</td>
                </tr>
                <tr>
                  <td className="k">携帯番号（代表）</td>
                  <td>{c.mobile}</td>
                </tr>
              </tbody>
            </table>
            <div className="stamp-box">
              {/* 角印（帳票内のためnext/imageは使わない） */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/azk-stamp.png" alt={`${c.officeName} 角印`} />
            </div>
          </div>

          <div className="agent-block">
            <div className="agent-title">申請取次者</div>
            {c.agentName}（証明書番号 {c.agentCertNo}／有効期限 {fmtJP(agentExpire)}）
          </div>

          <div className="footer-meta">発行日：{fmtJP(record.created_at.slice(0, 10))}</div>
        </div>
      </div>

      <style jsx global>{`
        .azk-doc-wrapper {
          width: 100%;
          max-width: ${DOC_WIDTH}px;
          margin: 0 auto;
          overflow: hidden;
          background: #fff;
          box-shadow: 0 0 0 1px #e7e3d8, 0 12px 30px rgba(0, 0, 0, 0.08);
        }
        .azk-doc {
          width: ${DOC_WIDTH}px;
          background: #fff;
          padding: 38px 45px;
          box-sizing: border-box;
          transform-origin: top left;
          font-family: "Noto Sans JP", "Hiragino Kaku Gothic ProN", sans-serif;
          color: #161a17;
          font-size: 11.5px;
        }
        .azk-doc .doc-title-ja {
          font-family: "Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: 0.08em;
          margin: 0 0 6px;
          line-height: 1.2;
        }
        .azk-doc .boxno-badge {
          font-size: 18px;
          font-weight: 700;
          color: #a8332a;
          border: 2px solid #a8332a;
          border-radius: 4px;
          padding: 1px 8px;
          letter-spacing: 0.08em;
          font-family: "Shippori Mincho", "Hiragino Mincho ProN", serif;
          text-align: center;
          line-height: 1.4;
        }
        .azk-doc .ref-no {
          font-size: 10px;
          color: #7a756a;
          letter-spacing: 0.04em;
        }
        .azk-doc table.meta {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 10px;
        }
        .azk-doc table.meta td {
          border: 1px solid #b7b0a0;
          padding: 5px 10px;
          font-size: 11.5px;
          vertical-align: middle;
        }
        .azk-doc table.meta td.k {
          width: 30%;
          background: #f4f1ea;
          font-weight: 500;
          color: #4b554f;
        }
        .azk-doc table.meta td.v {
          font-size: 12px;
          font-weight: 500;
        }
        .azk-doc table.meta.meta-2col td.k {
          width: 14%;
        }
        .azk-doc table.meta.meta-2col td.v {
          width: 36%;
        }
        .azk-doc .section-label {
          font-size: 11px;
          font-weight: 700;
          color: #4b554f;
          background: #f4f1ea;
          padding: 4px 8px;
          margin: 0 0 6px;
          border-left: 3px solid #a8332a;
        }
        .azk-doc .card-imgs {
          display: flex;
          gap: 8px;
          margin-bottom: 10px;
          align-items: stretch;
        }
        .azk-doc .card-imgs .slot {
          flex: 1;
          border: 1px solid #b7b0a0;
          overflow: hidden;
          background: #f7f5f0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .azk-doc .card-imgs .slot img {
          width: 100%;
          height: auto;
          object-fit: contain;
          display: block;
        }
        .azk-doc .card-imgs .slot .empty {
          font-size: 10px;
          color: #b0aa9a;
          padding: 12px 0;
        }
        .azk-doc .legal {
          font-size: 11px;
          line-height: 1.75;
          margin: 0 0 8px;
        }
        .azk-doc .translation-block {
          border: 2.5px solid #a8332a;
          border-radius: 6px;
          padding: 12px 14px;
          margin: 0 0 10px;
          background: #fff8f7;
        }
        .azk-doc .translation-title-text {
          font-size: 15px;
          font-weight: 700;
          color: #a8332a;
          margin: 0 0 6px;
          line-height: 1.4;
          letter-spacing: 0.02em;
        }
        .azk-doc .translation-legal {
          font-size: 13px;
          font-weight: 700;
          line-height: 1.7;
          margin: 0;
          color: #1f2421;
        }
        .azk-doc .party-with-stamp {
          display: flex;
          gap: 8px;
          align-items: flex-start;
          margin-bottom: 8px;
        }
        .azk-doc table.party {
          flex: 1;
          width: 100%;
          border-collapse: collapse;
          margin: 0;
        }
        .azk-doc table.party td {
          border: 1px solid #b7b0a0;
          padding: 5px 10px;
          font-size: 11.5px;
        }
        .azk-doc table.party td.k {
          width: 28%;
          background: #f4f1ea;
          color: #4b554f;
          font-weight: 500;
        }
        .azk-doc .stamp-box {
          width: 72px;
          min-width: 72px;
          height: 72px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          align-self: center;
        }
        .azk-doc .stamp-box img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          mix-blend-mode: multiply;
        }
        .azk-doc .agent-block {
          font-size: 11.5px;
          line-height: 1.7;
          border-top: 1px solid #b7b0a0;
          padding-top: 8px;
        }
        .azk-doc .agent-block .agent-title {
          font-weight: 700;
          color: #4b554f;
          margin-bottom: 3px;
        }
        .azk-doc .footer-meta {
          margin-top: 10px;
          text-align: right;
          font-size: 10px;
          color: #7a756a;
        }
        @page {
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          .azk-doc-wrapper {
            max-width: none !important;
            width: 210mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            overflow: visible !important;
            height: auto !important;
          }
          .azk-doc {
            width: 210mm !important;
            transform: none !important;
            padding: 10mm 12mm !important;
          }
        }
      `}</style>
    </>
  );
}
