"use client";

import { useState } from "react";
import type { CopyEdit } from "@/lib/application-copy";
import { dbErrorMessage } from "@/lib/errors";

// 項目をその場で入力・編集して保存する欄（文字・日付・選択肢）。
// 未登録なら「未登録」と入力欄、登録済みなら今の値を入れた入力欄と「やめる」を出す
export function InlineEditField({
  label,
  edit,
  initial = "",
  registered = false,
  onSave,
  onCancel,
}: {
  label: string;
  edit: CopyEdit;
  initial?: string; // 最初に入れておく値（登録済みの値）
  registered?: boolean; // true: 登録済みの値を編集している（空で保存すると消す）
  onSave: (edit: CopyEdit, value: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = "options" in edit ? edit.options : undefined;
  const isDate = "kind" in edit && edit.kind === "date";
  // エラー文に出すマイグレーション名（登録支援機関の情報は app_settings に保存する）
  const migration = edit.target === "custodian" ? "0149_app_settings.sql" : "0001_init.sql";
  const cls =
    "min-h-[28px] rounded border border-seal/40 bg-surface px-1.5 text-[11px] focus:border-brand focus:outline-none disabled:opacity-60";
  // 未登録のときは空では保存しない。登録済みのときは変わっていなければ保存しない（空にして消すのは可）
  const canSave = registered ? value.trim() !== initial.trim() : value.trim().length > 0;
  // 選択肢に無い値（古い登録値）も選べるように残す
  const optionList = options && value && !options.includes(value) ? [value, ...options] : options;

  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(edit, value);
    } catch (err) {
      setError(dbErrorMessage(err, migration, `${label}の保存に失敗しました`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-1">
        {!registered && <span className="text-seal">未登録</span>}
        {optionList ? (
          <select value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} className={cls} aria-label={label}>
            <option value="">{registered ? "（空にする）" : "選択してください"}</option>
            {optionList.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={isDate ? "date" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") onCancel?.();
            }}
            disabled={busy}
            placeholder="ここに入力"
            aria-label={label}
            autoFocus={registered}
            className={`${cls} ${isDate ? "" : "min-w-[10rem] flex-1"}`}
          />
        )}
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !canSave}
          className="rounded bg-brand px-2 py-1 text-[10px] font-bold text-brand-foreground disabled:opacity-50"
        >
          {busy ? "保存中…" : "保存"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-border px-2 py-1 text-[10px] font-bold text-muted disabled:opacity-50"
          >
            やめる
          </button>
        )}
      </span>
      {registered && !error && (
        <span className="text-[10px] text-muted">
          空にして保存すると登録を消します。{optionList ? "" : "Enterで保存、Escでやめる"}
        </span>
      )}
      {error && (
        <span role="alert" className="text-[10px] font-bold text-seal">
          {error}
        </span>
      )}
    </span>
  );
}
