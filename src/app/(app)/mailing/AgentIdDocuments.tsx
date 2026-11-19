"use client";

import { useEffect, useRef, useState } from "react";
import { IdCard, Loader2, Printer, Trash2, Upload } from "lucide-react";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { listMailingAgentDocuments } from "@/lib/supabase/queries/mailing-agent-docs";
import { docsForAgent, type MailingAgentDocument } from "@/lib/mailing-agent-docs";
import { createAgentDocTicket, deleteAgentDoc, getAgentDocPreviewUrl, registerAgentDoc } from "./actions";
import { getAppSetting, setAppSetting } from "@/lib/supabase/queries/app-settings";
import {
  NOZEI3_AGENTS_SETTING_KEY,
  findSavedAgent,
  normalizeSavedAgents,
  upsertSavedAgent,
  type SavedAgent,
} from "@/lib/nozei3-form";

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
      <AgentProfileFields agentName={name} canEdit={canEdit} />
      <p className="mt-3 flex items-center gap-1.5 text-xs font-bold">
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

// 代理人の住所・生年月日・電話番号（代理人の名前ごとに登録。自治体の申請書の代理人の欄に入る）。
// 納税証明書その3の代理人と同じ登録（app_settings の mailing_agents）を使う
function AgentProfileFields({ agentName, canEdit }: { agentName: string; canEdit: boolean }) {
  const [all, setAll] = useState<SavedAgent[] | null>(null);
  const [draft, setDraft] = useState<{ kana: string; address: string; birth: string; phone: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getAppSetting(createClient(), NOZEI3_AGENTS_SETTING_KEY)
      .then((v) => {
        if (!cancelled) setAll(normalizeSavedAgents(v));
      })
      .catch(() => {
        if (!cancelled) setAll([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // 名前が変わったら、その人の登録を入力欄に出し直す
  const saved = all ? findSavedAgent(all, agentName) : null;
  const [draftFor, setDraftFor] = useState("");
  if (all && draftFor !== agentName) {
    setDraftFor(agentName);
    setDraft({ kana: saved?.kana ?? "", address: saved?.address ?? "", birth: saved?.birth ?? "", phone: saved?.phone ?? "" });
    setMsg(null);
  }
  if (!all || !draft) return null;
  const changed =
    draft.kana !== (saved?.kana ?? "") ||
    draft.address !== (saved?.address ?? "") || draft.birth !== (saved?.birth ?? "") || draft.phone !== (saved?.phone ?? "");
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      // 保存の直前に読み直して、ほかの代理人の登録を消さないようにする
      const latest = normalizeSavedAgents(await getAppSetting(createClient(), NOZEI3_AGENTS_SETTING_KEY));
      const next = upsertSavedAgent(latest, { name: agentName, kana: draft.kana, address: draft.address, birth: draft.birth, phone: draft.phone });
      await setAppSetting(createClient(), NOZEI3_AGENTS_SETTING_KEY, { agents: next });
      setAll(next);
      setMsg("保存しました");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };
  const input = "min-h-[34px] rounded-md border border-border bg-background px-2 text-xs";
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-bold">{agentName} の情報（申請書の代理人の欄に入ります）</p>
      <div className="flex flex-wrap gap-2 text-[11px]">
        <label className="flex flex-col gap-0.5">
          <span className="text-muted">フリガナ</span>
          <input
            value={draft.kana}
            readOnly={!canEdit}
            placeholder="ノグチ アキナ"
            onChange={(e) => setDraft({ ...draft, kana: e.target.value })}
            className={`${input} w-40`}
          />
        </label>
        <label className="flex min-w-[14rem] flex-1 flex-col gap-0.5">
          <span className="text-muted">住所</span>
          <input
            value={draft.address}
            readOnly={!canEdit}
            onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-muted">生年月日</span>
          <input
            type="date"
            value={draft.birth}
            readOnly={!canEdit}
            onChange={(e) => setDraft({ ...draft, birth: e.target.value })}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-muted">電話番号</span>
          <input
            value={draft.phone}
            readOnly={!canEdit}
            inputMode="tel"
            placeholder="080-1234-5678"
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            className={`${input} w-36`}
          />
        </label>
      </div>
      {canEdit && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !changed}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : null}
            代理人の情報を保存
          </button>
          {msg && <span className="text-[11px] text-muted">{msg}</span>}
          {!saved && <span className="text-[11px] text-muted">まだ登録されていません（保存すると次回から出ます）</span>}
        </div>
      )}
    </div>
  );
}
