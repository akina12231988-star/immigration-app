"use client";

import { useState } from "react";
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
import { SSW_INDUSTRIES } from "@/lib/industries";
import type { Organization, OrganizationInput } from "@/types/db";

const EMPTY: OrganizationInput = { name: "", industry: "", address: "", contact: "", note: "" };

const INPUT_CLASS =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

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
                <div className="flex min-w-0 items-center gap-2">
                  <Building2 size={16} className="shrink-0 text-muted" />
                  <p className="truncate font-bold">{org.name}</p>
                </div>
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
                {[org.industry, org.address, org.contact].filter(Boolean).join(" ・ ") ||
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
  const [form, setForm] = useState<OrganizationInput>(
    initial
      ? {
          name: initial.name,
          industry: initial.industry,
          address: initial.address,
          contact: initial.contact,
          note: initial.note,
        }
      : EMPTY,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof OrganizationInput>(key: K, value: OrganizationInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

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
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">名称（必須）</span>
          <input
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="株式会社◯◯食品"
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">業種（特定技能 産業分野）</span>
          <select
            value={form.industry}
            onChange={(e) => set("industry", e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">選択してください</option>
            {SSW_INDUSTRIES.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">所在地</span>
          <input
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">連絡先</span>
          <input
            value={form.contact}
            onChange={(e) => set("contact", e.target.value)}
            placeholder="担当者名・電話番号など"
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">備考</span>
          <input
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <Button type="submit" fullWidth disabled={busy} className="mt-1">
          {busy ? "保存中…" : initial ? "更新する" : "登録する"}
        </Button>
      </form>
    </Modal>
  );
}
