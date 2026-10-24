"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarPlus,
  CreditCard,
  FileText,
  ImagePlus,
  Pencil,
  Plus,
  ScanSearch,
  Trash2,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { uploadWorkerDoc } from "@/lib/worker-docs";
import { todayStr } from "@/lib/application-alerts";
import {
  deleteWorkerDoc,
  deleteWorkerDocPeriod,
  listWorkerDocPeriods,
  listWorkerDocs,
  saveWorkerDocPeriod,
  type WorkerDocView,
} from "@/app/(app)/workers/actions";
import {
  buildPastPeriods,
  docPeriodDate,
  manualPeriodKey,
  manualPeriodLabel,
  orderPeriodTabs,
  periodKeyForDoc,
  sortDocsByPeriodDate,
  type ManualPeriod,
} from "@/lib/worker-doc-periods";
import type { WorkHistoryRow } from "@/types/db";

type Kind = "在留カード" | "照合結果" | "指定書";

// 書類タブでの見出し（照合結果は正式な名前で出す）
const KIND_LABELS: Record<Kind, string> = {
  在留カード: "在留カード",
  照合結果: "在留カード等読取アプリケーションで照合結果",
  指定書: "指定書",
};

// PDFかどうか（imgタグでは表示できないため、埋め込み表示に切り替える）
function isPdfDoc(d: WorkerDocView): boolean {
  return (
    d.mimeType === "application/pdf" ||
    (d.fileName ?? "").toLowerCase().endsWith(".pdf") ||
    (d.url.split("?")[0] ?? "").toLowerCase().endsWith(".pdf")
  );
}

// 在留カード・照合結果・指定書の差し替え（最新を大きく表示・履歴も保持）。
// 在籍期間（現在／過去の所属機関ごと）のタブで、当時の画像へ表示を切り替えられる。
// 在籍期間のタブにない期間（前の会社を辞めたあとの在留カードなど）は「期間を追加」で自分で足せる
export function WorkerDocuments({
  workerId,
  canEdit,
  histories = [],
  periodNote = "",
}: {
  workerId: string;
  canEdit: boolean;
  histories?: WorkHistoryRow[];
  periodNote?: string; // 在留期間の注意事項（申請の許可情報の最新。画像の下に薄い赤で出す）
}) {
  const [docs, setDocs] = useState<WorkerDocView[]>([]);
  const [manual, setManual] = useState<ManualPeriod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [period, setPeriod] = useState("current");
  // 期間の追加・編集フォーム（null＝閉じている。id があれば編集）
  const [periodForm, setPeriodForm] = useState<{
    id: string | null;
    label: string;
    startOn: string;
    endOn: string;
  } | null>(null);
  const [savingPeriod, setSavingPeriod] = useState(false);

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
  const loadPeriods = () =>
    listWorkerDocPeriods(workerId)
      .then((rows) => setManual(rows))
      .catch(() => undefined);

  // 間違えて登録した画像の削除（保存したファイルの実体も消える）
  const removeDoc = async (doc: WorkerDocView) => {
    if (
      !window.confirm(
        `「${doc.kind}」の登録データ（${doc.downloadName || doc.fileName || ""}）を削除します。元に戻せません。よろしいですか？`,
      )
    ) {
      return;
    }
    setError(null);
    const res = await deleteWorkerDoc(doc.id);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    load();
  };
  useEffect(() => {
    load();
    void loadPeriods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  // 表示中の期間の画像だけに絞る（追加した期間は period_id、過去タブから登録した画像は effective_on で振り分ける）。
  // 「いつ時点の書類か」の新しい順に並べる
  const visibleDocs = useMemo(
    () => sortDocsByPeriodDate(docs.filter((d) => periodKeyForDoc(d, past, hasOngoing) === period)),
    [docs, past, hasOngoing, period],
  );

  const isCurrent = period === "current";
  // 過去タブを開いているとき、アップロードした画像をその期間に振り分けるための日付（退職日）
  const selectedPast = past.find((p) => p.key === period) ?? null;
  // 追加した期間のタブを開いているとき（画像は期間IDで結び付ける。日付は期間の開始日）
  const selectedManual = manual.find((m) => manualPeriodKey(m.id) === period) ?? null;
  const effectiveOn = selectedManual ? selectedManual.startOn : (selectedPast?.end ?? null);
  const periodId = selectedManual?.id ?? null;
  const uploadLabel = isCurrent ? "差し替え" : "この期間に登録";
  const emptyLabel = isCurrent ? "未登録" : "この期間の登録はありません";

  // 「現在」に該当する画像が無くても、登録済みの画像があれば一番新しいものを代わりに表示する。
  // （何も登録していないように見えてしまうのを防ぐ。差し替えれば最新になる）
  // ただし過去タブ・追加した期間から登録した画像（effective_on・period_id あり）は当時の画像なので、
  // 「現在」には出さない（現在と過去に同じものが表示されてしまうため）
  const newestFor = (kind: Kind) =>
    docs.find((d) => d.kind === kind && !d.effectiveOn && !d.periodId) ?? null;

  // 期間の追加・編集の保存
  const savePeriod = async () => {
    if (!periodForm) return;
    if (!periodForm.startOn) {
      setError("期間の開始日を入れてください");
      return;
    }
    setSavingPeriod(true);
    setError(null);
    try {
      const res = await saveWorkerDocPeriod(workerId, {
        id: periodForm.id,
        label: periodForm.label,
        startOn: periodForm.startOn,
        endOn: periodForm.endOn || null,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      await loadPeriods();
      setPeriodForm(null);
      setPeriod(manualPeriodKey(res.id));
      const label = manualPeriodLabel({
        id: res.id,
        label: periodForm.label,
        startOn: periodForm.startOn,
        endOn: periodForm.endOn || null,
      });
      setInfo(
        periodForm.id
          ? `期間「${label}」を保存しました。`
          : `期間「${label}」を追加しました。このタブで在留カード・照合結果・指定書を「この期間に登録」で登録してください。`,
      );
    } finally {
      setSavingPeriod(false);
    }
  };

  // 追加した期間の削除（画像は消えず、日付で元の在籍期間または「現在」に振り分けられる）
  const removePeriod = async (m: ManualPeriod) => {
    const count = docs.filter((d) => d.periodId === m.id).length;
    if (
      !window.confirm(
        `期間「${manualPeriodLabel(m)}」を削除します。` +
          (count > 0
            ? `この期間に登録した画像（${count}件）は削除されず、日付で元の在籍期間または「現在」に振り分けられます。`
            : "") +
          "よろしいですか？",
      )
    ) {
      return;
    }
    setError(null);
    const res = await deleteWorkerDocPeriod(m.id);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setPeriod("current");
    setInfo(`期間「${manualPeriodLabel(m)}」を削除しました。`);
    await loadPeriods();
    load();
  };

  // タブの並び: 「現在」の右に、過去の在籍期間と追加した期間を開始日の新しい順（左が新しい）で自動で並べる
  const tabs = useMemo(() => orderPeriodTabs(past, manual), [past, manual]);
  const showTabs = tabs.length > 0 || canEdit;

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-bold text-muted">在留カード・指定書</h2>
      <p className="-mt-2 mb-3 text-[11px] text-muted">
        在留カード・在留カード等読取アプリケーションで照合結果・指定書の順に出します。申請詳細の許可情報で登録した画像が自動で入り、無ければここにドロップして保存できます。
      </p>
      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}
      {info && (
        <p role="status" className="mb-3 rounded-lg bg-brand/10 px-3 py-2 text-xs font-bold text-brand">
          {info}
        </p>
      )}

      {/* 期間の切り替えタブ（現在／過去の在籍期間／自分で追加した期間）と「期間を追加」 */}
      {showTabs && (
        <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1">
          <PeriodChip active={isCurrent} onClick={() => setPeriod("current")}>
            現在
          </PeriodChip>
          {tabs.map((t) => (
            <PeriodChip key={t.key} active={period === t.key} onClick={() => setPeriod(t.key)}>
              {t.manual && <CalendarPlus size={12} className="mr-1 inline" />}
              {t.label}
            </PeriodChip>
          ))}
          {canEdit && !periodForm && (
            <button
              type="button"
              onClick={() => setPeriodForm({ id: null, label: "", startOn: "", endOn: "" })}
              className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-brand/60 px-3 py-1.5 text-xs font-bold text-brand"
              title="在籍期間のタブにない期間（前の会社を辞めたあとの在留カードなど）を足す"
            >
              <Plus size={12} /> 期間を追加
            </button>
          )}
        </div>
      )}

      {/* 期間の追加・編集フォーム */}
      {canEdit && periodForm && (
        <div className="mb-3 rounded-xl border border-brand/40 bg-brand/5 px-3 py-2">
          <p className="mb-1.5 text-xs font-bold text-brand">
            {periodForm.id ? "期間を編集" : "新しい期間を追加"}
          </p>
          <div className="flex flex-wrap items-end gap-2 text-[11px] font-bold text-muted">
            <label className="flex flex-col gap-0.5">
              名前（任意。所属機関名や「在留カード更新前」など）
              <input
                type="text"
                value={periodForm.label}
                onChange={(e) => setPeriodForm({ ...periodForm, label: e.target.value })}
                placeholder="例: 有限会社○○"
                className="min-h-[32px] w-56 rounded-lg border border-border bg-surface px-2 text-xs text-foreground focus:border-brand focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              開始日（在留カードの交付日など）
              <input
                type="date"
                value={periodForm.startOn}
                onChange={(e) => setPeriodForm({ ...periodForm, startOn: e.target.value })}
                className="min-h-[32px] rounded-lg border border-border bg-surface px-1.5 text-xs text-foreground focus:border-brand focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              終了日（未定なら空のまま）
              <input
                type="date"
                value={periodForm.endOn}
                onChange={(e) => setPeriodForm({ ...periodForm, endOn: e.target.value })}
                className="min-h-[32px] rounded-lg border border-border bg-surface px-1.5 text-xs text-foreground focus:border-brand focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void savePeriod()}
              disabled={savingPeriod}
              className="min-h-[32px] rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-50"
            >
              {savingPeriod ? "保存中…" : periodForm.id ? "保存" : "追加"}
            </button>
            <button
              type="button"
              onClick={() => setPeriodForm(null)}
              className="min-h-[32px] rounded-lg border border-border px-3 text-xs font-bold text-muted"
            >
              やめる
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            追加するとタブが増えます。そのタブを開いて「この期間に登録」で在留カード・照合結果・指定書を登録すると、その期間の画像として保存されます（「現在」の画像は変わりません）。
          </p>
        </div>
      )}

      {/* 追加した期間のタブを開いているとき: 期間の編集・削除 */}
      {selectedManual && canEdit && !periodForm && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span>
            追加した期間「{manualPeriodLabel(selectedManual)}」を表示中。ここで登録した画像はこの期間に入ります。
          </span>
          <button
            type="button"
            onClick={() =>
              setPeriodForm({
                id: selectedManual.id,
                label: selectedManual.label,
                startOn: selectedManual.startOn,
                endOn: selectedManual.endOn ?? "",
              })
            }
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 font-bold text-brand"
          >
            <Pencil size={11} /> 期間を編集
          </button>
          <button
            type="button"
            onClick={() => void removePeriod(selectedManual)}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 font-bold text-seal"
          >
            <Trash2 size={11} /> 期間を削除
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DocColumn
          kind="在留カード"
          icon={<CreditCard size={14} />}
          docs={visibleDocs.filter((d) => d.kind === "在留カード")}
          fallback={isCurrent ? newestFor("在留カード") : null}
          workerId={workerId}
          canEdit={canEdit}
          onDelete={removeDoc}
          effectiveOn={effectiveOn}
          periodId={periodId}
          uploadLabel={uploadLabel}
          emptyLabel={emptyLabel}
          onUploaded={load}
          onError={setError}
        />
        <DocColumn
          kind="照合結果"
          icon={<ScanSearch size={14} />}
          docs={visibleDocs.filter((d) => d.kind === "照合結果")}
          fallback={isCurrent ? newestFor("照合結果") : null}
          workerId={workerId}
          canEdit={canEdit}
          onDelete={removeDoc}
          effectiveOn={effectiveOn}
          periodId={periodId}
          uploadLabel={uploadLabel}
          emptyLabel={emptyLabel}
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
          onDelete={removeDoc}
          effectiveOn={effectiveOn}
          periodId={periodId}
          uploadLabel={uploadLabel}
          emptyLabel={emptyLabel}
          onUploaded={load}
          onError={setError}
        />
      </div>
      {/* 在留期間の注意事項（申請詳細の許可情報で入れた最新の文） */}
      {periodNote.trim() && (
        <div className="mt-3 rounded-xl bg-seal/10 px-3 py-2">
          <p className="text-[10px] font-bold text-seal">在留期間の注意事項（申請の許可情報の最新）</p>
          <p className="whitespace-pre-wrap text-xs font-bold text-seal">{periodNote}</p>
        </div>
      )}
      <div className="mt-2 space-y-1 text-[11px] text-muted">
        <p>
          新しい画像を登録すると「現在」の最新として表示され、以前の画像も履歴として残ります。「現在」では、いま登録されている最新の画像を表示します（在籍期間が今日を含む場合もここに出ます）。過去の在籍期間タブでは、その期間の当時の画像を表示します。過去タブで「この期間に登録」すると、当時の画像としてその期間に保存されます。
        </p>
        <p>
          <span className="font-bold">タブにない期間の在留カード・指定書を新しく登録するとき</span>
          （例: 過去の在籍が 2025-11-11 で終わり、そのあとの在留カード 2025-11-11〜2026-11-11 があって、次が「現在」の場合）:
          タブの右の「期間を追加」を押し、名前（任意）・開始日（例: 2025-11-11）・終了日（例: 2026-11-11）を入れて「追加」すると、その期間のタブが増えます。
          増えたタブを開き、在留カード・照合結果・指定書それぞれの「この期間に登録」（枠へのドロップも同じ）で画像を登録してください。登録した画像はその期間のタブにだけ出て、「現在」や過去の在籍期間の画像は変わりません。
          期間の名前や日付は、そのタブを開いて「期間を編集」で直せます。「期間を削除」しても登録した画像は消えず、日付で元の在籍期間または「現在」に振り分けられます。
        </p>
      </div>
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
  onDelete,
  effectiveOn = null,
  periodId = null,
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
  onDelete: (doc: WorkerDocView) => void | Promise<void>;
  // 過去の在籍期間タブでは、その期間の日付を付けて登録する（当時の画像として振り分けるため）
  effectiveOn?: string | null;
  // 自分で追加した期間のタブでは、その期間のIDを付けて登録する（期間IDで振り分けるため）
  periodId?: string | null;
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
      await uploadWorkerDoc(workerId, kind, file, null, effectiveOn, periodId);
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
          {KIND_LABELS[kind]}
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
      {/* 間違えて登録したときの削除（申請登録時の画像はここでは消せない） */}
      {latest && canEdit && !latest.fromApplication && (
        <button
          type="button"
          onClick={() => void onDelete(latest)}
          className="mt-1 flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-seal"
        >
          <Trash2 size={12} />
          削除
        </button>
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
          <p className="mb-1 text-[10px] text-muted">
            履歴（{history.length}件）
            {canEdit && <span className="ml-1">— 間違えて登録した分は × で1枚ずつ消せます</span>}
          </p>
          <div className="flex gap-1.5 overflow-x-auto pt-1.5 pr-1.5">
            {history.map((d) => (
              <span key={d.id} className="relative shrink-0">
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${docPeriodDate(d)} の${KIND_LABELS[kind]}（${d.downloadName || d.fileName || ""}）`}
                >
                  {isPdfDoc(d) ? (
                    <span className="flex h-12 w-12 items-center justify-center rounded border border-border text-[10px] font-bold text-muted">
                      PDF
                    </span>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={d.url} alt="履歴" className="h-12 w-12 rounded border border-border object-cover" />
                  )}
                </a>
                {/* 履歴の1枚だけを消す（申請登録時の画像はここでは消せない） */}
                {canEdit && !d.fromApplication && (
                  <button
                    type="button"
                    onClick={() => void onDelete(d)}
                    aria-label={`${docPeriodDate(d)} の${KIND_LABELS[kind]}を削除`}
                    title="この履歴の画像だけを削除する"
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-seal/50 bg-surface text-seal shadow-sm hover:bg-seal hover:text-white"
                  >
                    <X size={10} />
                  </button>
                )}
              </span>
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
