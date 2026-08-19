"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, FileText, ShieldCheck, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { uploadWorkerDoc } from "@/lib/worker-docs";
import { dbErrorMessage } from "@/lib/errors";
import { listWorkerDocs, type WorkerDocView } from "@/app/(app)/workers/actions";

type Kind = "雇用保険 離職票" | "雇用保険 被保険者証";

const KINDS: { kind: Kind; title: string; hint: string }[] = [
  {
    kind: "雇用保険 離職票",
    title: "離職票（離職に関する書類）",
    hint: "離職票-1・離職票-2・離職証明書など。退職したときにハローワーク・会社から届く分を登録します。",
  },
  {
    kind: "雇用保険 被保険者証",
    title: "被保険者証（番号に関する書類）",
    hint: "雇用保険被保険者証・資格取得等確認通知書など、被保険者番号がわかる書類を登録します。",
  },
];

// 雇用保険の書類（離職票・被保険者番号がわかる書類）の保管。
// ハローワークや会社から届いたら、その場でPDF・画像を登録しておける。
// 新しく登録すると最新になり、前の分も履歴に残る（転職のたびに離職票が増えるため）。
export function WorkerEmploymentInsurance({
  workerId,
  canEdit = false,
}: {
  workerId: string;
  canEdit?: boolean;
}) {
  const [docs, setDocs] = useState<WorkerDocView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    listWorkerDocs(workerId).then(setDocs).catch(() => undefined);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  // 0085 が未適用だと worker_documents の種別の制約で弾かれるので、実行する
  // マイグレーション名を画面に出す
  const handleError = (err: unknown) =>
    setError(
      dbErrorMessage(err, "0085_employment_insurance_docs.sql", "アップロードに失敗しました"),
    );

  return (
    <section id="employment-insurance">
      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted">
          <ShieldCheck size={14} />
          雇用保険（離職票・被保険者証）
        </h2>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          雇用保険の離職・被保険者番号に関する書類が届いたら、ここにPDF・画像で登録します。
          枠にドラッグ＆ドロップするだけでも登録できます。
          同じ欄に新しく登録すると最新になり、前の分は履歴に残ります。
        </p>
        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {KINDS.map((k) => (
            <InsuranceColumn
              key={k.kind}
              kind={k.kind}
              title={k.title}
              hint={k.hint}
              docs={docs.filter((d) => d.kind === k.kind)}
              workerId={workerId}
              canEdit={canEdit}
              onUploaded={load}
              onError={handleError}
            />
          ))}
        </div>
      </Card>
    </section>
  );
}

function InsuranceColumn({
  kind,
  title,
  hint,
  docs,
  workerId,
  canEdit,
  onUploaded,
  onError,
}: {
  kind: Kind;
  title: string;
  hint: string;
  docs: WorkerDocView[];
  workerId: string;
  canEdit: boolean;
  onUploaded: () => void;
  onError: (err: unknown) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const latest = docs[0];
  const history = docs.slice(1);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await uploadWorkerDoc(workerId, kind, file);
      onUploaded();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  const isImage = (d: WorkerDocView) => (d.mimeType ?? "").startsWith("image/");

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs font-bold text-muted">
          <FileText size={14} />
          {title}
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-brand disabled:opacity-50"
          >
            {busy ? "登録中…" : <><Upload size={12} /> 登録</>}
          </button>
        )}
      </div>
      <p className="mb-1.5 text-[10px] leading-relaxed text-muted">{hint}</p>
      <FileDropArea
        onFiles={(files) => void handleFile(files[0])}
        disabled={!canEdit || busy}
        className="overflow-hidden rounded-xl border border-border bg-background"
      >
        {latest ? (
          isImage(latest) ? (
            <a href={latest.url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={latest.url} alt={title} className="max-h-56 w-full object-contain" />
            </a>
          ) : (
            <div className="flex h-32 flex-col items-center justify-center gap-1 px-2 text-center">
              <FileText size={24} className="text-muted" />
              {/* ダウンロードすると付く名前をそのまま出す（氏名_書類名） */}
              <p className="max-w-full truncate text-xs font-bold">
                {latest.downloadName || latest.fileName || kind}
              </p>
              <p className="text-[10px] text-muted">{latest.createdAt.slice(0, 10)} 登録</p>
            </div>
          )
        ) : (
          <div className="flex h-32 items-center justify-center px-2 text-center text-xs text-muted">
            {canEdit ? "未登録（PDF・画像をここにドロップでも登録できます）" : "未登録"}
          </div>
        )}
      </FileDropArea>
      {latest && (
        <div className="mt-1.5 flex items-center gap-2">
          <a
            href={latest.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-muted"
          >
            <ExternalLink size={12} />
            開く
          </a>
          <a
            href={latest.downloadUrl || latest.url}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-brand"
          >
            <Download size={12} />
            ダウンロード
          </a>
        </div>
      )}
      {history.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-[10px] text-muted">履歴（{history.length}件）</p>
          <div className="flex flex-col gap-0.5">
            {history.map((d) => (
              <a
                key={d.id}
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-[11px] text-muted underline-offset-2 hover:text-brand hover:underline"
              >
                {d.createdAt.slice(0, 10)} — {d.downloadName || d.fileName || kind}
              </a>
            ))}
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
