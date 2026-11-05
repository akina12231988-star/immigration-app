"use client";

import { useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateMunicipalityFormUrl } from "@/lib/supabase/queries/tax-cert";
import { dbErrorMessage } from "@/lib/errors";
import type { Municipality } from "@/lib/tax-cert";

type FormColumn = "cert_form_url" | "juminhyo_form_url";

// 請求先の自治体の申請書（交付請求書）をダウンロードするページを開くボタン。
// 自治体マスタに未登録なら、その場でURLを入れて保存できる（自治体マスタに保存され、次からはボタンが出る）
export function MunicipalityFormLink({
  municipality,
  column = "cert_form_url",
  canEdit,
  onSaved,
}: {
  municipality: Municipality | null;
  column?: FormColumn;
  canEdit: boolean;
  onSaved?: (m: Municipality) => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!municipality) return null;
  const url = (municipality[column] ?? "").trim();
  const what = column === "cert_form_url" ? "課税・納税証明書" : "住民票・転出届";

  const save = async () => {
    const v = draft.trim();
    if (!/^https?:\/\//.test(v)) {
      setError("https:// から始まるURLを入れてください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateMunicipalityFormUrl(createClient(), municipality.id, column, v);
      onSaved?.({ ...municipality, [column]: v });
      setDraft("");
    } catch (err) {
      setError(dbErrorMessage(err, "0212_municipality_form_urls.sql", "保存に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground"
          >
            <Download size={14} />
            {municipality.name}の申請書をダウンロード（申請書のページを開く）
          </a>
        ) : (
          <span className="text-[11px] font-bold text-status-notice-fg">
            {municipality.name}の{what}の申請書のページが未登録です
          </span>
        )}
        {municipality.website_url && (
          <a
            href={municipality.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-brand px-2.5 text-xs font-bold text-brand"
          >
            <ExternalLink size={12} />
            {municipality.name}のサイト
          </a>
        )}
      </div>
      {!url && canEdit && (
        <div className="flex gap-1.5">
          <input
            type="url"
            inputMode="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`${municipality.name}の申請書のページのURL（https://...）`}
            className="min-h-[36px] w-full rounded-lg border border-border bg-surface px-2 text-xs focus:border-brand focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !draft.trim()}
            className="shrink-0 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-40"
          >
            {busy ? "保存中…" : "登録"}
          </button>
        </div>
      )}
      {error && <p className="text-[11px] text-seal">{error}</p>}
    </div>
  );
}
