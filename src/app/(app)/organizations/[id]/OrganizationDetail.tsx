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
import {
  orgSupportManagers,
  orgSupportStaff,
  requiredSupportStaffCount,
} from "@/lib/support-system";
import type { Organization, OrganizationInput } from "@/types/db";

// 所属機関の詳細表示。開いた時点で入力済みの欄は表示のみ、
// 未記入の欄はこの画面で入力して保存できる（修正は一覧の鉛筆ボタンから）
export function OrganizationDetail({
  organization,
  managerNames = [],
  staffNames = [],
  workerCount = 0,
}: {
  organization: Organization;
  managerNames?: string[]; // 支援責任者にしている従業員（/employees で設定）
  staffNames?: string[]; // 支援担当者にしている従業員（/employees で設定）
  workerCount?: number; // この機関に在籍している1号特定技能外国人数
}) {
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

  // 支援体制の表示は保存済みの内容（form ではなく organization）を使う
  const managers = orgSupportManagers(organization.intake);
  const supportStaff = orgSupportStaff(organization.intake);
  const dual = managers.filter((n) => supportStaff.includes(n));

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
      {/* 支援体制（令和9年4月1日施行の要件）。在籍数と選任状況をひと目で確認できるようにする */}
      <Card className="p-4">
        <h2 className="mb-1 text-sm font-bold">支援体制</h2>
        <p className="text-xs">
          <span className="text-muted">在籍（1号特定技能）: </span>
          <span className="font-bold">{workerCount}名</span>
          <span className="ml-2 text-muted">
            必要人数（この機関分）: 支援責任者1名以上・支援担当者
            {requiredSupportStaffCount(workerCount > 0 ? 1 : 0, workerCount)}名以上
          </span>
        </p>
        <p className="mt-1 text-xs">
          <span className="text-muted">支援責任者: </span>
          {managers.length > 0 ? (
            managers.join("・")
          ) : (
            <span className="font-bold text-seal">未選任</span>
          )}
        </p>
        <p className="text-xs">
          <span className="text-muted">支援担当者: </span>
          {supportStaff.length > 0 ? (
            supportStaff.join("・")
          ) : (
            <span className="font-bold text-seal">未選任</span>
          )}
        </p>
        {dual.length > 0 && <p className="text-xs text-muted">兼任: {dual.join("・")}</p>}
      </Card>

      <Card className="p-4">
        <div className="flex flex-col gap-2.5">
          <OrganizationFormBody
            form={form}
            setForm={setForm}
            managerNames={managerNames}
            staffNames={staffNames}
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
          managerNames={managerNames}
          staffNames={staffNames}
          onClose={() => setEditOpen(false)}
          onSubmit={handleEditSubmit}
        />
      )}
    </div>
  );
}
