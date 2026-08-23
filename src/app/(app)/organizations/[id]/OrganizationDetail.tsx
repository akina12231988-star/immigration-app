"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { updateOrganization } from "@/lib/supabase/queries/organizations";
import {
  OrganizationFormBody,
  organizationToInput,
} from "../OrganizationFormFields";
import {
  isContractedOrg,
  requiredSupportStaffCount,
  orgSupportManagers,
  orgSupportStaff,
} from "@/lib/support-system";
import type { Organization } from "@/types/db";

// 所属機関の詳細表示。開いた時点で入力済みの欄は表示のみ・未記入の欄はそのまま入力できる。
// 「編集」を押すとこの画面がそのまま編集モードになり、入力済みの項目も直して保存できる
// （以前の「会社・機関を編集」モーダルは廃止し、この画面に統一した）
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
  // 編集モード: 入力済みの項目のロックを外して、この画面のまま修正できる
  const [editing, setEditing] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(snapshot),
    [form, snapshot],
  );

  // 支援体制の表示は保存済みの内容（form ではなく organization）を使う
  const managers = orgSupportManagers(organization.intake);
  const supportStaff = orgSupportStaff(organization.intake);
  const dual = managers.filter((n) => supportStaff.includes(n));
  // 在籍数から必要な支援担当者の人数を出す（支援担当者1人当たり50人未満）
  const needStaff = requiredSupportStaffCount(workerCount);
  const shortage = Math.max(0, needStaff - supportStaff.length);
  const contractStatus = (organization.intake?.support_contract_status ?? "").trim();
  const contracted = isContractedOrg(organization.intake, workerCount);

  const handleSave = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await updateOrganization(createClient(), organization.id, {
        ...form,
        name: form.name.trim(),
      });
      setSnapshot(form);
      setEditing(false);
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
      {/* 会社名のバー〜支援体制までは上部に固定して、下にスクロールしても常に見えるようにする。
          ボタンは表示モードでは「編集」、編集モードでは「編集した内容を保存」に切り替わる */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 flex flex-col gap-3 border-b border-border bg-background px-4 pb-3 pt-2 shadow-sm md:-mx-8 md:-mt-6 md:px-8 md:pt-3">
      <AppHeader title={organization.name} backHref="/organizations" />
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
          {editing
            ? "編集モードです。入力済みの項目もこの画面のまま修正して保存できます。"
            : "未記入の欄はこの画面でそのまま入力して保存できます。入力済みの項目を修正する場合は「編集」を押してください。"}
        </p>
        {editing ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                // 変更を破棄して表示モードに戻す
                setForm(snapshot);
                setEditing(false);
              }}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted"
            >
              <X size={14} />
              編集をやめる
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy || !dirty}
              className="rounded-lg bg-brand px-4 py-2 text-xs font-bold text-brand-foreground disabled:opacity-50"
            >
              {busy ? "保存中…" : "編集した内容を保存"}
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            {dirty && (
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={busy}
                className="rounded-lg bg-brand px-4 py-2 text-xs font-bold text-brand-foreground disabled:opacity-50"
              >
                {busy ? "保存中…" : "入力した内容を保存"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold"
            >
              <Pencil size={14} />
              編集
            </button>
          </div>
        )}
      </div>
      {/* 支援体制（令和9年4月1日施行の要件）。在籍数と選任状況をひと目で確認できるようにする */}
      <Card className="p-4">
        <h2 className="mb-1 text-sm font-bold">支援体制</h2>
        <p className="mb-1 text-xs">
          <span className="text-muted">支援委託の状況: </span>
          <span className="font-bold">{contractStatus || "未設定"}</span>
          <span className="ml-2 text-muted">
            {contracted
              ? "委託を受けている機関として数えています"
              : "委託を受けている機関として数えていません"}
          </span>
        </p>
        <p className="text-xs">
          <span className="text-muted">在籍（1号特定技能）: </span>
          <span className="font-bold">{workerCount}名</span>
          <span className="ml-2 text-muted">
            必要な支援担当者: {needStaff}名（選任 {supportStaff.length}名）
          </span>
          {shortage > 0 && <span className="font-bold text-seal"> ← {shortage}名不足</span>}
        </p>
        <p className="mt-1 text-xs">
          <span className="text-muted">支援責任者: </span>
          {managers.length > 0 ? (
            managers.join("・")
          ) : (
            <span className="font-bold text-seal">未選任（1人以上必要）</span>
          )}
        </p>
        <p className="text-xs">
          <span className="text-muted">支援担当者: </span>
          {supportStaff.length > 0 ? (
            supportStaff.join("・")
          ) : (
            <span className="font-bold text-seal">未選任（1人以上必要）</span>
          )}
        </p>
        {dual.length > 0 && <p className="text-xs text-muted">兼任: {dual.join("・")}</p>}
      </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-2.5">
          <OrganizationFormBody
            form={form}
            setForm={setForm}
            managerNames={managerNames}
            staffNames={staffNames}
            orgId={organization.id}
            snapshot={editing ? null : snapshot}
          />
          <Button fullWidth disabled={busy || !dirty} onClick={handleSave} className="mt-1">
            {busy ? "保存中…" : editing ? "編集した内容を保存" : "入力した内容を保存"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
