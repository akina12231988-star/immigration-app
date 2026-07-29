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
import type { Organization, OrganizationInput } from "@/types/db";

export function OrganizationsAdmin({ organizations }: { organizations: Organization[] }) {
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
            </Card>
          ))}
        </div>
      )}

      {formOpen && (
        <OrganizationFormModal
          initial={editing}
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

function OrganizationFormModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial: Organization | null;
  onClose: () => void;
  onSubmit: (input: OrganizationInput) => Promise<void>;
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
