"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  DOCUMENT_REQUEST_SOURCES,
  itemsToText,
  parseItemsText,
  type OrganizationDocumentRequest,
  type OrganizationDocumentRequestInput,
} from "@/lib/org-document-requests";

const FIELD = "min-h-[40px] w-full rounded-lg border border-border bg-surface px-2 text-sm focus:border-brand focus:outline-none";

// 依頼の登録・編集フォーム（件名・依頼日・期限・集める書類の項目・メモ）
export function DocumentRequestForm({
  organizations,
  initial,
  defaultOrgId,
  today,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  organizations: { id: string; name: string }[];
  initial?: OrganizationDocumentRequest | null; // 編集のとき
  defaultOrgId?: string;
  today: string;
  busy: boolean;
  error: string | null;
  onSubmit: (input: OrganizationDocumentRequestInput) => void;
  onClose: () => void;
}) {
  const [orgId, setOrgId] = useState(initial?.organization_id ?? defaultOrgId ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [requestedOn, setRequestedOn] = useState(initial?.requested_on ?? today);
  const [dueOn, setDueOn] = useState(initial?.due_on ?? "");
  const [source, setSource] = useState(initial?.source ?? "メール");
  const [itemsText, setItemsText] = useState(initial ? itemsToText(initial.items) : "");
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    setLocalError(null);
    if (!orgId) return setLocalError("所属機関を選んでください");
    if (!title.trim()) return setLocalError("件名を入れてください（例: 年末調整の件）");
    // 編集のときは、同じ項目名の id を引き継ぐ（チェック済みの記録が外れないように）
    const items = parseItemsText(itemsText).map((item) => {
      const prev = initial?.items.find((p) => p.name === item.name);
      return prev ? { ...item, id: prev.id } : item;
    });
    if (items.length === 0) return setLocalError("集める書類を1行に1つ入れてください");
    onSubmit({
      organization_id: orgId,
      title: title.trim(),
      requested_on: requestedOn || today,
      due_on: dueOn || null,
      source,
      memo,
      items,
      closed_on: initial?.closed_on ?? null,
    });
  };

  return (
    <Modal open title={initial ? "依頼を編集" : "会社からの依頼を登録"} onClose={onClose} wide>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-[11px] leading-relaxed text-muted">
          会社から「この書類を集めてほしい」と連絡が来たら登録します。登録すると、その機関の在籍者ひとりひとりについて
          「案内した・発行した・会社に送った」をチェックできる表ができます。
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">所属機関（依頼してきた会社）</span>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} disabled={!!initial} className={FIELD}>
              <option value="">選んでください</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">件名</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 年末調整の件" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">依頼が来た日</span>
            <input type="date" value={requestedOn} onChange={(e) => setRequestedOn(e.target.value)} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">期限（会社に送る締切）</span>
            <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">どうやって来たか</span>
            <select value={source} onChange={(e) => setSource(e.target.value)} className={FIELD}>
              {DOCUMENT_REQUEST_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">集める書類（1行に1つ。「書類名｜補足」で補足も書けます）</span>
          <textarea
            value={itemsText}
            onChange={(e) => setItemsText(e.target.value)}
            rows={5}
            placeholder={"扶養控除申告書\n扶養証明書(日本語訳)｜コピーでよい（カラー不可）\n送金証明書\n令和8年度源泉徴収票｜2026年入社の方のみ"}
            className="min-h-[120px] w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm leading-relaxed focus:border-brand focus:outline-none"
          />
          {initial && (
            <span className="text-[11px] text-muted">
              書類名を変えると、その書類のチェックは新しい項目として数え直します（名前が同じ行はチェックを引き継ぎます）。
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">メモ（メールの本文など）</span>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={4}
            className="min-h-[88px] w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm leading-relaxed focus:border-brand focus:outline-none"
          />
        </label>
        {(localError || error) && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {localError || error}
          </p>
        )}
        <div className="flex gap-2">
          <Button fullWidth onClick={submit} disabled={busy}>
            {busy ? "保存中…" : initial ? "保存する" : "登録してチェック表を作る"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="shrink-0 whitespace-nowrap rounded-xl border border-border px-5 text-sm font-bold text-muted"
          >
            やめる
          </button>
        </div>
      </div>
    </Modal>
  );
}
