"use client";

import { useMemo, useState } from "react";
import { CalendarSync, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { WorkerWithOrg } from "@/lib/supabase/queries/workers";
import { residenceRenewalDefaultUntil, RESIDENCE_RENEWAL_MONTHS } from "@/lib/worker-alerts";
import { todayStr } from "@/lib/application-alerts";
import { SUPPORT_SCOPES, type SupportScope } from "@/types/db";
import { WorkerRenewalCard } from "@/components/workers/WorkerRenewalCard";

// 所属機関の選択肢（絞り込みとカード内の選択で共用）
interface OrgOption {
  id: string;
  name: string;
}

const SELECT_CLASS =
  "min-h-[40px] flex-1 rounded-xl border border-border bg-surface px-2.5 text-xs font-bold focus:border-brand focus:outline-none";

// 更新準備: 在留期限が近い人（初期値は4か月以内）を在留期限順に並べ、
// 所属機関・支援区分・国籍で絞り込める一覧
export function RenewalPrepClient({
  workers,
  organizations,
  underReviewWorkerIds = [],
  canEdit,
}: {
  workers: WorkerWithOrg[];
  organizations: OrgOption[];
  underReviewWorkerIds?: string[];
  canEdit: boolean;
}) {
  const today = todayStr();
  // 在留期限をいつまで表示するか（初期値は4か月後。日付を変えると先の人も見られる）
  const defaultUntil = residenceRenewalDefaultUntil(today);
  const [until, setUntil] = useState(defaultUntil);
  const [orgId, setOrgId] = useState<"all" | "none" | string>("all");
  const [support, setSupport] = useState<SupportScope | "all">("all");
  const [nationality, setNationality] = useState<string>("all");

  const underReview = useMemo(() => new Set(underReviewWorkerIds), [underReviewWorkerIds]);
  const orgNames = useMemo(() => new Map(organizations.map((o) => [o.id, o.name])), [organizations]);

  // カードの見出しと同じ「申請準備先（転職なら転職先）→ 現在の所属機関」で絞り込む
  const prepOrgIdOf = (w: WorkerWithOrg) =>
    w.application_prep_organization_id ?? w.current_organization_id;

  // 表示対象: 在留期限が「いつまで」以前の人（超過も含む）。
  // 退職者・新規準備で追加した人・申請の途中（受付済みで許可待ち）の人は対象外
  const targets = useMemo(() => {
    const limit = until || defaultUntil;
    return workers
      .filter(
        (w) =>
          w.status !== "退職" &&
          w.application_prep_kind !== "新規" &&
          w.residence_expiry_date &&
          w.residence_expiry_date <= limit &&
          !underReview.has(w.id),
      )
      .sort((a, b) =>
        (a.residence_expiry_date ?? "").localeCompare(b.residence_expiry_date ?? ""),
      );
  }, [workers, until, defaultUntil, underReview]);

  // 国籍の選択肢（対象者に登録されている国籍を重複なしで五十音順に）
  const nationalities = useMemo(
    () =>
      [...new Set(targets.map((w) => w.nationality.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "ja"),
      ),
    [targets],
  );

  const filtered = useMemo(
    () =>
      targets.filter((w) => {
        if (support !== "all" && w.support !== support) return false;
        if (nationality !== "all" && w.nationality !== nationality) return false;
        if (orgId === "none") return !prepOrgIdOf(w);
        if (orgId !== "all") return prepOrgIdOf(w) === orgId;
        return true;
      }),
    [targets, orgId, support, nationality],
  );

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
        <CalendarSync size={14} className="mt-0.5 shrink-0" />
        在留期限の{RESIDENCE_RENEWAL_MONTHS}
        か月前になった人を、在留期限が近い順に表示しています。前もって更新の準備を始めてください。
        退職した人と、すでに入管申請が受付済みで結果待ちの人は表示されません。
      </p>

      {/* 絞り込み: 所属機関・支援区分・国籍（並びは在留期限が近い順で固定） */}
      <div className="flex flex-wrap gap-2">
        <select
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          aria-label="所属機関で絞り込み"
          className={SELECT_CLASS}
        >
          <option value="all">所属機関: すべて</option>
          <option value="none">未所属</option>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          value={support}
          onChange={(e) => setSupport(e.target.value as SupportScope | "all")}
          aria-label="支援区分で絞り込み"
          className={SELECT_CLASS}
        >
          <option value="all">支援区分: すべて</option>
          {SUPPORT_SCOPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={nationality}
          onChange={(e) => setNationality(e.target.value)}
          aria-label="国籍で絞り込み"
          className={SELECT_CLASS}
        >
          <option value="all">国籍: すべて</option>
          {nationalities.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {/* 在留期限をいつまで表示するか（初期値は4か月後。伸ばすと先の人も確認できる） */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface px-3.5 py-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-muted">在留期限をいつまで表示するか</span>
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="min-h-[40px] rounded-lg border border-border bg-background px-2 text-sm focus:border-brand focus:outline-none"
          />
        </label>
        {until !== defaultUntil && (
          <button
            type="button"
            onClick={() => setUntil(defaultUntil)}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-border bg-surface px-3 text-xs font-bold text-muted"
          >
            <X size={14} />
            {RESIDENCE_RENEWAL_MONTHS}か月後に戻す
          </button>
        )}
        <p className="w-full text-[11px] text-muted">
          在留期限が {until || defaultUntil} までの人を表示中（初期値は
          {RESIDENCE_RENEWAL_MONTHS}か月後の {defaultUntil}）
        </p>
      </div>

      <p className="text-sm font-bold text-muted">{filtered.length}名</p>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">該当者はいません。</Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((w) => (
            <WorkerRenewalCard
              key={w.id}
              worker={w}
              orgName={
                w.organizations?.name ??
                (w.current_organization_id
                  ? (orgNames.get(w.current_organization_id) ?? null)
                  : null)
              }
              organizations={organizations}
              today={today}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
