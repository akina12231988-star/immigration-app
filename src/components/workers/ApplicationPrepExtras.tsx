"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, ExternalLink, Eye } from "lucide-react";
import { Combobox } from "@/components/ui/Combobox";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { updateTodo, type TodoRow } from "@/lib/supabase/queries/todos";
import {
  TODO_CHECK_KIND,
  TODO_STAGES,
  isCheckingStatus,
  stageOfStatus,
  type TodoStatusOption,
} from "@/lib/todo";
import { PREP_SIGN_STATUSES } from "@/lib/application-prep";
import type { PrepChecklistRow } from "@/lib/supabase/queries/application-prep";
import { listOrganizationFiles } from "@/lib/supabase/queries/organization-files";
import { getOrgFilePreviewUrl } from "@/app/(app)/organizations/actions";
import { orgYearlyFileGroups, type OrgYearlyFileGroup } from "@/lib/org-yearly-files";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { listWorkerWages } from "@/lib/supabase/queries/wages";
import { dbErrorMessage } from "@/lib/errors";
import type { Organization, OrganizationFileRow, WorkerWage } from "@/types/db";

// 申請準備 書類チェックリストの追加表示・入力。
//  - 申請準備TODOのステータス（本人の名前の下に常時表示・編集可）
//  - 現在の住所（未登録なら入力して保存）
//  - 所属機関の情報（住所・電話・代表者・協力確認書・売上高・定期報告/賃金台帳）
//  - 単独/連名申請の選択と連名相手の紐づけ
//  - 本人から署名をもらったかのステータス
//  - 賃金（採用時いくらか）の表示とリンク
//  - あっせんの有無（TODOと共有）と求人への採用の流れ

const INPUT =
  "min-h-[36px] rounded-lg border border-border bg-surface px-2 text-xs focus:border-brand focus:outline-none disabled:opacity-60";

// ---- 申請準備TODOのステータス（名前の下に常時表示） ----

export function PrepTodoStatusField({
  todo,
  options,
  canEdit,
  onError,
  onChanged,
}: {
  todo: TodoRow | null; // 表示中のTODO番号に対応する申請準備のTODO（無ければ null）
  options: TodoStatusOption[]; // すべての選択肢（申請準備＋チェック）
  canEdit: boolean;
  onError: (m: string) => void;
  onChanged: () => void;
}) {
  const kindOptions = options.filter((o) => o.kind === "申請準備");
  const checkOptions = options.filter((o) => o.kind === TODO_CHECK_KIND);

  if (!todo) {
    return (
      <div className="mb-3 rounded-xl border border-border bg-background px-3 py-2.5 text-[11px] text-muted">
        このTODO番号の申請準備のTODOがまだありません（申請準備のページを開くと自動で作成されます）。
      </div>
    );
  }

  const stage = stageOfStatus(todo.status, kindOptions);
  const save = (patch: Partial<Pick<TodoRow, "status" | "check_status">>) => {
    updateTodo(createClient(), todo.id, patch)
      .then(onChanged)
      .catch((err) => onError(dbErrorMessage(err, "0102_todos.sql", "ステータスの保存に失敗しました")));
  };

  return (
    <div className="mb-3 rounded-xl border border-brand/40 bg-brand/5 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-muted">
          申請準備TODO（No.{todo.todo_no}）のステータス
        </span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            stage === "完了"
              ? "bg-status-approved-bg text-status-approved-fg"
              : stage === "進行中"
                ? "bg-status-applied-bg text-status-applied-fg"
                : "bg-background text-muted ring-1 ring-border"
          }`}
        >
          {stage}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <select
          value={todo.status}
          disabled={!canEdit}
          onChange={(e) => save({ status: e.target.value })}
          className={`${INPUT} min-w-0 flex-1`}
        >
          {/* 選択肢から消された（または自由入力の）値もそのまま残す */}
          {todo.status && !kindOptions.some((o) => o.name === todo.status) && (
            <option value={todo.status}>{todo.status}</option>
          )}
          {!todo.status && <option value="">未選択</option>}
          {TODO_STAGES.map((s) => {
            const group = kindOptions.filter((o) => o.stage === s);
            return group.length > 0 ? (
              <optgroup key={s} label={s}>
                {group.map((o) => (
                  <option key={o.id} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
      </div>
      {/* 経過が「〜チェック中」のときは確認ステータスも出す */}
      {isCheckingStatus(todo.status) && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="shrink-0 text-[11px] font-bold text-muted">チェック</span>
          <select
            value={todo.check_status ?? ""}
            disabled={!canEdit}
            onChange={(e) => save({ check_status: e.target.value })}
            className={`${INPUT} min-w-0 flex-1`}
          >
            <option value="">未選択</option>
            {todo.check_status &&
              !checkOptions.some((o) => o.name === todo.check_status) && (
                <option value={todo.check_status}>{todo.check_status}</option>
              )}
            {TODO_STAGES.map((s) => {
              const group = checkOptions.filter((o) => o.stage === s);
              return group.length > 0 ? (
                <optgroup key={s} label={s}>
                  {group.map((o) => (
                    <option key={o.id} value={o.name}>
                      {o.name}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
        </div>
      )}
    </div>
  );
}

// ---- 現在の住所（未登録なら入力して保存できる） ----

export function PrepAddressField({
  workerId,
  address,
  canEdit,
  onSaved,
}: {
  workerId: string;
  address: string; // 現在の登録値
  canEdit: boolean;
  onSaved: (address: string) => void;
}) {
  const [value, setValue] = useState(address);
  const [prev, setPrev] = useState(address);
  if (address !== prev) {
    setPrev(address);
    setValue(address);
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = value.trim() !== address;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateWorker(createClient(), workerId, { address: value.trim() });
      onSaved(value.trim());
    } catch {
      setError("住所の保存に失敗しました。通信状況を確認してもう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-3 rounded-xl border border-border bg-background px-3 py-2.5">
      <p className="mb-1 text-[11px] font-bold text-muted">現在の住所</p>
      {error && <p className="mb-1 rounded-lg bg-seal/10 px-2 py-1 text-[11px] text-seal">{error}</p>}
      {canEdit ? (
        <div className="flex items-center gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="未登録（入力して保存できます）"
            className={`${INPUT} min-w-0 flex-1`}
          />
          {changed && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-brand-foreground disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs">{address || "未登録"}</p>
      )}
    </div>
  );
}

// ---- 所属機関の情報（申請種別の下に表示） ----

export function PrepOrgInfo({ orgId }: { orgId: string | null }) {
  // どの機関のデータかも一緒に持ち、機関が切り替わった直後に前の機関の情報を出さないようにする
  const [loadedData, setLoadedData] = useState<{
    orgId: string;
    org: Organization | null;
    files: OrganizationFileRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const supabase = createClient();
    void Promise.all([
      supabase
        .from("organizations")
        .select("*")
        .eq("id", orgId)
        .maybeSingle()
        .then(({ data }) => (data as Organization | null) ?? null),
      listOrganizationFiles(supabase, orgId).catch(() => [] as OrganizationFileRow[]),
    ]).then(([org, files]) => {
      if (!cancelled) setLoadedData({ orgId, org, files });
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const org = loadedData?.orgId === orgId ? loadedData.org : null;
  const files = loadedData?.orgId === orgId ? loadedData.files : [];
  const intake = useMemo(() => normalizeOrganizationIntake(org?.intake), [org]);

  if (!orgId) {
    return (
      <p className="rounded-lg bg-surface/60 px-2.5 py-2 text-[11px] text-muted">
        所属機関が未設定です。上の「申請準備の対応状況」または申請一覧で所属機関（転職の場合は転職先）を選んでください。
      </p>
    );
  }
  if (!org) return null;

  // 直近の売上高（決算情報のうち売上が入っている行）
  const sales = intake.financials.filter((f) => f.sales).slice(0, 2);
  const reportGroups = orgYearlyFileGroups(files, "定期報告書");
  const ledgerGroups = orgYearlyFileGroups(files, "賃金台帳");

  const preview = async (id: string) => {
    const res = await getOrgFilePreviewUrl(id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  };

  const councilLine = (rows: { to: string; on: string }[]) => {
    const filled = rows.filter((r) => r.to || r.on);
    if (filled.length === 0) return "未登録";
    return filled.map((r) => `${r.to || "提出先未記入"}（${r.on || "提出日未記入"}）`).join("、");
  };

  return (
    <div className="space-y-1.5 rounded-lg bg-surface/60 p-2.5 text-[11px] leading-relaxed">
      <p className="flex flex-wrap items-center gap-1.5 font-bold">
        <Building2 size={13} className="text-brand" />
        {org.name}
        <Link
          href={`/organizations/${org.id}`}
          className="font-bold text-brand hover:underline"
        >
          所属機関を開く →
        </Link>
      </p>
      {error && <p className="rounded-lg bg-seal/10 px-2 py-1 text-seal">{error}</p>}
      <p>住所: {org.address || "未登録"}</p>
      <p>電話番号: {org.contact || "未登録"}</p>
      <p>
        代表者: {intake.rep_name || "未登録"}
        {intake.rep_kana && `（${intake.rep_kana}）`}
      </p>
      <p>協力確認書（事業所の所在地）: {councilLine(intake.council_office_submissions)}</p>
      <p>協力確認書（住居地）: {councilLine(intake.council_residence_submissions)}</p>
      {intake.council_note && <p>協議会メモ: {intake.council_note}</p>}
      <p>
        直近の売上高:{" "}
        {sales.length > 0
          ? sales
              .map((f) => `${f.year || "年度未記入"}${f.term ? `（${f.term}）` : ""} ${f.sales}`)
              .join("、")
          : "未登録（所属機関の決算情報に入力すると表示されます）"}
      </p>
      <OrgYearlyFilesLine label="直近の定期報告" groups={reportGroups} onPreview={preview} />
      <OrgYearlyFilesLine label="賃金台帳" groups={ledgerGroups} onPreview={preview} />
    </div>
  );
}

// 直近の年度グループのファイルを1行で表示する（表示ボタン付き）
function OrgYearlyFilesLine({
  label,
  groups,
  onPreview,
}: {
  label: string;
  groups: OrgYearlyFileGroup[];
  onPreview: (id: string) => Promise<void>;
}) {
  const latest = groups[0];
  if (!latest) {
    return <p>{label}: 未登録（所属機関の編集画面からアップロードできます）</p>;
  }
  return (
    <div>
      <p className="font-bold">
        {label}（{latest.label || "年度未設定"}）:
      </p>
      <div className="mt-0.5 flex flex-col gap-0.5">
        {latest.files.map((f) => (
          <span key={f.id} className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate">{f.file_name}</span>
            <button
              type="button"
              onClick={() => void onPreview(f.id)}
              aria-label="表示"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border text-muted hover:text-brand"
            >
              <Eye size={12} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---- 単独申請か連名申請か（連名の場合は相手を名前検索してTODO番号と紐づける） ----

export function JointApplicationField({
  workerId,
  row,
  canEdit,
  onChange,
}: {
  workerId: string;
  row: PrepChecklistRow;
  canEdit: boolean;
  onChange: (
    patch: Partial<Pick<PrepChecklistRow, "joint_kind" | "joint_worker_id" | "joint_todo_no">>,
  ) => void;
}) {
  // 連名相手の候補（自分以外の外国人）。連名を選んだときだけ読み込む
  const [workers, setWorkers] = useState<{ id: string; label: string }[] | null>(null);
  const [todoNo, setTodoNo] = useState(row.joint_todo_no);
  const [prevNo, setPrevNo] = useState(row.joint_todo_no);
  if (row.joint_todo_no !== prevNo) {
    setPrevNo(row.joint_todo_no);
    setTodoNo(row.joint_todo_no);
  }

  useEffect(() => {
    if (row.joint_kind !== "連名" || workers !== null) return;
    let cancelled = false;
    void createClient()
      .from("workers")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        if (cancelled) return;
        setWorkers(
          (((data as { id: string; name: string }[] | null) ?? []) as { id: string; name: string }[])
            .filter((w) => w.id !== workerId)
            .map((w) => ({ id: w.id, label: w.name })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [row.joint_kind, workers, workerId]);

  // 相手を選んだら、その人の申請TODO番号を引いて紐づける
  const selectPartner = (id: string) => {
    if (!id) {
      onChange({ joint_worker_id: null, joint_todo_no: "" });
      return;
    }
    void createClient()
      .from("workers")
      .select("residence_renewal_todo")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        const no = (data as { residence_renewal_todo: string | null } | null)?.residence_renewal_todo ?? "";
        onChange({ joint_worker_id: id, joint_todo_no: no });
      });
  };

  const partnerName = row.joint_worker_id
    ? (workers?.find((w) => w.id === row.joint_worker_id)?.label ?? null)
    : null;

  return (
    <div className="mt-2 rounded-lg bg-surface/60 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-muted">この番号の申請</span>
        <select
          value={row.joint_kind}
          disabled={!canEdit}
          onChange={(e) => onChange({ joint_kind: e.target.value })}
          className={INPUT}
        >
          <option value="">未選択</option>
          <option value="単独">単独申請</option>
          <option value="連名">連名申請</option>
        </select>
        {row.joint_kind === "単独" && (
          <span className="text-[11px] text-muted">単独申請のため、リストの追加はしません。</span>
        )}
      </div>
      {row.joint_kind === "連名" && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[11px] text-muted">
            どの人と連名申請をするか名前で検索して選ぶと、その人のTODO番号と紐づきます。
          </p>
          {canEdit && (
            <Combobox
              options={workers ?? []}
              value={row.joint_worker_id ?? ""}
              onChange={selectPartner}
              placeholder="連名相手を氏名で検索して選択"
            />
          )}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-bold text-muted">連名相手:</span>
            {row.joint_worker_id ? (
              <Link
                href={`/workers/${row.joint_worker_id}`}
                className="font-bold text-brand hover:underline"
              >
                {partnerName ?? "外国人詳細を開く"}
              </Link>
            ) : (
              <span className="text-muted">未選択</span>
            )}
            <span className="font-bold text-muted">相手のTODO番号:</span>
            <input
              value={todoNo}
              readOnly={!canEdit}
              onChange={(e) => setTodoNo(e.target.value)}
              onBlur={() => {
                if (todoNo.trim() !== row.joint_todo_no) onChange({ joint_todo_no: todoNo.trim() });
              }}
              placeholder="例: TODO-1234"
              className={`${INPUT} w-28 tabular-nums`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---- 本人から署名をもらったかのステータス ----

export function PrepSignStatusField({
  value,
  canEdit,
  onChange,
}: {
  value: string;
  canEdit: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2.5">
      <p className="mb-1 text-[11px] font-bold text-muted">本人から署名をもらったか</p>
      <select
        value={value}
        disabled={!canEdit}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT} w-full`}
      >
        <option value="">未選択</option>
        {/* 選択肢から外れた保存済みの値もそのまま残す */}
        {value && !PREP_SIGN_STATUSES.includes(value as (typeof PREP_SIGN_STATUSES)[number]) && (
          <option value={value}>{value}</option>
        )}
        {PREP_SIGN_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---- 賃金（いくらで採用となっているか）。外国人詳細の賃金の記録と同じデータを表示 ----

export function PrepWageSummary({ workerId }: { workerId: string }) {
  const [wages, setWages] = useState<WorkerWage[]>([]);
  const [orgNames, setOrgNames] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    listWorkerWages(supabase, workerId)
      .then((rows) => {
        if (cancelled) return;
        setWages(rows);
        setLoaded(true);
        const ids = [...new Set(rows.map((r) => r.organization_id).filter(Boolean))] as string[];
        if (ids.length === 0) return;
        void supabase
          .from("organizations")
          .select("id, name")
          .in("id", ids)
          .then(({ data }) => {
            if (cancelled) return;
            setOrgNames(
              new Map(((data as { id: string; name: string }[] | null) ?? []).map((o) => [o.id, o.name])),
            );
          });
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2.5">
      <p className="mb-1 flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold text-muted">
        賃金（いくらで採用となっているか）
        <Link
          href={`/workers/${workerId}#wages`}
          className="font-bold text-brand hover:underline"
        >
          賃金（1-6号別紙）を開く →
        </Link>
      </p>
      {!loaded ? null : wages.length === 0 ? (
        <p className="text-[11px] text-muted">
          賃金の記録がまだありません。「賃金（1-6号別紙）を開く」から採用時の賃金を登録してください。
        </p>
      ) : (
        <div className="space-y-0.5 text-[11px] leading-relaxed">
          {wages.map((w, i) => (
            <p key={w.id}>
              <span className="font-bold">
                {w.kind} {w.amount.toLocaleString("ja-JP")}円
              </span>
              （{w.started_on}〜{w.reason && `・${w.reason}`}）
              {w.organization_id && orgNames.get(w.organization_id) && (
                <span className="text-muted">　{orgNames.get(w.organization_id)}</span>
              )}
              {i === 0 && (
                <span className="ml-1 rounded-full bg-status-approved-bg px-1.5 py-0.5 text-[10px] font-bold text-status-approved-fg">
                  現在
                </span>
              )}
              {w.detail && Object.keys(w.detail).length > 0 && (
                <span className="ml-1 text-[10px] text-muted">1-6号別紙あり</span>
              )}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- あっせんの有無（申請準備のTODOと共有）と求人への採用の流れ ----

interface PrepJobFlow {
  id: string;
  applied_on: string;
  interview_on: string | null;
  result_on: string | null;
  result: string;
  orgName: string;
  postingReceivedOn: string | null;
  postingJobType: string;
}

export function PrepAssenSection({
  workerId,
  todo,
  canEdit,
  onError,
  onChanged,
}: {
  workerId: string;
  todo: TodoRow | null; // あっせんの有無はTODOに保存して /todos と共有する
  canEdit: boolean;
  onError: (m: string) => void;
  onChanged: () => void;
}) {
  const [flows, setFlows] = useState<PrepJobFlow[]>([]);
  const [note, setNote] = useState(todo?.assen_note ?? "");
  const [prevNote, setPrevNote] = useState(todo?.assen_note ?? "");
  if ((todo?.assen_note ?? "") !== prevNote) {
    setPrevNote(todo?.assen_note ?? "");
    setNote(todo?.assen_note ?? "");
  }

  useEffect(() => {
    let cancelled = false;
    void createClient()
      .from("job_applications")
      .select(
        "id, applied_on, interview_on, result_on, result, organizations(name), job_postings(received_on, job_type)",
      )
      .eq("worker_id", workerId)
      .order("applied_on", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const rows =
          (data as unknown as {
            id: string;
            applied_on: string;
            interview_on: string | null;
            result_on: string | null;
            result: string;
            organizations: { name: string } | null;
            job_postings: { received_on: string | null; job_type: string } | null;
          }[]) ?? [];
        setFlows(
          rows.map((r) => ({
            id: r.id,
            applied_on: r.applied_on,
            interview_on: r.interview_on,
            result_on: r.result_on,
            result: r.result,
            orgName: r.organizations?.name ?? "",
            postingReceivedOn: r.job_postings?.received_on ?? null,
            postingJobType: r.job_postings?.job_type ?? "",
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  const save = (patch: Partial<Pick<TodoRow, "assen" | "assen_note">>) => {
    if (!todo) return;
    updateTodo(createClient(), todo.id, patch)
      .then(onChanged)
      .catch((err) =>
        onError(dbErrorMessage(err, "0103_todo_prep_extras.sql", "あっせんの保存に失敗しました")),
      );
  };

  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-muted">あっせん</span>
        <select
          value={todo?.assen ?? ""}
          disabled={!canEdit || !todo}
          onChange={(e) => save({ assen: e.target.value })}
          className={INPUT}
        >
          <option value="">未設定</option>
          <option value="あり">あり（求人からの採用）</option>
          <option value="なし">なし</option>
        </select>
        {!todo && (
          <span className="text-[11px] text-muted">
            申請準備のTODOが作成されると設定できます（TODOと共有）。
          </span>
        )}
      </div>
      {todo?.assen === "なし" && (
        <label className="mt-1.5 block">
          <span className="text-[11px] font-bold text-muted">
            どのような経緯での申請書類作成か（あっせん無しの場合に記入）
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if (note !== (todo.assen_note ?? "")) save({ assen_note: note });
            }}
            disabled={!canEdit}
            rows={2}
            placeholder="例: 知人の紹介で本人から直接依頼があり、会社と面談のうえ雇用が決まった など"
            className={`${INPUT} mt-0.5 w-full py-1.5`}
          />
        </label>
      )}
      {todo?.assen === "あり" && (
        <div className="mt-1.5 rounded-lg bg-surface/60 p-2">
          <p className="mb-1 text-[11px] font-bold text-muted">
            求人への採用の一連の流れ（求職管理簿から）
          </p>
          {flows.length === 0 ? (
            <p className="text-[11px] text-muted">
              この外国人の応募（求職管理簿）が見つかりません。
              <Link href="/jobs" className="mx-1 font-bold text-brand hover:underline">
                求職一覧
              </Link>
              で応募・採用を登録してください。
            </p>
          ) : (
            <div className="space-y-1">
              {flows.map((f) => (
                <p key={f.id} className="text-[11px] leading-relaxed">
                  <span className="font-bold">{f.orgName}</span>
                  {f.postingJobType && `（${f.postingJobType}）`}
                  求人申込日 {f.postingReceivedOn ?? "—"} → 求職申込日 {f.applied_on} → 面接日{" "}
                  {f.interview_on ?? "—"} → {f.result === "採用" ? "採用日" : f.result}{" "}
                  {f.result_on ?? "—"}
                </p>
              ))}
              <Link
                href="/jobs"
                className="inline-flex items-center gap-1 text-[10px] font-bold text-brand hover:underline"
              >
                <ExternalLink size={10} />
                求職一覧を開く
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
