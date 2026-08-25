"use client";

import { useState } from "react";
import { ExternalLink, Upload } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RosterDraftEditor } from "@/components/workers/RosterDraftEditor";
import { getOnboardingRosterDraft } from "@/app/(app)/onboarding/actions";
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
  const [rosterDraft, setRosterDraft] = useState<RosterDraft | null>(null);
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
      setRosterDraft(draft);
      setPreview({ def, label, file, url: URL.createObjectURL(file) });
    } catch (err) {
      onError(err instanceof Error ? err.message : `${label}の作成に失敗しました`);
    } finally {
      setCreatingKey(null);
    }
  };

  // プレビューの中で直した内容でPDFを作り直す
  const rebuild = async () => {
    if (!preview || !rosterDraft) return;
    setRebuilding(true);
    try {
      const file = await fetchDocPdf(workerId, preview.def, preview.label, rosterDraft);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { ...preview, file, url: URL.createObjectURL(file) };
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : `${preview.label}の作り直しに失敗しました`);
    } finally {
      setRebuilding(false);
    }
  };

  // プレビューを閉じる（表示に使った一時的なURLを片づける）
  const close = () => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setRosterDraft(null);
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
            {attaching ? "添付中…" : "添付する"}
          </button>
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
