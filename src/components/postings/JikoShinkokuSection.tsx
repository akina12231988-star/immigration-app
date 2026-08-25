"use client";

import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createPostingFileTicket,
  registerPostingFile,
} from "@/app/(app)/postings/file-actions";
import { PostingFileAttachments } from "@/components/postings/PostingFileAttachments";
import { fileSaveMessage, saveOrShareFile } from "@/lib/file-save";
import { dbErrorMessage } from "@/lib/errors";

export const JIKO_SHINKOKU_KIND = "自己申告書";

// 求人不受理に係る自己申告書（様式例第7号）。
// 事業所名・所在地・代表者名は所属機関の登録内容、右上の年月日は求人の受付年月日が入る。
// チェックシートは全て空欄で作る（1つでも該当すると求人不受理になるため）。
export function JikoShinkokuSection({
  postingId,
  orgName,
  orgAddress,
  repName,
  dateOn,
  canEdit,
}: {
  postingId: string;
  orgName: string;
  orgAddress: string;
  repName: string;
  dateOn: string;
  canEdit: boolean;
}) {
  const [busy, setBusy] = useState<"attach" | "download" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [reload, setReload] = useState(0);

  const missing = [
    !orgName && "事業所名",
    !orgAddress && "事業所所在地",
    !repName && "代表者名",
  ].filter(Boolean) as string[];

  const build = async (): Promise<{ blob: Blob; fileName: string }> => {
    const res = await fetch("/api/posting-doc-pdf", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postingId, kind: JIKO_SHINKOKU_KIND }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "自己申告書の作成に失敗しました");
    }
    const blob = await res.blob();
    const cd = res.headers.get("content-disposition") ?? "";
    const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
    return { blob, fileName: m ? decodeURIComponent(m[1]) : "自己申告書.pdf" };
  };

  // 作って、この求人の添付データとして保存する
  const createAndAttach = async () => {
    setBusy("attach");
    setMessage(null);
    try {
      const { blob, fileName } = await build();
      const ticket = await createPostingFileTicket(postingId, fileName, "application/pdf");
      if (!ticket.ok) throw new Error(ticket.message);
      const { error } = await createClient()
        .storage.from("app-files")
        .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: "application/pdf" });
      if (error) throw new Error(`アップロードに失敗しました: ${error.message}`);
      const saved = await registerPostingFile(
        postingId,
        JIKO_SHINKOKU_KIND,
        ticket.path,
        fileName,
        "application/pdf",
      );
      if (!saved.ok) throw new Error(saved.message);
      setReload((k) => k + 1);
      setMessage({ ok: true, text: `${fileName} を作ってこの求人に添付しました。` });
    } catch (err) {
      setMessage({
        ok: false,
        text: dbErrorMessage(err, "0094_posting_files.sql", "自己申告書の作成に失敗しました"),
      });
    } finally {
      setBusy(null);
    }
  };

  // 作って、添付せずに保存だけする（スマホは共有シート）
  const downloadOnly = async () => {
    setBusy("download");
    setMessage(null);
    try {
      const { blob, fileName } = await build();
      const result = await saveOrShareFile(blob, fileName, "application/pdf");
      const text = fileSaveMessage(result, fileName);
      if (text) setMessage({ ok: true, text });
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "自己申告書の作成に失敗しました",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-1.5 text-[11px] font-bold text-muted">
        求人不受理に係る自己申告書（様式例第7号）
      </p>
      <p className="mb-2 text-[11px] leading-relaxed text-muted">
        事業所名・事業所所在地・代表者名は所属機関の登録内容、右上の年月日はこの求人の受付年月日（
        {dateOn || "未入力"}）が入ります。チェックシートは全て空欄で作ります（1つでも該当すると求人不受理になるため）。
      </p>
      {missing.length > 0 && (
        <p className="mb-2 rounded-lg bg-status-notice-bg px-2.5 py-1.5 text-[11px] font-bold text-status-notice-fg">
          {missing.join("・")}が未登録です。空欄のまま作られるので、所属機関の登録内容を入れてから作り直してください。
        </p>
      )}
      {message && (
        <p
          role="status"
          className={`mb-2 rounded-lg px-2.5 py-1.5 text-[11px] ${
            message.ok ? "bg-brand/10 text-brand" : "bg-seal/10 text-seal"
          }`}
        >
          {message.text}
        </p>
      )}
      {canEdit && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void createAndAttach()}
            disabled={busy !== null}
            className="flex min-h-[36px] items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-50"
          >
            {busy === "attach" ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
            {busy === "attach" ? "作成中…" : "作成して添付"}
          </button>
          <button
            type="button"
            onClick={() => void downloadOnly()}
            disabled={busy !== null}
            className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-brand px-3 text-xs font-bold text-brand disabled:opacity-50"
          >
            {busy === "download" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Download size={13} />
            )}
            {busy === "download" ? "作成中…" : "ダウンロード（添付しない）"}
          </button>
        </div>
      )}
      <PostingFileAttachments
        key={reload}
        postingId={postingId}
        kind={JIKO_SHINKOKU_KIND}
        addLabel="自己申告書を添付（PDF・画像）"
        canEdit={canEdit}
      />
    </div>
  );
}
