import type { PostingStatus } from "@/types/recruiting";

const CLASSES: Record<PostingStatus, string> = {
  募集中: "bg-status-reported-bg text-status-reported-fg",
  充足: "bg-status-applied-bg text-status-applied-fg",
  終了: "bg-status-before-bg text-status-before-fg",
};

export function PostingStatusBadge({ status }: { status: PostingStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${CLASSES[status]}`}
    >
      {status}
    </span>
  );
}
