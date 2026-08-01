"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import {
  deleteOrganization,
  insertOrganization,
  updateOrganization,
} from "@/lib/supabase/queries/organizations";
import {
  OrganizationFormBody,
  emptyOrganizationInput,
  organizationToInput,
} from "@/app/(app)/organizations/OrganizationFormFields";
import {
  orgRequiredPersons,
  orgSupportManagers,
  orgSupportStaff,
} from "@/lib/support-system";
import type { Organization, OrganizationInput } from "@/types/db";

// 所属機関ごとの在籍数（1号特定技能外国人）。支援体制ページと同じ数え方
export interface OrgWorkerCounts {
  [organizationId: string]: number;
}

// 在籍数・支援責任者・支援担当者・必要人数の1行表示（令和9年4月1日施行の要件）
function OrgSupportLine({ org, workerCount }: { org: Organization; workerCount: number }) {
  const managers = orgSupportManagers(org.intake);
  const staff = orgSupportStaff(org.intake);
  const dual = managers.filter((n) => staff.includes(n));
  // 支援責任者等 = 責任者と担当者の実人数（兼務は1人）。在籍数から必要人数を出す
  const persons = new Set([...managers, ...staff]).size;
  const needPersons = orgRequiredPersons(workerCount);
  const shortage = Math.max(0, needPersons - persons);
  return (
    <div className="mt-1.5 border-t border-border pt-1.5 text-xs">
      <p>
        <span className="text-muted">在籍（1号特定技能）: </span>
        <span className="font-bold">{workerCount}名</span>
        <span className="ml-2 text-muted">
          必要な支援責任者等: {needPersons}名（選任 {persons}名）
        </span>
        {shortage > 0 && <span className="font-bold text-seal"> ← {shortage}名不足</span>}
      </p>
      <p className="mt-0.5">
        <span className="text-muted">支援責任者: </span>
        {managers.length > 0 ? (
          managers.join("・")
        ) : (
          <span className="font-bold text-seal">未選任（1人以上必要）</span>
        )}
      </p>
      <p>
        <span className="text-muted">支援担当者: </span>
        {staff.length > 0 ? (
          staff.join("・")
        ) : (
          <span className="font-bold text-seal">未選任（1人以上必要）</span>
        )}
      </p>
      {dual.length > 0 && <p className="text-muted">兼任: {dual.join("・")}</p>}
    </div>
  );
}

export function OrganizationsAdmin({
  organizations,
  managerNames = [],
  staffNames = [],
  workerCounts = {},
}: {
  organizations: Organization[];
  managerNames?: string[]; // 支援責任者にしている従業員
  staffNames?: string[]; // 支援担当者にしている従業員
  workerCounts?: OrgWorkerCounts;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [deleting, setDeleting] = useState<Organization | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (org: Organization) => {
    setEditing(org);
    setFormOpen(true);
  };

  const handleSubmit = async (input: OrganizationInput) => {
    const supabase = createClient();
    if (editing) {
      await updateOrganization(supabase, editing.id, input);
    } else {
      await insertOrganization(supabase, input);
    }
    setFormOpen(false);
    setNotice({ ok: true, message: editing ? "更新しました" : "登録しました" });
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteOrganization(createClient(), deleting.id);
      setNotice({ ok: true, message: `${deleting.name} を削除しました` });
      router.refresh();
    } catch (err) {
      setNotice({
        ok: false,
        message: `削除に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ${
            notice.ok ? "bg-brand/10 text-brand" : "bg-seal/10 text-seal"
          }`}
        >
          {notice.message}
        </p>
      )}

      <Button fullWidth icon={<Plus size={20} />} onClick={openNew}>
        会社・機関を追加
      </Button>

      {organizations.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          まだ登録がありません。外国人の所属先となる会社・機関を追加してください。
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {organizations.map((org) => (
            <Card key={org.id} className="p-4">
              <div className="mb-1 flex items-start justify-between gap-2">
                {/* 名称をタップすると詳細ページ（登録内容の表示・未記入欄の入力）を開く */}
                <Link
                  href={`/organizations/${org.id}`}
                  className="flex min-w-0 items-center gap-2"
                >
                  <Building2 size={16} className="shrink-0 text-muted" />
                  <p className="truncate font-bold underline-offset-2 hover:text-brand hover:underline">
                    {org.name}
                  </p>
                </Link>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label="編集"
                    onClick={() => openEdit(org)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="削除"
                    onClick={() => setDeleting(org)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-seal"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
              <p className="text-xs text-muted">
                {[org.industry, org.business_category, org.address, org.contact].filter(Boolean).join(" ・ ") ||
                  "詳細未登録"}
              </p>
              {org.note && <p className="mt-0.5 text-xs text-muted">{org.note}</p>}
              <OrgSupportLine org={org} workerCount={workerCounts[org.id] ?? 0} />
            </Card>
          ))}
        </div>
      )}

      {formOpen && (
        <OrganizationFormModal
          initial={editing}
          managerNames={managerNames}
          staffNames={staffNames}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="会社・機関を削除"
        message={
          deleting
            ? `「${deleting.name}」を削除します。この機関に所属中の外国人は「未所属」になります。`
            : ""
        }
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// 会社・機関の編集モーダル。一覧（鉛筆ボタン）と詳細ページの「編集」から使う
export function OrganizationFormModal({
  initial,
  onClose,
  onSubmit,
  managerNames = [],
  staffNames = [],
}: {
  initial: Organization | null;
  onClose: () => void;
  onSubmit: (input: OrganizationInput) => Promise<void>;
  managerNames?: string[];
  staffNames?: string[];
}) {
  const [form, setForm] = useState<OrganizationInput>(() =>
    initial ? organizationToInput(initial) : emptyOrganizationInput(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ ...form, name: form.name.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setBusy(false);
    }
  };

  return (
    <Modal open title={initial ? "会社・機関を編集" : "会社・機関を追加"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        {error && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}
        <OrganizationFormBody
          form={form}
          setForm={setForm}
          managerNames={managerNames}
          staffNames={staffNames}
          orgId={initial?.id ?? null}
          snapshot={null}
        />
        <Button type="submit" fullWidth disabled={busy} className="mt-1">
          {busy ? "保存中…" : initial ? "更新する" : "登録する"}
        </Button>
      </form>
    </Modal>
  );
}
