"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { listWorkerDocs, type WorkerDocView } from "@/app/(app)/workers/actions";
import { notifyWorkerDocsChanged } from "@/lib/worker-docs-events";

// 参考様式の作成画面の右に出す「在留カードで確かめる」欄。
// いまの在留カード（外国人詳細の在留カード・指定書でいちばん新しいもの）を見ながら、
// 様式に入る本人の情報（氏名・生年月日・住所など）を確かめ、違っていたらこの場で直して保存する。
// 保存すると外国人詳細の登録も変わり、onSaved で様式を作り直す
const FIELDS = [
  { key: "name", label: "氏名" },
  { key: "kana", label: "フリガナ" },
  { key: "birth", label: "生年月日", type: "date" },
  { key: "gender", label: "性別" },
  { key: "nationality", label: "国籍・地域" },
  { key: "postal_code", label: "郵便番号" },
  { key: "address", label: "住居地" },
  { key: "residence_card_no", label: "在留カード番号" },
  { key: "passport_no", label: "旅券番号" },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];
type Values = Record<FieldKey, string>;

export function WorkerCardCheckPanel({ workerId, onSaved }: { workerId: string; onSaved: () => void }) {
  const [card, setCard] = useState<WorkerDocView | null | undefined>(undefined);
  const [saved, setSaved] = useState<Values | null>(null);
  const [values, setValues] = useState<Values | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listWorkerDocs(workerId)
      .then((rows) => {
        // いちばん新しい在留カード（新しい順に並んでいる）
        if (!cancelled) setCard(rows.find((d) => d.kind === "在留カード") ?? null);
      })
      .catch(() => {
        if (!cancelled) setCard(null);
      });
    void createClient()
      .from("workers")
      .select(FIELDS.map((f) => f.key).join(", "))
      .eq("id", workerId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const row = data as unknown as Record<string, unknown>;
        const v = Object.fromEntries(FIELDS.map((f) => [f.key, typeof row[f.key] === "string" ? (row[f.key] as string) : ""])) as Values;
        setSaved(v);
        setValues(v);
      });
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  const changed = !!values && !!saved && FIELDS.some((f) => values[f.key] !== saved[f.key]);

  async function save() {
    if (!values || !saved) return;
    setBusy(true);
    setMessage(null);
    try {
      const patch: Record<string, string | null> = {};
      for (const f of FIELDS) {
        if (values[f.key] === saved[f.key]) continue;
        // 生年月日は空なら null（日付の列）
        patch[f.key] = f.key === "birth" ? values[f.key] || null : values[f.key].trim();
      }
      await updateWorker(createClient(), workerId, patch as Parameters<typeof updateWorker>[2]);
      setSaved(values);
      notifyWorkerDocsChanged(workerId);
      setMessage({ ok: true, text: "外国人の登録を直しました。様式を作り直しています。" });
      onSaved();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "保存できませんでした" });
    } finally {
      setBusy(false);
    }
  }

  const isPdf = !!card && ((card.mimeType ?? "").includes("pdf") || /\.pdf$/i.test(card.fileName ?? ""));

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      <h2 className="text-sm font-bold">在留カードで確かめる</h2>
      <p className="text-[11px] leading-relaxed text-muted">
        いまの在留カードと、様式に入る本人の情報を見比べてください。違っていたら下で直して「保存」すると、外国人詳細の登録も直り、様式も作り直します。
      </p>
      {/* いまの在留カード */}
      {card === undefined ? (
        <p className="text-xs text-muted">在留カードを読み込み中…</p>
      ) : card === null ? (
        <p className="rounded-lg bg-status-notice-bg px-2 py-1.5 text-xs text-status-notice-fg">
          在留カードの画像が登録されていません（外国人詳細の「在留カード・指定書」で登録できます）。
        </p>
      ) : isPdf ? (
        <a href={card.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand underline">
          <ExternalLink size={12} />
          在留カード（PDF）を開く
        </a>
      ) : (
        <a href={card.url} target="_blank" rel="noopener noreferrer" title="押すと大きく開きます">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.url} alt="在留カード" className="w-full rounded-lg border border-border" />
        </a>
      )}
      {card && <p className="text-[10px] text-muted">登録日 {card.createdAt.slice(0, 10)}（押すと別のタブで大きく開きます）</p>}

      {/* 様式に入る本人の情報（外国人詳細の登録） */}
      {values ? (
        <div className="flex flex-col gap-1.5">
          {FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-xs">
              <span className={`w-24 shrink-0 ${values[f.key] !== saved?.[f.key] ? "font-bold text-brand" : "text-muted"}`}>{f.label}</span>
              <input
                type={"type" in f ? f.type : "text"}
                value={values[f.key]}
                onChange={(e) => setValues((v) => (v ? { ...v, [f.key]: e.target.value } : v))}
                className="min-h-[32px] min-w-0 flex-1 rounded border border-border bg-background px-2"
              />
            </label>
          ))}
          <button
            type="button"
            disabled={!changed || busy}
            onClick={() => void save()}
            className="inline-flex min-h-[40px] items-center justify-center gap-1 rounded-lg bg-brand px-3 text-sm font-bold text-brand-foreground disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            直した所を保存（外国人詳細も変わります）
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted">本人の情報を読み込み中…</p>
      )}
      {message && (
        <p className={`rounded px-2 py-1.5 text-xs ${message.ok ? "bg-status-approved-bg text-status-approved-fg" : "bg-seal/10 text-seal"}`}>
          {message.text}
        </p>
      )}
      <Link href={`/workers/${workerId}`} target="_blank" className="text-xs font-bold text-brand underline">
        外国人詳細を開く（ほかの登録を直すとき）→
      </Link>
    </section>
  );
}
