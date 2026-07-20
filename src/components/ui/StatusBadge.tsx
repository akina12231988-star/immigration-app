import type { ApplicationStatus } from "@/types/application";
import { STATUS_STYLES } from "@/lib/status";

export function StatusBadge({
  status,
  label,
}: {
  status: ApplicationStatus;
  label?: string; // 表示テキストの上書き（例: 申請前で在留更新が準備中なら「申請前準備中」）
}) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${style.bg} ${style.fg}`}
    >
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {label ?? status}
    </span>
  );
}
