"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileJson, TriangleAlert, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { parseLegacyJson, type ImportResult } from "@/lib/ssw/import";
import { parseNotionCsv } from "@/lib/ssw/notion-csv";
import { importWorkers, type ImportSummary } from "@/lib/supabase/queries/workers";

type Phase = "select" | "preview" | "importing" | "done";

export function ImportClient() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("select");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ImportResult | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const isCsv = file.name.toLowerCase().endsWith(".csv") || (!text.trimStart().startsWith("{") && !text.trimStart().startsWith("["));
      const result = isCsv ? parseNotionCsv(text) : parseLegacyJson(JSON.parse(text));
      if (result.workerCount === 0) {
        setError(
          isCsv
            ? "CSVから外国人データを読み取れませんでした。Notionの「在籍履歴」CSVか、氏名の列があるか確認してください。"
            : "外国人データが見つかりませんでした。旧ツールの「JSON保存」ファイルか確認してください。",
        );
        return;
      }
      setParsed(result);
      setPhase("preview");
    } catch {
      setError("ファイルの読み込みに失敗しました。JSONまたはCSV形式をご確認ください。");
    }
  }

  async function runImport() {
    if (!parsed) return;
    setPhase("importing");
    setError(null);
    try {
      const result = await importWorkers(createClient(), parsed.workers);
      setSummary(result);
      setPhase("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "取り込みに失敗しました");
      setPhase("preview");
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {phase === "select" && (
        <>
          <Card className="p-4 text-sm leading-relaxed text-muted">
            次のいずれかのファイルを取り込めます。
            <span className="mt-2 block">
              ・Notion「在籍履歴」からエクスポートした
              <span className="font-bold text-foreground">CSV</span>
            </span>
            <span className="block">
              ・旧「特定技能1号 職歴・通算期間管理」ツールの
              <span className="font-bold text-foreground">JSON</span>
            </span>
            <span className="mt-2 block text-xs">
              外国人ID（Notionのページ）で突き合わせるため、同じファイルを取り込んでも重複しません。
            </span>
          </Card>
          <Button fullWidth icon={<Upload size={19} />} onClick={() => inputRef.current?.click()}>
            CSV / JSON ファイルを選択
          </Button>
        </>
      )}

      {phase === "preview" && parsed && (
        <>
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <FileJson size={18} className="text-brand" />
              <p className="truncate text-sm font-bold">{fileName}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="外国人" value={parsed.workerCount} unit="名" />
              <Stat label="職歴" value={parsed.historyCount} unit="件" />
            </div>
          </Card>

          {parsed.skipped.length > 0 && (
            <Card className="p-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-status-notice-fg">
                <TriangleAlert size={15} />
                補正・スキップ（{parsed.skipped.length}件）
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
                {parsed.skipped.map((s, i) => (
                  <li key={i}>・{s}</li>
                ))}
              </ul>
            </Card>
          )}

          <Button fullWidth onClick={runImport}>
            この内容で取り込む
          </Button>
          <Button variant="secondary" fullWidth onClick={() => setPhase("select")}>
            別のファイルを選ぶ
          </Button>
        </>
      )}

      {phase === "importing" && (
        <Card className="flex items-center gap-3 p-5">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="text-sm text-muted">取り込んでいます…</p>
        </Card>
      )}

      {phase === "done" && summary && (
        <>
          <Card className="p-4">
            <p className="mb-3 flex items-center gap-2 font-bold text-status-reported-fg">
              <CheckCircle2 size={18} />
              取り込みが完了しました
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="新規" value={summary.inserted} unit="名" />
              <Stat label="更新" value={summary.updated} unit="名" />
              <Stat label="職歴" value={summary.historyInserted} unit="件" />
              <Stat label="機関を新規作成" value={summary.orgsCreated} unit="件" />
            </div>
            {summary.errors.length > 0 && (
              <div className="mt-3 rounded-lg bg-seal/10 p-3 text-xs text-seal">
                <p className="mb-1 font-bold">一部エラー（{summary.errors.length}件）</p>
                <ul className="max-h-32 space-y-1 overflow-y-auto">
                  {summary.errors.map((e, i) => (
                    <li key={i}>・{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
          <Button fullWidth onClick={() => router.push("/workers")}>
            外国人一覧で確認する
          </Button>
          <p className="px-1 text-[11px] leading-relaxed text-muted">
            通算期間が旧ツールの表示と一致するか、数名分を照合してください。支援区分・状態・所属機関などの新項目は取り込み後に各詳細ページから補完できます。
          </p>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json,text/csv,.csv"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-xl bg-background p-3 text-center">
      <p className="text-2xl font-black tabular-nums">
        {value}
        <span className="ml-0.5 text-sm font-bold text-muted">{unit}</span>
      </p>
      <p className="text-xs font-medium text-muted">{label}</p>
    </div>
  );
}
