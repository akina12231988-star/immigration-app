import { Users, BadgeCheck, TimerReset, Flag } from "lucide-react";
import { Card } from "@/components/ui/Card";

export interface WorkerSummary {
  total: number; // 登録人数
  active: number; // 1号在留中
  withinOneYear: number; // 残り1年以内
  reachedCap: number; // 5年到達
}

const CARDS = [
  { key: "total", label: "登録人数", icon: Users, accent: "text-brand bg-brand/10" },
  {
    key: "active",
    label: "1号在留中",
    icon: BadgeCheck,
    accent: "text-status-applied-fg bg-status-applied-bg",
  },
  {
    key: "withinOneYear",
    label: "残り1年以内",
    icon: TimerReset,
    accent: "text-status-notice-fg bg-status-notice-bg",
  },
  { key: "reachedCap", label: "5年到達", icon: Flag, accent: "text-seal bg-seal/10" },
] as const;

// 一覧上部のサマリー（旧HTML版のサマリーカードを踏襲）
export function SummaryCards({ summary }: { summary: WorkerSummary }) {
  return (
    <section className="grid grid-cols-2 gap-3">
      {CARDS.map(({ key, label, icon: Icon, accent }) => (
        <Card key={key} className="p-4">
          <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
            <Icon size={20} />
          </div>
          <p className="text-2xl font-black tabular-nums">
            {summary[key]}
            <span className="ml-0.5 text-sm font-bold text-muted">名</span>
          </p>
          <p className="text-xs font-medium text-muted">{label}</p>
        </Card>
      ))}
    </section>
  );
}
