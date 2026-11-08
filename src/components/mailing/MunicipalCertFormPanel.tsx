"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, FileText, MapPinned, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createMunicipalFormTicket,
  registerMunicipalFormPdf,
  removeMunicipalFormPdf,
} from "@/app/(app)/mailing/municipal-form-actions";
import { MUNICIPAL_FORM_DOCS, normalizeMunicipalFormLayout, type MunicipalFormDoc } from "@/lib/municipal-form";
import type { Municipality } from "@/lib/tax-cert";
import { MunicipalFormLayoutEditor } from "./MunicipalFormLayoutEditor";

// 自治体の追加のときに選んでおく申請書・委任状のPDF
export type MunicipalFormFiles = Partial<Record<MunicipalFormDoc, File | null>>;

// 追加した自治体に、選んでおいたPDFをアップロードする。失敗したものはメッセージにまとめて返す
export async function uploadMunicipalFormFiles(
  municipality: Municipality,
  files: MunicipalFormFiles,
): Promise<{ municipality: Municipality; uploaded: number; errors: string[] }> {
  let m = municipality;
  let uploaded = 0;
  const errors: string[] = [];
  for (const doc of ["cert", "proxy"] as const) {
    const f = files[doc];
    if (!f) continue;
    try {
      m = await uploadMunicipalFormPdf(m, doc, f);
      uploaded += 1;
    } catch (err) {
      errors.push(`${MUNICIPAL_FORM_DOCS[doc].label}: ${err instanceof Error ? err.message : "アップロードに失敗しました"}`);
    }
  }
  return { municipality: m, uploaded, errors };
}

// 申請書・委任状のPDFを自治体マスタにアップロードする（自治体の追加のあとにも使う）。
// 保存した列（保存先・ファイル名）を返す
export async function uploadMunicipalFormPdf(
  municipality: Municipality,
  doc: MunicipalFormDoc,
  file: File,
): Promise<Municipality> {
  if (file.type !== "application/pdf") throw new Error("PDFを選んでください");
  const cols = MUNICIPAL_FORM_DOCS[doc];
  const ticket = await createMunicipalFormTicket(municipality.id, file.type, doc);
  if (!ticket.ok) throw new Error(ticket.message);
  const { error: upErr } = await createClient()
    .storage.from("app-files")
    .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
  if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
  const res = await registerMunicipalFormPdf(municipality.id, ticket.path, file.name, doc);
  if (!res.ok) throw new Error(res.message);
  return { ...municipality, [cols.pathCol]: ticket.path, [cols.nameCol]: file.name };
}

// 自治体の課税・納税証明書の申請書PDF（自治体マスタ）。
// PDFをアップロードして「記入位置」を一度置いておくと、外国人を選んだときに
// 氏名・フリガナ・生年月日・住所などを書き込んだ申請書をダウンロードできる。
// workerId・fiscalYear を渡すとその人・その年度の申請書のダウンロードボタンを出す
export function MunicipalCertFormPanel({
  municipality,
  doc = "cert",
  canEdit,
  workerId,
  fiscalYear,
  onChanged,
}: {
  municipality: Municipality | null;
  doc?: MunicipalFormDoc; // 申請書（cert）か委任状（proxy）か
  canEdit: boolean;
  workerId?: string;
  fiscalYear?: number;
  onChanged?: (m: Municipality) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!municipality) return null;
  const m = municipality;
  const cols = MUNICIPAL_FORM_DOCS[doc];
  const label = cols.label;
  const pdfPath = (m[cols.pathCol] ?? "").trim();
  const pdfName = m[cols.nameCol] ?? "";
  const hasPdf = !!pdfPath;
  const layoutCount = normalizeMunicipalFormLayout(m[cols.layoutCol]).length;
  const base = `/api/municipal-cert-form?municipalityId=${encodeURIComponent(m.id)}&doc=${doc}`;
  const personHref = workerId
    ? `${base}&workerId=${encodeURIComponent(workerId)}${fiscalYear ? `&fiscalYear=${fiscalYear}` : ""}`
    : "";

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      onChanged?.(await uploadMunicipalFormPdf(m, doc, file));
      // はじめてのPDFなら、そのまま記入位置の画面を開く
      if (layoutCount === 0) setEditing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove() {
    if (!window.confirm(`${m.name} の${label}PDFと記入位置を外します。よろしいですか？`)) return;
    setBusy(true);
    setError(null);
    const res = await removeMunicipalFormPdf(m.id, doc);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    onChanged?.({ ...m, [cols.pathCol]: "", [cols.nameCol]: "", [cols.layoutCol]: [] });
  }

  const btn = "inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-bold";

  // PDFをこの欄にドラッグ＆ドロップしても登録・差し替えできる
  const dropProps = canEdit
    ? {
        onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
          if (busy) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          if (!dragging) setDragging(true);
        },
        onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        },
        onDrop: (e: React.DragEvent<HTMLDivElement>) => {
          if (busy) return;
          e.preventDefault();
          setDragging(false);
          const f = Array.from(e.dataTransfer.files).find((x) => x.type === "application/pdf");
          if (f) void upload(f);
          else setError(`${label}はPDFをドロップしてください`);
        },
      }
    : {};

  return (
    <div
      className={`mt-1.5 flex flex-col gap-1 rounded-lg border-2 border-dashed p-1.5 transition-colors ${
        dragging ? "border-brand bg-brand/5" : "border-transparent"
      }`}
      {...dropProps}
    >
      {dragging && <p className="text-center text-xs font-bold text-brand">ここに離すと{label}PDFを{hasPdf ? "差し替えます" : "登録します"}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      {hasPdf ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {personHref && layoutCount > 0 && (
              <>
                <a href={`${personHref}&download=1`} className={`${btn} bg-brand text-brand-foreground`}>
                  <Download size={14} />
                  {label}（自動入力）をダウンロード
                </a>
                <a href={personHref} target="_blank" rel="noopener noreferrer" className={`${btn} border border-brand text-brand`}>
                  <FileText size={14} />
                  開いて確認・印刷
                </a>
              </>
            )}
            {canEdit && (
              <button type="button" onClick={() => setEditing(true)} disabled={busy} className={`${btn} border border-border`}>
                <MapPinned size={14} />
                記入位置{layoutCount > 0 ? `を直す（${layoutCount}項目）` : "を置く"}
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted">
            {label}PDF: {pdfName || "登録済み"}
            {layoutCount === 0 && (
              <span className="ml-1 font-bold text-seal">記入位置がまだ無いため自動入力できません（「記入位置を置く」で置いてください）</span>
            )}
            {canEdit && (
              <>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="ml-2 font-bold text-brand underline">
                  PDFを差し替える
                </button>
                <button type="button" onClick={() => void remove()} disabled={busy} className="ml-2 font-bold text-seal underline">
                  外す
                </button>
              </>
            )}
          </p>
        </>
      ) : (
        canEdit && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={`${btn} border border-dashed border-brand text-brand`}>
              <Upload size={14} />
              {busy ? "アップロード中…" : `${label}PDFを登録（自動入力用）`}
            </button>
            <span className="text-[11px] text-muted">
              PDFをここにドラッグ＆ドロップしても登録できます。登録して記入位置を置くと、氏名・住所などを入れた{label}を作れます
            </span>
          </div>
        )
      )}
      {error && <p className="text-[11px] text-seal">{error}</p>}
      {/* 編集中の自治体の画面（モーダル）の中から開いても全画面になるよう、body 直下に出す */}
      {editing &&
        createPortal(
        <MunicipalFormLayoutEditor
          municipalityId={m.id}
          municipalityName={m.name}
          doc={doc}
          initialLayout={m[cols.layoutCol]}
          onClose={() => setEditing(false)}
          onSaved={(layout) => onChanged?.({ ...m, [cols.layoutCol]: layout })}
        />,
          document.body,
        )}
    </div>
  );
}
