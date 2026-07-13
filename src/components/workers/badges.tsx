import type { SswStatus } from "@/types/ssw";
import type { SupportScope, WorkerStatus } from "@/types/db";

const SSW_STATUS_CLASSES: Record<SswStatus, string> = {
  "1号在留中": "bg-status-applied-bg text-status-applied-fg",
  "5年到達": "bg-seal/10 text-seal",
  中断中: "bg-status-notice-bg text-status-notice-fg",
  "1号期間未登録": "bg-status-before-bg text-status-before-fg",
};

export function SswStatusBadge({ status }: { status: SswStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${SSW_STATUS_CLASSES[status]}`}
    >
      {status}
    </span>
  );
}

const WORKER_STATUS_CLASSES: Record<WorkerStatus, string> = {
  支援中: "bg-status-reported-bg text-status-reported-fg",
  求職活動中: "bg-status-applied-bg text-status-applied-fg",
  帰国: "bg-status-before-bg text-status-before-fg",
  退職: "bg-status-notice-bg text-status-notice-fg",
};

export function WorkerStatusBadge({ status }: { status: WorkerStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${WORKER_STATUS_CLASSES[status]}`}
    >
      {status}
    </span>
  );
}

export function SupportBadge({ support }: { support: SupportScope }) {
  if (support === "支援対象") return null; // 大多数なのでバッジは対象外のみ表示
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border px-2.5 py-1 text-[11px] font-bold text-muted">
      支援対象外
    </span>
  );
}
