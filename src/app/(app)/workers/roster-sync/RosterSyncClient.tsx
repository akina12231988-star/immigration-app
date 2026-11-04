"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, Loader2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { errorMessage } from "@/lib/errors";
import { readXlsx } from "@/lib/xlsx-read";
import { matchRoster, parseRosterSheets, type RosterMatch, type RosterWorker } from "@/lib/roster-sync";

type Matched = Extract<RosterMatch, { worker: RosterWorker }>;
const isMatched = (m: RosterMatch): m is Matched => m.worker !== null;
const changed = (m: Matched) => m.officeChanged || m.residenceChanged;

// 在籍名簿（請求書作成で書き出したエクセル）を読み込み、「配属先」「居住について」が
// 外国人詳細と違う人を並べて、選んだ人だけ外国人詳細に反映する
export function RosterSyncClient({ workers }: { workers: RosterWorker[] }) {
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [matches, setMatches] = useState<RosterMatch[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setDone(null);
    setFileName(file.name);
    try {
      const entries = parseRosterSheets(await readXlsx(await file.arrayBuffer()));
      if (entries.length === 0) {
        setError("名簿の行が見つかりませんでした。「氏名」「配属先」「居住について」の見出しがある在籍名簿のエクセルか確認してください。");
        setMatches(null);
        return;
      }
      const m = matchRoster(entries, workers);
      setMatches(m);
      setSelected(new Set(m.filter(isMatched).filter(changed).map((x) => x.worker.id)));
    } catch (err) {
      setError(errorMessage(err, "エクセルを読み込めませんでした（.xlsx か確認してください）"));
      setMatches(null);
    }
  };

  const matched = useMemo(() => (matches ?? []).filter(isMatched), [matches]);
  const changes = matched.filter(changed);
  const notFound = (matches ?? []).filter((m): m is Extract<RosterMatch, { worker: null }> => m.worker === null);

  const apply = async () => {
    setBusy(true);
    setError(null);
    let n = 0;
    try {
      for (const m of changes) {
        if (!selected.has(m.worker.id)) continue;
        await updateWorker(createClient(), m.worker.id, {
          ...(m.officeChanged ? { assigned_office: m.entry.office } : {}),
          ...(m.residenceChanged ? { residence_note: m.entry.residence } : {}),
        });
        n++;
      }
      setDone(n);
      setMatches(null);
      router.refresh();
    } catch (err) {
      setError(`${n}名まで反映したところで止まりました: ${errorMessage(err, "保存に失敗しました")}`);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const cell = (before: string | null, after: string, isChanged: boolean) =>
    isChanged ? (
      <span>
        <span className="text-muted line-through">{before || "（空）"}</span>
        <span className="mx-1 text-muted">→</span>
        <b className="text-brand">{after}</b>
      </span>
    ) : (
      <span className="text-muted">{after || before || "—"}</span>
    );

  return (
    <div className="space-y-4 px-4 pt-4 lg:px-8">
      <p className="text-[11px] leading-relaxed text-muted">
        請求書作成で書き出した在籍名簿（エクセル）の「配属先」「居住について」を、外国人詳細の「配属先営業所」「居住先」に反映します。
        外国人は在留カード番号で照合し、番号が合わないときは氏名で照合します。名簿で空の欄は変えません。
        今の値と違う人だけが一覧に出るので、確かめてから「反映する」を押してください。
      </p>

      <Card className="p-0">
        <FileDropArea onFiles={(files) => void load(files[0])} className="rounded-2xl p-4">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-6 text-center text-sm text-muted hover:border-brand">
            <FileSpreadsheet size={28} className="text-brand" />
            <span className="font-bold text-brand">在籍名簿のエクセル（.xlsx）を選ぶ</span>
            <span className="text-[11px]">この枠にドラッグ＆ドロップしても読み込めます。所属機関ごとのシートが複数あっても全部読みます。</span>
            {fileName && <span className="text-xs text-foreground">読み込んだファイル: {fileName}</span>}
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => void load(e.target.files?.[0])}
            />
          </label>
        </FileDropArea>
      </Card>

      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}
      {done !== null && (
        <p className="flex items-center gap-2 rounded-lg bg-status-approved-bg px-3 py-2 text-sm font-bold text-status-approved-fg">
          <CheckCircle2 size={16} />
          {done}名の配属先・居住を外国人詳細に反映しました。
        </p>
      )}

      {matches && (
        <>
          <p className="text-xs font-bold text-muted">
            名簿 {matches.length}名 ／ 照合できた {matched.length}名（うち変わる {changes.length}名）
            {notFound.length > 0 && <span className="text-seal"> ／ 照合できない {notFound.length}名</span>}
          </p>

          {changes.length === 0 ? (
            <Card className="p-4 text-sm text-muted">配属先・居住が外国人詳細と違う人はいません（反映は不要です）。</Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={changes.every((m) => selected.has(m.worker.id))}
                        onChange={(e) => setSelected(e.target.checked ? new Set(changes.map((m) => m.worker.id)) : new Set())}
                        className="h-4 w-4"
                        aria-label="すべて選ぶ"
                      />
                    </th>
                    <th className="px-2 py-2">氏名</th>
                    <th className="px-2 py-2">配属先</th>
                    <th className="px-2 py-2">居住について</th>
                    <th className="px-2 py-2">照合</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((m) => (
                    <tr key={m.worker.id} className="border-b border-border/60">
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected.has(m.worker.id)} onChange={() => toggle(m.worker.id)} className="h-4 w-4" />
                      </td>
                      <td className="px-2 py-2">
                        <Link href={`/workers/${m.worker.id}`} target="_blank" className="font-bold hover:text-brand hover:underline">
                          {m.worker.name}
                        </Link>
                        <span className="block text-[11px] text-muted">{m.entry.sheet}</span>
                      </td>
                      <td className="px-2 py-2">{cell(m.worker.assigned_office, m.entry.office, m.officeChanged)}</td>
                      <td className="px-2 py-2">{cell(m.worker.residence_note, m.entry.residence, m.residenceChanged)}</td>
                      <td className="px-2 py-2 text-xs text-muted">{m.by === "card" ? "在留カード番号" : "氏名"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {notFound.length > 0 && (
            <Card className="p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-seal">
                <TriangleAlert size={14} />
                照合できなかった人（反映しません）
              </p>
              <ul className="space-y-0.5 text-xs text-muted">
                {notFound.map((m, i) => (
                  <li key={i}>
                    {m.entry.name}（{m.entry.sheet}・在留カード番号 {m.entry.cardNo || "なし"}）: {m.reason}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {changes.length > 0 && (
            <button
              type="button"
              onClick={() => void apply()}
              disabled={busy || selected.size === 0}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-brand-foreground disabled:opacity-50"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              {busy ? "反映中…" : `選んだ ${[...selected].filter((id) => changes.some((m) => m.worker.id === id)).length}名に反映する`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
