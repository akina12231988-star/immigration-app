"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, FileArchive, FileText, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatYenAmount, warekiYear } from "@/lib/dependents";
import { buildFuyoRoster, fuyoFileName, type FuyoRosterRow, type FuyoRosterWorker } from "@/lib/fuyo-roster";
import type { FuyoFormData, FuyoFormKind } from "@/lib/fuyo-form";
import { todayStr } from "@/lib/ssw/calc";

const INPUT =
  "min-h-[40px] rounded-xl border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none";

// 1人分の申告書PDFを作る（外国人詳細の作成画面と同じ /api/dependents-form を使う）
async function fetchFuyoPdf(row: FuyoRosterRow, kind: FuyoFormKind, year: string): Promise<Blob> {
  const w = row.worker;
  const data: FuyoFormData = {
    kind,
    year,
    worker: {
      name: w.name,
      kana: w.kana,
      birth: w.birth,
      address: w.address,
      myNumber: w.my_number,
      hasSpouse: w.has_spouse,
    },
    householdHead: w.name,
    headRelation: "本人",
    // 年末調整時は送金が目標額に達した人だけ、入社時は全員を記載する
    dependents: kind === "年末調整時" ? row.achieved : row.dependents,
  };
  const res = await fetch("/api/dependents-form", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? "申告書の作成に失敗しました");
  }
  return res.blob();
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// 扶養控除等申告書（年末調整）の一覧。
// 対象年（1月1日〜12月31日）の送金が目標額に達した扶養親族がいる人を抽出して、
// 年末調整用（達した人だけ記載）の申告書を1人ずつ・まとめて（ZIP）作る。入社時（全員記載）も作れる
export function DependentsFormsClient({
  workers,
  organizations,
}: {
  workers: FuyoRosterWorker[];
  organizations: { id: string; name: string }[];
}) {
  const today = todayStr();
  const [year, setYear] = useState(today.slice(0, 4));
  const [orgId, setOrgId] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [achievedOnly, setAchievedOnly] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const orgName = useMemo(() => new Map(organizations.map((o) => [o.id, o.name])), [organizations]);

  const roster = useMemo(() => buildFuyoRoster(workers, year, today), [workers, year, today]);
  const rows = roster.filter(
    (r) =>
      (!orgId || r.worker.current_organization_id === orgId) &&
      (!activeOnly || r.worker.status === "在籍中") &&
      (!achievedOnly || r.achieved.length > 0),
  );
  const yearEndTargets = rows.filter((r) => r.achieved.length > 0);

  const downloadOne = async (row: FuyoRosterRow, kind: FuyoFormKind) => {
    setBusy(`${row.worker.id}-${kind}`);
    setError(null);
    try {
      saveBlob(await fetchFuyoPdf(row, kind, year), fuyoFileName(kind, year, row.worker.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : "申告書の作成に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  // 年末調整用を、送金が達した扶養親族がいる人の分だけまとめて ZIP にする
  const downloadAll = async () => {
    setBusy("all");
    setError(null);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (const row of yearEndTargets) {
        zip.file(fuyoFileName("年末調整時", year, row.worker.name), await fetchFuyoPdf(row, "年末調整時", year));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      saveBlob(blob, `扶養控除等申告書_年末調整時_${year}_${yearEndTargets.length}名.zip`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "申告書の作成に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 px-4 pt-4 lg:px-8">
      <p className="text-[11px] leading-relaxed text-muted">
        外国人詳細で入力した扶養家族と年末の国際送金から、対象年（1月1日〜12月31日）の送金が目標額
        （30歳以上70歳未満は38万円以上、それ以外は1円以上）に達した扶養親族がいる人を抽出します。
        「年末調整用」は達した扶養親族だけを記載し、B欄の「生計を一にする事実」にその年の送金合計額を書きます。
        「入社時」は扶養親族を全員記載します。
      </p>

      <Card className="flex flex-wrap items-end gap-3 p-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">対象年（西暦）</span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className={`${INPUT} w-24 tabular-nums`}
            />
            <span className="text-xs text-muted">{warekiYear(year) && `（${warekiYear(year)}分）`}</span>
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">所属機関</span>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={INPUT}>
            <option value="">すべて</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-[40px] items-center gap-1.5 text-xs font-bold">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} className="h-4 w-4" />
          在籍中の人だけ
        </label>
        <label className="flex min-h-[40px] items-center gap-1.5 text-xs font-bold">
          <input type="checkbox" checked={achievedOnly} onChange={(e) => setAchievedOnly(e.target.checked)} className="h-4 w-4" />
          送金が達した扶養親族がいる人だけ
        </label>
        <button
          type="button"
          onClick={() => void downloadAll()}
          disabled={busy !== null || yearEndTargets.length === 0}
          className="ml-auto inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground disabled:opacity-50"
        >
          {busy === "all" ? <Loader2 size={17} className="animate-spin" /> : <FileArchive size={17} />}
          {busy === "all" ? "作成中…" : `年末調整用をまとめてダウンロード（${yearEndTargets.length}名・ZIP）`}
        </button>
      </Card>

      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      <p className="text-xs font-bold text-muted">
        {rows.length}名（扶養家族を登録している人 {roster.length}名中）
      </p>

      {rows.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">該当する人はいません。</Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Card key={row.worker.id} className="p-3">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Link href={`/workers/${row.worker.id}`} className="font-bold hover:text-brand hover:underline">
                    {row.worker.name}
                  </Link>
                  <span className="ml-2 text-xs text-muted">
                    {orgName.get(row.worker.current_organization_id ?? "") ?? "所属機関未設定"}・{row.worker.status || "状態未設定"}
                  </span>
                  <p className="mt-1 text-xs">
                    <span className={`font-bold ${row.achieved.length > 0 ? "text-status-approved-fg" : "text-seal"}`}>
                      送金が達した扶養親族 {row.achieved.length} / {row.dependents.length}人
                    </span>
                    {row.achieved.length > 0 && (
                      <span className="ml-1 text-muted">（{row.achieved.map((d) => d.name).join("、")}）</span>
                    )}
                  </p>
                  {row.shortages.length > 0 && (
                    <ul className="mt-0.5 space-y-0.5 text-[11px] text-muted">
                      {row.shortages.map((s, i) => (
                        <li key={i}>
                          未達: {s.dependent.name}（{s.dependent.relation || "続柄未入力"}）
                          {year}年の送金 {formatYenAmount(s.total)} ／ 目標 {formatYenAmount(s.target)}
                          （あと {formatYenAmount(Math.max(0, s.target - s.total))}）
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void downloadOne(row, "年末調整時")}
                    disabled={busy !== null || row.achieved.length === 0}
                    title={row.achieved.length === 0 ? "送金が目標額に達した扶養親族がいません" : undefined}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-40"
                  >
                    {busy === `${row.worker.id}-年末調整時` ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                    年末調整用
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadOne(row, "入社時")}
                    disabled={busy !== null}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-border bg-surface px-3 text-xs font-bold text-brand disabled:opacity-40"
                  >
                    {busy === `${row.worker.id}-入社時` ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                    入社時（全員記載）
                  </button>
                  <Link
                    href={`/workers/${row.worker.id}/dependents-form?kind=year-end&year=${year}`}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-border px-3 text-xs font-bold text-muted"
                  >
                    <FileText size={13} />
                    内容を見て作成
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
