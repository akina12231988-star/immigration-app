"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, FileText, Files } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { Card } from "@/components/ui/Card";
import { saveOrShareFile, fileSaveMessage } from "@/lib/file-save";
import {
  AUDIT_DOCS,
  auditDocsBundleName,
  storedAuditDocs,
  type AuditDoc,
} from "@/lib/audit-docs";

const SOURCE_STYLE: Record<AuditDoc["source"], string> = {
  保管: "bg-brand/10 text-brand",
  作成: "bg-status-notice-bg text-status-notice-fg",
  別で用意: "bg-seal/10 text-seal",
};

// 労働局の訪問指導（当日点検）で出す確認書類。
// アプリに入れてある規程・手数料表はここからそのままダウンロードでき、
// 帳簿はそれを作る画面へ進める
export function AuditDocsClient({ today }: { today: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const stored = storedAuditDocs();

  // 1件をダウンロード（スマホは共有シート）
  const download = async (doc: AuditDoc) => {
    if (!doc.file) return;
    setBusy(String(doc.no));
    setMessage(null);
    try {
      const blob = await (await fetch(doc.file.url)).blob();
      const result = await saveOrShareFile(blob, doc.file.fileName, "application/pdf");
      const text = fileSaveMessage(result, doc.file.fileName);
      if (text) setMessage({ ok: true, text });
    } catch (err) {
      setMessage({
        ok: false,
        text: `${doc.file.fileName} の保存に失敗しました（${err instanceof Error ? err.message.slice(0, 80) : "原因不明"}）`,
      });
    } finally {
      setBusy(null);
    }
  };

  // 保管している書類をまとめて1つのPDFにする（当日そのまま渡せるように）
  const downloadBundle = async () => {
    setBusy("bundle");
    setMessage(null);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const out = await PDFDocument.create();
      for (const doc of stored) {
        const bytes = await (await fetch(doc.file!.url)).arrayBuffer();
        const src = await PDFDocument.load(bytes);
        const pages = await out.copyPages(src, src.getPageIndices());
        for (const p of pages) out.addPage(p);
      }
      const fileName = auditDocsBundleName(today);
      const blob = new Blob([(await out.save()) as BlobPart], { type: "application/pdf" });
      const result = await saveOrShareFile(blob, fileName, "application/pdf");
      const text = fileSaveMessage(result, fileName);
      if (text) setMessage({ ok: true, text });
    } catch (err) {
      setMessage({
        ok: false,
        text: `まとめてのPDF作成に失敗しました（${err instanceof Error ? err.message.slice(0, 80) : "原因不明"}）`,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
        <BackButton fallbackHref="/postings" />
        <h1 className="flex-1 text-lg font-bold">訪問指導の確認書類</h1>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4 lg:px-8">
        <p className="text-xs leading-relaxed text-muted">
          労働局の訪問指導（当日点検）で出す書類の一覧です。訪問通知文の【別紙】確認書類①〜⑨に合わせています。
          規程・手数料表はアプリに入れてあるので、ここからそのままダウンロードできます。
          帳簿はその場で作るので、それぞれの画面へ進んでください。
          <br />
          ※点検した書類は写しを1部持ち帰られます。事前にコピー（印刷）も用意してください。関係書類のコピーは最新分だけで構いません。
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadBundle()}
            disabled={busy !== null}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground disabled:opacity-50"
          >
            <Files size={18} />
            {busy === "bundle" ? "作成中…" : `規程・手数料表をまとめて保存（${stored.length}件・PDF）`}
          </button>
          <span className="text-[11px] text-muted">
            1件ずつ出すときは、下の各行の「ダウンロード」を押してください。
          </span>
        </div>

        {message && (
          <p
            role="status"
            className={`rounded-lg px-3 py-2 text-xs ${
              message.ok ? "bg-brand/10 text-brand" : "bg-seal/10 text-seal"
            }`}
          >
            {message.text}
          </p>
        )}

        <Card className="divide-y divide-border overflow-hidden">
          {AUDIT_DOCS.map((doc) => (
            <div key={doc.no} className="flex flex-wrap items-start gap-x-3 gap-y-2 p-3.5">
              <span className="mt-0.5 w-6 shrink-0 text-sm font-black tabular-nums text-muted">
                {doc.no}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold leading-relaxed">
                  {doc.label}
                  {doc.paidOnly && (
                    <span className="ml-1.5 align-middle text-[10px] font-bold text-muted">
                      （有料職業紹介事業者のみ）
                    </span>
                  )}
                </p>
                {doc.note && (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{doc.note}</p>
                )}
                {doc.file && (
                  <p className="mt-0.5 text-[11px] text-muted">
                    {doc.file.fileName}（{doc.file.pages}ページ）
                  </p>
                )}
              </div>
              <span
                className={`mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${SOURCE_STYLE[doc.source]}`}
              >
                {doc.source}
              </span>
              <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                {doc.file && (
                  <>
                    <button
                      type="button"
                      onClick={() => void download(doc)}
                      disabled={busy !== null}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-brand px-3 text-xs font-bold text-brand disabled:opacity-50"
                    >
                      <Download size={13} />
                      {busy === String(doc.no) ? "保存中…" : "ダウンロード"}
                    </button>
                    <a
                      href={doc.file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-border px-3 text-xs font-bold text-muted"
                    >
                      <FileText size={13} />
                      中身を見る
                    </a>
                  </>
                )}
                {doc.screen && (
                  <Link
                    href={doc.screen.href}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-brand px-3 text-xs font-bold text-brand"
                  >
                    <ExternalLink size={13} />
                    {doc.screen.label}
                  </Link>
                )}
              </span>
            </div>
          ))}
        </Card>

        <p className="text-[11px] leading-relaxed text-muted">
          「保管」の書類を差し替えたいとき（規程を改定したときなど）は、新しいPDFを渡してもらえれば入れ替えます。
        </p>
      </div>
    </>
  );
}
