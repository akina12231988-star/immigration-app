import type { Application, ApplicationStatus } from "@/types/application";

// 一覧に表示するステータス文言。
// 在留更新対象で「準備中」にした外国人の申請前案件は「申請前＜準備中＞」と表示する。
export function applicationStatusLabel(app: Application): string {
  if (app.status === "申請前" && app.workerRenewalStatus === "準備中") {
    return "申請前＜準備中＞";
  }
  return app.status;
}

interface StatusStyle {
  bg: string;
  fg: string;
  dot: string;
}

// Stage1設計書のステータス配色（グレー/ブルー/グリーン系/オレンジ/グリーン濃）
export const STATUS_STYLES: Record<ApplicationStatus, StatusStyle> = {
  申請前: {
    bg: "bg-status-before-bg",
    fg: "text-status-before-fg",
    dot: "bg-status-before-fg",
  },
  申請済: {
    bg: "bg-status-applied-bg",
    fg: "text-status-applied-fg",
    dot: "bg-status-applied-fg",
  },
  LINE報告済: {
    bg: "bg-status-reported-bg",
    fg: "text-status-reported-fg",
    dot: "bg-status-reported-fg",
  },
  通知書到着: {
    bg: "bg-status-notice-bg",
    fg: "text-status-notice-fg",
    dot: "bg-status-notice-fg",
  },
  許可済: {
    bg: "bg-status-approved-bg",
    fg: "text-status-approved-fg",
    dot: "bg-status-approved-fg",
  },
  在留カード受領: {
    bg: "bg-brand/10",
    fg: "text-brand",
    dot: "bg-brand",
  },
  取下げ: {
    bg: "bg-seal/10",
    fg: "text-seal",
    dot: "bg-seal",
  },
};
