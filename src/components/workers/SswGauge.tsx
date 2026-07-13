import { CAP_MONTHS, ymdText, type SswCalcResult } from "@/lib/ssw/calc";
import type { SswStatus } from "@/types/ssw";

const BAR_COLORS: Record<SswStatus, string> = {
  "1号在留中": "bg-brand",
  "5年到達": "bg-seal",
  中断中: "bg-status-notice-fg",
  "1号期間未登録": "bg-border",
};

// 特定技能1号 通算60か月ゲージ（旧HTML版のゲージ表示を踏襲）
export function SswGauge({ calc, compact = false }: { calc: SswCalcResult; compact?: boolean }) {
  const pct = Math.min((calc.usedMonths / CAP_MONTHS) * 100, 100);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className={`font-bold tabular-nums ${compact ? "text-xs" : "text-sm"}`}>
          通算 {ymdText(calc.used)}
          <span className="ml-1 font-medium text-muted">/ 5年</span>
        </p>
        <p className={`tabular-nums text-muted ${compact ? "text-[11px]" : "text-xs"}`}>
          {calc.status === "5年到達"
            ? "上限到達"
            : calc.status === "1号期間未登録"
              ? "対象期間なし"
              : `残り ${ymdText(calc.remain)}`}
        </p>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={CAP_MONTHS}
        aria-valuenow={calc.usedMonths}
        aria-label="特定技能1号 通算期間（60か月中）"
        className={`mt-1.5 overflow-hidden rounded-full bg-background ${compact ? "h-2" : "h-3"}`}
      >
        <div
          className={`h-full rounded-full transition-[width] ${BAR_COLORS[calc.status]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!compact && (
        <div className="mt-1 flex justify-between text-[10px] text-muted">
          <span>0</span>
          <span>1年</span>
          <span>2年</span>
          <span>3年</span>
          <span>4年</span>
          <span>5年</span>
        </div>
      )}
    </div>
  );
}
