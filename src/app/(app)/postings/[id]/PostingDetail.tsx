"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ClipboardList, Megaphone, Pencil, Share2, Trash2, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PostingForm } from "@/components/postings/PostingForm";
import { PostingStatusBadge } from "@/components/postings/PostingStatusBadge";
import { PostingOutputDialog } from "@/components/postings/PostingOutputDialog";
import { ApplicationResultBadge } from "@/components/postings/ApplicationResultBadge";
import { PostingFileAttachments } from "@/components/postings/PostingFileAttachments";
import { JikoShinkokuSection } from "@/components/postings/JikoShinkokuSection";
import { createClient } from "@/lib/supabase/client";
import { deletePosting, updatePosting } from "@/lib/supabase/queries/postings";
import { postingDisplayName } from "@/lib/posting-output";
import {
  contractText,
  holidayText,
  insurancesText,
  normalizePostingSheet,
  smokingText,
  workHoursText,
} from "@/lib/posting-sheet";
import { formatWage, type ApplicationResult, type JobPostingInput } from "@/types/recruiting";
import type { Organization } from "@/types/db";
import type { PostingWithStats } from "@/lib/supabase/queries/postings";
import type { ApplicationWithRefs } from "@/lib/supabase/queries/jobs";

export function PostingDetail({
  posting,
  organizations,
  applicants,
  canEdit,
}: {
  posting: PostingWithStats;
  organizations: Organization[];
  applicants: ApplicationWithRefs[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orgName = posting.organizations?.name;

  // 求人票（会社に書いてもらった内容）
  const sheet = normalizePostingSheet(posting.sheet);

  const hired = applicants.filter((a) => a.result === "採用").length;
  // 所属機関が求人で必須としている他条件（所属機関の情報で登録）
  const postingOrg = organizations.find((o) => o.id === posting.organization_id);
  const orgPostingNote = (postingOrg?.intake?.posting_note ?? "").trim();

  const handleUpdate = async (input: JobPostingInput) => {
    await updatePosting(createClient(), posting.id, input);
    setEditOpen(false);
    router.refresh();
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePosting(createClient(), posting.id);
      router.push("/postings");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {orgPostingNote && (
        <p className="rounded-xl border border-status-notice-fg/50 bg-status-notice-bg/50 px-3 py-2.5 text-xs font-bold leading-relaxed text-status-notice-fg">
          ⚠ この所属機関の求人必須条件: {orgPostingNote}
        </p>
      )}

      {/* 編集: 鉛筆を押すと、今表示している内容をこの場で直接編集できる（モーダルは廃止） */}
      {editOpen ? (
        <Card className="p-4">
          <p className="mb-2 text-sm font-bold text-muted">
            求人を編集（内容を直して「更新する」を押してください）
          </p>
          <PostingForm
            initial={posting}
            organizations={organizations}
            submitLabel="更新する"
            onSubmit={handleUpdate}
            onCancel={() => setEditOpen(false)}
          />
        </Card>
      ) : (
        <>
      <Card className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-lg font-black">{postingDisplayName(posting, orgName)}</p>
            {orgName && posting.display_company && (
              <p className="text-xs text-muted">機関: {orgName}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <PostingStatusBadge status={posting.status} />
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                aria-label="編集"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted"
              >
                <Pencil size={15} />
              </button>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <Info label="職種" value={posting.job_type} />
          <Info label="給与" value={formatWage(posting.wage_kind, posting.wage_amount)} />
          <Info label="募集人数" value={`${posting.openings}名（採用${hired}名）`} />
          <Info label="性別" value={posting.gender} />
          <Info label="就業場所" value={posting.work_location} />
          <Info label="掲載用住所" value={posting.display_address} />
          <Info label="対象国籍" value={posting.target_nationality} />
          <Info label="採用予定" value={posting.hire_timing} />
          <Info label="雇用期間" value={posting.employment_period} />
          <Info label="連絡先" value={posting.contact} />
          <Info label="受付日" value={posting.received_on} />
          <Info label="有効期限" value={posting.valid_until} />
          <Info label="備考" value={posting.note} wide />
        </dl>
      </Card>

      {/* 求人票（会社に書いてもらう内容）。編集は上の鉛筆から */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <ClipboardList size={15} className="text-brand" />
            求人票（特定技能1号）
          </h2>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <Info label="分野名" value={sheet.field_name} />
          <Info label="記入日" value={sheet.filled_on} />
          <Info label="勤務地の変更の可能性" value={sheet.work_location_change} />
          <Info label="契約期間" value={contractText(sheet)} />
          <Info label="仕事内容" value={sheet.job_description} wide />
          <Info label="勤務時間" value={workHoursText(sheet)} />
          <Info label="変形労働制" value={sheet.flexible_hours} />
          <Info label="休憩" value={sheet.break_minutes ? `${sheet.break_minutes}分` : ""} />
          <Info label="残業" value={sheet.overtime} />
          <Info label="休日" value={holidayText(sheet)} wide />
          {sheet.allowances
            .filter((a) => a.name || a.amount || a.method)
            .map((a, i) => (
              <Info
                key={i}
                label={`手当${sheet.allowances.length > 1 ? i + 1 : ""}`}
                value={[
                  a.name,
                  a.amount ? `${Number(a.amount).toLocaleString("ja-JP")}円` : "",
                  a.method ? `計算方法：${a.method}` : "",
                ]
                  .filter(Boolean)
                  .join("／")}
                wide
              />
            ))}
          <Info
            label="源泉所得税（扶養0人）"
            value={
              /^\d+$/.test(sheet.income_tax)
                ? `${Number(sheet.income_tax).toLocaleString("ja-JP")}円`
                : sheet.income_tax
            }
          />
          <Info
            label="社会保険料・雇用保険料"
            value={
              sheet.social_insurance || sheet.employment_insurance
                ? `社保 ${sheet.social_insurance || "—"} ／ 雇用 ${sheet.employment_insurance || "—"}`
                : ""
            }
          />
          <Info
            label="居住費"
            value={[
              sheet.housing_cost ? `${Number(sheet.housing_cost).toLocaleString("ja-JP")}円` : "",
              sheet.housing_kind,
              sheet.housing_note,
            ]
              .filter(Boolean)
              .join("／")}
            wide
          />
          <Info
            label="水道光熱費"
            value={[
              sheet.utility_cost ? `約${Number(sheet.utility_cost).toLocaleString("ja-JP")}円` : "",
              sheet.utility_kind,
            ]
              .filter(Boolean)
              .join("／")}
          />
          <Info
            label="通信費"
            value={
              /^\d+$/.test(sheet.communication_cost)
                ? `約${Number(sheet.communication_cost).toLocaleString("ja-JP")}円`
                : sheet.communication_cost
            }
          />
          <Info label="昇給" value={[sheet.raise, sheet.raise_note].filter(Boolean).join("／")} />
          <Info label="賞与" value={[sheet.bonus, sheet.bonus_note].filter(Boolean).join("／")} />
          <Info
            label="給与の締切日・支払日"
            value={
              sheet.pay_closing_day || sheet.pay_day
                ? `${sheet.pay_closing_day || "—"} 締切 ／ ${sheet.pay_day || "—"} 支払`
                : ""
            }
          />
          <Info label="支払方法" value={sheet.pay_method} />
          <Info label="加入保険" value={insurancesText(sheet)} wide />
          <Info label="受動喫煙防止措置" value={smokingText(sheet)} wide />
          <Info label="経験の有無" value={sheet.experience} />
          <Info label="必要条件" value={sheet.requirements} />
          <Info label="その他（応募条件）" value={sheet.other_requirements} wide />
        </dl>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          会社からもらった求人票の内容です。空欄は上の鉛筆マーク（編集）から入力できます。
          職種・就業場所・採用人数・基本給・連絡先は上の求人管理簿の欄と共通です。
        </p>
        {/* 記載してもらった求人票の原本（PDF・画像）を添付して残す（求人管理簿の裏付け） */}
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1.5 text-[11px] font-bold text-muted">求人票の原本（PDF・画像）</p>
          <PostingFileAttachments postingId={posting.id} canEdit={canEdit} />
        </div>
        {/* 求人不受理に係る自己申告書（訪問指導の確認書類⑦）。この求人の内容で作って添付する */}
        <JikoShinkokuSection
          postingId={posting.id}
          orgName={postingOrg?.name ?? orgName ?? ""}
          orgAddress={postingOrg?.address ?? ""}
          repName={(postingOrg?.intake?.rep_name ?? "").trim()}
          dateOn={posting.received_on ?? ""}
          canEdit={canEdit}
        />
      </Card>
        </>
      )}

      <Button
        variant="primary"
        fullWidth
        icon={<Share2 size={18} />}
        onClick={() => setOutputOpen(true)}
      >
        Facebook掲載用に出力
      </Button>

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-muted">
          <Users size={14} />
          応募者（{applicants.length}名）
        </h2>
        {applicants.length === 0 ? (
          <Card className="p-5 text-center text-sm text-muted">
            まだ応募はありません。外国人の詳細ページ「求職」タブから、この求人への応募を登録できます。
          </Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {applicants.map((a) => (
              <Link
                key={a.id}
                href={a.workers ? `/workers/${a.workers.id}` : "#"}
                className="flex items-center gap-3 p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <p className="truncate font-bold">{a.workers?.name ?? "（削除済み）"}</p>
                    <ApplicationResultBadge result={a.result as ApplicationResult} />
                  </div>
                  <p className="text-xs tabular-nums text-muted">
                    応募日 {a.applied_on}
                    {a.interview_on && ` ・ 面接 ${a.interview_on}`}
                  </p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-muted" />
              </Link>
            ))}
          </Card>
        )}
      </section>

      {canEdit && (
        <Button
          variant="seal"
          fullWidth
          icon={<Trash2 size={18} />}
          onClick={() => setDeleteOpen(true)}
        >
          この求人を削除
        </Button>
      )}

      <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-muted">
        <Megaphone size={13} className="mt-0.5 shrink-0" />
        求人管理簿は厚生労働省の記載事項に沿って記録しています。掲載用の会社名・住所は別途「Facebook掲載用」欄で設定できます。
      </p>

      {outputOpen && (
        <PostingOutputDialog
          posting={posting}
          orgName={orgName}
          onClose={() => setOutputOpen(false)}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        title="求人を削除"
        message={`「${postingDisplayName(posting, orgName)}」を削除します。この求人への応募記録の紐づけは外れます（応募自体は残ります）。`}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

function Info({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string | null;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[11px] font-bold text-muted">{label}</dt>
      <dd className="whitespace-pre-wrap break-words">{value || "—"}</dd>
    </div>
  );
}
