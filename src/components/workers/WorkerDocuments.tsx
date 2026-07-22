"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, FileText, ImagePlus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { uploadWorkerDoc } from "@/lib/worker-docs";
import { listWorkerDocs, type WorkerDocView } from "@/app/(app)/workers/actions";
import type { WorkHistoryRow } from "@/types/db";

type Kind = "在留カード" | "指定書";

// 過去の在籍期間（所属機関ごと）。現在の在籍は "current" タブで表す
interface OrgPeriod {
  key: string;
  org: string;
  start: string; // 雇用開始日
  end: string; // 退職日
}

// 職歴から所属機関ごとの在籍期間を組み立てる。
// 本国での職歴は除外し、同じ機関が連続する職歴はひとつの在籍期間にまとめる。
function buildPastPeriods(histories: WorkHistoryRow[]): OrgPeriod[] {
  const rows = [...histories]
    .filter((h) => h.visa !== "本国での職歴")
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));

  const merged: { org: string; start: string; end: string | null }[] = [];
  for (const h of rows) {
    const org = h.org_name || "所属不明";
    const last = merged[merged.length - 1];
    if (last && last.org === org) {
      if (last.end !== null && (h.end_date === null || h.end_date > last.end)) {
        last.end = h.end_date;
      }
    } else {
      merged.push({ org, start: h.start_date, end: h.end_date });
    }
  }

  // 終了日のある期間だけが「過去」タブ。継続中の在籍は「現在」タブに含める
  return merged
    .filter((p): p is { org: string; start: string; end: string } => p.end !== null)
    .sort((a, b) => (a.start > b.start ? -1 : 1))
    .map((p, i) => ({ key: `${p.start}-${i}`, org: p.org, start: p.start, end: p.end }));
}

// 画像の登録日から、どの在籍期間の画像かを判定する。
// 期間内ならその期間、どこにも入らなければ「現在」。
// ただし過去の期間同士の隙間に登録された画像は、日付が近いほうの過去期間に寄せる
function periodKeyFor(createdAt: string, past: OrgPeriod[], hasOngoing: boolean): string {
  const d = createdAt.slice(0, 10);
  for (const p of past) {
    if (p.start <= d && d <= p.end) return p.key;
  }
  if (past.length === 0) return "current";
  const newest = past[0];
  // 最後の退職日より後は「現在」（次の雇用に向けた登録とみなす）
  if (d > newest.end) return "current";
  if (hasOngoing && past.every((p) => d < p.start)) return "current";
  // 過去期間の隙間・最初の期間より前 → 日付が最も近い過去期間へ
  let bestKey = newest.key;
  let bestDist = Infinity;
  for (const p of past) {
    const dist =
      d < p.start
        ? Date.parse(p.start) - Date.parse(d)
        : Date.parse(d) - Date.parse(p.end);
    if (dist < bestDist) {
      bestDist = dist;
      bestKey = p.key;
    }
  }
  return bestKey;
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

  const past = useMemo(() => buildPastPeriods(histories), [histories]);
  const hasOngoing = useMemo(
    () => histories.some((h) => h.visa !== "本国での職歴" && h.end_date === null),
    [histories],
  );

  const load = () => {
    listWorkerDocs(workerId).then(setDocs).catch(() => undefined);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  // 表示中の在籍期間に登録された画像だけに絞る
  const visibleDocs = useMemo(
    () => docs.filter((d) => periodKeyFor(d.createdAt, past, hasOngoing) === period),
    [docs, past, hasOngoing, period],
  );

  const isCurrent = period === "current";

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
          workerId={workerId}
          canEdit={canEdit && isCurrent}
          emptyLabel={isCurrent ? "未登録" : "この期間の登録はありません"}
          onUploaded={load}
          onError={setError}
        />
        <DocColumn
          kind="指定書"
          icon={<FileText size={14} />}
          docs={visibleDocs.filter((d) => d.kind === "指定書")}
          workerId={workerId}
          canEdit={canEdit && isCurrent}
          emptyLabel={isCurrent ? "未登録" : "この期間の登録はありません"}
          onUploaded={load}
          onError={setError}
        />
      </div>
      <p className="mt-2 text-[11px] text-muted">
        新しい画像を登録すると「現在」の最新として表示され、以前の画像も履歴として残ります。過去の在籍期間タブでは、その期間中に登録された当時の画像を表示します。
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
  workerId,
  canEdit,
  emptyLabel,
  onUploaded,
  onError,
}: {
  kind: Kind;
  icon: React.ReactNode;
  docs: WorkerDocView[];
  workerId: string;
  canEdit: boolean;
  emptyLabel: string;
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
          <div className="flex h-32 items-center justify-center text-xs text-muted">
            {emptyLabel}
          </div>
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
