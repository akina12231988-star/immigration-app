"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { AttachedFileButton } from "@/components/ui/AttachedFileButton";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { listMailingFiles, type MailingFileRow } from "@/lib/supabase/queries/mailing-files";
import {
  createMailingFileTicket,
  deleteMailingFile,
  getMailingFilePreviewUrl,
  registerMailingFile,
  setMailingFileKind,
} from "./actions";
import { baseKindOf, certIdOfKind, certTaggedKind, type TaxCertType } from "@/lib/mailing-attachments";

// 郵送請求の記録へのファイル添付（郵送請求した申請書・転出届・住民票・領収書の画像やPDF・複数可）。
// 追加はドラッグ＆ドロップと、ボタンを押してファイルを選ぶ方法のどちらでもできる。
export function MailingFileAttachments({
  recordId,
  kind,
  addLabel,
  canEdit,
  filterKind,
  filterKinds,
  certTypes,
  certFilter,
  yearChoices,
}: {
  recordId: string;
  kind: string;
  addLabel: string;
  canEdit: boolean;
  // 指定するとその種別の添付だけを表示する（領収書だけを分けて出すときに使う）
  filterKind?: string;
  // 指定するとこれらの種別の添付をまとめて表示する（同じ自治体の2年度を1つの欄にまとめたとき）
  filterKinds?: string[];
  // 届いた証明書が「どの証明書か」を選ばせる（課税・納税証明書の記録）。選んだ証明書を種別名に付けて残す
  certTypes?: TaxCertType[];
  // この証明書の分だけ出す（申請準備の行から。どの証明書か未設定の添付も出す）
  certFilter?: string;
  // 2年度を1つの欄にまとめたとき、添付が「どの年度か」を選ぶ（kind はその年度の種別名）
  yearChoices?: { kind: string; label: string }[];
}) {
  const choosingYear = !!yearChoices && yearChoices.length > 1;
  // これから添付する年度（1つしか無ければそれ）
  const [yearKind, setYearKind] = useState<string | null>(() => (yearChoices?.length === 1 ? yearChoices[0].kind : null));
  const yearLabelOf = (k: string) => yearChoices?.find((y) => y.kind === k)?.label ?? "";
  const [files, setFiles] = useState<MailingFileRow[]>([]);
  // 「どの証明書か」は種別名の後ろに付けているので、欄の突き合わせは付ける前の種別名でする
  const byKind = filterKinds?.length
    ? files.filter((f) => filterKinds.includes(baseKindOf(f.kind)))
    : filterKind
      ? files.filter((f) => baseKindOf(f.kind) === filterKind)
      : files;
  const shown = certFilter
    ? byKind.filter((f) => {
        const id = certIdOfKind(f.kind);
        return !id || id === certFilter;
      })
    : byKind;
  const choosing = !!certTypes && certTypes.length > 0;
  // これから添付する証明書（1つしか無ければそれ）
  const [certId, setCertId] = useState<string | null>(() => (certTypes?.length === 1 ? certTypes[0].id : null));
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    listMailingFiles(createClient(), recordId)
      .then((rows) => {
        if (!cancelled) setFiles(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [recordId]);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    if (choosingYear && !yearKind) {
      setError("先に、どの年度の証明書かを選んでください");
      return;
    }
    if (choosing && !certId) {
      setError("先に、どの証明書の添付かを選んでください（課税証明書・納税証明書）");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        const { blob, mimeType, fileName } = await compressImage(file);
        const ticket = await createMailingFileTicket(recordId, fileName, mimeType);
        if (!ticket.ok) throw new Error(ticket.message);
        const { error: upErr } = await createClient()
          .storage.from("app-files")
          .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
        if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
        const base = choosingYear && yearKind ? yearKind : kind;
        const res = await registerMailingFile(recordId, choosing ? certTaggedKind(base, certId) : base, ticket.path, fileName, mimeType);
        if (!res.ok) throw new Error(res.message);
      }
      setFiles(await listMailingFiles(createClient(), recordId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function preview(id: string) {
    const res = await getMailingFilePreviewUrl(id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  }

  // 添付した証明書が「どの証明書か」を選び直す（前からある、まだ選んでいない添付もここで選べる）
  async function changeCert(f: MailingFileRow, id: string) {
    setError(null);
    const next = certTaggedKind(baseKindOf(f.kind), id || null);
    const res = await setMailingFileKind(f.id, next);
    if (res.ok) setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, kind: next } : x)));
    else setError(res.message);
  }

  // 添付した証明書が「どの年度か」を選び直す（2年度をまとめた欄。どの証明書かはそのまま）
  async function changeYear(f: MailingFileRow, nextYearKind: string) {
    setError(null);
    const next = certTaggedKind(nextYearKind, certIdOfKind(f.kind));
    const res = await setMailingFileKind(f.id, next);
    if (res.ok) setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, kind: next } : x)));
    else setError(res.message);
  }

  async function remove(f: MailingFileRow) {
    if (!window.confirm(`「${f.file_name}」を削除します。よろしいですか？`)) return;
    setError(null);
    const res = await deleteMailingFile(f.id);
    if (res.ok) setFiles((prev) => prev.filter((x) => x.id !== f.id));
    else setError(res.message);
  }

  return (
    <div
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDragOver(false);
        if (!busy) void handleFiles(e.dataTransfer.files);
      }}
      className={`flex flex-col gap-1.5 rounded-xl p-1 ${dragOver ? "bg-brand/10 ring-2 ring-brand" : ""}`}
    >
      {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
      {shown.length === 0 && !canEdit && <p className="text-[11px] text-muted">添付はありません</p>}
      {shown.map((f) => (
        <div key={f.id} className="flex flex-wrap items-center gap-1.5">
          <AttachedFileButton fileName={f.file_name} onOpen={() => preview(f.id)} className="min-w-0 flex-1" />
          {/* 2年度をまとめた欄では、どの年度の証明書かも出す（選び直せる） */}
          {choosingYear &&
            (canEdit ? (
              <select
                value={yearChoices!.some((y) => y.kind === baseKindOf(f.kind)) ? baseKindOf(f.kind) : ""}
                onChange={(e) => e.target.value && void changeYear(f, e.target.value)}
                aria-label={`${f.file_name}はどの年度の証明書か`}
                className="min-h-[28px] rounded-lg border border-brand px-1.5 text-[11px] font-bold text-brand"
              >
                {!yearChoices!.some((y) => y.kind === baseKindOf(f.kind)) && <option value="">どの年度か未選択</option>}
                {yearChoices!.map((y) => (
                  <option key={y.kind} value={y.kind}>
                    {y.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="rounded-lg bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                {yearLabelOf(baseKindOf(f.kind)) || "どの年度か未選択"}
              </span>
            ))}
          {choosing &&
            (canEdit ? (
              <select
                value={certIdOfKind(f.kind) ?? ""}
                onChange={(e) => void changeCert(f, e.target.value)}
                aria-label={`${f.file_name}はどの証明書か`}
                className={`min-h-[28px] rounded-lg border px-1.5 text-[11px] font-bold ${
                  certIdOfKind(f.kind) ? "border-brand text-brand" : "border-amber-400 text-amber-700"
                }`}
              >
                <option value="">どの証明書か未選択</option>
                {certTypes!.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className={`rounded-lg px-1.5 py-0.5 text-[10px] font-bold ${certIdOfKind(f.kind) ? "bg-brand/10 text-brand" : "bg-amber-50 text-amber-700"}`}>
                {certTypes!.find((c) => c.id === certIdOfKind(f.kind))?.label ?? "どの証明書か未選択"}
              </span>
            ))}
          {canEdit && (
            <button
              type="button"
              onClick={() => remove(f)}
              aria-label="削除"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-seal"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <>
          {/* 2年度をまとめた欄は、どの年度の証明書かを先に選ぶ */}
          {choosingYear && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] font-bold text-muted">どの年度？</span>
              {yearChoices!.map((y) => (
                <button
                  key={y.kind}
                  type="button"
                  onClick={() => {
                    setYearKind(y.kind);
                    setError(null);
                  }}
                  aria-pressed={yearKind === y.kind}
                  className={`min-h-[28px] rounded-lg border px-2 text-[11px] font-bold ${
                    yearKind === y.kind ? "border-brand bg-brand text-brand-foreground" : "border-border bg-background text-muted"
                  }`}
                >
                  {y.label}
                </button>
              ))}
            </div>
          )}
          {/* 課税・納税証明書は、どの証明書の添付かを先に選ぶ（申請準備でその行にだけ出すため） */}
          {choosing && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] font-bold text-muted">どの証明書？</span>
              {certTypes!.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCertId(c.id);
                    setError(null);
                  }}
                  aria-pressed={certId === c.id}
                  className={`min-h-[28px] rounded-lg border px-2 text-[11px] font-bold ${
                    certId === c.id ? "border-brand bg-brand text-brand-foreground" : "border-border bg-background text-muted"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (choosingYear && !yearKind) {
                setError("先に、どの年度の証明書かを選んでください");
                return;
              }
              if (choosing && !certId) {
                setError("先に、どの証明書の添付かを選んでください（課税証明書・納税証明書）");
                return;
              }
              inputRef.current?.click();
            }}
            disabled={busy}
            className="flex items-center gap-1.5 self-start rounded-lg border border-dashed border-brand px-3 py-2 text-xs font-bold text-brand disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {busy
              ? "アップロード中…"
              : choosing && certId
                ? `${choosingYear && yearKind ? `${yearLabelOf(yearKind)}の` : ""}${certTypes!.find((c) => c.id === certId)?.label ?? ""}として${addLabel}`
                : addLabel}
          </button>
          <p className="text-[11px] text-muted">
            {dragOver
              ? "ここで離すと添付します"
              : "画像・PDFをこの枠にドラッグ＆ドロップしても添付できます。"}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}
