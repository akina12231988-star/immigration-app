import type { ApplicationResult } from "@/types/recruiting";

const CLASSES: Record<ApplicationResult, string> = {
  選考中: "bg-status-applied-bg text-status-applied-fg",
  採用: "bg-status-approved-bg text-status-approved-fg",
  不採用: "bg-status-before-bg text-status-before-fg",
  辞退: "bg-status-notice-bg text-status-notice-fg",
};

export function ApplicationResultBadge({ result }: { result: ApplicationResult }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${CLASSES[result]}`}
    >
      {result}
    </span>
  );
}
