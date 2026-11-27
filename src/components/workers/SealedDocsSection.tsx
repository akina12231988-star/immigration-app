"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Printer, Save } from "lucide-react";
import { RefFormRowBar, RefFormTemplatesDialog, refFormHref, useRefFormTemplates } from "@/components/ref-forms/RefFormPanel";
import { languageForNationality, pickRefFormTemplate, refFormName } from "@/lib/ref-form";
import { createClient } from "@/lib/supabase/client";
import { listWorkerSealedDocs, upsertWorkerSealedDoc } from "@/lib/supabase/queries/sealed-docs";
import { mergePdfParts, rasterizePdfInBrowser, type PdfPart } from "@/lib/pdf-merge";

// 会社に印鑑をもらう書類のキー（参考様式のキーと同じ）
const SEALED_DOC_KEYS = ["shien-itaku", "t1-5", "t1-6-1"] as const;

// 会社に必ず印鑑をもらう書類（支援委託契約書・特定技能雇用契約書・雇用条件書）。
// どれも2部印刷して（1部は会社の控え）、押印してもらったらスキャンをドライブに置き、
// そのリンクをここに貼って残す。ひな形・記入位置は参考様式と同じ仕組み
export function SealedDocsSection({
  workerId,
  nationality,
  orgId,
  orgName,
  todoNo,
  canEdit,
}: {
  workerId: string;
  nationality: string;
  orgId: string | null;
  orgName: string;
  todoNo: string;
  canEdit: boolean;
}) {
  const refForms = useRefFormTemplates();
  const [managing, setManaging] = useState<string | null>(null);
  const [off, setOff] = useState<string[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [sealed, setSealed] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadNote, setLoadNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // クライアントの生成も非同期の中で行う（設定が無い環境でも画面ごと落とさない）。
    // 読み込んだ値を手元に写すだけ（外部の保存場所と同期する）
    void (async () => {
      const rows = await listWorkerSealedDocs(createClient(), workerId);
      if (cancelled) return;
      setLinks(Object.fromEntries(rows.map((r) => [r.kind, r.drive_url])));
      setSealed(Object.fromEntries(rows.map((r) => [r.kind, r.sealed])));
    })().catch(() => {
      if (cancelled) return;
      setLoadNote("押印後のリンクの保存には、マイグレーション 0237_sealed_docs.sql の適用が必要です");
    });
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  const saveLink = async (kind: string) => {
    const v = (drafts[kind] ?? links[kind] ?? "").trim();
    setBusy(`save-${kind}`);
    setError(null);
    try {
      await upsertWorkerSealedDoc(createClient(), workerId, kind, { drive_url: v });
      setLinks((cur) => ({ ...cur, [kind]: v }));
      setDrafts((cur) => {
        const next = { ...cur };
        delete next[kind];
        return next;
      });
    } catch (e) {
      setError(`リンクを保存できませんでした: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  // 「会社の印鑑をもらった」のチェック（書類ごとのチェックリスト）
  const toggleSealed = async (kind: string, v: boolean) => {
    setBusy(`seal-${kind}`);
    setError(null);
    try {
      await upsertWorkerSealedDoc(createClient(), workerId, kind, { sealed: v });
      setSealed((cur) => ({ ...cur, [kind]: v }));
    } catch (e) {
      setError(`チェックを保存できませんでした: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  // 同じ書類を2部つなげた PDF を作って新しいタブで開く（1回の印刷で2部出る）
  const printTwo = async (kind: string) => {
    setError(null);
    const w = window.open("", "_blank");
    if (!w) {
      setError("新しいタブを開けませんでした。ブラウザのポップアップの許可をご確認ください。");
      return;
    }
    w.document.write("<p style='font-family:sans-serif;padding:24px'>2部ぶんの PDF を作っています…</p>");
    setBusy(`print-${kind}`);
    try {
      const res = await fetch(refFormHref(workerId, [kind], "all", off, todoNo));
      if (!res.ok) throw new Error(`${refFormName(kind)}を作れませんでした`);
      const bytes = await res.arrayBuffer();
      const part = (n: number): PdfPart => ({ kind: "pdf", bytes: bytes.slice(0), name: `${refFormName(kind)}（${n}部目）` });
      const merged = await mergePdfParts([part(1), part(2)], { rasterize: rasterizePdfInBrowser });
      w.location.href = URL.createObjectURL(new Blob([merged as BlobPart], { type: "application/pdf" }));
    } catch (e) {
      w.close();
      setError(e instanceof Error ? e.message : "PDF を作れませんでした");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-brand/40 bg-brand/5 p-2 text-[11px]">
      <p className="font-bold text-brand">
        🖨 会社に印鑑をもらう書類（2部印刷・1部は会社の控え）
        <span className={`ml-1 rounded-full px-2 py-0.5 ${SEALED_DOC_KEYS.every((k) => sealed[k]) ? "bg-status-approved-bg text-status-approved-fg" : "bg-seal/10 text-seal"}`}>
          印鑑 {SEALED_DOC_KEYS.filter((k) => sealed[k]).length}/{SEALED_DOC_KEYS.length}件
        </span>
        <span className="ml-1 font-normal text-muted">
          支援委託契約書・特定技能雇用契約書（1-5号）・雇用条件書（1-6号）は会社の印鑑が必要です。「2部まとめて印刷」で同じ書類が2部つながった
          PDF が出ます。押印してもらったらスキャンをドライブに置き、リンクを貼って保存してください。
        </span>
      </p>
      {loadNote && <p className="font-bold text-seal">{loadNote}</p>}
      {SEALED_DOC_KEYS.map((key) => {
        const template = pickRefFormTemplate(refForms.templates, key, nationality, orgId);
        const link = links[key] ?? "";
        const draft = drafts[key] ?? link;
        return (
          <div key={key} className="flex flex-col gap-1">
            <RefFormRowBar
              formKey={key}
              workerId={workerId}
              nationality={nationality}
              orgId={orgId}
              orgName={orgName}
              templates={refForms.templates}
              canEdit={canEdit}
              onManage={() => setManaging(key)}
              off={off}
              onOffChange={setOff}
              todoNo={todoNo}
            />
            <div className="flex flex-wrap items-center gap-1.5 pl-2">
              <button
                type="button"
                onClick={() => void printTwo(key)}
                disabled={busy != null || !template}
                title={template ? "同じ書類を2部つなげたPDFを開きます" : "ひな形を登録すると押せます"}
                className="inline-flex min-h-[30px] items-center gap-1 rounded-lg bg-brand px-2.5 font-bold text-brand-foreground disabled:opacity-40"
              >
                {busy === `print-${key}` ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
                2部まとめて印刷
              </button>
              <label className={`inline-flex min-h-[30px] items-center gap-1 rounded-lg border px-2 font-bold ${sealed[key] ? "border-status-approved-fg/40 bg-status-approved-bg text-status-approved-fg" : "border-seal/40 bg-seal/5 text-seal"}`}>
                <input
                  type="checkbox"
                  checked={!!sealed[key]}
                  disabled={!canEdit || busy != null || loadNote != null}
                  onChange={(e) => void toggleSealed(key, e.target.checked)}
                  className="size-4"
                />
                会社の印鑑をもらった
              </label>
              <span className="font-bold text-muted">押印後の控え:</span>
              <input
                value={draft}
                onChange={(e) => setDrafts((cur) => ({ ...cur, [key]: e.target.value }))}
                placeholder="Google ドライブなどのリンクを貼る"
                disabled={!canEdit || loadNote != null}
                className="min-h-[30px] w-full flex-1 rounded-lg border border-border bg-surface px-2 sm:w-auto"
              />
              <button
                type="button"
                onClick={() => void saveLink(key)}
                disabled={!canEdit || busy != null || loadNote != null || draft.trim() === link}
                className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-brand px-2 font-bold text-brand disabled:opacity-40"
              >
                {busy === `save-${key}` ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                保存
              </button>
              {link && (
                <a href={link} target="_blank" rel="noreferrer" className="inline-flex min-h-[30px] items-center gap-1 font-bold text-brand underline">
                  <ExternalLink size={12} />
                  開く
                </a>
              )}
              {!link && !loadNote && <span className="font-bold text-seal">リンク未登録</span>}
            </div>
          </div>
        );
      })}
      {refForms.error && <p className="text-seal">{refForms.error}</p>}
      {error && (
        <p role="alert" className="font-bold text-seal">
          {error}
        </p>
      )}
      {managing && (
        <RefFormTemplatesDialog
          formKey={managing}
          formLabel={refFormName(managing)}
          templates={refForms.templates}
          defaultLanguage={managing === "shien-itaku" ? "日本語" : languageForNationality(nationality) || "日本語"}
          orgId={orgId}
          orgName={orgName}
          onClose={() => setManaging(null)}
          onChanged={refForms.reload}
        />
      )}
    </div>
  );
}
