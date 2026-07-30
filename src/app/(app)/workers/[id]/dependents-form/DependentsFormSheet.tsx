"use client";

import { useState } from "react";
import { BackButton } from "@/components/BackButton";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  dependentAge,
  dependentCategoryLabels,
  isSpouseRelation,
  warekiDate,
} from "@/lib/dependents";
import { fuyoOverflow, type FuyoFormData } from "@/lib/fuyo-form";
import { todayStr } from "@/lib/ssw/calc";
import type { WorkerDependent } from "@/types/db";

interface FormWorker {
  name: string;
  kana: string;
  birth: string | null;
  address: string;
  myNumber: string;
  hasSpouse: string;
}

// 給与所得者の扶養控除等（異動）申告書（令和8年分・国税庁の入力用PDF）を、
// 外国人詳細の扶養家族データから自動入力してダウンロードする
export function DependentsFormSheet({
  worker,
  dependents,
}: {
  worker: FormWorker;
  dependents: WorkerDependent[];
}) {
  const today = todayStr();
  const [householdHead, setHouseholdHead] = useState(worker.name);
  const [headRelation, setHeadRelation] = useState("本人");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spouse = dependents.find((d) => isSpouseRelation(d.relation));
  const over16 = dependents.filter(
    (d) =>
      !isSpouseRelation(d.relation) &&
      d.birth !== "" &&
      (dependentAge(d.birth, today) ?? 0) >= 16,
  );
  const under16 = dependents.filter(
    (d) => d.birth !== "" && (dependentAge(d.birth, today) ?? 99) < 16,
  );
  const noBirth = dependents.filter((d) => !isSpouseRelation(d.relation) && d.birth === "");

  const formData: FuyoFormData = {
    worker,
    householdHead,
    headRelation,
    dependents,
  };
  const overflow = fuyoOverflow(formData, today);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dependents-form", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: formData }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "申告書の生成に失敗しました");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `扶養控除等申告書_${worker.name}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "申告書の生成に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const TOOL_INPUT =
    "min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

  return (
    <>
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
        <BackButton fallbackHref="/workers" />
        <h1 className="flex-1 text-lg font-bold">扶養控除等（異動）申告書</h1>
      </div>

      <div className="space-y-4 px-4 py-5 lg:px-8">
        <p className="text-[11px] leading-relaxed text-muted">
          国税庁の入力用PDF（令和8年分 給与所得者の扶養控除等（異動）申告書）に、
          外国人詳細の扶養家族データを自動入力してダウンロードします。
          扶養家族の追加・修正は外国人詳細で行ってください。
          老人扶養親族・特定扶養親族・非居住者の区分は現時点の年齢から自動判定しています。
        </p>

        {error && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">世帯主の氏名</span>
            <input
              value={householdHead}
              onChange={(e) => setHouseholdHead(e.target.value)}
              className={TOOL_INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">あなたとの続柄</span>
            <input
              value={headRelation}
              onChange={(e) => setHeadRelation(e.target.value)}
              className={`${TOOL_INPUT} w-28`}
            />
          </label>
          <button
            type="button"
            onClick={download}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-foreground disabled:opacity-50"
          >
            <Download size={18} />
            {busy ? "作成中…" : "申告書PDFをダウンロード"}
          </button>
        </div>

        {(overflow.over16Overflow > 0 || overflow.under16Overflow > 0 || noBirth.length > 0) && (
          <div className="rounded-xl bg-seal/10 px-3.5 py-2.5 text-xs leading-relaxed text-seal">
            {overflow.over16Overflow > 0 && (
              <p>
                16歳以上の扶養親族が様式の4行を超えています（{overflow.over16Overflow}
                人分は入りません）。2枚に分けて作成してください。
              </p>
            )}
            {overflow.under16Overflow > 0 && (
              <p>16歳未満の扶養親族が様式の2行を超えています（{overflow.under16Overflow}人分は入りません）。</p>
            )}
            {noBirth.length > 0 && (
              <p>
                生年月日が未入力の扶養家族（{noBirth.map((d) => d.name || "氏名未入力").join("・")}
                ）は申告書に入りません。外国人詳細で入力してください。
              </p>
            )}
          </div>
        )}

        {/* 記載内容のプレビュー（どの欄に誰が入るか） */}
        <Card className="p-4">
          <p className="mb-2 text-sm font-bold">記載内容</p>
          <dl className="space-y-2 text-sm">
            <PreviewRow
              label="給与の支払者の欄"
              value="記入しません（会社側で記載する欄のため空欄のまま出力します）"
            />
            <PreviewRow
              label="本人"
              value={`${worker.name}${worker.birth ? `（${warekiDate(worker.birth)}生まれ）` : ""} ・ 世帯主 ${householdHead || "未入力"}（${headRelation || "未入力"}） ・ 配偶者の有無 ${spouse || worker.hasSpouse === "有" ? "有" : "無"}`}
            />
            <PreviewRow
              label="A欄 源泉控除対象配偶者"
              value={spouse ? depLine(spouse, today) : "該当なし"}
            />
            <div>
              <dt className="text-[11px] font-bold text-muted">B欄 控除対象扶養親族（16歳以上・4行まで）</dt>
              {over16.length === 0 ? (
                <dd className="text-muted">該当なし</dd>
              ) : (
                over16.slice(0, 4).map((d, i) => (
                  <dd key={i} className="mt-1">
                    {i + 1}. {depLine(d, today)}
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {dependentCategoryLabels(d, today).map((l) => (
                        <span
                          key={l}
                          className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand"
                        >
                          {l}
                        </span>
                      ))}
                    </span>
                  </dd>
                ))
              )}
            </div>
            <PreviewRow
              label="住民税欄 16歳未満の扶養親族（2行まで）"
              value={
                under16.length === 0
                  ? "該当なし"
                  : under16
                      .slice(0, 2)
                      .map((d) => depLine(d, today))
                      .join(" ／ ")
              }
            />
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            ダウンロードしたPDFは入力済みの確定版（編集不可）です。生計を一にする事実（送金額）の欄と署名は、
            提出前に本人が記入してください。所轄税務署長・市区町村長の欄も必要に応じて記入してください。
          </p>
        </Card>
      </div>
    </>
  );
}

function depLine(d: WorkerDependent, today: string): string {
  const age = d.birth ? dependentAge(d.birth, today) : null;
  return [
    d.name || "氏名未入力",
    d.relation && `（${d.relation}）`,
    d.birth && `${warekiDate(d.birth)}生まれ`,
    age != null && `${age}歳`,
  ]
    .filter(Boolean)
    .join(" ");
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold text-muted">{label}</dt>
      <dd className="whitespace-pre-wrap break-words">{value}</dd>
    </div>
  );
}
