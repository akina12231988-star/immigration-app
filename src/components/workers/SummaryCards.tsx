import { Users, BadgeCheck, TimerReset, Flag, CalendarClock, LogOut } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { WorkerQuickFilter } from "@/components/workers/WorkerFilters";

export interface WorkerSummary {
  total: number; // 登録人数
  active: number; // 1号在留中（在籍中）
  withinOneYear: number; // 1号で残り1年以内
  reachedCap: number; // 5年到達
  expiry3m: number; // 在留期限まで3ヶ月以内
  retired: number; // 退職者
}

const CARDS: {
  key: keyof WorkerSummary;
  quick: WorkerQuickFilter;
  label: string;
  icon: typeof Users;
  accent: string;
}[] = [
  { key: "total", quick: "all", label: "登録人数", icon: Users, accent: "text-brand bg-brand/10" },
  {
    key: "active",
    quick: "active",
    label: "1号で在籍中",
    icon: BadgeCheck,
    accent: "text-status-applied-fg bg-status-applied-bg",
  },
  {
    key: "withinOneYear",
    quick: "within1year",
    label: "残り1年以内（1号）",
    icon: TimerReset,
    accent: "text-status-notice-fg bg-status-notice-bg",
  },
  {
    key: "reachedCap",
    quick: "reached",
    label: "5年到達",
    icon: Flag,
    accent: "text-seal bg-seal/10",
  },
  {
    key: "expiry3m",
    quick: "expiry3m",
    label: "在留期限3ヶ月以内",
    icon: CalendarClock,
    accent: "text-status-notice-fg bg-status-notice-bg",
  },
  {
    key: "retired",
    quick: "retired",
    label: "退職者",
    icon: LogOut,
    accent: "text-muted bg-background",
  },
];

// 一覧上部のサマリー。カードを押すと該当者だけに絞り込む。
export function SummaryCards({
  summary,
  active,
  onSelect,
}: {
  summary: WorkerSummary;
  active: WorkerQuickFilter;
  onSelect: (quick: WorkerQuickFilter) => void;
}) {
  return (
    <section className="grid grid-cols-2 gap-3">
      {CARDS.map(({ key, quick, label, icon: Icon, accent }) => {
        const isActive = active === quick;
        return (
          <Card
            key={key}
            onClick={() => onSelect(quick)}
            className={`cursor-pointer p-4 transition hover:border-brand active:scale-[0.98] ${
              isActive ? "border-brand ring-1 ring-brand" : ""
            }`}
          >
            <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
              <Icon size={20} />
            </div>
            <p className="text-2xl font-black tabular-nums">
              {summary[key]}
              <span className="ml-0.5 text-sm font-bold text-muted">名</span>
            </p>
            <p className="text-xs font-medium text-muted">{label}</p>
          </Card>
        );
      })}
    </section>
  );
}
