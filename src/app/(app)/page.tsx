"use client";

import Link from "next/link";
import {
  FileClock,
  MessageCircleWarning,
  MailWarning,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getDashboardStats } from "@/lib/mock-data";
import { useApplications } from "@/lib/application-store";

const STAT_CARDS = [
  {
    key: "thisMonthCount",
    label: "今月申請件数",
    icon: FileClock,
    accent: "text-status-applied-fg bg-status-applied-bg",
  },
  {
    key: "unreportedCount",
    label: "未報告件数",
    icon: MessageCircleWarning,
    accent: "text-seal bg-seal/10",
  },
  {
    key: "waitingNoticeCount",
    label: "通知書待ち件数",
    icon: MailWarning,
    accent: "text-status-notice-fg bg-status-notice-bg",
  },
  {
    key: "approvedCount",
    label: "許可済件数",
    icon: CheckCircle2,
    accent: "text-status-approved-fg bg-status-approved-bg",
  },
] as const;

export default function DashboardPage() {
  const { applications } = useApplications();
  const stats = getDashboardStats(applications);

  // ⑬通知機能: LINE報告未実施・通知書未登録・許可未処理をアプリ内で可視化
  const needsAttention = applications
    .filter((a) => a.status !== "許可済" && a.status !== "申請前")
    .filter((a) => !a.lineReported || a.status === "通知書到着");

  return (
    <div className="-mx-4 -mt-4">
      <AppHeader title="ダッシュボード" />
      <div className="space-y-6 px-4 pt-5">
        <section className="grid grid-cols-2 gap-3">
          {STAT_CARDS.map(({ key, label, icon: Icon, accent }) => (
            <Card key={key} className="p-4">
              <div
                className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}
              >
                <Icon size={20} />
              </div>
              <p className="text-2xl font-black tabular-nums">
                {stats[key]}
                <span className="ml-0.5 text-sm font-bold text-muted">件</span>
              </p>
              <p className="text-xs font-medium text-muted">{label}</p>
            </Card>
          ))}
        </section>

        {needsAttention.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-bold text-muted">
              対応が必要な案件
            </h2>
            <Card className="divide-y divide-border overflow-hidden">
              {needsAttention.map((a) => (
                <Link
                  key={a.id}
                  href={`/applications/${a.id}`}
                  className="flex items-center gap-3 p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{a.name}</p>
                    <p className="truncate text-xs text-muted">
                      {a.applicationContent}
                    </p>
                  </div>
                  {!a.lineReported && (
                    <span className="rounded-full bg-seal/10 px-2 py-1 text-[11px] font-bold text-seal">
                      未報告
                    </span>
                  )}
                  {a.status === "通知書到着" && (
                    <span className="rounded-full bg-status-notice-bg px-2 py-1 text-[11px] font-bold text-status-notice-fg">
                      許可待ち
                    </span>
                  )}
                  <ChevronRight size={18} className="shrink-0 text-muted" />
                </Link>
              ))}
            </Card>
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-muted">最近の申請</h2>
            <Link
              href="/applications"
              className="text-sm font-bold text-brand"
            >
              すべて見る
            </Link>
          </div>
          <Card className="divide-y divide-border overflow-hidden">
            {applications.slice(0, 3).map((a) => (
              <Link
                key={a.id}
                href={`/applications/${a.id}`}
                className="flex items-center gap-3 p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{a.name}</p>
                  <p className="truncate text-xs text-muted">
                    申請日 {a.applicationDate}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </Link>
            ))}
          </Card>
        </section>
      </div>
    </div>
  );
}
