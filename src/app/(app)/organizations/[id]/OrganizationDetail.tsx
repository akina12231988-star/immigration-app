"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { updateOrganization } from "@/lib/supabase/queries/organizations";
import { OrganizationFormModal } from "@/app/(app)/admin/organizations/OrganizationsAdmin";
import {
  OrganizationFormBody,
  organizationToInput,
} from "../OrganizationFormFields";
import type { Organization, OrganizationInput } from "@/types/db";

// 所属機関の詳細表示。開いた時点で入力済みの欄は表示のみ、
// 未記入の欄はこの画面で入力して保存できる（修正は一覧の鉛筆ボタンから）
export function OrganizationDetail({ organization }: { organization: Organization }) {
  const router = useRouter();
  // snapshot = 表示のみにする基準（保存すると入力した欄も表示に切り替わる）
  const [snapshot, setSnapshot] = useState(() => organizationToInput(organization));
  const [form, setForm] = useState(() => organizationToInput(organization));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(snapshot),
    [form, snapshot],
  );

  // 鉛筆（編集）: 登録済みの内容も修正できる編集モーダル。保存後は最新の内容で表示し直す
  const handleEditSubmit = async (input: OrganizationInput) => {
    const saved = await updateOrganization(createClient(), organization.id, {
      ...input,
      name: input.name.trim(),
    });
    setEditOpen(false);
    const next = organizationToInput(saved);
    setSnapshot(next);
    setForm(next);
    setNotice({ ok: true, message: "更新しました" });
    router.refresh();
  };

  const handleSave = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await updateOrganization(createClient(), organization.id, form);
      setSnapshot(form);
      setNotice({ ok: true, message: "保存しました" });
      router.refresh();
    } catch (err) {
      setNotice({
        ok: false,
        message: `保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(false);
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
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs leading-relaxed text-muted">
          未記入の欄はこの画面でそのまま入力して保存できます。
          入力済みの項目を修正する場合は「編集」ボタンを使ってください。
        </p>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold"
        >
          <Pencil size={14} />
          編集
        </button>
      </div>
      <Card className="p-4">
        <div className="flex flex-col gap-2.5">
          <OrganizationFormBody
            form={form}
            setForm={setForm}
            orgId={organization.id}
            snapshot={snapshot}
          />
          <Button fullWidth disabled={busy || !dirty} onClick={handleSave} className="mt-1">
            {busy ? "保存中…" : "入力した内容を保存"}
          </Button>
        </div>
      </Card>

      {editOpen && (
        <OrganizationFormModal
          initial={organization}
          onClose={() => setEditOpen(false)}
          onSubmit={handleEditSubmit}
        />
      )}
    </div>
  );
}
