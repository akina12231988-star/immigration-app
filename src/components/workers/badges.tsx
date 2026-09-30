import { isSsw2Residence, type SswStatus } from "@/types/ssw";
import type { SupportScope, WorkerStatus } from "@/types/db";

const SSW_STATUS_CLASSES: Record<SswStatus, string> = {
  "1号在留中": "bg-status-applied-bg text-status-applied-fg",
  "5年到達": "bg-seal/10 text-seal",
  中断中: "bg-status-notice-bg text-status-notice-fg",
  "1号期間未登録": "bg-status-before-bg text-status-before-fg",
};

// 特定技能1号の通算（5年）の状態を出すバッジ。
// 在留資格が特定技能2号の人は、1号の通算の話ではないので「2号在留中」を
// 1号とは違う色（塗りつぶし）で出す
export function SswStatusBadge({
  status,
  residenceStatus,
}: {
  status: SswStatus;
  residenceStatus?: string | null;
}) {
  if (isSsw2Residence(residenceStatus)) {
    return (
      <span
        title="在留資格が特定技能2号です（1号の通算5年の上限はありません）"
        className="inline-flex shrink-0 items-center rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold text-brand-foreground"
      >
        2号在留中
      </span>
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${SSW_STATUS_CLASSES[status]}`}
    >
      {status}
    </span>
  );
}

const WORKER_STATUS_CLASSES: Record<WorkerStatus, string> = {
  申請準備中: "bg-status-notice-bg text-status-notice-fg",
  在籍中: "bg-status-approved-bg text-status-approved-fg",
  求職活動中: "bg-status-applied-bg text-status-applied-fg",
  帰国: "bg-status-before-bg text-status-before-fg",
  退職: "bg-status-notice-bg text-status-notice-fg",
};

export function WorkerStatusBadge({ status }: { status: WorkerStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${
        // 統一前の「支援中」などが残っている場合は在籍中と同じ見た目にする
        WORKER_STATUS_CLASSES[status] ?? WORKER_STATUS_CLASSES["在籍中"]
      }`}
    >
      {status}
    </span>
  );
}

export function SupportBadge({ support }: { support: SupportScope }) {
  if (support === "支援対象") return null; // 大多数なのでバッジは対象以外のみ表示
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border px-2.5 py-1 text-[11px] font-bold text-muted">
      {support}
    </span>
  );
}
