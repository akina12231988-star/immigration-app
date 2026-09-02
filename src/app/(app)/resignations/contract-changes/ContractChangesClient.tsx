"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarClock,
  ExternalLink,
  FileOutput,
  FileSignature,
  MessageCircle,
  Plus,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Combobox } from "@/components/ui/Combobox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import {
  deleteContractChange,
  insertContractChange,
  updateContractChange,
  type ContractChangeWithRefs,
} from "@/lib/supabase/queries/contract-changes";
import type { WorkerForResignation } from "@/lib/supabase/queries/workers";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import { messengerWebUrl } from "@/lib/messenger-link";
import { notionAppUrl } from "@/lib/notion-link";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import {
  CONTRACT_CHANGE_ATTACHMENT_NOTE,
  CONTRACT_CHANGE_ITEMS,
  contractChangeLabels,
} from "@/lib/contract-change";
import { downloadBlob } from "@/lib/xlsx-export";
import type { Organization } from "@/types/db";

const INPUT =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";
const TEXTAREA =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none";

const MIGRATION = "0133_contract_changes.sql";

// 契約内容変更の随時報告書（参考様式第3-1-1号）の記録一覧。
// 何をいつ変更したかを記録し、そのまま届出書（Excel）を作る。
export function ContractChangesClient({
  changes,
  workers = [],
  organizations = [],
  canEdit,
  canDelete,
}: {
  changes: ContractChangeWithRefs[];
  workers?: WorkerForResignation[];
  organizations?: Organization[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ContractChangeWithRefs | null>(null);
  const [deleting, setDeleting] = useState<ContractChangeWithRefs | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await deleteContractChange(createClient(), deleting.id);
      setDeleting(null);
      router.refresh();
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, "削除に失敗しました"));
    } finally {
      setBusyDelete(false);
    }
  };

  // 届出書（参考様式第3-1-1号）を作ってダウンロードする
  const download = async (row: ContractChangeWithRefs) => {
    setDownloadingId(row.id);
    setError(null);
    try {
      const res = await fetch("/api/contract-change-form", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "様式の生成に失敗しました");
      }
      const blob = await res.blob();
      downloadBlob(blob, `参考様式第3-1-1号_${row.workers?.name ?? "届出"}.xlsx`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "様式の生成に失敗しました"));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
          <FileSignature size={14} className="mt-0.5 shrink-0" />
          雇用契約の内容が変わったときの随時届出（参考様式第3-1-1号）を作ります。何を変更したかを選ぶと、届出書の「変更事項」欄にそのまま入ります。
        </p>
        {canEdit && (
          <Button className="shrink-0" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            変更を記録
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {changes.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          契約内容変更の記録はありません。
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {changes.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="mb-1 flex items-start justify-between gap-2">
                <Link href={r.workers ? `/workers/${r.workers.id}` : "#"} className="min-w-0">
                  <p className="truncate font-bold">{r.workers?.name ?? "（削除済み）"}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted">
                    <Building2 size={12} className="shrink-0" />
                    {r.org_name || r.organizations?.name || "所属機関未設定"}
                  </p>
                </Link>
                {r.forms_downloaded_at && (
                  <span className="shrink-0 rounded-full bg-status-approved-bg px-2.5 py-1 text-[11px] font-bold text-status-approved-fg">
                    届出書 作成済み
                  </span>
                )}
              </div>

              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums text-muted">
                <span className="flex items-center gap-1">
                  <CalendarClock size={12} />
                  変更年月日 {r.changed_on}
                </span>
                <span>随時報告TODO {r.todo_no || "未入力"}</span>
              </p>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.items.length === 0 ? (
                  <span className="rounded-full bg-seal/10 px-2.5 py-1 text-[11px] font-bold text-seal">
                    変更事項が未選択
                  </span>
                ) : (
                  contractChangeLabels(r.items).map((label) => (
                    <span
                      key={label}
                      className="rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-bold text-brand"
                    >
                      {label}
                    </span>
                  ))
                )}
              </div>

              {r.detail && (
                <p className="mt-2 whitespace-pre-wrap text-xs text-muted">変更内容: {r.detail}</p>
              )}

              {/* Messenger・Notion リンク */}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {r.workers?.messenger_link && (
                  <a
                    href={messengerWebUrl(r.workers.messenger_link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs font-bold text-brand"
                  >
                    <MessageCircle size={13} />
                    Messenger
                  </a>
                )}
                {r.workers?.notion_link && (
                  <a
                    href={notionAppUrl(r.workers.notion_link)}
                    className="flex items-center gap-1 text-xs font-bold text-brand"
                  >
                    <ExternalLink size={13} />
                    Notion
                  </a>
                )}
              </div>

              {canEdit && (
                <div className="mt-3 flex flex-col gap-2">
                  <Button
                    fullWidth
                    icon={<FileOutput size={15} />}
                    disabled={downloadingId === r.id || r.items.length === 0}
                    onClick={() => void download(r)}
                  >
                    {downloadingId === r.id ? "作成中…" : "届出書作成（参考様式第3-1-1号）"}
                  </Button>
                  <p className="text-center text-[11px] leading-relaxed text-muted">
                    {r.items.length === 0
                      ? "変更事項を選ぶと届出書を作れます（「記録を編集」から）"
                      : "変更後の雇用条件書（参考様式第1-6号）の添付を忘れずに"}
                  </p>
                  <div className="flex justify-between">
                    <button
                      type="button"
                      onClick={() => setEditing(r)}
                      className="text-xs font-bold text-brand"
                    >
                      記録を編集
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setDeleting(r)}
                        className="text-xs font-bold text-seal"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <ContractChangeDialog
          workers={workers}
          organizations={organizations}
          editing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="契約内容変更の記録の削除"
        message={`${deleting?.workers?.name ?? ""} さんの契約内容変更の記録を削除します。よろしいですか？`}
        busy={busyDelete}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// 契約内容変更の記録・編集ダイアログ。
// 外国人を氏名で検索 → 所属機関を確認 → 変更年月日と変更事項（Ⅰ〜Ⅸ・複数可）を選ぶ。
// 選んだ事項に含まれる「変更内容」を下に出して、選び間違いを防ぐ。
function ContractChangeDialog({
  workers,
  organizations,
  editing,
  onClose,
  onSaved,
}: {
  workers: WorkerForResignation[];
  organizations: Organization[];
  editing: ContractChangeWithRefs | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [workerId, setWorkerId] = useState(editing?.worker_id ?? "");
  // 編集時は保存済みの機関をコンボボックスで表示する（登録済み機関の自動選択は新規時のみ）
  const [useRegisteredOrg, setUseRegisteredOrg] = useState(!editing);
  const [orgId, setOrgId] = useState(editing?.organization_id ?? "");
  const [changedOn, setChangedOn] = useState(editing?.changed_on ?? "");
  const [items, setItems] = useState<string[]>(editing?.items ?? []);
  const [detail, setDetail] = useState(editing?.detail ?? "");
  const [todoNo, setTodoNo] = useState(editing?.todo_no ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const worker = useMemo(() => workers.find((w) => w.id === workerId), [workers, workerId]);
  const registeredOrg = useMemo(
    () => organizations.find((o) => o.id === worker?.current_organization_id) ?? null,
    [organizations, worker],
  );
  const targetOrg = useMemo(() => {
    if (useRegisteredOrg && registeredOrg) return registeredOrg;
    return organizations.find((o) => o.id === orgId) ?? null;
  }, [useRegisteredOrg, registeredOrg, organizations, orgId]);

  const workerOptions = useMemo(
    () => workers.map((w) => ({ id: w.id, label: w.kana ? `${w.name}（${w.kana}）` : w.name })),
    [workers],
  );
  const orgOptions = useMemo(
    () => organizations.map((o) => ({ id: o.id, label: o.name })),
    [organizations],
  );

  const toggle = (code: string) =>
    setItems((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );

  const save = async () => {
    if (!workerId) {
      setError("外国人を選択してください");
      return;
    }
    if (!targetOrg) {
      setError("所属機関を選択してください");
      return;
    }
    if (!changedOn) {
      setError("変更年月日を入れてください");
      return;
    }
    if (items.length === 0) {
      setError("変更事項を1つ以上選んでください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const input = {
        worker_id: workerId,
        organization_id: targetOrg.id,
        org_name: targetOrg.name,
        org_address: targetOrg.address,
        org_contact: targetOrg.contact,
        org_staff: normalizeOrganizationIntake(targetOrg.intake).report_staff,
        changed_on: changedOn,
        // 様式のⅠ〜Ⅸの並びでそろえて保存する
        items: CONTRACT_CHANGE_ITEMS.filter((i) => items.includes(i.code)).map((i) => i.code),
        detail: detail.trim(),
        todo_no: todoNo.trim(),
        note: editing?.note ?? "",
      };
      if (editing) {
        await updateContractChange(supabase, editing.id, input);
      } else {
        await insertContractChange(supabase, input);
      }
      onSaved();
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, "保存に失敗しました"));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={editing ? "契約内容変更の記録を編集" : "契約内容の変更を記録"}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">外国人（必須・氏名で検索）</span>
          <Combobox
            options={workerOptions}
            value={workerId}
            onChange={(id) => {
              setWorkerId(id);
              setUseRegisteredOrg(true);
              setOrgId("");
            }}
            placeholder="名前を入力して候補から選択"
          />
        </label>

        {worker && (
          <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <p className="text-xs font-bold text-muted">届出をする所属機関</p>
            {registeredOrg ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useRegisteredOrg}
                  onChange={(e) => setUseRegisteredOrg(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-brand"
                />
                <span>
                  登録されている所属機関「<b>{registeredOrg.name}</b>」で届け出る
                </span>
              </label>
            ) : (
              <p className="text-xs text-muted">
                この外国人には所属機関が登録されていません。下から選んでください。
              </p>
            )}
            {!(useRegisteredOrg && registeredOrg) && (
              <Combobox
                options={orgOptions}
                value={orgId}
                onChange={setOrgId}
                placeholder="機関名を入力して候補から選択"
              />
            )}
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">変更年月日（必須）</span>
          <input
            type="date"
            value={changedOn}
            onChange={(e) => setChangedOn(e.target.value)}
            className={INPUT}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-muted">
            変更事項（必須・複数選べます）
          </span>
          <div className="flex flex-col gap-1.5">
            {CONTRACT_CHANGE_ITEMS.map((item) => {
              const checked = items.includes(item.code);
              return (
                <label
                  key={item.code}
                  className={`flex flex-col gap-1 rounded-xl border px-3 py-2.5 ${
                    checked ? "border-brand bg-brand/5" : "border-border bg-background"
                  }`}
                >
                  <span className="flex items-start gap-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(item.code)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                    />
                    {item.label}
                  </span>
                  {/* 様式の記載要領の対応表。どれを選べばよいか迷わないように出す */}
                  <span className="pl-6 text-[11px] leading-relaxed text-muted">
                    {item.items.join("／")}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">変更内容のメモ（社内用・任意）</span>
          <textarea
            rows={2}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="例: 基本給を月185,000円へ / 就業場所を第2工場へ"
            className={TEXTAREA}
          />
          <span className="text-[11px] text-muted">
            届出書には出ません。あとで見返すための覚え書きです。
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">随時報告TODO番号（任意）</span>
          <input
            type="text"
            value={todoNo}
            onChange={(e) => setTodoNo(e.target.value)}
            placeholder="例: TODO-2005"
            className={INPUT}
          />
        </label>

        <p className="rounded-xl bg-background px-3 py-2.5 text-[11px] leading-relaxed text-muted">
          {CONTRACT_CHANGE_ATTACHMENT_NOTE}
        </p>

        <div className="flex gap-2">
          <Button fullWidth disabled={busy} onClick={save}>
            {busy ? "保存中…" : "保存"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-border px-5 text-sm font-bold text-muted"
          >
            やめる
          </button>
        </div>
      </div>
    </Modal>
  );
}
