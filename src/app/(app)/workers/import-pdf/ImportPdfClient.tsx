"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, TriangleAlert, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { extractPdfText } from "@/lib/import/pdf-text";
import { parseDocumentText, type ImportedWorker } from "@/lib/import";
import { importDocumentWorkers, type ImportSummary } from "@/lib/supabase/queries/workers";

type Phase = "select" | "reading" | "preview" | "importing" | "done";

interface Preview {
  workers: ImportedWorker[];
  historyCount: number;
  warnings: string[];
  fileNames: string[];
}

export function ImportPdfClient() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("select");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setPhase("reading");
    const workers: ImportedWorker[] = [];
    const warnings: string[] = [];
    const fileNames: string[] = [];
    try {
      for (const file of Array.from(files)) {
        fileNames.push(file.name);
        let text: string;
        try {
          text = await extractPdfText(file);
        } catch {
          warnings.push(`${file.name}: PDFの読み取りに失敗しました`);
          continue;
        }
        const result = parseDocumentText(text);
        if (!result.ok) {
          if (result.error.kind === "no-payload") {
            warnings.push(
              `${file.name}: 取り込み用データが見つかりませんでした（このシステムの履歴書ツールで作成したPDFをご利用ください）`,
            );
          } else {
            warnings.push(`${file.name}: 未対応の帳票（${result.error.docType}）です`);
          }
          continue;
        }
        workers.push(...result.document.workers);
        warnings.push(...result.document.warnings.map((w) => `${file.name}: ${w}`));
      }

      if (workers.length === 0) {
        setError(
          warnings[0] ??
            "取り込めるデータが見つかりませんでした。履歴書ツールで作成したPDFかご確認ください。",
        );
        setPhase("select");
        return;
      }

      const historyCount = workers.reduce((sum, w) => sum + w.histories.length, 0);
      setPreview({ workers, historyCount, warnings, fileNames });
      setPhase("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDFの解析に失敗しました");
      setPhase("select");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function runImport() {
    if (!preview) return;
    setPhase("importing");
    setError(null);
    try {
      const result = await importDocumentWorkers(createClient(), preview.workers);
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
            履歴書ツールで作成した
            <span className="font-bold text-foreground">履歴書PDF</span>
            をアップロードすると、氏名・生年月日・国籍・在留資格・職歴など、記載内容を自動で読み取って登録します。
            PDF内のテキストデータを読み取るため、スキャン画像ではなくツールから保存したPDFをご利用ください。
            職歴は件数の制限なくすべて取り込みます。複数のPDFをまとめて選択できます。
          </Card>
          <Button fullWidth icon={<Upload size={19} />} onClick={() => inputRef.current?.click()}>
            PDFファイルを選択
          </Button>
        </>
      )}

      {phase === "reading" && (
        <Card className="flex items-center gap-3 p-5">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="text-sm text-muted">PDFを読み取っています…</p>
        </Card>
      )}

      {phase === "preview" && preview && (
        <>
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <FileText size={18} className="text-brand" />
              <p className="truncate text-sm font-bold">{preview.fileNames.join("、")}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="外国人" value={preview.workers.length} unit="名" />
              <Stat label="職歴" value={preview.historyCount} unit="件" />
            </div>
          </Card>

          <Card className="p-4">
            <p className="mb-2 text-sm font-bold">読み取り内容</p>
            <ul className="space-y-2 text-sm">
              {preview.workers.map((w, i) => (
                <li key={i} className="rounded-lg bg-background p-3">
                  <p className="font-bold">{w.name || "（氏名不明）"}</p>
                  <p className="text-xs text-muted">
                    {[w.nationality, w.birth, w.residence_status].filter(Boolean).join(" ・ ")}
                    {" ／ 職歴 "}
                    {w.histories.length}
                    件
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          {preview.warnings.length > 0 && (
            <Card className="p-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-status-notice-fg">
                <TriangleAlert size={15} />
                補足（{preview.warnings.length}件）
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
                {preview.warnings.map((w, i) => (
                  <li key={i}>・{w}</li>
                ))}
              </ul>
            </Card>
          )}

          <Button fullWidth onClick={runImport}>
            この内容で登録する
          </Button>
          <Button variant="secondary" fullWidth onClick={() => setPhase("select")}>
            別のPDFを選ぶ
          </Button>
        </>
      )}

      {phase === "importing" && (
        <Card className="flex items-center gap-3 p-5">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="text-sm text-muted">登録しています…</p>
        </Card>
      )}

      {phase === "done" && summary && (
        <>
          <Card className="p-4">
            <p className="mb-3 flex items-center gap-2 font-bold text-status-reported-fg">
              <CheckCircle2 size={18} />
              取り込みが完了しました
            </p>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="新規" value={summary.inserted} unit="名" />
              <Stat label="更新" value={summary.updated} unit="名" />
              <Stat label="職歴" value={summary.historyInserted} unit="件" />
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
            性別・言語・住所など、専用の入力欄がない情報は備考欄にまとめて登録されます。各詳細ページで確認・補完してください。
          </p>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
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
