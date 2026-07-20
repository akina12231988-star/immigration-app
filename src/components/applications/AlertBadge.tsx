import { transitionEndDate, formatMonthDay } from "@/lib/application-alerts";

// 在留期限アラートのバッジ（経過措置終了日を明示）
export function AlertBadge({ expiry }: { expiry?: string }) {
  const label = expiry
    ? `期限注意（${formatMonthDay(transitionEndDate(expiry))}で経過措置終了）`
    : "期限注意";
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-seal px-2 py-0.5 text-[10px] font-bold text-seal-foreground">
      {label}
    </span>
  );
}
