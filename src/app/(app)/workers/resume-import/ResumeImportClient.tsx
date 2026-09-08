"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, ExternalLink, FileSearch, Loader2, UserPlus, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { createClient } from "@/lib/supabase/client";
import { extractPdfTextLines } from "@/lib/pdf-text-lines";
import {
  getWorkerWithHistories,
  insertWorker,
  updateWorker,
  type WorkerWithOrg,
} from "@/lib/supabase/queries/workers";
import { blankWorkerInput } from "@/lib/worker-defaults";
import { uploadOnboardingDoc } from "@/lib/onboarding-files";
import { onboardingDocDefs } from "@/lib/onboarding";
import { todayStr } from "@/lib/ssw/calc";
import { errorMessage } from "@/lib/errors";
import {
  extractRirekiPayload,
  findRirekiMatches,
  rirekiPreviewRows,
  rirekiToWorkHistories,
  rirekiToWorkerPatch,
  type RirekiPayload,
} from "@/lib/rireki-import";

const LANG_LABEL: Record<string, string> = {
  ja: "日本語",
  vi: "ベトナム語",
  id: "インドネシア語",
  km: "クメール語",
  tl: "タガログ語",
  en: "英語",
};

// 履歴書PDFを落とすと中身を読み取り、確認してから外国人に登録する。
//   ・同じ氏名の人が登録済みなら「この人を更新」を選べる（生年月日も一致する人が先頭）
//   ・新しく登録するときは氏名・生年月日・国籍・在留資格・住所・職歴を入れて登録する
//   ・PDFそのものは入社書類の「履歴書」として保存できる
export function ResumeImportClient({ workers }: { workers: WorkerWithOrg[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [payload, setPayload] = useState<RirekiPayload | null>(null);
  const [target, setTarget] = useState<"new" | string>("new"); // 'new' か 登録済みの外国人ID
  const [savePdf, setSavePdf] = useState(true);
  const [done, setDone] = useState<{ id: string; name: string; created: boolean; histories: number } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => (payload ? findRirekiMatches(payload, workers) : []), [payload, workers]);
  const preview = useMemo(() => (payload ? rirekiPreviewRows(payload) : []), [payload]);
  const histories = useMemo(() => (payload ? rirekiToWorkHistories(payload) : []), [payload]);

  // PDFを読み取って埋め込みデータを取り出す
  const onFile = async (f: File) => {
    setBusy(true);
    setError(null);
    setDone(null);
    setPayload(null);
    setFile(f);
    try {
      const data = await f.arrayBuffer();
      // pdfjs は渡したバッファを持っていってしまうのでコピーを渡す
      const lines = await extractPdfTextLines(data.slice(0));
      const p = extractRirekiPayload(lines.map((l) => l.text).join("\n"));
      if (!p) {
        setError(
          "このPDFには履歴書ツールの埋め込みデータがありません。履歴書ツール（/resume）で「PDFを開く」→ PDF保存したファイルを使ってください（画像として保存したPDFやスキャンは読めません）。",
        );
        return;
      }
      setPayload(p);
      const m = findRirekiMatches(p, workers);
      // 生年月日まで一致する人がいればその人を、居なければ新規を選んでおく
      setTarget(m.length > 0 && m[0].sameBirth ? m[0].worker.id : "new");
    } catch (err) {
      setError(errorMessage(err, "PDFの読み取りに失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!payload || !file) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const patch = rirekiToWorkerPatch(payload);
      let workerId: string;
      let created = false;
      let addedHistories = 0;
      if (target === "new") {
        const w = await insertWorker(supabase, { ...blankWorkerInput(payload.basic.name), ...patch });
        workerId = w.id;
        created = true;
        if (histories.length > 0) {
          const { error: hErr } = await supabase
            .from("work_histories")
            .insert(histories.map((h) => ({ ...h, worker_id: workerId })));
          if (hErr) throw hErr;
          addedHistories = histories.length;
        }
      } else {
        workerId = target;
        // 登録済みの人は、履歴書に書かれている項目で上書きする（空の項目は触らない）
        await updateWorker(supabase, workerId, patch);
        // 職歴は、同じ会社・同じ開始日の行がまだ無いものだけ足す（二重に増やさない）
        const existing = await getWorkerWithHistories(supabase, workerId);
        const has = new Set(
          (existing?.work_histories ?? []).map((h) => `${h.org_name}|${h.start_date}`),
        );
        const fresh = histories.filter((h) => !has.has(`${h.org_name}|${h.start_date}`));
        if (fresh.length > 0) {
          const { error: hErr } = await supabase
            .from("work_histories")
            .insert(fresh.map((h) => ({ ...h, worker_id: workerId })));
          if (hErr) throw hErr;
          addedHistories = fresh.length;
        }
      }
      // PDFを入社書類の「履歴書」として保存する
      if (savePdf) {
        const def = onboardingDocDefs(todayStr()).find((d) => d.key === "rirekisho");
        if (def) await uploadOnboardingDoc(workerId, def, file);
      }
      setDone({ id: workerId, name: payload.basic.name, created, histories: addedHistories });
      setPayload(null);
      setFile(null);
    } catch (err) {
      setError(errorMessage(err, "取り込みに失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  // 本人に送る履歴書ツールのURL（このシステムの /resume。ログイン不要）
  const toolUrl = typeof window === "undefined" ? "/resume" : `${window.location.origin}/resume`;
  const copyToolUrl = async () => {
    try {
      await navigator.clipboard.writeText(toolUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1600);
    } catch {
      window.prompt("このURLをコピーして本人に送ってください", toolUrl);
    }
  };

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
        <FileSearch size={14} className="mt-0.5 shrink-0" />
        履歴書ツールで本人が作った履歴書PDFを落とすと、書かれている内容を読み取って外国人に登録します。
        同じ氏名の人が登録済みなら、その人の更新もできます。PDFは入社書類の「履歴書」としても保存されます。
      </p>

      {/* 本人へ送るツールのURL */}
      <Card className="space-y-2 p-4">
        <p className="text-sm font-bold">履歴書ツール（本人がスマホで入力する画面）</p>
        <p className="text-xs leading-relaxed text-muted">
          このURLを本人に送ると、ログインなしで6言語（日本語・インドネシア語・ベトナム語・クメール語・タガログ語・英語）の画面から
          日本語の履歴書PDFを作れます。できたPDFをここに落として取り込みます。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-background px-3 py-2 text-xs">{toolUrl}</code>
          <Button variant="secondary" onClick={copyToolUrl} icon={<Copy size={16} />}>
            {copiedUrl ? "コピーしました" : "URLをコピー"}
          </Button>
          <a
            href="/resume"
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-bold"
          >
            <ExternalLink size={16} />
            ツールを開く
          </a>
        </div>
      </Card>

      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {done && (
        <Card className="space-y-2 p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-status-approved-fg">
            <CheckCircle2 size={16} />
            {done.name} を{done.created ? "新しく登録しました" : "更新しました"}
            {done.histories > 0 && `（職歴 ${done.histories}件を追加）`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/workers/${done.id}`}
              className="inline-flex min-h-[40px] items-center rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground"
            >
              外国人詳細を開く
            </Link>
            <Button variant="secondary" onClick={() => setDone(null)}>
              続けて別のPDFを取り込む
            </Button>
          </div>
        </Card>
      )}

      <FileDropArea
        onFiles={(files) => {
          if (!busy && files.length > 0) void onFile(files[0]);
        }}
        disabled={busy}
        className="rounded-xl border border-dashed border-border bg-surface p-4"
        title="履歴書PDFをここにドロップすると読み取ります"
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
          <Button
            icon={busy ? <Loader2 size={16} className="animate-spin" /> : <FileSearch size={16} />}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "読み取り中…" : "履歴書PDFを選ぶ"}
          </Button>
          <span className="text-xs text-muted">
            {file ? `${file.name} を読み取りました` : "ここに履歴書PDFをドロップできます"}
          </span>
        </div>
      </FileDropArea>

      {payload && (
        <Card className="space-y-4 p-4">
          <div>
            <p className="mb-2 text-sm font-bold">
              読み取った内容
              <span className="ml-2 text-[11px] font-normal text-muted">
                入力した言語: {LANG_LABEL[payload.sourceLang] ?? payload.sourceLang}
                {payload.generatedAt && ` ・ 作成 ${payload.generatedAt.slice(0, 10)}`}
              </span>
            </p>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              {preview.map((r) => (
                <div key={r.label} className="flex gap-2">
                  <dt className="w-28 shrink-0 text-muted">{r.label}</dt>
                  <dd className="min-w-0 flex-1 break-words font-bold">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-bold text-muted">職歴（{histories.length}件）</p>
            {histories.length === 0 ? (
              <p className="text-xs text-muted">職歴は書かれていません。</p>
            ) : (
              <ul className="space-y-0.5 text-xs">
                {histories.map((h, i) => (
                  <li key={i}>
                    {h.start_date} 〜 {h.end_date ?? "継続中"}　{h.org_name || "（会社名なし）"}
                    {h.role && `　${h.role}`}　<span className="text-muted">{h.visa}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {payload.families.length > 0 && (
            <p className="text-[11px] text-muted">
              家族構成（{payload.families.length}件）は履歴書PDFにだけ残ります（外国人詳細には取り込みません）。
            </p>
          )}

          {/* 新規か、登録済みの人の更新か */}
          <div>
            <p className="mb-1 text-[11px] font-bold text-muted">登録先</p>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="target" checked={target === "new"} onChange={() => setTarget("new")} />
                <UserPlus size={14} />
                新しく登録する
              </label>
              {matches.map((m) => (
                <label key={m.worker.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="target"
                    checked={target === m.worker.id}
                    onChange={() => setTarget(m.worker.id)}
                  />
                  <Users size={14} />
                  登録済みの <b>{m.worker.name}</b>
                  <span className="text-xs text-muted">
                    {m.worker.birth ? `（生年月日 ${m.worker.birth}${m.sameBirth ? "・一致" : "・違う"}）` : "（生年月日 未登録）"}
                    {m.worker.organizations?.name && ` ${m.worker.organizations.name}`}
                  </span>
                  を更新する
                </label>
              ))}
            </div>
            {matches.length > 0 && target !== "new" && (
              <p className="mt-1 text-[11px] text-muted">
                更新では、履歴書に書かれている項目だけを上書きします。職歴は同じ会社・同じ開始日の行が無いものだけ足します。
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={savePdf} onChange={(e) => setSavePdf(e.target.checked)} />
            このPDFを入社書類の「履歴書」として保存する
          </label>

          <Button
            icon={busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            disabled={busy}
            onClick={() => void run()}
          >
            {busy ? "取り込み中…" : target === "new" ? "新しく登録する" : "この人を更新する"}
          </Button>
        </Card>
      )}
    </div>
  );
}
