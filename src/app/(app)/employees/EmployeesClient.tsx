"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, CheckCircle2, Pencil, Plus, Trash2, UserCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import {
  deleteEmployee,
  insertEmployee,
  updateEmployee,
} from "@/lib/supabase/queries/employees";
import {
  REFORM_EFFECTIVE_ON,
  SUPPORT_MANAGER_MIN_YEARS,
  buildEmployeeRoles,
  serviceLabel,
  summarizeOrganizations,
  summarizeSupportSystem,
  supportManagerBlockReason,
  type EmployeeSupportRole,
  type SupportWorker,
} from "@/lib/support-system";
import {
  EMPLOYMENT_KINDS,
  type Employee,
  type EmployeeInput,
  type Organization,
} from "@/types/db";

type OrgBrief = Pick<Organization, "id" | "name" | "intake">;

const MIGRATION = "0062_employees.sql・0063_employee_roles.sql";

function emptyInput(): EmployeeInput {
  return {
    name: "",
    kana: "",
    joined_on: null,
    left_on: null,
    employment_kind: "常勤",
    is_representative: false,
    is_officer: false,
    is_support_manager: false,
    is_support_staff: false,
    office: "",
    training_completed_on: null,
    note: "",
  };
}

function toInput(e: Employee): EmployeeInput {
  return {
    name: e.name,
    kana: e.kana,
    joined_on: e.joined_on,
    left_on: e.left_on,
    employment_kind: e.employment_kind,
    is_representative: e.is_representative,
    is_officer: e.is_officer,
    is_support_manager: e.is_support_manager,
    is_support_staff: e.is_support_staff,
    office: e.office,
    training_completed_on: e.training_completed_on,
    note: e.note,
  };
}

// 役割バッジ（支援責任者 / 支援担当者 / 兼任）
function RoleBadges({ role }: { role: EmployeeSupportRole }) {
  if (!role.isManager && !role.isStaff) {
    return <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted">役割なし</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {role.isManager && (
        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand">
          支援責任者
        </span>
      )}
      {role.isStaff && (
        <span className="rounded-full bg-status-applied-bg px-2 py-0.5 text-xs font-bold text-status-applied-fg">
          支援担当者
        </span>
      )}
      {role.isDual && (
        <span className="rounded-full bg-seal/10 px-2 py-0.5 text-xs font-bold text-seal">
          兼任
        </span>
      )}
    </span>
  );
}

export function EmployeesClient({
  employees,
  organizations,
  workers,
  today,
}: {
  employees: Employee[];
  organizations: OrgBrief[];
  workers: SupportWorker[];
  today: string;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeInput>(emptyInput);
  const [deleting, setDeleting] = useState<Employee | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const orgSummaries = summarizeOrganizations(organizations, workers);
  const roles = buildEmployeeRoles(employees, orgSummaries, today);
  const summary = summarizeSupportSystem(roles, orgSummaries);
  const suggested = roles.filter((r) => r.suggestManager);

  const set = <K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const openNew = () => {
    setEditing(null);
    setForm(emptyInput());
    setFormOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setEditing(employee);
    setForm(toInput(employee));
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const supabase = createClient();
      const input: EmployeeInput = { ...form, name: form.name.trim() };
      if (editing) {
        await updateEmployee(supabase, editing.id, input);
      } else {
        await insertEmployee(supabase, input);
      }
      setFormOpen(false);
      setNotice({ ok: true, message: editing ? "更新しました" : "登録しました" });
      router.refresh();
    } catch (err) {
      setNotice({ ok: false, message: dbErrorMessage(err, MIGRATION, "保存に失敗しました") });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteEmployee(createClient(), deleting.id);
      setNotice({ ok: true, message: `${deleting.name} を削除しました` });
      router.refresh();
    } catch (err) {
      setNotice({ ok: false, message: dbErrorMessage(err, MIGRATION, "削除に失敗しました") });
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  // フォームで入力中の内容に対する支援責任者の要件チェック（満たさない場合の警告表示）
  const managerBlockReason = supportManagerBlockReason(
    { ...(editing ?? ({} as Employee)), ...form } as Employee,
    today,
  );

  const inputCls =
    "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm";

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

      {/* 体制の充足状況 */}
      <Card className="p-4">
        <h2 className="mb-1 text-sm font-bold">支援体制の充足状況</h2>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          令和9年4月1日（{REFORM_EFFECTIVE_ON}）施行の省令改正に基づく判定です。支援責任者・支援担当者は、支援業務を行う事務所ごとに常勤の役員又は職員から
          それぞれ1名以上を選任します（兼務可）。支援担当者の数は「委託を受けている特定技能所属機関の数÷10」と「1号特定技能外国人の数÷50」の
          双方を<strong>超えている</strong>必要があります。
        </p>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-xl bg-background p-3">
            <dt className="text-xs text-muted">委託を受けている機関</dt>
            <dd className="text-lg font-bold">{summary.orgCount}社</dd>
          </div>
          <div className="rounded-xl bg-background p-3">
            <dt className="text-xs text-muted">1号特定技能外国人</dt>
            <dd className="text-lg font-bold">{summary.workerCount}名</dd>
          </div>
          <div className="rounded-xl bg-background p-3">
            <dt className="text-xs text-muted">支援担当者（必要／現在）</dt>
            <dd className="text-lg font-bold">
              {summary.requiredStaff}名 ／{" "}
              <span className={summary.staffShortage > 0 ? "text-seal" : "text-brand"}>
                {summary.currentStaff}名
              </span>
            </dd>
          </div>
          <div className="rounded-xl bg-background p-3">
            <dt className="text-xs text-muted">支援責任者（現在）</dt>
            <dd className="text-lg font-bold">{summary.currentManagers}名</dd>
          </div>
        </dl>

        {summary.staffShortage > 0 ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            支援担当者が{summary.staffShortage}名不足しています（必要 {summary.requiredStaff}名・現在{" "}
            {summary.currentStaff}名）。所属機関の「支援担当者」に選任してください。
          </p>
        ) : (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            支援担当者の人数は要件を満たしています（必要 {summary.requiredStaff}名・現在{" "}
            {summary.currentStaff}名）。
          </p>
        )}

        {summary.offices.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {summary.offices.map((office) => (
              <li
                key={office.office || "(未設定)"}
                className="rounded-lg border border-border px-3 py-2 text-xs"
              >
                <span className="font-bold">{office.office || "事務所 未設定"}</span>
                <span className="ml-2 text-muted">
                  支援責任者 {office.managers.length}名／支援担当者 {office.staff.length}名
                </span>
                {!office.ok && (
                  <span className="ml-2 font-bold text-seal">
                    ← 事務所ごとにそれぞれ1名以上必要です
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 支援責任者になれる従業員のアラート */}
      {suggested.length > 0 && (
        <Card className="border-brand/40 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-brand">
            <UserCheck size={16} />
            支援責任者に該当できます
          </h2>
          <p className="mb-2 text-xs text-muted">
            入社から{SUPPORT_MANAGER_MIN_YEARS}年以上経過した常勤の従業員です。所属機関の「支援責任者」に選任できます。
          </p>
          <ul className="flex flex-col gap-1.5">
            {suggested.map((role) => (
              <li key={role.employee.id} className="text-sm">
                <span className="font-bold">{role.employee.name}</span>
                <span className="ml-2 text-xs text-muted">
                  勤続 {serviceLabel(role.employee.joined_on, today)}
                  {role.employee.office && `・${role.employee.office}`}
                  {!role.employee.training_completed_on && "・養成講習 未修了"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            ※ 支援責任者には養成講習の受講が義務付けられますが、令和9年4月1日以降も当分の間は未修了でも差し支えありません。
          </p>
        </Card>
      )}

      <Button fullWidth icon={<Plus size={20} />} onClick={openNew}>
        従業員を追加
      </Button>

      {/* 従業員一覧 */}
      {employees.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          まだ登録がありません。支援責任者・支援担当者になる従業員を追加してください。
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {roles.map((role) => {
            const e = role.employee;
            const blockReason = supportManagerBlockReason(e, today);
            return (
              <Card key={e.id} className="p-4">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold">
                      {e.name}
                      {e.is_representative && (
                        <span className="ml-2 rounded-full bg-background px-2 py-0.5 text-xs text-muted">
                          代表
                        </span>
                      )}
                      {e.is_officer && (
                        <span className="ml-2 rounded-full bg-background px-2 py-0.5 text-xs text-muted">
                          役員
                        </span>
                      )}
                    </p>
                    {e.kana && <p className="text-xs text-muted">{e.kana}</p>}
                  </div>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label="編集"
                      onClick={() => openEdit(e)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label="削除"
                      onClick={() => setDeleting(e)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>

                <div className="mb-2 mt-1">
                  <RoleBadges role={role} />
                </div>

                {/* 従業員側で役割にしていないのに所属機関で選任されている（設定の取り違え） */}
                {(role.mismatchedManagerOrgs.length > 0 || role.mismatchedStaffOrgs.length > 0) && (
                  <p className="mb-2 rounded-lg bg-seal/10 px-2 py-1.5 text-xs text-seal">
                    {role.mismatchedManagerOrgs.length > 0 && (
                      <span className="block">
                        ⚠ 支援責任者にしていませんが {role.mismatchedManagerOrgs.join("・")}{" "}
                        の支援責任者に選任されています。
                      </span>
                    )}
                    {role.mismatchedStaffOrgs.length > 0 && (
                      <span className="block">
                        ⚠ 支援担当者にしていませんが {role.mismatchedStaffOrgs.join("・")}{" "}
                        の支援担当者に選任されています。
                      </span>
                    )}
                    上の編集で役割をチェックするか、所属機関側の選任を外してください。
                  </p>
                )}

                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div>
                    <dt className="inline text-muted">入社日 </dt>
                    <dd className="inline">{e.joined_on || "未入力"}</dd>
                  </div>
                  <div>
                    <dt className="inline text-muted">勤続 </dt>
                    <dd className="inline">{serviceLabel(e.joined_on, today) || "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline text-muted">勤務 </dt>
                    <dd className="inline">{e.employment_kind}</dd>
                  </div>
                  <div>
                    <dt className="inline text-muted">事務所 </dt>
                    <dd className="inline">{e.office || "未設定"}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="inline text-muted">養成講習 </dt>
                    <dd className="inline">
                      {e.training_completed_on ? `修了（${e.training_completed_on}）` : "未修了"}
                    </dd>
                  </div>
                  {e.left_on && (
                    <div className="col-span-2">
                      <dt className="inline text-muted">退職日 </dt>
                      <dd className="inline text-seal">{e.left_on}</dd>
                    </div>
                  )}
                </dl>

                {/* どこの所属機関の責任者・担当者か */}
                <div className="mt-2 border-t border-border pt-2">
                  <p className="mb-1 text-xs font-bold text-muted">担当している所属機関</p>
                  {role.assignments.length === 0 ? (
                    <p className="text-xs text-muted">
                      なし
                      {blockReason
                        ? `（支援責任者にはなれません: ${blockReason}）`
                        : role.isManager || role.isStaff
                          ? "（所属機関の支援責任者・支援担当者で選任してください）"
                          : "（支援責任者・支援担当者に該当できます）"}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {role.assignments.map((a) => (
                        <li key={a.organizationId} className="flex items-center gap-1.5 text-xs">
                          <Building2 size={12} className="shrink-0 text-muted" />
                          <Link
                            href={`/organizations/${a.organizationId}`}
                            className="underline-offset-2 hover:text-brand hover:underline"
                          >
                            {a.organizationName}
                          </Link>
                          <span className="text-muted">
                            {a.isDual
                              ? "（責任者・担当者を兼任）"
                              : a.isManager
                                ? "（支援責任者）"
                                : "（支援担当者）"}
                            ・1号 {a.workerCount}名
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {role.assignments.length > 0 && (
                    <p className="mt-1 text-xs text-muted">
                      担当している1号特定技能外国人 合計 {role.workerCount}名
                    </p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 所属機関ごとの体制 */}
      <Card className="p-4">
        <h2 className="mb-2 text-sm font-bold">所属機関ごとの支援体制</h2>
        {orgSummaries.length === 0 ? (
          <p className="text-sm text-muted">所属機関が登録されていません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {orgSummaries.map((org) => (
              <li key={org.organizationId} className="rounded-xl border border-border p-3">
                <Link
                  href={`/organizations/${org.organizationId}`}
                  className="font-bold underline-offset-2 hover:text-brand hover:underline"
                >
                  {org.organizationName}
                </Link>
                <p className="mt-0.5 text-xs text-muted">
                  在籍している1号特定技能外国人 {org.workerCount}名
                </p>
                <p className="mt-1 text-xs">
                  <span className="text-muted">支援責任者: </span>
                  {org.managers.length > 0 ? (
                    org.managers.join("・")
                  ) : (
                    <span className="font-bold text-seal">未選任</span>
                  )}
                </p>
                <p className="text-xs">
                  <span className="text-muted">支援担当者: </span>
                  {org.staff.length > 0 ? (
                    org.staff.join("・")
                  ) : (
                    <span className="font-bold text-seal">未選任</span>
                  )}
                </p>
                {org.dual.length > 0 && (
                  <p className="text-xs text-muted">兼任: {org.dual.join("・")}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={formOpen}
        title={editing ? "従業員を編集" : "従業員を追加"}
        onClose={() => setFormOpen(false)}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">氏名（所属機関の選択肢になります）</span>
            <input
              required
              value={form.name}
              onChange={(ev) => set("name", ev.target.value)}
              placeholder="例: 市原　彩奈"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">フリガナ</span>
            <input
              value={form.kana}
              onChange={(ev) => set("kana", ev.target.value)}
              className={inputCls}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">入社日</span>
              <input
                type="date"
                value={form.joined_on ?? ""}
                onChange={(ev) => set("joined_on", ev.target.value || null)}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">退職日（在籍中は空欄）</span>
              <input
                type="date"
                value={form.left_on ?? ""}
                onChange={(ev) => set("left_on", ev.target.value || null)}
                className={inputCls}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">勤務区分</span>
              <select
                value={form.employment_kind}
                onChange={(ev) => set("employment_kind", ev.target.value)}
                className={inputCls}
              >
                {EMPLOYMENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">支援業務を行う事務所</span>
              <input
                value={form.office}
                onChange={(ev) => set("office", ev.target.value)}
                placeholder="例: 本社"
                className={inputCls}
              />
            </label>
          </div>
          {/* 個人事業主には役員がいないため、代表と役員は別項目にする（両方に該当する場合は両方チェック） */}
          <div className="flex gap-5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_representative}
                onChange={(ev) => set("is_representative", ev.target.checked)}
                className="h-5 w-5"
              />
              代表
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_officer}
                onChange={(ev) => set("is_officer", ev.target.checked)}
                className="h-5 w-5"
              />
              役員
            </label>
          </div>
          <p className="-mt-1 text-xs text-muted">
            個人事業主の場合は「代表」にチェックしてください（役員はいないため）。支援責任者等は常勤の役員又は職員から選任します。
          </p>
          {/* 現在の役割。ここで選んだ人だけが所属機関の支援責任者・支援担当者に選べる */}
          <div className="flex flex-col gap-1.5 rounded-xl border border-border p-3">
            <span className="text-xs font-bold text-muted">現在している役割</span>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_support_manager}
                onChange={(ev) => set("is_support_manager", ev.target.checked)}
                className="h-5 w-5"
              />
              支援責任者
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_support_staff}
                onChange={(ev) => set("is_support_staff", ev.target.checked)}
                className="h-5 w-5"
              />
              支援担当者
            </label>
            <p className="text-xs text-muted">
              ここでチェックした人だけが、所属機関の「支援責任者」「支援担当者」で選べるようになります。両方チェックすると兼任です。
            </p>
            {form.is_support_manager && managerBlockReason && (
              <p className="text-xs font-bold text-seal">
                ⚠ この人は支援責任者の要件を満たしていません（{managerBlockReason}）。
              </p>
            )}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">
              支援責任者の養成講習 修了日（未修了は空欄）
            </span>
            <input
              type="date"
              value={form.training_completed_on ?? ""}
              onChange={(ev) => set("training_completed_on", ev.target.value || null)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">メモ</span>
            <textarea
              value={form.note}
              onChange={(ev) => set("note", ev.target.value)}
              rows={2}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => setFormOpen(false)}
              disabled={busy}
            >
              キャンセル
            </Button>
            <Button type="submit" fullWidth disabled={busy}>
              {busy ? "保存中…" : "保存"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="従業員を削除"
        message={`${deleting?.name ?? ""} を削除します。所属機関に選任されている場合は、所属機関側の支援責任者・支援担当者からも外してください。`}
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
