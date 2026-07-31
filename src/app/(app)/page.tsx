"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileClock,
  MessageCircleWarning,
  Hourglass,
  CreditCard,
  ChevronRight,
  Users,
  Building2,
  ShieldCheck,
  Briefcase,
  ClipboardList,
  MailWarning,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { OnboardingPendingAlert } from "@/components/OnboardingPendingAlert";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { countPrePrepApplications, getDashboardStats } from "@/lib/application-stats";
import { isExpiryAlert, todayStr } from "@/lib/application-alerts";
import { useApplications } from "@/lib/application-store";
import { buildRenewalPlaceholders } from "@/lib/renewal-placeholders";
import { isSswInsuranceRenewalTarget, remainingLabel } from "@/lib/worker-alerts";
import { formatDateSlash, isStartDateCorrectionNeeded } from "@/lib/onboarding";
import { listWorkersWithOrg, type WorkerWithOrg } from "@/lib/supabase/queries/workers";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { orgStaffLabel } from "@/lib/organization-intake";
import { createClient } from "@/lib/supabase/client";
import type { Organization } from "@/types/db";

const STAT_CARDS = [
  {
    key: "prePrepCount",
    view: "pre-prep",
    label: "申請前＜準備中＞件数",
    icon: FileClock,
    accent: "text-status-before-fg bg-status-before-bg",
  },
  {
    key: "unreportedCount",
    view: "unreported",
    label: "LINE未報告件数",
    icon: MessageCircleWarning,
    accent: "text-seal bg-seal/10",
  },
  {
    key: "waitingNoticeCount",
    view: "waiting-notice",
    label: "現在審査中件数",
    icon: Hourglass,
    accent: "text-status-notice-fg bg-status-notice-bg",
  },
  {
    key: "approvedCount",
    view: "approved",
    label: "在留カード受取待ち件数",
    icon: CreditCard,
    accent: "text-status-approved-fg bg-status-approved-bg",
  },
] as const;

export default function DashboardPage() {
  const { applications } = useApplications();

  // 在留更新で「準備中」の外国人（申請前＜準備中＞の擬似行の件数に使う）
  const [renewalWorkers, setRenewalWorkers] = useState<WorkerWithOrg[]>([]);
  useEffect(() => {
    let cancelled = false;
    listWorkersWithOrg(createClient())
      .then((ws) => {
        if (!cancelled) setRenewalWorkers(ws);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // 所属機関ごとの担当者（主・副）を表示するための機関マスタ
  const [orgs, setOrgs] = useState<Organization[]>([]);
  useEffect(() => {
    let cancelled = false;
    listOrganizations(createClient())
      .then((os) => {
        if (!cancelled) setOrgs(os);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  // 機関IDから担当者表示（例: 市原　彩奈（主）・田上　夏季（副））。未設定は ''
  const staffForOrg = (orgId: string | null | undefined) =>
    orgId ? orgStaffLabel(orgById.get(orgId)?.intake) : "";

  // 入社書類メールの送信記録（雇用開始日の訂正検知に使う）
  const [onbRecords, setOnbRecords] = useState<
    { worker_id: string; employment_start_on: string | null; mail_sent_on: string | null }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    void createClient()
      .from("onboarding_records")
      .select("worker_id, employment_start_on, mail_sent_on")
      .then(({ data }) => {
        if (!cancelled && data) setOnbRecords(data as typeof onbRecords);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const onbRecordByWorker = new Map(onbRecords.map((r) => [r.worker_id, r]));

  // ④在留期限アラート: 申請時点の在留期限から1か月経過・未受取
  const today = todayStr();
  const expiryAlerts = applications.filter((a) => isExpiryAlert(a, today));

  // 入社書類メールの訂正アラート: 初回送信後に雇用開始日が変わった外国人
  const correctionAlerts = renewalWorkers
    .map((w) => ({ w, r: onbRecordByWorker.get(w.id) }))
    .filter(({ w, r }) =>
      r
        ? isStartDateCorrectionNeeded({
            recordStartOn: r.employment_start_on,
            workerStartOn: w.employment_start_on,
            mailSentOn: r.mail_sent_on,
          })
        : false,
    );

  // 特定技能総合保険の期限アラート: 有効期限まで1か月以内（または超過）の外国人。
  // 所属機関が外国人負担で本人が自己負担加入を希望していない場合（未加入）は対象外
  const insuranceAlerts = renewalWorkers.filter((w) => {
    if (!isSswInsuranceRenewalTarget(w, today)) return false;
    const burden =
      (w.current_organization_id
        ? orgById.get(w.current_organization_id)?.intake?.ssw_insurance_burden
        : "") ?? "";
    return burden !== "外国人負担" || w.ssw_insurance_self_join;
  });

  // 申請前＜準備中＞: 実レコード＋在留更新準備中の擬似行（申請一覧のタブと同じ件数）
  const prePrepCount =
    countPrePrepApplications(applications) +
    buildRenewalPlaceholders(renewalWorkers, applications, today).length;
  const stats = { ...getDashboardStats(applications), prePrepCount };

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
                        {staffForOrg(a.organizationId) && ` ・担当 ${staffForOrg(a.organizationId)}`}
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-seal" />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {insuranceAlerts.length > 0 && (
          <section>
            <div className="rounded-2xl border-2 border-seal bg-seal/10 p-4">
              <div className="mb-2 flex items-center gap-2 font-bold text-seal">
                <ShieldAlert size={18} />
                特定技能総合保険 期限アラート {insuranceAlerts.length}件
              </div>
              <p className="mb-2 text-xs text-seal/90">
                特定技能総合保険の有効期限まで1か月を切った（または期限切れの）外国人です。更新手続きをしてください。
              </p>
              <div className="space-y-1.5">
                {insuranceAlerts.map((w) => (
                  <Link
                    key={w.id}
                    href={`/workers/${w.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{w.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {w.organizations?.name ?? ""} 有効期限 {w.ssw_insurance_expiry_date}
                        {w.ssw_insurance_expiry_date &&
                          `（${remainingLabel(w.ssw_insurance_expiry_date, today)}）`}
                        {staffForOrg(w.current_organization_id) &&
                          ` ・担当 ${staffForOrg(w.current_organization_id)}`}
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-seal" />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 入社書類メールの訂正アラート: 送信後に雇用開始日が変わった外国人 */}
        {correctionAlerts.length > 0 && (
          <section>
            <div className="rounded-2xl border-2 border-seal bg-seal/10 p-4">
              <div className="mb-2 flex items-center gap-2 font-bold text-seal">
                <MailWarning size={18} />
                入社書類の訂正が必要 {correctionAlerts.length}件
              </div>
              <p className="mb-2 text-xs text-seal/90">
                入社書類メールを送った後に雇用開始日が変わった外国人です。訂正版（雇用条件書・労働者名簿など）を送ってください。
              </p>
              <div className="space-y-1.5">
                {correctionAlerts.map(({ w, r }) => (
                  <Link
                    key={w.id}
                    href={`/onboarding?worker=${w.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{w.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {w.organizations?.name ?? ""} 雇用開始日{" "}
                        {formatDateSlash(r?.employment_start_on ?? null)} →{" "}
                        {formatDateSlash(w.employment_start_on)}
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-seal" />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 入社書類の後送待ちアラート */}
        <OnboardingPendingAlert />

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
                      {staffForOrg(a.organizationId) && ` ・担当 ${staffForOrg(a.organizationId)}`}
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
