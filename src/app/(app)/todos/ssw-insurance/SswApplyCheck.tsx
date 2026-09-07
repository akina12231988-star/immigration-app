"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Check, ClipboardCheck, FileSearch, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { errorMessage } from "@/lib/errors";
import { extractPdfTextLines, pdfLinesInReadingOrder } from "@/lib/pdf-text-lines";
import {
  checkSswApply,
  parseSswApplyLines,
  parseSswApplyText,
  sswApplySummary,
  type SswApplyCheckResult,
} from "@/lib/ssw-apply-check";
import type { SswInsuranceRow } from "@/lib/ssw-insurance";

// 申込内容の添削。
// 保険の申込サイト（被保険者情報の一覧）をコピーして貼り付けると、
// 申込手続中の人と、氏名・生年月日・性別・保険期間・所属機関名が合っているかを見る。
export function SswApplyCheck({
  rows,
  expected,
}: {
  rows: SswInsuranceRow[]; // 氏名を探す先（一覧に出ている人みんな）
  expected: SswInsuranceRow[]; // 申込に出てくるはずの人（申込手続中）
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<SswApplyCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const run = () => setResult(checkSswApply(parseSswApplyText(text), rows, expected));

  // 申込内容のPDF（申込サイトの画面を印刷したもの）をそのまま読み取って照合する。
  // 1人ずつ名前をコピーしなくてよいように、ドラッグ＆ドロップだけで済ませる
  const onFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const data = await file.arrayBuffer();
      // pdfjs は渡したバッファを持っていってしまう（空になる）のでコピーを渡す
      const lines = pdfLinesInReadingOrder(await extractPdfTextLines(data.slice(0)));
      const parsed = parseSswApplyLines(lines);
      if (parsed.length === 0) {
        setError(
          "PDFから被保険者情報を読み取れませんでした。文字が画像になっているPDF（スキャン）は読めません。その場合は内容をコピーして下に貼り付けてください",
        );
        return;
      }
      setText(lines.join("\n"));
      setResult(checkSswApply(parsed, rows, expected));
    } catch (err) {
      setError(errorMessage(err, "PDFの読み取りに失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <details>
        <summary className="cursor-pointer text-sm font-bold">
          申込内容の照合（添削）
          <span className="ml-1.5 font-normal text-muted">
            申込手続中 {expected.length}件
          </span>
        </summary>

        <p className="mt-1 mb-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
          <ClipboardCheck size={13} className="mt-0.5 shrink-0" />
          保険の申込内容のPDFをこの枠にドラッグ＆ドロップ（または「PDFを選ぶ」）すると、そのまま読み取って申込手続中の人と照合します。1人ずつコピーする必要はありません。氏名・生年月日・性別・保険期間（〇ヶ月）・保険始期希望日・所属機関名を見て、システムの情報と違うところを出します。うまく読めないときは、下の欄に内容を貼り付けて「照合する」でも照合できます。
        </p>

        {/* PDFの読み取り（枠に落としてもボタンからでも同じ） */}
        <FileDropArea
          onFiles={(files) => {
            if (!busy && files.length > 0) void onFile(files[0]);
          }}
          disabled={busy}
          className="mb-2 rounded-xl border border-dashed border-border bg-background p-3"
          title="申込内容のPDFをここにドロップしても照合できます"
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="secondary"
              icon={busy ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />}
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? "読み取り中…" : "PDFを選ぶ"}
            </Button>
            <span className="text-[11px] text-muted">
              {fileName ? `${fileName} を読み取りました` : "ここにPDFをドロップできます"}
            </span>
          </div>
        </FileDropArea>

        {error && (
          <p role="alert" className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-[11px] text-seal">
            {error}
          </p>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={"例:\nVU THI NHAN\tベトナム\t女\t1988/09/30\t7ヶ月\t2026/09/08\t株式会社ベース"}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button disabled={!text.trim()} onClick={run}>
            照合する
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setText("");
              setResult(null);
            }}
          >
            消す
          </Button>
          {result && <span className="text-[11px] font-bold">{sswApplySummary(result)}</span>}
        </div>

        {result && (
          <div className="mt-3 space-y-2">
            {result.rows.map((r, i) => (
              <div
                key={`${r.line.name}-${i}`}
                className={`rounded-xl border p-2.5 text-[11px] ${
                  r.ok ? "border-border bg-background" : "border-seal/40 bg-seal/5"
                }`}
              >
                <p className="flex flex-wrap items-center gap-1.5 font-bold">
                  {r.ok ? (
                    <Check size={13} className="text-status-reported-fg" />
                  ) : (
                    <X size={13} className="text-seal" />
                  )}
                  {r.line.name || "（氏名を読み取れませんでした）"}
                  {r.workerId ? (
                    r.ok && <span className="font-normal text-muted">合っています</span>
                  ) : (
                    <span className="text-seal">
                      システムの申込手続中・一覧に同じ氏名の人がいません
                    </span>
                  )}
                </p>
                {r.issues.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {r.issues.map((issue) => (
                      <li key={issue.field} className="text-seal">
                        {issue.field}: 申込「{issue.actual}」／システム「{issue.expected}」
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            {result.missing.length > 0 && (
              <div className="rounded-xl border border-seal/40 bg-seal/5 p-2.5 text-[11px]">
                <p className="flex items-center gap-1.5 font-bold text-seal">
                  <AlertTriangle size={13} />
                  申込手続中なのに、貼り付けた申込内容に出てこない人（{result.missing.length}件）
                </p>
                <p className="mt-1">{result.missing.map((m) => m.name).join(" ／ ")}</p>
              </div>
            )}
          </div>
        )}
      </details>
    </Card>
  );
}
