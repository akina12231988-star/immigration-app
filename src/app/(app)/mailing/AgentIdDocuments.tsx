"use client";

import { useEffect, useRef, useState } from "react";
import { IdCard, Loader2, Printer, Trash2, Upload } from "lucide-react";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { listMailingAgentDocuments } from "@/lib/supabase/queries/mailing-agent-docs";
import { docsForAgent, type MailingAgentDocument } from "@/lib/mailing-agent-docs";
import { createAgentDocTicket, deleteAgentDoc, getAgentDocPreviewUrl, registerAgentDoc } from "./actions";

// 郵送請求の代理人の身分証明書。代理人の名前に登録した本人確認書類（運転免許証の写しなど）を
// その場で開いて印刷できる。まだ無ければここから登録する（名前ごとに保存され、次回から出る）
export function AgentIdDocuments({ agentName, canEdit }: { agentName: string; canEdit: boolean }) {
  const [docs, setDocs] = useState<MailingAgentDocument[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    listMailingAgentDocuments(createClient())
      .then((rows) => {
        if (!cancelled) setDocs(rows);
      })
      // 0186 未適用でも画面は壊さない（登録しようとしたときにマイグレーションの案内が出る）
      .catch(() => {
        if (!cancelled) setDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const name = agentName.trim();
  if (!name) return null;
  const mine = docsForAgent(docs ?? [], name);

  const open = async (d: MailingAgentDocument) => {
    setError(null);
    const res = await getAgentDocPreviewUrl(d.id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  };
  // 全部を順に別タブで開く（ブラウザの印刷でまとめて印刷できる）
  const openAll = async () => {
    for (const d of mine) await open(d);
  };
  const upload = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        const { blob, mimeType, fileName } = await compressImage(file);
        const ticket = await createAgentDocTicket(fileName, mimeType);
        if (!ticket.ok) throw new Error(ticket.message);
        const { error: upErr } = await createClient()
          .storage.from("app-files")
          .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
        if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
        const res = await registerAgentDoc(name, label, ticket.path, fileName, mimeType);
        if (!res.ok) throw new Error(res.message);
        setDocs((prev) => [
          ...(prev ?? []),
          {
            id: res.id,
            agent_name: name,
            label: label.trim(),
            storage_path: ticket.path,
            file_name: fileName,
            mime_type: mimeType,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      setLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (d: MailingAgentDocument) => {
    if (!window.confirm(`「${d.label || d.file_name}」を削除しますか？`)) return;
    const res = await deleteAgentDoc(d.id);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setDocs((prev) => (prev ?? []).filter((x) => x.id !== d.id));
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold">
        <IdCard size={15} />
        {name} の身分証明書（郵送請求に同封する写し）
      </p>
      {docs === null ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted">
          <Loader2 size={12} className="animate-spin" />
          読み込み中…
        </p>
      ) : mine.length === 0 ? (
        <p className="mt-1 text-[11px] text-muted">
          まだ登録がありません。{canEdit ? "下から身分証明書の画像・PDF を登録すると、次回からここに出ます。" : ""}
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {mine.map((d) => (
            <span key={d.id} className="inline-flex items-center gap-1 rounded-lg border border-brand bg-brand/5 px-2 py-1 text-xs">
              <button type="button" onClick={() => void open(d)} className="inline-flex items-center gap-1 font-bold text-brand">
                <Printer size={13} />
                {d.label || d.file_name}
              </button>
              {canEdit && (
                <button type="button" onClick={() => void remove(d)} aria-label={`${d.label || d.file_name}を削除`} className="text-muted">
                  <Trash2 size={12} />
                </button>
              )}
            </span>
          ))}
          {mine.length > 1 && (
            <button
              type="button"
              onClick={() => void openAll()}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-brand px-2.5 text-xs font-bold text-brand-foreground"
            >
              <Printer size={13} />
              すべて開いて印刷
            </button>
          )}
          <span className="w-full text-[10px] text-muted">押すと別タブで開きます。ブラウザの印刷（Ctrl+P／⌘P）で印刷してください。</span>
        </div>
      )}
      {canEdit && (
        <FileDropArea
          onFiles={(list) => void upload(list)}
          disabled={busy}
          className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-2 py-1.5"
          title="身分証明書の画像・PDF をここに落としても登録できます"
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="書類の種類（例: 運転免許証（表））"
            className="min-h-[32px] w-48 rounded-lg border border-border bg-background px-2 text-xs"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-bold text-brand disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {busy ? "登録中…" : "身分証明書を登録"}
          </button>
          <span className="text-[10px] text-muted">画像・PDF をドロップでも可</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
        </FileDropArea>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-seal/10 px-3 py-1.5 text-xs text-seal">
          {error}
        </p>
      )}
    </div>
  );
}
