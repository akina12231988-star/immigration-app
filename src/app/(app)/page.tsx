"use client";

import Link from "next/link";
import {
  FileClock,
  MessageCircleWarning,
  MailWarning,
  CheckCircle2,
  ChevronRight,
  Users,
  Building2,
  ShieldCheck,
  Briefcase,
  ClipboardList,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getDashboardStats } from "@/lib/application-stats";
import { useApplications } from "@/lib/application-store";

const STAT_CARDS = [
  {
    key: "thisMonthCount",
    view: "this-month",
    label: "今月申請件数",
    icon: FileClock,
    accent: "text-status-applied-fg bg-status-applied-bg",
  },
  {
    key: "unreportedCount",
    view: "unreported",
    label: "未報告件数",
    icon: MessageCircleWarning,
    accent: "text-seal bg-seal/10",
  },
  {
    key: "waitingNoticeCount",
    view: "waiting-notice",
    label: "通知書待ち件数",
    icon: MailWarning,
    accent: "text-status-notice-fg bg-status-notice-bg",
  },
  {
    key: "approvedCount",
    view: "approved",
    label: "許可済件数",
    icon: CheckCircle2,
    accent: "text-status-approved-fg bg-status-approved-bg",
  },
] as const;

export default function DashboardPage() {
  const { applications } = useApplications();
  const stats = getDashboardStats(applications);

  // ⑬通知機能: LINE報告未実施・通知書未登録・在留カード未受領をアプリ内で可視化
  const needsAttention = applications
    .filter(
      (a) =>
        a.status !== "在留カード受領" &&
        a.status !== "申請前" &&
        a.status !== "取下げ"
    )
    .filter(
      (a) => !a.lineReported || a.status === "通知書到着" || a.status === "許可済"
    );

  return (
    <div className="-mx-4 -mt-4 lg:-mx-8 lg:-mt-6">
      <AppHeader title="ダッシュボード" />
      <div className="space-y-6 px-4 pt-5">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STAT_CARDS.map(({ key, view, label, icon: Icon, accent }) => (
            <Link key={key} href={`/applications?view=${view}`}>
              <Card className="h-full p-4 transition hover:border-brand active:scale-[0.98]">
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
            </Link>
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
                  {a.status === "許可済" && (
                    <span className="rounded-full bg-status-approved-bg px-2 py-1 text-[11px] font-bold text-status-approved-fg">
                      在留カード待ち
                    </span>
                  )}
                  <ChevronRight size={18} className="shrink-0 text-muted" />
                </Link>
              ))}
            </Card>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-sm font-bold text-muted">特定技能・管理メニュー</h2>
          <Card className="divide-y divide-border overflow-hidden">
            {[
              { href: "/workers", label: "外国人管理", desc: "職歴・通算期間・支援状況", icon: Users },
              { href: "/postings", label: "求人管理簿", desc: "求人の記録・Facebook掲載用出力", icon: Briefcase },
              { href: "/jobs", label: "選考状況", desc: "選考中の応募を横断表示", icon: ClipboardList },
              { href: "/admin/organizations", label: "会社・機関マスタ", desc: "所属先の登録（管理者のみ）", icon: Building2 },
              { href: "/admin/users", label: "職員・権限管理", desc: "招待・ロール設定（管理者のみ）", icon: ShieldCheck },
            ].map(({ href, label, desc, icon: Icon }) => (
              <Link key={href} href={href} className="flex items-center gap-3 p-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{label}</span>
                  <span className="block truncate text-xs text-muted">{desc}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-muted" />
              </Link>
            ))}
          </Card>
        </section>

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
