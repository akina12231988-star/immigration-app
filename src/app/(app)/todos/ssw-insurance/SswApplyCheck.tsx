"use client";

import { useState } from "react";
import { AlertTriangle, Check, ClipboardCheck, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  checkSswApply,
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

  const run = () => setResult(checkSswApply(parseSswApplyText(text), rows, expected));

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
          保険の申込サイトの「被保険者情報」の一覧（またはPDFの中身）をコピーして貼り付け、「照合する」を押してください。1人1行で、氏名・生年月日・性別・保険期間（〇ヶ月）・保険始期希望日・所属機関名を読み取って、システムの情報と違うところを出します。並びが多少ずれていても読めます。
        </p>

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
