"use client";

import { useState } from "react";
import { ExternalLink, Save, Upload } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RosterDraftEditor } from "@/components/workers/RosterDraftEditor";
import { getOnboardingRosterDraft, saveOnboardingRosterDraft } from "@/app/(app)/onboarding/actions";
import type { OnboardingDocDef } from "@/lib/onboarding";
import type { RosterDraft } from "@/lib/roster-draft";

// アプリで作る書類（扶養控除等申告書・労働者名簿）の「作成」の共通部分。
//
// 「作成」を押すとまずPDFを作ってプレビューで見せ、内容を確かめてから添付する。
// 労働者名簿は、プレビューの中で中身（業務の種類・履歴・前職・解雇の欄）を直して
// 作り直せる。添付するときに、直した内容は労働者名簿の画面にも保存する。

export interface GeneratedPreview {
  def: OnboardingDocDef;
  label: string;
  file: File;
  url: string;
}

async function fetchDocPdf(
  workerId: string,
  def: OnboardingDocDef,
  label: string,
  roster?: RosterDraft,
): Promise<File> {
  const res = await fetch("/api/onboarding-doc-pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workerId, kind: def.key, roster }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${label}の作成に失敗しました`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const fileName = m ? decodeURIComponent(m[1]) : `${label}.pdf`;
  return new File([blob], fileName, { type: "application/pdf" });
}

export function useGeneratedDocPreview(workerId: string, onError: (message: string) => void) {
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);
  // 労働者名簿のときだけ、直せる中身を持つ（他の書類は null）
  const [rosterDraft, setRosterDraftState] = useState<RosterDraft | null>(null);
  // 欄を直したあと、まだPDFを作り直していないか（添付する前に作り直すため）
  const [dirty, setDirty] = useState(false);
  const setRosterDraft = (d: RosterDraft) => {
    setRosterDraftState(d);
    setDirty(true);
  };
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  // 「作成」: PDFを作ってプレビューを開く
  const create = async (def: OnboardingDocDef, label: string) => {
    setCreatingKey(def.key);
    try {
      let draft: RosterDraft | null = null;
      if (def.key === "meibo") {
        const res = await getOnboardingRosterDraft(workerId);
        if (!res.ok) throw new Error(res.message);
        draft = res.draft;
      }
      const file = await fetchDocPdf(workerId, def, label, draft ?? undefined);
      setRosterDraftState(draft);
      setDirty(false);
      setDraftSavedAt(null);
      setPreview({ def, label, file, url: URL.createObjectURL(file) });
    } catch (err) {
      onError(err instanceof Error ? err.message : `${label}の作成に失敗しました`);
    } finally {
      setCreatingKey(null);
    }
  };

  // プレビューの中で直した内容でPDFを作り直す
  const rebuild = async (): Promise<File | null> => {
    if (!preview || !rosterDraft) return null;
    setRebuilding(true);
    try {
      const file = await fetchDocPdf(workerId, preview.def, preview.label, rosterDraft);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { ...preview, file, url: URL.createObjectURL(file) };
      });
      setDirty(false);
      return file;
    } catch (err) {
      onError(err instanceof Error ? err.message : `${preview.label}の作り直しに失敗しました`);
      return null;
    } finally {
      setRebuilding(false);
    }
  };

  // 添付するファイル。欄を直したあと作り直していなければ、直した内容で作り直してから返す
  // （作り直す前のPDFが添付されて「消したはずの履歴が残る」ことがないように）
  const freshFile = async (): Promise<File | null> => {
    if (!preview) return null;
    if (rosterDraft && dirty) return rebuild();
    return preview.file;
  };

  // 労働者名簿の中身だけを保存する（添付はしない）。次に作成するときもこの内容になる
  const saveDraft = async () => {
    if (!rosterDraft) return;
    setSavingDraft(true);
    try {
      const res = await saveOnboardingRosterDraft(workerId, rosterDraft);
      if (!res.ok) throw new Error(res.message);
      setDraftSavedAt(new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      onError(err instanceof Error ? err.message : "労働者名簿を保存できませんでした");
    } finally {
      setSavingDraft(false);
    }
  };

  // プレビューを閉じる（表示に使った一時的なURLを片づける）
  const close = () => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setRosterDraftState(null);
    setDirty(false);
    setDraftSavedAt(null);
  };

  return {
    preview,
    rosterDraft,
    setRosterDraft,
    creatingKey,
    rebuilding,
    create,
    rebuild,
    close,
    dirty,
    freshFile,
    saveDraft,
    savingDraft,
    draftSavedAt,
  };
}

export function GeneratedDocPreviewModal({
  preview,
  rosterDraft,
  onDraftChange,
  onRebuild,
  rebuilding,
  onAttach,
  attaching,
  onClose,
  myNumberBlank,
  error,
  dirty = false,
  onSaveDraft,
  savingDraft = false,
  draftSavedAt = null,
}: {
  preview: GeneratedPreview;
  rosterDraft: RosterDraft | null;
  onDraftChange: (draft: RosterDraft) => void;
  onRebuild: () => void;
  rebuilding: boolean;
  onAttach: () => void;
  attaching: boolean;
  onClose: () => void;
  myNumberBlank: boolean;
  error?: string | null;
  dirty?: boolean; // 欄を直したあと、まだ作り直していない
  onSaveDraft?: () => void; // 労働者名簿の中身だけ保存する
  savingDraft?: boolean;
  draftSavedAt?: string | null;
}) {
  return (
    <Modal open wide title={`${preview.label}のプレビュー`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}
        {myNumberBlank && (
          <p className="rounded-lg bg-status-notice-bg px-3 py-2 text-sm font-bold text-status-notice-fg">
            個人番号は空欄のまま作成しています。印刷して本人に記入してもらうか、外国人詳細に個人番号を登録してから作り直してください。
          </p>
        )}
        <p className="text-sm">
          外国人詳細の登録内容で作成しました。
          <span className="font-bold">内容に間違いがなければ「添付する」を押してください。</span>
          <span className="block text-[11px] text-muted">
            {rosterDraft
              ? "直すところがあれば下の欄でその場で直せます。添付すると、直した内容は労働者名簿の画面にも保存されます。添付後も「差し替え」でやり直せます。"
              : "添付後も「差し替え」でやり直せます。直すところがあるときは「やめる」で閉じ、外国人詳細を直してからもう一度作成してください。"}
          </span>
        </p>
        <iframe
          src={preview.url}
          title={`${preview.label}のプレビュー`}
          className="h-[60vh] w-full rounded-xl border border-border bg-background"
        />
        {rosterDraft && dirty && (
          <p className="rounded-lg bg-status-notice-bg px-3 py-2 text-xs font-bold text-status-notice-fg">
            欄を直しました。上のPDFはまだ直す前の内容です。「この内容で作り直す」で確かめるか、そのまま「直した内容で作り直して添付する」を押してください。
          </p>
        )}
        {rosterDraft && (
          <RosterDraftEditor
            draft={rosterDraft}
            onChange={onDraftChange}
            onRebuild={onRebuild}
            busy={rebuilding}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAttach}
            disabled={attaching || rebuilding}
            className="flex items-center gap-1 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-foreground disabled:opacity-50"
          >
            <Upload size={14} />
            {attaching ? (dirty ? "作り直して添付中…" : "添付中…") : rosterDraft && dirty ? "直した内容で作り直して添付する" : "添付する"}
          </button>
          {rosterDraft && onSaveDraft && (
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={savingDraft || attaching}
              title="添付はせずに、直した内容を労働者名簿に保存します（次に作成するときもこの内容になります）"
              className="flex items-center gap-1 rounded-lg border border-brand px-4 py-2 text-sm font-bold text-brand disabled:opacity-50"
            >
              <Save size={14} />
              {savingDraft ? "保存中…" : "名簿の内容を保存"}
            </button>
          )}
          {draftSavedAt && <span className="text-[11px] font-bold text-status-approved-fg">保存しました（{draftSavedAt}）</span>}
          <button
            type="button"
            onClick={onClose}
            disabled={attaching}
            className="rounded-lg border border-border px-4 py-2 text-sm font-bold text-muted"
          >
            やめる
          </button>
          <a
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
          >
            <ExternalLink size={12} />
            別のタブで大きく開く
          </a>
        </div>
      </div>
    </Modal>
  );
}
