"use client";

import { Plus, Trash2 } from "lucide-react";
import { sortRosterHistory } from "@/lib/roster";
import type { RosterDraft } from "@/lib/roster-draft";

// 入社書類の「作成」で出すプレビューの中で、労働者名簿の中身を直すための入力欄。
// ここで直して「この内容で作り直す」を押すと、その内容でPDFを作り直す。
// 添付するときに、この内容は労働者名簿（/workers/[id]/roster）にも保存される。

const INPUT =
  "min-h-[36px] w-full rounded-lg border border-border bg-background px-2 text-xs focus:border-brand focus:outline-none";

function RowsField({
  title,
  columns,
  rows,
  onChange,
  addLabel,
}: {
  title: string;
  columns: { label: string; placeholder: string; width?: string }[];
  rows: string[][];
  onChange: (rows: string[][]) => void;
  addLabel: string;
}) {
  const setCell = (i: number, col: number, value: string) =>
    onChange(rows.map((r, idx) => (idx === i ? r.map((c, j) => (j === col ? value : c)) : r)));

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-bold text-muted">{title}</span>
      {rows.length === 0 && <p className="text-[11px] text-muted">（まだ行がありません）</p>}
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {columns.map((col, j) => (
            <input
              key={col.label}
              value={row[j] ?? ""}
              onChange={(e) => setCell(i, j, e.target.value)}
              placeholder={col.placeholder}
              aria-label={`${title}の${i + 1}行目の${col.label}`}
              className={`${INPUT} ${col.width ?? ""}`}
            />
          ))}
          <button
            type="button"
            aria-label={`${title}の${i + 1}行目を削除`}
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-seal"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, columns.map(() => "")])}
        className="mt-0.5 inline-flex items-center gap-1 self-start rounded-lg border border-dashed border-brand px-2.5 py-1 text-[11px] font-bold text-brand"
      >
        <Plus size={12} />
        {addLabel}
      </button>
    </div>
  );
}

export function RosterDraftEditor({
  draft,
  onChange,
  onRebuild,
  busy,
}: {
  draft: RosterDraft;
  onChange: (draft: RosterDraft) => void;
  onRebuild: () => void;
  busy: boolean;
}) {
  const set = <K extends keyof RosterDraft>(key: K, value: RosterDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-3">
      <p className="text-[11px] leading-relaxed text-muted">
        直すところがあればここで直して「この内容で作り直す」を押してください。
        名前・フリガナ・生年月日・住所・個人番号・雇用開始年月日は外国人詳細の登録内容がそのまま入るため、
        直すときは外国人詳細から修正してください。
      </p>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">送付先の会社名</span>
          <input
            value={draft.company_name}
            onChange={(e) => set("company_name", e.target.value)}
            placeholder="例: 株式会社◯◯"
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">発行年月日</span>
          <input
            type="date"
            value={draft.issued_on}
            onChange={(e) => set("issued_on", e.target.value)}
            className={INPUT}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold text-muted">業務の種類</span>
        <input
          value={draft.work_kind}
          onChange={(e) => set("work_kind", e.target.value)}
          placeholder="例: 農業分野・耕種農業の一般社員（役員なし）"
          className={INPUT}
        />
      </label>

      <RowsField
        title="履歴"
        columns={[
          { label: "年月日", placeholder: "例: 2026年8月25日", width: "sm:w-[40%]" },
          { label: "内容", placeholder: "例: 入社" },
        ]}
        rows={draft.history.map((h) => [h.on, h.content])}
        onChange={(rows) =>
          set(
            "history",
            // 年月日の古い順に並べ替えて保存する（画面の労働者名簿と同じ）
            sortRosterHistory(rows.map(([on = "", content = ""]) => ({ on, content }))),
          )
        }
        addLabel="履歴の行を追加"
      />

      <RowsField
        title="前職"
        columns={[
          { label: "会社名", placeholder: "例: ◯◯株式会社" },
          { label: "都道府県", placeholder: "例: 熊本県", width: "sm:w-[40%]" },
        ]}
        rows={draft.previous_jobs.map((j) => [j.company, j.prefecture])}
        onChange={(rows) =>
          set(
            "previous_jobs",
            rows.map(([company = "", prefecture = ""]) => ({ company, prefecture })),
          )
        }
        addLabel="前職の行を追加"
      />

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">解雇・退職または死亡の年月日</span>
          <input
            value={draft.leaving_on}
            onChange={(e) => set("leaving_on", e.target.value)}
            placeholder="例: 2027年3月31日"
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">同・事由</span>
          <input
            value={draft.leaving_reason}
            onChange={(e) => set("leaving_reason", e.target.value)}
            placeholder="例: 自己都合退職"
            className={INPUT}
          />
        </label>
      </div>

      <button
        type="button"
        onClick={onRebuild}
        disabled={busy}
        className="self-start rounded-lg border border-brand px-3 py-2 text-xs font-bold text-brand disabled:opacity-50"
      >
        {busy ? "作り直し中…" : "この内容で作り直す"}
      </button>
    </div>
  );
}
