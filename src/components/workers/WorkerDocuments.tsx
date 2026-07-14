"use client";

import { useEffect, useRef, useState } from "react";
import { CreditCard, FileText, ImagePlus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { uploadWorkerDoc } from "@/lib/worker-docs";
import { listWorkerDocs, type WorkerDocView } from "@/app/(app)/workers/actions";

type Kind = "在留カード" | "指定書";

// 在留カード・指定書の差し替え（最新を大きく表示・履歴も保持）
export function WorkerDocuments({ workerId, canEdit }: { workerId: string; canEdit: boolean }) {
  const [docs, setDocs] = useState<WorkerDocView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    listWorkerDocs(workerId).then(setDocs).catch(() => undefined);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-bold text-muted">在留カード・指定書</h2>
      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DocColumn
          kind="在留カード"
          icon={<CreditCard size={14} />}
          docs={docs.filter((d) => d.kind === "在留カード")}
          workerId={workerId}
          canEdit={canEdit}
          onUploaded={load}
          onError={setError}
        />
        <DocColumn
          kind="指定書"
          icon={<FileText size={14} />}
          docs={docs.filter((d) => d.kind === "指定書")}
          workerId={workerId}
          canEdit={canEdit}
          onUploaded={load}
          onError={setError}
        />
      </div>
      <p className="mt-2 text-[11px] text-muted">
        新しい画像を登録すると最新として表示され、以前の画像も履歴として残ります。
      </p>
    </Card>
  );
}

function DocColumn({
  kind,
  icon,
  docs,
  workerId,
  canEdit,
  onUploaded,
  onError,
}: {
  kind: Kind;
  icon: React.ReactNode;
  docs: WorkerDocView[];
  workerId: string;
  canEdit: boolean;
  onUploaded: () => void;
  onError: (m: string) => void;
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
      onError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs font-bold text-muted">
          {icon}
          {kind}
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-brand disabled:opacity-50"
          >
            {busy ? "登録中…" : <><ImagePlus size={12} /> 差し替え</>}
          </button>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        {latest ? (
          <a href={latest.url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={latest.url} alt={kind} className="max-h-56 w-full object-contain" />
          </a>
        ) : (
          <div className="flex h-32 items-center justify-center text-xs text-muted">未登録</div>
        )}
      </div>
      {latest?.fromApplication && (
        <p className="mt-1 text-[10px] text-muted">申請登録時の画像を表示中（差し替えると最新になります）</p>
      )}
      {history.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-[10px] text-muted">履歴（{history.length}件）</p>
          <div className="flex gap-1.5 overflow-x-auto">
            {history.map((d) => (
              <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.url} alt="履歴" className="h-12 w-12 rounded border border-border object-cover" />
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
