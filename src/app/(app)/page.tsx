"use client";

import { useEffect, useState } from "react";
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
  TriangleAlert,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getDashboardStats } from "@/lib/application-stats";
import { isExpiryAlert, todayStr } from "@/lib/application-alerts";
import { useApplications } from "@/lib/application-store";
import { createClient } from "@/lib/supabase/client";

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

  // ④在留期限アラート: 申請時点の在留期限から1か月経過・未受取
  const today = todayStr();
  const expiryAlerts = applications.filter((a) => isExpiryAlert(a, today));

  // ⑨募集中の求人件数
  const [openPostings, setOpenPostings] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void createClient()
      .from("job_postings")
      .select("id", { count: "exact", head: true })
      .eq("status", "募集中")
      .then(({ count }) => {
        if (!cancelled) setOpenPostings(count ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        {expiryAlerts.length > 0 && (
          <section>
            <div className="rounded-2xl border-2 border-seal bg-seal/10 p-4">
              <div className="mb-2 flex items-center gap-2 font-bold text-seal">
                <TriangleAlert size={18} />
                在留期限アラート {expiryAlerts.length}件
              </div>
              <p className="mb-2 text-xs text-seal/90">
                申請時点の在留期限から1か月が経過し、まだ受取処理が済んでいない申請です。
              </p>
              <div className="space-y-1.5">
                {expiryAlerts.map((a) => (
                  <Link
                    key={a.id}
                    href={`/applications/${a.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{a.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {a.organizationName ?? ""} 在留期限 {a.residenceExpiryAtApply}
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-seal" />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

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
          <Card className="flex items-center gap-4 p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Briefcase size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-muted">現在の求人件数（募集中）</p>
              <p className="text-2xl font-black tabular-nums">
                {openPostings ?? "—"}
                <span className="ml-0.5 text-sm font-bold text-muted">件</span>
              </p>
            </div>
            <Link
              href="/postings"
              className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-foreground"
            >
              詳細
            </Link>
          </Card>
        </section>

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
