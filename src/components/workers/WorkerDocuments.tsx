"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, FileText, ImagePlus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { uploadWorkerDoc } from "@/lib/worker-docs";
import { todayStr } from "@/lib/application-alerts";
import { listWorkerDocs, type WorkerDocView } from "@/app/(app)/workers/actions";
import { buildPastPeriods, docPeriodDate, periodKeyFor } from "@/lib/worker-doc-periods";
import type { WorkHistoryRow } from "@/types/db";

type Kind = "在留カード" | "指定書";

// PDFかどうか（imgタグでは表示できないため、埋め込み表示に切り替える）
function isPdfDoc(d: WorkerDocView): boolean {
  return (
    d.mimeType === "application/pdf" ||
    (d.fileName ?? "").toLowerCase().endsWith(".pdf") ||
    (d.url.split("?")[0] ?? "").toLowerCase().endsWith(".pdf")
  );
}

// 在留カード・指定書の差し替え（最新を大きく表示・履歴も保持）。
// 在籍期間（現在／過去の所属機関ごと）のタブで、当時の画像へ表示を切り替えられる
export function WorkerDocuments({
  workerId,
  canEdit,
  histories = [],
}: {
  workerId: string;
  canEdit: boolean;
  histories?: WorkHistoryRow[];
}) {
  const [docs, setDocs] = useState<WorkerDocView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("current");

  const today = todayStr();
  const past = useMemo(() => buildPastPeriods(histories, today), [histories, today]);
  // 継続中の在籍、または退職日が今日以降（まだ期間内）の在籍があるか
  const hasOngoing = useMemo(
    () =>
      histories.some(
        (h) => h.visa !== "本国での職歴" && (h.end_date === null || h.end_date >= today),
      ),
    [histories, today],
  );

  const load = () => {
    listWorkerDocs(workerId).then(setDocs).catch(() => undefined);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  // 表示中の在籍期間の画像だけに絞る（過去タブから登録した画像は effective_on で当時の期間に入る）
  const visibleDocs = useMemo(
    () => docs.filter((d) => periodKeyFor(docPeriodDate(d), past, hasOngoing) === period),
    [docs, past, hasOngoing, period],
  );

  const isCurrent = period === "current";
  // 過去タブを開いているとき、アップロードした画像をその期間に振り分けるための日付（退職日）
  const selectedPast = past.find((p) => p.key === period) ?? null;

  // 「現在」に該当する画像が無くても、登録済みの画像があれば一番新しい時点のものを表示する。
  // （何も登録していないように見えてしまうのを防ぐ。差し替えれば最新になる）
  const newestFor = (kind: Kind) => {
    const list = docs.filter((d) => d.kind === kind);
    if (list.length === 0) return null;
    return [...list].sort((a, b) => (docPeriodDate(a) > docPeriodDate(b) ? -1 : 1))[0];
  };

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-bold text-muted">在留カード・指定書</h2>
      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* 在籍期間の切り替えタブ（過去の在籍がある場合のみ表示） */}
      {past.length > 0 && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          <PeriodChip active={isCurrent} onClick={() => setPeriod("current")}>
            現在
          </PeriodChip>
          {past.map((p) => (
            <PeriodChip
              key={p.key}
              active={period === p.key}
              onClick={() => setPeriod(p.key)}
            >
              過去（{p.org}）{p.start}〜{p.end}
            </PeriodChip>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DocColumn
          kind="在留カード"
          icon={<CreditCard size={14} />}
          docs={visibleDocs.filter((d) => d.kind === "在留カード")}
          fallback={isCurrent ? newestFor("在留カード") : null}
          workerId={workerId}
          canEdit={canEdit}
          effectiveOn={selectedPast?.end ?? null}
          uploadLabel={isCurrent ? "差し替え" : "この期間に登録"}
          emptyLabel={isCurrent ? "未登録" : "この期間の登録はありません"}
          onUploaded={load}
          onError={setError}
        />
        <DocColumn
          kind="指定書"
          icon={<FileText size={14} />}
          docs={visibleDocs.filter((d) => d.kind === "指定書")}
          fallback={isCurrent ? newestFor("指定書") : null}
          workerId={workerId}
          canEdit={canEdit}
          effectiveOn={selectedPast?.end ?? null}
          uploadLabel={isCurrent ? "差し替え" : "この期間に登録"}
          emptyLabel={isCurrent ? "未登録" : "この期間の登録はありません"}
          onUploaded={load}
          onError={setError}
        />
      </div>
      <p className="mt-2 text-[11px] text-muted">
        新しい画像を登録すると「現在」の最新として表示され、以前の画像も履歴として残ります。「現在」では、いま登録されている最新の画像を表示します（在籍期間が今日を含む場合もここに出ます）。過去の在籍期間タブでは、その期間の当時の画像を表示します。過去タブで「この期間に登録」すると、当時の画像としてその期間に保存されます。
      </p>
    </Card>
  );
}

function PeriodChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${
        active
          ? "bg-brand text-brand-foreground"
          : "border border-border text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function DocColumn({
  kind,
  icon,
  docs,
  fallback = null,
  workerId,
  canEdit,
  effectiveOn = null,
  uploadLabel = "差し替え",
  emptyLabel,
  onUploaded,
  onError,
}: {
  kind: Kind;
  icon: React.ReactNode;
  docs: WorkerDocView[];
  // この期間の画像が無いときに代わりに表示する、登録済みで一番新しい画像
  fallback?: WorkerDocView | null;
  workerId: string;
  canEdit: boolean;
  // 過去の在籍期間タブでは、その期間の日付を付けて登録する（当時の画像として振り分けるため）
  effectiveOn?: string | null;
  uploadLabel?: string;
  emptyLabel: string;
  onUploaded: () => void;
  onError: (m: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const usingFallback = docs.length === 0 && !!fallback;
  const latest = docs[0] ?? fallback ?? undefined;
  const history = docs.slice(1);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await uploadWorkerDoc(workerId, kind, file, null, effectiveOn);
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
            {busy ? "登録中…" : <><ImagePlus size={12} /> {uploadLabel}</>}
          </button>
        )}
      </div>
      {/* 画像の枠にファイルを落としてもアップロードできる */}
      <FileDropArea
        onFiles={(files) => void handleFile(files[0])}
        disabled={!canEdit || busy}
        className="overflow-hidden rounded-xl border border-border bg-background"
      >
        {latest ? (
          isPdfDoc(latest) ? (
            // PDFは中身をスクロールして見られる埋め込み表示にする（imgでは表示できない）
            <iframe src={latest.url} title={kind} className="h-72 w-full" />
          ) : (
            <a href={latest.url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={latest.url} alt={kind} className="max-h-56 w-full object-contain" />
            </a>
          )
        ) : (
          <div className="flex h-32 items-center justify-center px-2 text-center text-xs text-muted">
            {canEdit ? `${emptyLabel}（ここにドロップでも登録できます）` : emptyLabel}
          </div>
        )}
      </FileDropArea>
      {latest && isPdfDoc(latest) && (
        <a
          href={latest.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-[11px] font-bold text-brand"
        >
          PDFを別タブで大きく開く
        </a>
      )}
      {latest?.fromApplication && (
        <p className="mt-1 text-[10px] text-muted">申請登録時の画像を表示中（差し替えると最新になります）</p>
      )}
      {usingFallback && !latest?.fromApplication && (
        <p className="mt-1 text-[10px] text-muted">
          {latest ? docPeriodDate(latest) : ""} 時点の画像を表示中（差し替えると最新になります）
        </p>
      )}
      {history.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-[10px] text-muted">履歴（{history.length}件）</p>
          <div className="flex gap-1.5 overflow-x-auto">
            {history.map((d) => (
              <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                {isPdfDoc(d) ? (
                  <span className="flex h-12 w-12 items-center justify-center rounded border border-border text-[10px] font-bold text-muted">
                    PDF
                  </span>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={d.url} alt="履歴" className="h-12 w-12 rounded border border-border object-cover" />
                )}
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
