import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, CalendarClock } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/Card";
import { ApplicationResultBadge } from "@/components/postings/ApplicationResultBadge";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listActiveApplications } from "@/lib/supabase/queries/jobs";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const active = await listActiveApplications(supabase).catch(() => []);

  return (
    <>
      <AppHeader title="選考状況" backHref="/" />
      <div className="space-y-4">
        <p className="text-sm text-muted">
          選考中の応募を面接日順で表示します（{active.length}件）
        </p>
        {active.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">
            選考中の応募はありません。
          </Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {active.map((a) => (
              <Link
                key={a.id}
                href={a.workers ? `/workers/${a.workers.id}` : "#"}
                className="flex items-center gap-3 p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <p className="truncate font-bold">{a.workers?.name ?? "（削除済み）"}</p>
                    <ApplicationResultBadge result="選考中" />
                  </div>
                  <p className="truncate text-xs text-muted">
                    {a.job_postings?.display_company || a.organizations?.name || "応募先"}
                  </p>
                  <p className="flex items-center gap-1 text-xs tabular-nums text-muted">
                    <CalendarClock size={12} />
                    {a.interview_on ? `面接 ${a.interview_on}` : "面接日未定"} ・ 応募 {a.applied_on}
                  </p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-muted" />
              </Link>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}
