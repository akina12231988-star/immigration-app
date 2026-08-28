"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  Loader2,
  Upload,
} from "lucide-react";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { listOnboardingDocs } from "@/lib/supabase/queries/onboarding";
import { getPensionRecord, upsertPensionRecord } from "@/lib/supabase/queries/pension";
import {
  clearOnboardingDocFile,
  getOnboardingDocDownloadUrl,
  getOnboardingDocPreviewUrl,
} from "@/app/(app)/onboarding/actions";
import { uploadOnboardingDoc } from "@/lib/onboarding-files";
import {
  assignPastedCodes,
  judgePension,
  parsePensionSymbols,
  pensionMonths,
  pensionSymbolByCode,
  summarizeMonths,
  warekiMonthLabel,
  PENSION_ACTION_LABELS,
  PENSION_MONTH_COUNT,
  PENSION_MONTH_LAG,
  PENSION_SYMBOLS,
  type PensionAction,
  type PensionMonthCodes,
} from "@/lib/pension";
import type { OnboardingDocumentRow } from "@/types/db";

const NENKIN_KEY = "prep_nenkin";

// 対応区分ごとの色。Tailwind は書いてあるクラス名しか作らないので literal で持つ
const ACTION_TONE: Record<PensionAction, string> = {
  pay: "bg-seal/10 text-seal",
  exempt: "bg-status-notice-bg text-status-notice-fg",
  ok: "bg-status-approved-bg text-status-approved-fg",
  check: "bg-status-notice-bg text-status-notice-fg",
};

// 記号を選ぶ <select> の並び（対応区分ごとにまとめる）
const SYMBOL_GROUPS: { action: PensionAction; label: string }[] = [
  { action: "pay", label: "未納（要支払い/免除申請）" },
  { action: "exempt", label: "免除・猶予・特例" },
  { action: "ok", label: "納付済み" },
  { action: "check", label: "要確認" },
];

// 今月を "YYYY-MM" で返す
function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// 年金記録票の記号を月ごとに控え、意味とアラート（未納なら支払い/免除申請が必要）を
// 表示し、年金記録票のファイルを添付できるページ。
export function PensionRecordClient({
  workerId,
  workerName,
  canEdit,
}: {
  workerId: string;
  workerName: string;
  canEdit: boolean;
}) {
  const [applyMonth, setApplyMonth] = useState(thisMonth());
  const [monthCodes, setMonthCodes] = useState<PensionMonthCodes>({});
  // 月が分からない古い記録（記号だけを控えていたころのもの）
  const [legacySymbols, setLegacySymbols] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [paste, setPaste] = useState("");
  const [showLegend, setShowLegend] = useState(false);
  const [file, setFile] = useState<OnboardingDocumentRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFile = () =>
    listOnboardingDocs(createClient(), workerId)
      .then((docs) => setFile(docs.find((d) => d.doc_key === NENKIN_KEY && d.storage_path) ?? null))
      .catch(() => undefined);

  useEffect(() => {
    getPensionRecord(createClient(), workerId)
      .then((r) => {
        setMonthCodes(r.months);
        setLegacySymbols(parsePensionSymbols(r.symbols));
        setApplyMonth(r.apply_month || thisMonth());
        setNote(r.note);
      })
      .catch(() => undefined);
    void loadFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  const months = useMemo(() => pensionMonths(applyMonth), [applyMonth]);
  const summary = useMemo(() => summarizeMonths(monthCodes, months), [monthCodes, months]);

  // 月ごとに入っていればそれで判定し、まだ無ければ古い記録の記号で判定する
  const monthCodeList = months.map((m) => monthCodes[m]).filter((c): c is string => !!c);
  const codes = monthCodeList.length ? monthCodeList : legacySymbols;
  const result = judgePension(codes);
  const hasFile = !!file?.storage_path;

  const setMonth = (month: string, code: string) =>
    setMonthCodes((prev) => {
      const next = { ...prev };
      if (code) next[month] = code;
      else delete next[month];
      return next;
    });

  // 記録票の並びをそのまま貼り付けて、24か月分をまとめて入れる
  const applyPaste = () => {
    const filled = assignPastedCodes(paste, months);
    if (!Object.keys(filled).length) {
      setError("記号を読み取れませんでした。記録票の記号をそのまま貼り付けてください。");
      return;
    }
    setMonthCodes((prev) => ({ ...prev, ...filled }));
    setPaste("");
    setError(null);
  };

  const clearMonths = () => {
    if (!window.confirm("入力した24か月分の記号をすべて消します。よろしいですか？")) return;
    setMonthCodes({});
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // 月ごとに入れたときは、そこに出てくる記号で記号欄も置き換える（記録票の並び順）
      const used = PENSION_SYMBOLS.filter((s) => monthCodeList.includes(s.code)).map((s) => s.code);
      await upsertPensionRecord(createClient(), workerId, {
        symbols: (used.length ? used : legacySymbols).join(","),
        note,
        apply_month: applyMonth,
        months: monthCodes,
      });
      if (used.length) setLegacySymbols(used);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      await uploadOnboardingDoc(workerId, { key: NENKIN_KEY, label: "年金記録", num: 0 }, f);
      await loadFile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function removeFile() {
    if (!window.confirm("年金記録票の添付を削除します。よろしいですか？")) return;
    setBusy(true);
    try {
      await clearOnboardingDocFile(workerId, NENKIN_KEY);
      await loadFile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    if (!file) return;
    const res = await getOnboardingDocPreviewUrl(file.id);
    if (!res.ok) return setError(res.message);
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function download() {
    if (!file) return;
    const res = await getOnboardingDocDownloadUrl(file.id);
    if (!res.ok) return setError(res.message);
    const a = document.createElement("a");
    a.href = res.url;
    a.download = res.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const alertTone =
    result.judgment === "pay"
      ? "bg-seal/10 text-seal"
      : result.judgment === "ok"
        ? "bg-status-approved-bg text-status-approved-fg"
        : "bg-status-notice-bg text-status-notice-fg";

  const INPUT =
    "min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      <Card className="p-4">
        <p className="mb-2 text-sm font-bold">{workerName}</p>
        <p className="text-[11px] leading-relaxed text-muted">
          年金記録票（被保険者記録照会回答票）の記号を月ごとに控えると、意味と対応が判定されます。
          申請では、申請月の{PENSION_MONTH_LAG}か月前までの{PENSION_MONTH_COUNT}か月分を見ます。国民年金加入者向け。
        </p>
        {codes.length > 0 && (
          <div
            className={`mt-3 flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold ${alertTone}`}
          >
            {result.judgment === "ok" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {result.alert}
          </div>
        )}
        {summary.payMonths.length > 0 && (
          <p className="mt-1.5 text-xs leading-relaxed text-seal">
            未納の月（{summary.payMonths.length}か月）:{" "}
            {summary.payMonths.map((m) => warekiMonthLabel(m)).join("・")}
          </p>
        )}
      </Card>

      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* 月ごとの記号（申請月の2か月前までの24か月分） */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">申請月</span>
            <input
              type="month"
              value={applyMonth}
              disabled={!canEdit}
              onChange={(e) => setApplyMonth(e.target.value)}
              className={INPUT}
            />
          </label>
          <p className="text-[11px] leading-relaxed text-muted">
            確認する期間
            <br />
            <span className="font-bold tabular-nums text-foreground">
              {months.length ? `${warekiMonthLabel(months[0])} 〜 ${warekiMonthLabel(months[months.length - 1])}` : "—"}
            </span>
            <br />
            入力済み {summary.filled} / {summary.total} か月
          </p>
        </div>

        {canEdit && (
          <div className="rounded-xl bg-background p-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-muted">
                まとめて入力（記録票の記号をそのまま貼り付け・古い月から順に入ります）
              </span>
              <textarea
                rows={2}
                value={paste}
                placeholder="例: AAA AAA AAA AAA AAA AAA A／A ＊＊＊"
                onChange={(e) => setPaste(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={applyPaste} disabled={!paste.trim()}>
                24か月分に割り当てる
              </Button>
              <Button type="button" variant="secondary" onClick={clearMonths}>
                すべて消す
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-border">
          {months.map((month, i) => {
            const code = monthCodes[month] ?? "";
            const sym = pensionSymbolByCode(code);
            return (
              <div
                key={month}
                className={`flex items-center gap-2 border-b border-border px-2.5 py-1.5 text-sm last:border-b-0 ${
                  i % 2 === 0 ? "bg-background" : "bg-surface/60"
                }`}
              >
                <span className="w-[104px] shrink-0 text-[11px] font-bold tabular-nums">
                  {warekiMonthLabel(month)}
                  <span className="ml-1 font-normal text-muted">{month}</span>
                </span>
                <select
                  value={code}
                  disabled={!canEdit}
                  aria-label={`${warekiMonthLabel(month)}の記号`}
                  onChange={(e) => setMonth(month, e.target.value)}
                  className="w-[68px] shrink-0 rounded-lg border border-border bg-background px-1.5 py-1 text-sm font-bold focus:border-brand focus:outline-none"
                >
                  <option value="">—</option>
                  {SYMBOL_GROUPS.map((g) => (
                    <optgroup key={g.action} label={g.label}>
                      {PENSION_SYMBOLS.filter((s) => s.action === g.action).map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.code}　{s.meaning}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted" title={sym?.meaning}>
                  {sym?.meaning ?? "未入力"}
                </span>
                {sym && (
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${ACTION_TONE[sym.action]}`}
                  >
                    {PENSION_ACTION_LABELS[sym.action]}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* 月が分からない古い記録。月ごとに入力すると置き換わる */}
        {!monthCodeList.length && legacySymbols.length > 0 && (
          <p className="rounded-lg bg-status-notice-bg px-3 py-2 text-[11px] leading-relaxed text-status-notice-fg">
            以前に記号だけを控えた記録があります: <b>{legacySymbols.join("・")}</b>
            <br />
            月ごとに入力して保存すると、こちらは自動で置き換わります。
          </p>
        )}

        <label className="block">
          <span className="mb-1 block text-[11px] font-bold text-muted">
            内訳メモ（例: 令和6年 3/12ヶ月 未納 など）
          </span>
          <textarea
            rows={2}
            value={note}
            readOnly={!canEdit}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
          />
        </label>

        {canEdit && (
          <Button type="button" fullWidth onClick={save} disabled={saving}>
            {saving ? (
              <span className="flex items-center gap-1">
                <Loader2 size={15} className="animate-spin" /> 保存中…
              </span>
            ) : saved ? (
              <span className="flex items-center gap-1">
                <Check size={15} /> 保存しました
              </span>
            ) : (
              "保存する"
            )}
          </Button>
        )}
      </Card>

      {/* 記号の一覧（記録票の凡例そのまま） */}
      <Card className="p-4">
        <button
          type="button"
          onClick={() => setShowLegend((v) => !v)}
          aria-expanded={showLegend}
          className="flex w-full items-center justify-between gap-2 text-sm font-bold"
        >
          記号の一覧（国民年金納付記録の見方）
          <ChevronDown
            size={16}
            className={`shrink-0 text-muted transition-transform ${showLegend ? "rotate-180" : ""}`}
          />
        </button>
        {showLegend && (
          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            {PENSION_SYMBOLS.map((s) => (
              <div
                key={s.code}
                className="flex items-center gap-2.5 border-b border-border bg-background px-3 py-1.5 text-sm last:border-b-0"
              >
                <span className="w-8 shrink-0 text-center font-bold">{s.code}</span>
                <span className="min-w-0 flex-1 text-[11px] text-muted">{s.meaning}</span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${ACTION_TONE[s.action]}`}
                >
                  {PENSION_ACTION_LABELS[s.action]}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 年金記録票ファイル（結果の添付）。枠にドラッグ＆ドロップでも添付できる */}
      <Card className="p-4">
        <FileDropArea
          onFiles={(files) => void handleFile(files[0])}
          disabled={!canEdit || busy}
          className="rounded-xl"
        >
        <div className="flex items-center gap-2.5 text-sm">
          <span className="min-w-0 flex-1">
            <span className="block font-bold">年金記録票（結果の添付）</span>
            <span className="block truncate text-[11px] text-muted">
              {hasFile ? file!.file_name : "未登録"}
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {busy ? (
              <Loader2 size={15} className="animate-spin text-muted" />
            ) : (
              <>
                {hasFile && (
                  <>
                    <IconButton label="表示" onClick={preview}>
                      <Eye size={13} />
                    </IconButton>
                    <IconButton label="ダウンロード" onClick={download}>
                      <Download size={13} />
                    </IconButton>
                  </>
                )}
                {canEdit && (
                  <IconButton
                    label={hasFile ? "差し替え" : "添付"}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={13} />
                    {hasFile ? "差し替え" : "添付"}
                  </IconButton>
                )}
                {canEdit && hasFile && (
                  <IconButton label="削除" tone="danger" onClick={removeFile}>
                    削除
                  </IconButton>
                )}
              </>
            )}
          </div>
        </div>
        {canEdit && (
          <p className="mt-1.5 text-[11px] text-muted">
            画像・PDFをこの枠にドラッグ＆ドロップしても添付できます。
          </p>
        )}
        </FileDropArea>
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  tone = "default",
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold ${
        tone === "danger" ? "text-seal" : "text-brand"
      }`}
    >
      {children}
    </button>
  );
}
