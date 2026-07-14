"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Megaphone, Pencil, Share2, Trash2, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PostingForm } from "@/components/postings/PostingForm";
import { PostingStatusBadge } from "@/components/postings/PostingStatusBadge";
import { PostingOutputDialog } from "@/components/postings/PostingOutputDialog";
import { ApplicationResultBadge } from "@/components/postings/ApplicationResultBadge";
import { createClient } from "@/lib/supabase/client";
import { deletePosting, updatePosting } from "@/lib/supabase/queries/postings";
import { postingDisplayName } from "@/lib/posting-output";
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
  const hired = applicants.filter((a) => a.result === "採用").length;

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

      {editOpen && (
        <Modal open title="求人を編集" onClose={() => setEditOpen(false)}>
          <PostingForm
            initial={posting}
            organizations={organizations}
            submitLabel="更新する"
            onSubmit={handleUpdate}
            onCancel={() => setEditOpen(false)}
          />
        </Modal>
      )}

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
