"use client";

import {
  autoMailingProgress,
  mailingProgressOptionsFor,
  type MailingProgress,
} from "@/lib/tax-office";
import { todayISO, type JudgmentRecord } from "@/lib/tax-cert";

// 郵送請求の進捗（準備中 / 請求先からの郵送待ち / 完了）の入力。
// 納税証明書その3だけに付いていたものを、課税証明書・納税証明書・転出届・住民票でも使う。
//
// 投函日は書類ごとに持つ場所が違う（課税・納税証明書は「郵送請求した日」、
// 転出届・住民票は「投函日」）ので、ここでは持たずに postDate で受け取る。

export interface MailingProgressValues {
  progress: MailingProgress;
  trackingNumber: string;
  receivedDate: string;
  note: string;
}

export function mailingProgressValuesFromRecord(r: JudgmentRecord): MailingProgressValues {
  return {
    progress: r.mailingProgress ?? "preparing",
    trackingNumber: r.trackingNumber ?? "",
    receivedDate: r.receivedDate ?? "",
    note: r.mailingNote ?? "",
  };
}

// 保存する内容。投函日が入っていれば、準備中のままでも郵送待ちに進める
export function mailingProgressPatch(
  v: MailingProgressValues,
  { postDate, requireTracking = false }: { postDate: string; requireTracking?: boolean },
): Pick<JudgmentRecord, "mailingProgress" | "trackingNumber" | "receivedDate" | "mailingNote"> {
  const progress = autoMailingProgress(v.progress, postDate, v.trackingNumber, requireTracking);
  return {
    mailingProgress: progress,
    trackingNumber: v.trackingNumber.trim(),
    // 完了にしていないときは、届いた日は残さない
    receivedDate: progress === "done" ? v.receivedDate : "",
    mailingNote: v.note.trim(),
  };
}

const INPUT =
  "min-h-[40px] w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none";
const LABEL = "text-[11px] font-bold text-muted";

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[40px] flex-1 rounded-xl border px-3 text-sm font-bold ${
        active ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface text-muted"
      }`}
    >
      {children}
    </button>
  );
}

export function MailingProgressFields({
  requestKind,
  mailed,
  postDate,
  v,
  set,
  canEdit,
}: {
  requestKind?: string;
  // 郵送で請求したか（窓口で受け取るだけなら「郵送待ち」は出さない）
  mailed: boolean;
  postDate: string; // 投函日（別の欄で入れているもの。自動で郵送待ちにするかの判断に使う）
  v: MailingProgressValues;
  set: (patch: Partial<MailingProgressValues>) => void;
  canEdit: boolean;
}) {
  if (!canEdit) return null;
  const all = mailingProgressOptionsFor(requestKind);
  const options = all.filter((o) => mailed || o.value !== "waiting");
  const waitingLabel = all.find((o) => o.value === "waiting")?.label ?? "郵送待ち";
  return (
    <div className="space-y-3 border-t border-dashed border-border pt-3">
      <div className="flex flex-col gap-1">
        <span className={LABEL}>進捗</span>
        <div className="flex flex-col gap-2 sm:flex-row">
          {options.map((o) => (
            <Pill key={o.value} active={v.progress === o.value} onClick={() => set({ progress: o.value })}>
              {o.label}
            </Pill>
          ))}
        </div>
        {mailed && (
          <span className="text-[11px] text-muted">
            {postDate
              ? `投函日（${postDate}）が入っているので、保存すると準備中は自動で「${waitingLabel}」になります。`
              : `投函日を入れて保存すると、準備中は自動で「${waitingLabel}」になります。`}
          </span>
        )}
      </div>

      {mailed && (
        <label className="flex flex-col gap-1">
          <span className={LABEL}>追跡番号（レターパックなど・任意）</span>
          <input
            value={v.trackingNumber}
            onChange={(e) => set({ trackingNumber: e.target.value })}
            placeholder="例: 1234-5678-9012"
            className={INPUT}
          />
        </label>
      )}

      {v.progress === "done" && (
        <label className="flex flex-col gap-1">
          <span className={LABEL}>証明書が届いた日</span>
          <div className="flex gap-2">
            <input
              type="date"
              value={v.receivedDate}
              onChange={(e) => set({ receivedDate: e.target.value })}
              className={INPUT}
            />
            <button
              type="button"
              onClick={() => set({ receivedDate: todayISO() })}
              className="shrink-0 whitespace-nowrap rounded-xl border border-border px-3 text-sm font-bold text-muted"
            >
              今日
            </button>
          </div>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className={LABEL}>進捗のメモ（任意）</span>
        <input
          value={v.note}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="例: 10/5に電話で確認、来週発送とのこと"
          className={INPUT}
        />
      </label>
    </div>
  );
}
