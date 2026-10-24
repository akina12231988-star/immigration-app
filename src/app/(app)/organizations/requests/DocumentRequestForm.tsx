"use client";

import { useState } from "react";
import { ClipboardPaste, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  DOCUMENT_REQUEST_SOURCES,
  LINK_DOC_NONE,
  joinedYearFromNote,
  linkDocOptions,
  newItemId,
  parseItemsText,
  type DocumentRequestItem,
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
  // 集める書類は1件ずつ行で入れる（書類名と補足を別の欄にする）。
  // 編集のときは登録済みの項目をそのまま行にし、id を引き継ぐ（チェック済みの記録が外れないように）
  const [rows, setRows] = useState<DocumentRequestItem[]>(() =>
    initial && initial.items.length > 0
      ? initial.items.map((i) => ({ ...i }))
      : [{ id: newItemId(), name: "", note: "", joined_year: null }],
  );
  // メールの文をまとめて貼り付けて行にする（1行に1つ。「書類名｜補足」や「書類名（補足）」も読む）
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  // 外国人詳細の「入社時に送る資料」のどの書類に紐づけるか（選択肢）
  const linkOptions = linkDocOptions(today);

  const updateRow = (id: string, patch: Partial<DocumentRequestItem>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { id: newItemId(), name: "", note: "", joined_year: null }]);
  const removeRow = (id: string) =>
    setRows((prev) => (prev.length <= 1 ? [{ id: newItemId(), name: "", note: "", joined_year: null }] : prev.filter((r) => r.id !== id)));
  const addPasted = () => {
    const parsed = parseItemsText(pasteText);
    if (parsed.length === 0) return;
    // 空の行は貼り付けた分で置き換える
    setRows((prev) => [...prev.filter((r) => r.name.trim() || r.note.trim()), ...parsed]);
    setPasteText("");
    setPasteOpen(false);
  };

  const submit = () => {
    setLocalError(null);
    if (!orgId) return setLocalError("所属機関を選んでください");
    if (!title.trim()) return setLocalError("件名を入れてください（例: 年末調整の件）");
    // 書類名が空の行は飛ばす。補足から入社年（◯◯年入社の方のみ）を読む
    const items = rows
      .map((r) => ({ ...r, name: r.name.trim(), note: r.note.trim() }))
      .filter((r) => r.name)
      .map((r) => ({ ...r, joined_year: joinedYearFromNote(r.note) }));
    if (items.length === 0) return setLocalError("集める書類を1つ以上入れてください（書類名の欄）");
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
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-muted">集める書類（1件ずつ行に入れます）</span>
            <button
              type="button"
              onClick={() => setPasteOpen((v) => !v)}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-brand hover:border-brand"
            >
              <ClipboardPaste size={12} />
              メールの文をまとめて貼り付けて行にする
            </button>
          </div>
          <span className="text-[11px] text-muted">
            補足に「2026年入社の方のみ」のように書くと、その年に入社した人だけが対象になります（源泉徴収票など）。
            「紐付」は外国人詳細の「入社時に送る資料」のどの書類に当たるかで、添付済みならチェック表のマスからそのデータを開けます（自動のままなら書類名で判定します）。
          </span>
          {pasteOpen && (
            <div className="rounded-lg border border-border bg-background p-2">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={4}
                placeholder={"1行に1つ。「書類名｜補足」や「書類名（補足）」の形も読みます\n扶養控除申告書\n扶養証明書(日本語訳)｜コピーでよい（カラー不可）\n令和8年度源泉徴収票｜2026年入社の方のみ"}
                className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm leading-relaxed focus:border-brand focus:outline-none"
              />
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={addPasted}
                  disabled={!pasteText.trim()}
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-foreground disabled:opacity-50"
                >
                  行にして足す
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPasteOpen(false);
                    setPasteText("");
                  }}
                  className="text-xs font-bold text-muted underline"
                >
                  閉じる
                </button>
              </div>
            </div>
          )}
          {/* 1件ごとの行: 書類名の欄と、その下に補足の欄 */}
          <div className="flex flex-col gap-2">
            {rows.map((row, i) => (
              <div key={row.id} className="rounded-lg border border-border bg-background p-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-center text-xs font-bold text-muted">{i + 1}</span>
                  <input
                    value={row.name}
                    onChange={(e) => updateRow(row.id, { name: e.target.value })}
                    placeholder="書類名（例: 扶養控除申告書）"
                    aria-label={`${i + 1}件目の書類名`}
                    className={FIELD}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    aria-label={`${i + 1}件目を削除`}
                    title="この行を削除"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-seal hover:border-seal"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="w-6 shrink-0 text-center text-[10px] font-bold text-muted">補足</span>
                  <input
                    value={row.note}
                    onChange={(e) => updateRow(row.id, { note: e.target.value })}
                    placeholder="補足（例: コピーでよい（カラー不可）・2026年入社の方のみ）"
                    aria-label={`${i + 1}件目の補足`}
                    className={`${FIELD} min-h-[36px] text-xs`}
                  />
                  <span className="w-9 shrink-0" />
                </div>
                {/* 外国人詳細の「入社時に送る資料」のどの書類に紐づけるか。
                    未設定なら書類名から自動で判定し、添付済みならチェック表のマスから開ける */}
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="w-6 shrink-0 text-center text-[10px] font-bold text-muted" title="外国人詳細の紐づけ先">
                    紐付
                  </span>
                  <select
                    value={row.link_doc_key ?? ""}
                    onChange={(e) => updateRow(row.id, { link_doc_key: e.target.value })}
                    aria-label={`${i + 1}件目の外国人詳細の紐づけ先`}
                    className={`${FIELD} min-h-[36px] text-xs`}
                  >
                    <option value="">外国人詳細の紐づけ先: 自動（書類名で判定）</option>
                    {linkOptions.map((o) => (
                      <option key={o.key} value={o.key}>
                        外国人詳細の「{o.label}」に紐づける
                      </option>
                    ))}
                    {/* 選択肢に無い書類キーが保存されていても消えないようにしておく */}
                    {row.link_doc_key &&
                      row.link_doc_key !== LINK_DOC_NONE &&
                      !linkOptions.some((o) => o.key === row.link_doc_key) && (
                        <option value={row.link_doc_key}>外国人詳細の「{row.link_doc_key}」に紐づける</option>
                      )}
                    <option value={LINK_DOC_NONE}>紐づけない</option>
                  </select>
                  <span className="w-9 shrink-0" />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addRow}
            className="flex w-fit items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-brand hover:border-brand"
          >
            <Plus size={13} />
            行を追加
          </button>
          {initial && (
            <span className="text-[11px] text-muted">
              書類名を変えても、その行のチェック済みの記録はそのまま引き継ぎます。行を削除すると、その書類のチェックは表から消えます。
            </span>
          )}
        </div>
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
