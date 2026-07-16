"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Check, ExternalLink, GraduationCap, Plus, Trash2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Combobox } from "@/components/ui/Combobox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import { deleteOrientation, insertOrientation, updateOrientation } from "@/lib/supabase/queries/orientations";
import { recommendedFileName, recommendedFolderName } from "@/lib/orientation";
import { todayStr } from "@/lib/application-alerts";
import { ORIENTATION_STATUSES, type OrientationStatus, type Organization } from "@/types/db";
import type { OrientationWithRefs } from "@/lib/supabase/queries/orientations";
import type { WorkerBrief } from "@/lib/supabase/queries/workers";

// 「overdue」= 実施予定日を過ぎているのにまだ未実施（＝実施可能だが未実施）
type StatusFilter = OrientationStatus | "overdue" | "all";

// 実施予定日が今日以前で、まだ未実施のもの
function isOverdue(o: OrientationWithRefs, today: string): boolean {
  return o.status === "未実施" && o.scheduled_on <= today;
}

const STATUS_CLASS: Record<OrientationStatus, string> = {
  未実施: "bg-status-notice-bg text-status-notice-fg",
  実施済: "bg-status-reported-bg text-status-reported-fg",
  "実施不可（早期退職）": "bg-seal/10 text-seal",
};

export function OrientationsClient({
  orientations,
  workers = [],
  organizations = [],
  canEdit,
}: {
  orientations: OrientationWithRefs[];
  workers?: WorkerBrief[];
  organizations?: Organization[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const today = todayStr();
  const [status, setStatus] = useState<StatusFilter>("未実施");
  const [orgId, setOrgId] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState<OrientationWithRefs | null>(null);
  const [creating, setCreating] = useState(false);

  // 所属機関の選択肢（登録済みオリエンから集約）
  const orgOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orientations) {
      const id = o.organization_id ?? o.workers?.current_organization_id;
      const name = o.organizations?.name;
      if (id && name) map.set(id, name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [orientations]);

  const filtered = useMemo(
    () =>
      orientations.filter((o) => {
        if (status === "overdue") {
          if (!isOverdue(o, today)) return false;
        } else if (status !== "all" && o.status !== status) {
          return false;
        }
        if (orgId !== "all") {
          const oid = o.organization_id ?? o.workers?.current_organization_id ?? "";
          if (oid !== orgId) return false;
        }
        if (from && o.scheduled_on < from) return false;
        if (to && o.scheduled_on > to) return false;
        return true;
      }),
    [orientations, status, orgId, from, to, today],
  );

  const overdueCount = useMemo(
    () => orientations.filter((o) => isOverdue(o, today)).length,
    [orientations, today],
  );

  const countFor = (s: StatusFilter) =>
    s === "all"
      ? orientations.length
      : s === "overdue"
        ? overdueCount
        : orientations.filter((o) => o.status === s).length;

  const tabLabel = (s: StatusFilter) =>
    s === "all" ? "すべて" : s === "overdue" ? "要実施（予定日超過）" : s;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
          <GraduationCap size={14} className="mt-0.5 shrink-0" />
          特定技能1号の対象者について、雇用開始日から2週間後の日曜を予定日として自動登録します。手動での追加も可能です。
        </p>
        {canEdit && (
          <Button className="shrink-0" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            新規追加
          </Button>
        )}
      </div>

      {/* 実施予定日を過ぎた未実施へのアラート */}
      {overdueCount > 0 && (
        <button
          type="button"
          onClick={() => setStatus("overdue")}
          className="flex w-full items-center gap-2 rounded-xl border border-seal/40 bg-seal/10 px-3 py-2.5 text-left text-sm font-bold text-seal"
        >
          <AlertTriangle size={17} className="shrink-0" />
          <span>
            実施予定日を過ぎた未実施が{overdueCount}件あります。実施してください。
          </span>
        </button>
      )}

      {/* 状態フィルター */}
      <div className="flex flex-wrap gap-2">
        {(["overdue", "未実施", "実施済", "実施不可（早期退職）", "all"] as StatusFilter[]).map((s) => {
          const active = status === s;
          const isOverdueTab = s === "overdue";
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-xl border px-3 py-2 text-sm font-bold ${
                active
                  ? isOverdueTab
                    ? "border-seal bg-seal text-white"
                    : "border-brand bg-brand text-brand-foreground"
                  : isOverdueTab && overdueCount > 0
                    ? "border-seal/40 bg-seal/10 text-seal"
                    : "border-border bg-surface text-muted"
              }`}
            >
              {tabLabel(s)}（{countFor(s)}）
            </button>
          );
        })}
      </div>

      {/* 所属機関・対象期間 */}
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">所属機関</span>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm">
            <option value="all">すべて</option>
            {orgOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">対象期間（実施予定日）開始</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">終了</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm" />
        </label>
        {(orgId !== "all" || from || to) && (
          <button type="button" onClick={() => { setOrgId("all"); setFrom(""); setTo(""); }} className="text-xs font-bold text-brand">
            条件クリア
          </button>
        )}
      </Card>

      <p className="text-sm font-bold text-muted">{filtered.length}件</p>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          該当する生活オリエンテーションはありません。
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="mb-1 flex items-start justify-between gap-2">
                <Link href={o.workers ? `/workers/${o.workers.id}` : "#"} className="min-w-0">
                  <p className="truncate font-bold">{o.workers?.name ?? "（削除済み）"}</p>
                  <p className="truncate text-xs text-muted">{o.organizations?.name ?? "所属機関未設定"}</p>
                </Link>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_CLASS[o.status]}`}>
                  {o.status}
                </span>
              </div>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums text-muted">
                <span className="flex items-center gap-1">
                  <CalendarClock size={12} />
                  実施予定日 {o.scheduled_on}
                </span>
                {o.employment_start_on && <span>雇用開始 {o.employment_start_on}</span>}
                {o.done_on && <span>実施日 {o.done_on}</span>}
              </p>
              {isOverdue(o, today) && (
                <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs font-bold text-seal">
                  <AlertTriangle size={13} className="shrink-0" />
                  実施予定日を過ぎています。実施してください。
                </p>
              )}
              {o.drive_link && (
                <a href={o.drive_link} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1 text-xs font-bold text-brand">
                  <ExternalLink size={13} />
                  保存資料を開く
                </a>
              )}
              {o.note && <p className="mt-1 text-xs text-muted">{o.note}</p>}
              {canEdit && (
                <div className="mt-3">
                  <Button variant={o.status === "未実施" ? "primary" : "secondary"} fullWidth icon={<Check size={16} />} onClick={() => setEditing(o)}>
                    記録・編集
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <RecordDialog
          orientation={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      {creating && (
        <NewOrientationDialog
          workers={workers}
          organizations={organizations}
          today={today}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function NewOrientationDialog({
  workers,
  organizations,
  today,
  onClose,
  onSaved,
}: {
  workers: WorkerBrief[];
  organizations: Organization[];
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [workerId, setWorkerId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [scheduledOn, setScheduledOn] = useState("");
  const [employmentStartOn, setEmploymentStartOn] = useState("");
  const [status, setStatus] = useState<OrientationStatus>("未実施");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workerOptions = useMemo(
    () => workers.map((w) => ({ id: w.id, label: w.name })),
    [workers],
  );
  const orgOptions = useMemo(
    () => organizations.map((o) => ({ id: o.id, label: o.name })),
    [organizations],
  );

  // 外国人を選んだら、その現在の所属機関を初期選択する
  const onSelectWorker = (id: string) => {
    setWorkerId(id);
    const w = workers.find((x) => x.id === id);
    setOrgId(w?.current_organization_id ?? "");
  };

  const save = async () => {
    if (!workerId) {
      setError("外国人を選択してください");
      return;
    }
    if (!scheduledOn) {
      setError("実施予定日を入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await insertOrientation(createClient(), {
        worker_id: workerId,
        organization_id: orgId || null,
        application_id: null,
        scheduled_on: scheduledOn,
        employment_start_on: employmentStartOn || null,
        status,
        done_on: status === "実施済" ? today : null,
        drive_link: "",
        note,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "追加に失敗しました");
      setBusy(false);
    }
  };

  const INPUT = "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

  return (
    <Modal open title="生活オリエンテーション 新規追加" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">外国人（必須）</span>
          <Combobox
            options={workerOptions}
            value={workerId}
            onChange={onSelectWorker}
            placeholder="氏名で検索して選択"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">所属機関</span>
          <Combobox
            options={orgOptions}
            value={orgId}
            onChange={setOrgId}
            placeholder="会社・機関名で検索して選択"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">実施予定日（必須）</span>
          <input type="date" value={scheduledOn} onChange={(e) => setScheduledOn(e.target.value)} className={INPUT} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">雇用開始日（任意）</span>
          <input type="date" value={employmentStartOn} onChange={(e) => setEmploymentStartOn(e.target.value)} className={INPUT} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">状態</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as OrientationStatus)} className={INPUT}>
            {ORIENTATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">備考</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} />
        </label>

        <Button fullWidth disabled={busy} onClick={save}>
          {busy ? "追加中…" : "追加する"}
        </Button>
      </div>
    </Modal>
  );
}

function RecordDialog({
  orientation,
  onClose,
  onSaved,
}: {
  orientation: OrientationWithRefs;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<OrientationStatus>(orientation.status);
  const [doneOn, setDoneOn] = useState(orientation.done_on ?? new Date().toISOString().slice(0, 10));
  const [driveLink, setDriveLink] = useState(orientation.drive_link ?? "");
  const [note, setNote] = useState(orientation.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteOrientation(createClient(), orientation.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const folder = recommendedFolderName(orientation.organizations?.name ?? "");
  const file = recommendedFileName(orientation.workers?.name ?? "", doneOn);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateOrientation(createClient(), orientation.id, {
        status,
        // 実施済のときのみ実施日を保存、その他は null に
        done_on: status === "実施済" ? doneOn || null : null,
        drive_link: driveLink,
        note,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setBusy(false);
    }
  };

  const INPUT = "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

  return (
    <Modal open title="生活オリエンテーション 記録" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">状態</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as OrientationStatus)} className={INPUT}>
            {ORIENTATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        {status === "実施不可（早期退職）" && (
          <p className="flex items-center gap-1.5 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
            <XCircle size={13} />
            生活オリエンテーション前に退職したため実施不可として記録します。
          </p>
        )}

        {status === "実施済" && (
          <>
            <div className="rounded-lg bg-background px-3 py-2 text-sm">
              <span className="text-xs font-bold text-muted">実施予定日</span>
              <p className="font-bold tabular-nums">{orientation.scheduled_on}</p>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">実施日</span>
              <input type="date" value={doneOn} onChange={(e) => setDoneOn(e.target.value)} className={INPUT} />
            </label>

            <div className="rounded-xl bg-background p-3 text-xs leading-relaxed text-muted">
              <p className="mb-1 font-bold text-foreground">Drive 推奨の保存名</p>
              <p>フォルダ: {folder}</p>
              <p>ファイル: {file}</p>
              <p className="mt-1">上記の名前で Drive に保存し、そのリンクを下に貼り付けてください。</p>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted">保存先リンク（Drive など）</span>
              <input type="url" value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/..." className={INPUT} />
            </label>
          </>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">備考</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} />
        </label>

        <Button fullWidth disabled={busy} onClick={save}>
          {busy ? "保存中…" : "保存する"}
        </Button>

        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={busy}
          className="mt-1 flex items-center justify-center gap-1.5 text-sm font-bold text-seal disabled:opacity-50"
        >
          <Trash2 size={15} />
          この生活オリエンテーションを削除
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="生活オリエンテーションを削除"
        message={`${orientation.workers?.name ?? "この外国人"}の生活オリエンテーション（予定日 ${orientation.scheduled_on}）を削除します。誤って登録した場合にご利用ください。この操作は取り消せません。`}
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </Modal>
  );
}
