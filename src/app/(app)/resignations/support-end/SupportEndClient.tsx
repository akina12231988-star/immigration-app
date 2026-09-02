"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarClock,
  ExternalLink,
  FileOutput,
  Handshake,
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
  deleteSupportEnd,
  insertSupportEnd,
  updateSupportEnd,
  type SupportEndPatch,
  type SupportEndWithRefs,
} from "@/lib/supabase/queries/support-end";
import type { WorkerForSupportEnd } from "@/lib/supabase/queries/workers";
import { dbErrorMessage, errorMessage } from "@/lib/errors";
import { messengerWebUrl } from "@/lib/messenger-link";
import { notionAppUrl } from "@/lib/notion-link";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { downloadBlob } from "@/lib/xlsx-export";
import { adhocReportStatus, countByAdhocStatus } from "@/lib/adhoc-report-progress";
import {
  SUPPORT_END_DEFAULT_MAJOR,
  SUPPORT_END_DEFAULT_MINOR,
  SUPPORT_END_DEFAULT_OTHER_REASON,
  SUPPORT_END_MAJOR_REASONS,
  SUPPORT_END_MINOR_REASONS,
  SUPPORT_END_OTHER_CODE,
  SUPPORT_END_OTHER_MAX,
  endDateFromPermitDate,
  otherReasonTooLong,
  supportEndMajor,
  supportEndMinor,
} from "@/lib/support-end";
import { AdhocPosting } from "../AdhocPosting";
import { AdhocOrgSearch } from "../AdhocOrgSearch";
import { matchesAdhocOrg } from "@/lib/adhoc-report-org";
import {
  RESIGNATION_STATUSES,
  type Organization,
  type ResignationStatus,
} from "@/types/db";

const INPUT =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

const MIGRATION = "0135_support_end_records.sql";

// 進み具合のバッジの色（準備中 → 署名依頼中 → 投函完了。他の随時報告書と同じ）
const STATUS_CLASS: Record<ResignationStatus, string> = {
  準備中: "bg-background text-muted",
  署名依頼中: "bg-status-notice-bg text-status-notice-fg",
  投函完了: "bg-status-approved-bg text-status-approved-fg",
};

// 支援委託終了の随時報告書（参考様式第3-3-2号）の記録一覧。
// 特定技能2号へ移行して支援委託契約が終わるときに使うのが中心。
export function SupportEndClient({
  records,
  workers = [],
  organizations = [],
  canEdit,
  canDelete,
}: {
  records: SupportEndWithRefs[];
  workers?: WorkerForSupportEnd[];
  organizations?: Organization[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SupportEndWithRefs | null>(null);
  const [deleting, setDeleting] = useState<SupportEndWithRefs | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ResignationStatus | "all">("all");
  // 所属機関の名称での絞り込み
  const [orgQuery, setOrgQuery] = useState("");

  // 投函日・追跡番号・進み具合はこの画面で直せるので、手元でも最新の値を持つ
  const [rows, setRows] = useState(records);
  const [prevRows, setPrevRows] = useState(records);
  if (records !== prevRows) {
    setPrevRows(records);
    setRows(records);
  }
  const patchRow = (id: string, patch: SupportEndPatch) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const statusCounts = useMemo(() => countByAdhocStatus(rows), [rows]);
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (statusFilter === "all" || adhocReportStatus(r) === statusFilter) &&
          matchesAdhocOrg(r, orgQuery),
      ),
    [rows, statusFilter, orgQuery],
  );

  const remove = async () => {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await deleteSupportEnd(createClient(), deleting.id);
      setDeleting(null);
      router.refresh();
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, "削除に失敗しました"));
    } finally {
      setBusyDelete(false);
    }
  };

  // 届出書（参考様式第3-3-2号）を作ってダウンロードする
  const download = async (row: SupportEndWithRefs) => {
    setDownloadingId(row.id);
    setError(null);
    try {
      const res = await fetch("/api/support-end-form", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "様式の生成に失敗しました");
      }
      downloadBlob(await res.blob(), `参考様式第3-3-2号_${row.workers?.name ?? "届出"}.xlsx`);
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
          <Handshake size={14} className="mt-0.5 shrink-0" />
          支援委託契約が終わったときの随時届出（参考様式第3-3-2号）を作ります。特定技能2号へ移行した場合は、許可日を入れると終了年月日（許可日の前の日）が自動で入ります。
        </p>
        {canEdit && (
          <Button className="shrink-0" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            支援委託終了を記録
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* 進み具合フィルター（準備中 → 署名依頼中 → 投函完了） */}
      <div className="flex flex-wrap gap-2">
        {(["all", ...RESIGNATION_STATUSES] as (ResignationStatus | "all")[]).map((st) => {
          const active = statusFilter === st;
          const count = st === "all" ? rows.length : statusCounts[st];
          return (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-bold ${
                active
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border bg-surface text-muted"
              }`}
            >
              {st === "all" ? "すべての進み具合" : st}（{count}）
            </button>
          );
        })}
      </div>

      {/* 所属機関の名称で絞り込み */}
      <AdhocOrgSearch rows={rows} value={orgQuery} onChange={setOrgQuery} />

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          {orgQuery.trim()
            ? `「${orgQuery}」に当てはまる支援委託終了の記録はありません。`
            : "支援委託終了の記録はありません。"}
        </Card>
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
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_CLASS[adhocReportStatus(r)]}`}
                >
                  {adhocReportStatus(r)}
                </span>
              </div>

              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums text-muted">
                <span className="flex items-center gap-1">
                  <CalendarClock size={12} />
                  終了年月日 {r.ended_on}
                </span>
                {r.permit_date_2go && <span>2号の許可日 {r.permit_date_2go}</span>}
                <span>随時報告TODO {r.todo_no || "未入力"}</span>
              </p>

              <p className="mt-1 text-xs text-muted">
                終了の事由: {supportEndMajor(r.major_reason)?.label ?? r.major_reason} ／{" "}
                {r.minor_reason === SUPPORT_END_OTHER_CODE
                  ? `その他（${r.other_reason || "理由未入力"}）`
                  : (supportEndMinor(r.minor_reason)?.label ?? r.minor_reason)}
              </p>
              {r.card_no && (
                <p className="mt-0.5 text-xs tabular-nums text-muted">
                  1号のときの在留カード番号 {r.card_no}
                </p>
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
                    disabled={downloadingId === r.id}
                    onClick={() => void download(r)}
                  >
                    {downloadingId === r.id ? "作成中…" : "届出書作成（参考様式第3-3-2号）"}
                  </Button>
                  <p className="text-center text-[11px] leading-relaxed text-muted">
                    支援計画変更に係る届出（参考様式第3-2号）が未提出なら、一緒に提出してください
                    {adhocReportStatus(r) === "準備中" &&
                      "（ダウンロードすると「署名依頼中」になります）"}
                  </p>

                  {/* 署名済みの届出書を郵送したときの記録 */}
                  <AdhocPosting
                    kind="support-end"
                    recordId={r.id}
                    record={r}
                    canEdit={canEdit}
                    onPatch={async (patch) => {
                      patchRow(r.id, patch);
                      await updateSupportEnd(createClient(), r.id, patch);
                    }}
                  />
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
        <SupportEndDialog
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
        title="支援委託終了の記録の削除"
        message={`${deleting?.workers?.name ?? ""} さんの支援委託終了の記録を削除します。よろしいですか？`}
        busy={busyDelete}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// 支援委託終了の記録・編集ダイアログ。
// 特定技能2号の許可日を入れると、終了年月日（許可日の前の日）が自動で入る。
// ①欄の在留カード番号・分野・業務区分は、特定技能2号へ移る前（1号のとき）の内容を書く。
function SupportEndDialog({
  workers,
  organizations,
  editing,
  onClose,
  onSaved,
}: {
  workers: WorkerForSupportEnd[];
  organizations: Organization[];
  editing: SupportEndWithRefs | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [workerId, setWorkerId] = useState(editing?.worker_id ?? "");
  const [useRegisteredOrg, setUseRegisteredOrg] = useState(!editing);
  const [orgId, setOrgId] = useState(editing?.organization_id ?? "");
  const [permitDate, setPermitDate] = useState(editing?.permit_date_2go ?? "");
  // 終了年月日は許可日の前の日を既定にしつつ、直せるようにしておく
  const [endedOn, setEndedOn] = useState(editing?.ended_on ?? "");
  const [major, setMajor] = useState(editing?.major_reason ?? SUPPORT_END_DEFAULT_MAJOR);
  const [minor, setMinor] = useState(editing?.minor_reason ?? SUPPORT_END_DEFAULT_MINOR);
  const [otherReason, setOtherReason] = useState(
    editing?.other_reason ?? SUPPORT_END_DEFAULT_OTHER_REASON,
  );
  const [cardNo, setCardNo] = useState(editing?.card_no ?? "");
  const [field, setField] = useState(editing?.field ?? "");
  const [category, setCategory] = useState(editing?.business_category ?? "");
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

  // 外国人を選んだら、①欄の初期値を今の登録内容から入れる（1号のときの内容に直してもらう）
  const pickWorker = (id: string) => {
    setWorkerId(id);
    setUseRegisteredOrg(true);
    setOrgId("");
    const w = workers.find((x) => x.id === id);
    if (!w) return;
    if (!cardNo) setCardNo(w.residence_card_no);
    if (!field) setField(w.field);
    if (!permitDate && w.residence_permit_date) {
      setPermitDate(w.residence_permit_date);
      setEndedOn(endDateFromPermitDate(w.residence_permit_date));
    }
  };

  // 許可日を入れたら終了年月日（前の日）を自動で入れる
  const pickPermitDate = (value: string) => {
    setPermitDate(value);
    setEndedOn(endDateFromPermitDate(value));
  };

  const minorOptions = SUPPORT_END_MINOR_REASONS.filter(
    (m) => m.code === SUPPORT_END_OTHER_CODE || m.majors.includes(major),
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
    if (!endedOn) {
      setError("終了年月日を入れてください（特定技能2号の許可日を入れると自動で入ります）");
      return;
    }
    if (minor === SUPPORT_END_OTHER_CODE && !otherReason.trim()) {
      setError("小分類が「その他」のときは理由を入れてください");
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
        card_no: cardNo.trim(),
        field: field.trim(),
        business_category: category.trim() || targetOrg.business_category,
        permit_date_2go: permitDate || null,
        ended_on: endedOn,
        major_reason: major,
        minor_reason: minor,
        other_reason: minor === SUPPORT_END_OTHER_CODE ? otherReason.trim() : "",
        todo_no: todoNo.trim(),
        note: editing?.note ?? "",
      };
      if (editing) {
        await updateSupportEnd(supabase, editing.id, input);
      } else {
        await insertSupportEnd(supabase, input);
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
      title={editing ? "支援委託終了の記録を編集" : "支援委託終了を記録"}
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
            onChange={pickWorker}
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

        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-[150px] flex-1 flex-col gap-1">
            <span className="text-xs font-bold text-muted">特定技能2号の許可日</span>
            <input
              type="date"
              value={permitDate}
              onChange={(e) => pickPermitDate(e.target.value)}
              className={INPUT}
            />
          </label>
          <label className="flex min-w-[150px] flex-1 flex-col gap-1">
            <span className="text-xs font-bold text-muted">終了年月日（必須）</span>
            <input
              type="date"
              value={endedOn}
              onChange={(e) => setEndedOn(e.target.value)}
              className={INPUT}
            />
          </label>
        </div>
        <p className="-mt-1 text-[11px] leading-relaxed text-muted">
          支援委託契約の終了年月日は、特定技能2号の許可日の<b>前の日</b>です。許可日を入れると自動で入ります。
        </p>

        <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <p className="text-xs font-bold text-muted">終了の事由</p>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted">大分類</span>
            <select
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              className={INPUT}
            >
              {SUPPORT_END_MAJOR_REASONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted">小分類</span>
            <select
              value={minor}
              onChange={(e) => setMinor(e.target.value)}
              className={INPUT}
            >
              {minorOptions.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {minor === SUPPORT_END_OTHER_CODE && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">その他の理由（全角20文字以内）</span>
              <input
                type="text"
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                placeholder={SUPPORT_END_DEFAULT_OTHER_REASON}
                className={INPUT}
              />
              {otherReasonTooLong(otherReason) && (
                <span className="text-[11px] font-bold text-seal">
                  {SUPPORT_END_OTHER_MAX}文字以内で書いてください（今 {otherReason.trim().length}
                  文字）
                </span>
              )}
            </label>
          )}
          <p className="text-[11px] leading-relaxed text-muted">
            特定技能2号へ移行した場合は「委託契約の期間満了」＋「その他（特定技能２号へ移行した為）」で届け出ます。
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <p className="text-xs font-bold text-muted">
            届出書①欄（特定技能2号へ移る前＝1号のときの内容）
          </p>
          <p className="text-[11px] leading-relaxed text-muted">
            外国人情報を2号の内容に更新済みのときは、1号のときの在留カード番号・分野・業務区分に直してください。ここに入れた内容がそのまま届出書に載ります。
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted">在留カード番号（1号のとき）</span>
            <input
              type="text"
              value={cardNo}
              onChange={(e) => setCardNo(e.target.value)}
              placeholder="例: AB12345678CD"
              className={`${INPUT} tabular-nums`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted">特定産業分野</span>
            <input
              type="text"
              value={field}
              onChange={(e) => setField(e.target.value)}
              placeholder="例: 農業分野"
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted">業務区分</span>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={targetOrg?.business_category || "例: 耕種農業"}
              className={INPUT}
            />
          </label>
        </div>

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
