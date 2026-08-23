"use client";

import { useMemo, useState } from "react";
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
  isContractedOrg,
  requiredSupportStaffCount,
  orgSupportManagers,
  orgSupportStaff,
} from "@/lib/support-system";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { matchesOrganizationName, organizationSuggestions } from "@/lib/org-search";
import { NameSearchBox } from "@/components/ui/NameSearchBox";
import { dbErrorMessage } from "@/lib/errors";
import { SUPPORT_CONTRACT_STATUSES, type Organization, type OrganizationInput } from "@/types/db";

// 絞り込みの選択肢（すべて → 支援委託の状況 → 未設定）
const FILTER_KEYS = ["すべて", ...SUPPORT_CONTRACT_STATUSES, "未設定"] as const;

// 所属機関ごとの在籍数（1号特定技能外国人）。支援体制ページと同じ数え方
export interface OrgWorkerCounts {
  [organizationId: string]: number;
}

// 支援委託の状況を切り替えるボタン。押すとその場で保存する。
// 「支援委託中」「特定技能1号の許可後に支援委託開始」を選ぶと、委託を受けている機関として数える
function SupportContractButtons({
  org,
  onSaved,
  onError,
}: {
  org: Organization;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [status, setStatus] = useState(
    () => (org.intake?.support_contract_status ?? "").trim(),
  );
  const [busy, setBusy] = useState(false);

  const choose = async (next: string) => {
    const value = status === next ? "" : next; // もう一度押すと未設定に戻す
    const prev = status;
    setStatus(value);
    setBusy(true);
    try {
      await updateOrganization(createClient(), org.id, {
        intake: { ...normalizeOrganizationIntake(org.intake), support_contract_status: value },
      });
      onSaved(`${org.name} の支援委託の状況を「${value || "未設定"}」にしました`);
    } catch (err) {
      setStatus(prev);
      onError(dbErrorMessage(err, "0043_organization_intake.sql", "保存に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted">支援委託:</span>
      {SUPPORT_CONTRACT_STATUSES.map((s) => {
        const on = status === s;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            disabled={busy}
            onClick={() => choose(s)}
            className={`min-h-[32px] rounded-full border px-2.5 text-xs transition disabled:opacity-50 ${
              on
                ? "border-brand bg-brand/10 font-bold text-brand"
                : "border-border bg-background text-muted"
            }`}
          >
            {s}
          </button>
        );
      })}
      {!status && <span className="text-xs text-muted">（未設定）</span>}
    </div>
  );
}

// 在籍数・支援責任者・支援担当者・必要人数の1行表示（令和9年4月1日施行の要件）
function OrgSupportLine({ org, workerCount }: { org: Organization; workerCount: number }) {
  const managers = orgSupportManagers(org.intake);
  const staff = orgSupportStaff(org.intake);
  const dual = managers.filter((n) => staff.includes(n));
  // 在籍数から必要な支援担当者の人数を出す（支援担当者1人当たり50人未満）
  const needStaff = requiredSupportStaffCount(workerCount);
  const shortage = Math.max(0, needStaff - staff.length);
  const contracted = isContractedOrg(org.intake, workerCount);
  // 委託していない機関は支援責任者等の必要人数の対象外なので指摘しない
  if (!contracted) {
    return (
      <div className="mt-1.5 border-t border-border pt-1.5 text-xs text-muted">
        在籍（1号特定技能）: <span className="font-bold text-foreground">{workerCount}名</span>
        <span className="ml-2">委託を受けている機関として数えていません</span>
      </div>
    );
  }
  return (
    <div className="mt-1.5 border-t border-border pt-1.5 text-xs">
      <p>
        <span className="text-muted">在籍（1号特定技能）: </span>
        <span className="font-bold">{workerCount}名</span>
        <span className="ml-2 text-muted">
          必要な支援担当者: {needStaff}名（選任 {staff.length}名）
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
  const [contractFilter, setContractFilter] = useState<string>("すべて");
  // 名称で検索（候補から選ぶ・部分一致）。入力中は支援委託の絞り込みに関わらず全体から探す
  const [nameQuery, setNameQuery] = useState("");
  const query = nameQuery.trim();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [deleting, setDeleting] = useState<Organization | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  // 支援委託の状況で絞り込む。件数はボタンに出す（0件でも押せるようにする）
  const counts = useMemo(() => {
    const map: Record<string, number> = { すべて: organizations.length, 未設定: 0 };
    for (const s of SUPPORT_CONTRACT_STATUSES) map[s] = 0;
    for (const org of organizations) {
      const status = (org.intake?.support_contract_status ?? "").trim();
      const key = status && status in map ? status : "未設定";
      map[key] += 1;
    }
    return map;
  }, [organizations]);

  const shown = useMemo(() => {
    // 名称で検索しているときは、支援委託の絞り込みを気にせず全体から探す
    if (query) return organizations.filter((org) => matchesOrganizationName(org, query));
    if (contractFilter === "すべて") return organizations;
    return organizations.filter((org) => {
      const status = (org.intake?.support_contract_status ?? "").trim();
      return contractFilter === "未設定" ? !status : status === contractFilter;
    });
  }, [organizations, contractFilter, query]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  // 編集は詳細ページ（名称をタップして開く画面）の「編集」に統一した。
  // 鉛筆ボタンはその画面へ移動する
  const openEdit = (org: Organization) => {
    router.push(`/organizations/${org.id}`);
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

      {/* 支援委託の状況で絞り込む（「支援委託中」だけを見たいときに使う） */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-bold text-muted">支援委託:</span>
        {FILTER_KEYS.map((key) => {
          const on = contractFilter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => setContractFilter(key)}
              className={`min-h-[36px] rounded-full border px-3 text-xs transition ${
                on
                  ? "border-brand bg-brand/10 font-bold text-brand"
                  : "border-border bg-background text-muted"
              }`}
            >
              {key}
              <span className="ml-1 tabular-nums">{counts[key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* 会社名で検索: 入力すると候補が出て、選ぶとその会社だけ表示される */}
      <NameSearchBox
        candidates={organizations}
        value={nameQuery}
        onChange={setNameQuery}
        placeholder="会社・機関の名称を入力して検索（「BASE」「国崎」などでも探せます）"
        suggest={organizationSuggestions}
        hintOf={(org) => org.intake?.support_contract_status ?? ""}
      />
      {query && (
        <p className="-mt-1 text-sm font-bold text-muted">
          「{query}」の検索結果 {shown.length}件
          <span className="ml-1 text-[11px] font-normal">
            （支援委託の絞り込みに関わらず探しています）
          </span>
        </p>
      )}

      {organizations.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          まだ登録がありません。外国人の所属先となる会社・機関を追加してください。
        </Card>
      ) : shown.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          {query
            ? `「${query}」に一致する会社・機関はありません。`
            : `「${contractFilter}」の会社・機関はありません。`}
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {shown.map((org) => (
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
              <SupportContractButtons
                org={org}
                onSaved={(message) => {
                  setNotice({ ok: true, message });
                  router.refresh();
                }}
                onError={(message) => setNotice({ ok: false, message })}
              />
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
