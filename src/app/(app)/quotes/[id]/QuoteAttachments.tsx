"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { QuoteAttachment } from "@/lib/supabase/queries/quotes";
import {
  createQuoteAttachmentTicket,
  deleteQuoteAttachment,
  getQuoteAttachmentUrls,
  registerQuoteAttachment,
} from "../actions";

const BUCKET = "app-files";

// 見積書の別紙（特定技能総合保険の案内など）。
// ファイル（PDF・画像）は一度登録すれば、どの見積書にもチェックで付けられる。
// 付けた別紙は、印刷するときに見積書の次のページから続けて印刷される
export function QuoteAttachmentsPanel({
  library,
  onLibraryChange,
  selected,
  onSelectedChange,
  canEdit,
}: {
  library: QuoteAttachment[];
  onLibraryChange: (list: QuoteAttachment[]) => void;
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  canEdit: boolean;
}) {
  const [name, setName] = useState("特定技能総合保険のご案内");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggle = (id: string, on: boolean) =>
    onSelectedChange(on ? [...selected.filter((x) => x !== id), id] : selected.filter((x) => x !== id));

  const upload = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
      const ticket = await createQuoteAttachmentTicket(file.name, mime);
      if (!ticket.ok) throw new Error(ticket.message);
      const { error: upErr } = await createClient()
        .storage.from(BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: mime });
      if (upErr) throw new Error(`アップロードに失敗: ${upErr.message}`);
      const reg = await registerQuoteAttachment({ path: ticket.path, name: name.trim() || file.name, fileName: file.name, mimeType: mime });
      if (!reg.ok) throw new Error(reg.message);
      const row: QuoteAttachment = {
        id: reg.id,
        name: name.trim() || file.name,
        storage_path: ticket.path,
        file_name: file.name,
        mime_type: mime,
        created_at: new Date().toISOString(),
      };
      onLibraryChange([...library, row]);
      onSelectedChange([...selected, row.id]);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録できませんでした");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (a: QuoteAttachment) => {
    if (!window.confirm(`別紙「${a.name}」を削除しますか？（ほかの見積書からも外れます）`)) return;
    setBusy(true);
    const res = await deleteQuoteAttachment(a.id);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    onLibraryChange(library.filter((x) => x.id !== a.id));
    onSelectedChange(selected.filter((x) => x !== a.id));
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <Paperclip size={16} />
        別紙（一緒に印刷する資料）
      </h2>
      <p className="mt-1 text-[11px] text-muted">
        特定技能総合保険の案内などのファイル（PDF・画像）を登録しておくと、チェックした別紙が見積書の次のページから続けて印刷されます。登録したファイルはどの見積書にも付けられます。
      </p>
      {library.length === 0 ? (
        <p className="mt-3 text-xs text-muted">登録した別紙はまだありません。</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {library.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5">
              <label className="flex min-h-[36px] flex-1 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={(e) => toggle(a.id, e.target.checked)}
                  disabled={!canEdit}
                  className="h-5 w-5"
                />
                <span className="font-bold">{a.name}</span>
                <span className="text-[11px] text-muted">{a.file_name}</span>
              </label>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(a)}
                  disabled={busy}
                  aria-label={`別紙「${a.name}」を削除`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-seal hover:bg-seal/10"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="別紙の名前（例: 特定技能総合保険のご案内）"
            aria-label="別紙の名前"
            className="min-h-[40px] min-w-[220px] flex-1 rounded-lg border border-border bg-background px-2 text-sm"
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-brand bg-background px-3 text-xs font-bold text-brand disabled:opacity-60"
          >
            <Upload size={14} />
            {busy ? "登録中…" : "ファイルを選んで登録"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs font-bold text-seal">
          {error}
        </p>
      )}
    </section>
  );
}

interface PageImage {
  key: string;
  src: string;
}

// 付けた別紙を、印刷用のページ（A4・1ページずつ）にする。PDF はページごとの画像にする
export function QuoteAttachmentPages({
  attachments,
  onLoadingChange,
}: {
  attachments: QuoteAttachment[];
  onLoadingChange?: (loading: boolean) => void;
}) {
  const [loaded, setLoaded] = useState<{ key: string; pages: PageImage[] }>({ key: "", pages: [] });
  const [error, setError] = useState<string | null>(null);
  const idsKey = attachments.map((a) => a.id).join(",");

  useEffect(() => {
    let cancelled = false;
    const list = attachments;
    if (list.length === 0) {
      onLoadingChange?.(false);
      return;
    }
    onLoadingChange?.(true);
    (async () => {
      const urls = await getQuoteAttachmentUrls(list.map((a) => a.id));
      const out: PageImage[] = [];
      for (const a of list) {
        const url = urls[a.id];
        if (!url) continue;
        if (a.mime_type === "application/pdf" || a.file_name.toLowerCase().endsWith(".pdf")) {
          const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
          const imgs = await pdfToImages(bytes);
          imgs.forEach((src, i) => out.push({ key: `${a.id}-${i}`, src }));
        } else {
          out.push({ key: a.id, src: url });
        }
      }
      if (!cancelled) {
        setError(null);
        setLoaded({ key: idsKey, pages: out });
      }
    })()
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "別紙を読み込めませんでした");
      })
      .finally(() => {
        if (!cancelled) onLoadingChange?.(false);
      });
    return () => {
      cancelled = true;
    };
    // 付ける別紙が変わったときだけ読み直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const pages = attachments.length > 0 && loaded.key === idsKey ? loaded.pages : [];
  if (error && attachments.length > 0) {
    return (
      <p role="alert" className="mx-auto mb-6 max-w-[210mm] text-xs font-bold text-seal print:hidden">
        {error}
      </p>
    );
  }
  return (
    <>
      {pages.map((p) => (
        <div key={p.key} className="quote-attach-page mx-auto mb-6 border border-border bg-white print:mb-0 print:border-0">
          {/* 別紙のページ（帳票内のため next/image は使わない） */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.src} alt="別紙" />
        </div>
      ))}
    </>
  );
}

// PDF をページごとの画像（data URL）にする（pdf.js）
async function pdfToImages(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const out: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("別紙を画像にできませんでした");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    out.push(canvas.toDataURL("image/jpeg", 0.9));
  }
  return out;
}
