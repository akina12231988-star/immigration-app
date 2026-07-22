"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarClock,
  ExternalLink,
  FileOutput,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Combobox } from "@/components/ui/Combobox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import {
  deleteResignation,
  insertResignation,
  updateResignation,
  type ResignationWithRefs,
} from "@/lib/supabase/queries/resignations";
import { updateWorker, type WorkerForResignation } from "@/lib/supabase/queries/workers";
import { notionAppUrl } from "@/lib/notion-link";
import { formsForKind } from "@/lib/resignation";
import { RESIGNATION_KINDS, type Organization, type ResignationKind } from "@/types/db";

const INPUT =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";
const TEXTAREA =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none";

const KIND_CLASS: Record<ResignationKind, string> = {
  会社都合: "bg-seal/10 text-seal",
  自己都合: "bg-status-notice-bg text-status-notice-fg",
};

export function ResignationsClient({
  resignations,
  workers = [],
  organizations = [],
  canEdit,
  canDelete,
}: {
  resignations: ResignationWithRefs[];
  workers?: WorkerForResignation[];
  organizations?: Organization[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ResignationWithRefs | null>(null);
  const [todoTarget, setTodoTarget] = useState<ResignationWithRefs | null>(null);
  const [deleting, setDeleting] = useState<ResignationWithRefs | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [kindFilter, setKindFilter] = useState<ResignationKind | "all">("all");

  const filtered = useMemo(
    () => resignations.filter((r) => kindFilter === "all" || r.kind === kindFilter),
    [resignations, kindFilter],
  );

  const remove = async () => {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await deleteResignation(createClient(), deleting.id);
      setDeleting(null);
      router.refresh();
    } finally {
      setBusyDelete(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
          <UserMinus size={14} className="mt-0.5 shrink-0" />
          退職を記録して外国人情報の退職者情報へ転記し、所属機関の随時届出（参考様式第3-1-2号ほか）を作成します。
        </p>
        {canEdit && (
          <Button className="shrink-0" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            退職を記録
          </Button>
        )}
      </div>

      {/* 退職区分フィルター */}
      <div className="flex flex-wrap gap-2">
        {(["all", ...RESIGNATION_KINDS] as (ResignationKind | "all")[]).map((k) => {
          const active = kindFilter === k;
          const count =
            k === "all" ? resignations.length : resignations.filter((r) => r.kind === k).length;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              className={`rounded-xl border px-3 py-2 text-sm font-bold ${
                active
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border bg-surface text-muted"
              }`}
            >
              {k === "all" ? "すべて" : k}（{count}）
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">退職の記録はありません。</Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="mb-1 flex items-start justify-between gap-2">
                <Link href={r.workers ? `/workers/${r.workers.id}` : "#"} className="min-w-0">
                  <p className="truncate font-bold">{r.workers?.name ?? "（削除済み）"}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted">
                    <Building2 size={12} className="shrink-0" />
                    {r.org_name || r.organizations?.name || "所属機関未設定"}
                  </p>
                </Link>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${KIND_CLASS[r.kind]}`}
                >
                  {r.kind}
                </span>
              </div>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums text-muted">
                <span className="flex items-center gap-1">
                  <CalendarClock size={12} />
                  退職日 {r.leaving_on}
                </span>
                <span>随時報告TODO {r.todo_no || "未入力"}</span>
              </p>
              {r.reason && <p className="mt-1 text-xs text-muted">理由: {r.reason}</p>}

              {/* Messenger・Notion リンク */}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {r.workers?.messenger_link && (
                  <a
                    href={r.workers.messenger_link}
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
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={r.todo_no ? "secondary" : "primary"}
                      icon={<Pencil size={15} />}
                      onClick={() => setTodoTarget(r)}
                    >
                      TODO番号
                    </Button>
                    <Link
                      href={`/resignations/${r.id}/forms`}
                      className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-base font-bold text-brand-foreground transition hover:bg-brand-strong active:scale-[0.98]"
                    >
                      <FileOutput size={15} />
                      届出書作成
                    </Link>
                  </div>
                  <p className="text-center text-[11px] text-muted">
                    作成する様式: {formsForKind(r.kind).join("・")}
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
                        className="flex items-center gap-1 text-xs font-bold text-seal"
                      >
                        <Trash2 size={13} />
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
        <ResignationDialog
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

      {todoTarget && (
        <TodoDialog
          resignation={todoTarget}
          onClose={() => setTodoTarget(null)}
          onSaved={() => {
            setTodoTarget(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="退職記録の削除"
        message={`${deleting?.workers?.name ?? ""} さんの退職記録を削除します。外国人情報の退職者情報はそのまま残ります。よろしいですか？`}
        busy={busyDelete}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// 退職の記録・編集ダイアログ。
// 外国人を氏名で検索 → Messenger/Notionリンク・登録済み所属機関を表示 →
// どの機関の退職かを選択 → 会社都合/自己都合・理由・退職日を入力して保存する。
// 保存時は外国人情報（workers）の退職者情報にも転記する。
function ResignationDialog({
  workers,
  organizations,
  editing,
  onClose,
  onSaved,
}: {
  workers: WorkerForResignation[];
  organizations: Organization[];
  editing: ResignationWithRefs | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [workerId, setWorkerId] = useState(editing?.worker_id ?? "");
  // 編集時は保存済みの機関をコンボボックスで表示する（登録済み機関の自動選択は新規時のみ）
  const [useRegisteredOrg, setUseRegisteredOrg] = useState(!editing);
  const [orgId, setOrgId] = useState(editing?.organization_id ?? "");
  const [kind, setKind] = useState<ResignationKind>(editing?.kind ?? "自己都合");
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [leavingOn, setLeavingOn] = useState(editing?.leaving_on ?? "");
  const [markRetired, setMarkRetired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const worker = findWorker(workers, workerId);
  const registeredOrg = useMemo(
    () => organizations.find((o) => o.id === worker?.current_organization_id) ?? null,
    [organizations, worker],
  );
  // 記録対象の機関: 登録済み機関を使うか、別の機関を検索して選ぶ
  const targetOrg = useMemo(() => {
    if (useRegisteredOrg && registeredOrg) return registeredOrg;
    return organizations.find((o) => o.id === orgId) ?? null;
  }, [useRegisteredOrg, registeredOrg, organizations, orgId]);

  const workerOptions = useMemo(
    () =>
      workers.map((w) => ({
        id: w.id,
        label: w.kana ? `${w.name}（${w.kana}）` : w.name,
      })),
    [workers],
  );
  const orgOptions = useMemo(
    () => organizations.map((o) => ({ id: o.id, label: o.name })),
    [organizations],
  );

  const save = async () => {
    if (!workerId) {
      setError("外国人を選択してください");
      return;
    }
    if (!targetOrg) {
      setError("退職する所属機関を選択してください");
      return;
    }
    if (!leavingOn) {
      setError("退職日を入力してください");
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
        kind,
        reason: reason.trim(),
        leaving_on: leavingOn,
        todo_no: editing?.todo_no ?? "",
        note: editing?.note ?? "",
      };
      if (editing) {
        await updateResignation(supabase, editing.id, input);
      } else {
        await insertResignation(supabase, input);
      }
      // 外国人情報の退職者情報へ転記（退職日・区分・理由・退職元機関）
      await updateWorker(supabase, workerId, {
        leaving_on: leavingOn,
        leaving_kind: kind,
        leaving_reason: reason.trim(),
        leaving_org_name: targetOrg.name,
        leaving_org_address: targetOrg.address,
        ...(markRetired ? { status: "退職" as const } : {}),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setBusy(false);
    }
  };

  return (
    <Modal open title={editing ? "退職記録の編集" : "退職を記録"} onClose={onClose}>
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
          <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-background px-3 py-2.5">
            {worker.messenger_link ? (
              <a
                href={worker.messenger_link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-bold text-brand"
              >
                <MessageCircle size={14} />
                Messengerを開く
              </a>
            ) : (
              <span className="text-xs text-muted">Messenger未登録</span>
            )}
            {worker.notion_link ? (
              <a
                href={notionAppUrl(worker.notion_link)}
                className="flex items-center gap-1 text-xs font-bold text-brand"
              >
                <ExternalLink size={14} />
                Notionを開く
              </a>
            ) : (
              <span className="text-xs text-muted">Notion未登録</span>
            )}
          </div>
        )}

        {worker && (
          <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <p className="text-xs font-bold text-muted">退職する所属機関</p>
            {registeredOrg ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useRegisteredOrg}
                  onChange={(e) => setUseRegisteredOrg(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-brand"
                />
                <span>
                  登録されている所属機関「<b>{registeredOrg.name}</b>」の退職を記録する
                  {registeredOrg.address && (
                    <span className="block text-xs text-muted">{registeredOrg.address}</span>
                  )}
                </span>
              </label>
            ) : (
              <p className="text-xs text-muted">
                外国人情報に所属機関が登録されていません。下から選択してください。
              </p>
            )}
            {(!useRegisteredOrg || !registeredOrg) && (
              <Combobox
                options={orgOptions}
                value={orgId}
                onChange={setOrgId}
                placeholder="会社・機関名で検索して選択"
              />
            )}
            {targetOrg && (
              <p className="text-[11px] text-muted">
                この機関の名称・住所を外国人情報の退職者情報にも記録します。
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">退職内容（必須）</span>
          <div className="grid grid-cols-2 gap-2">
            {RESIGNATION_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`min-h-[44px] rounded-xl border px-3 text-sm font-bold ${
                  kind === k
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-border bg-surface text-muted"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted">
            作成する様式: {formsForKind(kind).join("・")}
          </p>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">退職理由（わかれば）</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={
              kind === "会社都合"
                ? "例: 経営悪化により事業所を閉鎖したため"
                : "例: 家庭の事情により帰国するため"
            }
            className={TEXTAREA}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">退職日（必須）</span>
          <input
            type="date"
            value={leavingOn}
            onChange={(e) => setLeavingOn(e.target.value)}
            className={INPUT}
          />
          <span className="text-[11px] text-muted">
            外国人情報の退職者情報にも表示・記録されます。
          </span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={markRetired}
            onChange={(e) => setMarkRetired(e.target.checked)}
            className="h-4 w-4"
          />
          外国人のステータスを「退職」に変更する
        </label>

        <Button fullWidth disabled={busy} onClick={save}>
          {busy ? "保存中…" : "この内容で記録保存"}
        </Button>
        <p className="text-center text-[11px] text-muted">
          保存後、一覧の「TODO番号」からNotion随時報告TODO番号を入力し、「届出書作成」で様式に転記します。
        </p>
      </div>
    </Modal>
  );
}

function findWorker(
  workers: WorkerForResignation[],
  id: string,
): WorkerForResignation | null {
  return workers.find((w) => w.id === id) ?? null;
}

// Notion随時報告TODO番号の入力（記録保存後のステップ）。
// 外国人情報の「Notion 随時報告TODO番号」にも転記する。
function TodoDialog({
  resignation,
  onClose,
  onSaved,
}: {
  resignation: ResignationWithRefs;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [todo, setTodo] = useState(resignation.todo_no);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      await updateResignation(supabase, resignation.id, { todo_no: todo.trim() });
      await updateWorker(supabase, resignation.worker_id, { leaving_todo: todo.trim() });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setBusy(false);
    }
  };

  return (
    <Modal open title="Notion随時報告TODO番号" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">
            {resignation.workers?.name ?? ""} さんの随時報告TODO番号
          </span>
          <input
            value={todo}
            onChange={(e) => setTodo(e.target.value)}
            placeholder="例: TODO-1234"
            className={INPUT}
          />
          <span className="text-[11px] text-muted">
            外国人情報の退職者情報（Notion 随時報告TODO番号）にも転記されます。
          </span>
        </label>
        <Button fullWidth disabled={busy} onClick={save}>
          {busy ? "保存中…" : "保存"}
        </Button>
      </div>
    </Modal>
  );
}
