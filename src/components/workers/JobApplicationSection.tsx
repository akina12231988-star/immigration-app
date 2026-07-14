"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Pencil, Plus, Trash2, UserCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ApplicationResultBadge } from "@/components/postings/ApplicationResultBadge";
import { JobApplicationDialog } from "@/components/workers/JobApplicationDialog";
import { EmploymentDialog } from "@/components/workers/EmploymentDialog";
import { createClient } from "@/lib/supabase/client";
import {
  deleteApplication,
  insertApplication,
  insertEmployment,
  updateApplication,
} from "@/lib/supabase/queries/jobs";
import type { ApplicationWithRefs } from "@/lib/supabase/queries/jobs";
import type { PostingWithStats } from "@/lib/supabase/queries/postings";
import type { ApplicationResult, EmploymentInput } from "@/types/recruiting";
import type { JobApplicationValues } from "@/components/workers/JobApplicationDialog";

// 外国人詳細の「求職」セクション。応募の記録と、採用→所属自動更新の起点
export function JobApplicationSection({
  workerId,
  applications,
  postings,
  canEdit,
}: {
  workerId: string;
  applications: ApplicationWithRefs[];
  postings: PostingWithStats[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ApplicationWithRefs | null>(null);
  const [employFor, setEmployFor] = useState<ApplicationWithRefs | null>(null);
  const [deleting, setDeleting] = useState<ApplicationWithRefs | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitApplication = async (values: JobApplicationValues) => {
    const supabase = createClient();
    if (editing) {
      await updateApplication(supabase, editing.id, values);
    } else {
      await insertApplication(supabase, { ...values, worker_id: workerId });
    }
    router.refresh();
  };

  const submitEmployment = async (input: EmploymentInput) => {
    await insertEmployment(createClient(), input);
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteApplication(createClient(), deleting.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-muted">
          <BriefcaseBusiness size={14} />
          求職・応募（{applications.length}件）
        </h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-brand-foreground"
          >
            <Plus size={14} />
            応募を登録
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {applications.length === 0 ? (
        <Card className="p-5 text-center text-sm text-muted">
          応募の記録はありません。求人を選んで応募を登録すると、選考状況や採用がここで管理できます。
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {applications.map((a) => (
            <div key={a.id} className="p-3.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ApplicationResultBadge result={a.result as ApplicationResult} />
                  <p className="text-sm font-bold">
                    {a.job_postings?.display_company ||
                      a.organizations?.name ||
                      "応募先"}
                  </p>
                </div>
                {canEdit && (
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label="編集"
                      onClick={() => {
                        setEditing(a);
                        setDialogOpen(true);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label="削除"
                      onClick={() => setDeleting(a)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-seal"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                )}
              </div>
              <p className="text-xs tabular-nums text-muted">
                応募日 {a.applied_on}
                {a.interview_on && ` ・ 面接 ${a.interview_on}`}
                {a.result_on && ` ・ 結果 ${a.result_on}`}
              </p>
              {a.note && <p className="mt-0.5 truncate text-xs text-muted">{a.note}</p>}
              {canEdit && a.result === "採用" && (
                <button
                  type="button"
                  onClick={() => setEmployFor(a)}
                  className="mt-2 flex items-center gap-1.5 rounded-lg border border-brand px-3 py-1.5 text-xs font-bold text-brand"
                >
                  <UserCheck size={14} />
                  採用記録を登録（所属機関を反映）
                </button>
              )}
            </div>
          ))}
        </Card>
      )}

      {dialogOpen && (
        <JobApplicationDialog
          initial={editing}
          postings={postings}
          onClose={() => setDialogOpen(false)}
          onSubmit={submitApplication}
        />
      )}

      {employFor && (
        <EmploymentDialog
          workerId={workerId}
          application={employFor}
          onClose={() => setEmployFor(null)}
          onSubmit={submitEmployment}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="応募を削除"
        message={
          deleting
            ? `${deleting.applied_on} の応募記録を削除します。この操作は取り消せません。`
            : ""
        }
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}
