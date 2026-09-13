"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, Copy, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { updateOrganization } from "@/lib/supabase/queries/organizations";
import { listWorkerWages } from "@/lib/supabase/queries/wages";
import { toCalcHistory } from "@/lib/supabase/queries/histories";
import { findPlanDatesForTodo, listPlanDates } from "@/lib/supabase/queries/plan-dates";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { getAppSetting, setAppSetting } from "@/lib/supabase/queries/app-settings";
import { CUSTODIAN_SETTING_KEY, mergeCustodianInfo, mergeSupportOrgLists } from "@/lib/custody";
import {
  buildApplicationCopyGroups,
  copyGroupText,
  type CopyEdit,
  type CopyGroup,
  type CopyWorker,
} from "@/lib/application-copy";
import { dbErrorMessage } from "@/lib/errors";
import { CopyButton } from "@/components/ui/CopyButton";
import type { Organization, WorkHistoryRow, WorkerWage } from "@/types/db";

// 申請準備 ＞ 申請書に貼る情報。
// 外国人詳細・所属機関・賃金・職歴・支援計画書の日付から、申請書（申請人等作成用・所属機関等作成用）の
// 項目を組み立てて、1項目ずつ（年・月・日は部品ごとにも）コピーできるようにする。
export function ApplicationCopyPanel({
  workerId,
  orgId,
  todoNo,
  desiredStatus,
  canEdit = false,
  onSaved,
}: {
  workerId: string;
  orgId: string | null;
  todoNo: string;
  desiredStatus?: string; // 希望する在留資格（申請種別から）
  canEdit?: boolean; // true: 項目をこの場で入力・編集して保存できる
  onSaved?: () => void; // 保存したあと（親の表示を更新したいとき）
}) {
  // 保存したら読み直す（値を変えると useEffect が再実行される）
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState<{
    worker: CopyWorker | null;
    org: Organization | null;
    wages: WorkerWage[];
    histories: WorkHistoryRow[];
    planDates: Record<string, string>;
    custodian: Record<string, unknown> | null; // 登録支援機関の上書き（app_settings。無ければ既定値）
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void Promise.all([
      supabase.from("workers").select("*").eq("id", workerId).maybeSingle().then(({ data }) => (data as CopyWorker | null) ?? null),
      orgId
        ? supabase.from("organizations").select("*").eq("id", orgId).maybeSingle().then(({ data }) => (data as Organization | null) ?? null)
        : Promise.resolve(null),
      listWorkerWages(supabase, workerId).catch(() => [] as WorkerWage[]),
      supabase
        .from("work_histories")
        .select("*")
        .eq("worker_id", workerId)
        .then(({ data }) => ((data as WorkHistoryRow[] | null) ?? [])),
      listPlanDates(supabase, workerId)
        .then((rows) => findPlanDatesForTodo(rows, todoNo)?.dates ?? {})
        .catch(() => ({}) as Record<string, string>),
      // 0149 未適用でも既定値で表示できるようにエラーは無視する
      getAppSetting<Record<string, unknown>>(supabase, CUSTODIAN_SETTING_KEY).catch(() => null),
    ]).then(([worker, org, wages, histories, planDates, custodian]) => {
      if (!cancelled) setLoaded({ worker, org, wages, histories, planDates, custodian });
    });
    return () => {
      cancelled = true;
    };
  }, [workerId, orgId, todoNo, reloadKey]);

  // 項目をこの場で保存する（外国人 / 所属機関 / 所属機関の登録内容）。空で保存すると消す
  const saveEdit = async (edit: CopyEdit, value: string) => {
    const supabase = createClient();
    const v = value.trim();
    if (edit.target === "worker") {
      await updateWorker(supabase, workerId, {
        [edit.column]: edit.kind === "date" ? v || null : v,
      } as Parameters<typeof updateWorker>[2]);
    } else if (edit.target === "custodian") {
      // 登録支援機関の情報は全員共通（app_settings に保存）。通訳者・申請取次者の一覧など他の項目は残す
      const next = { ...(loaded?.custodian ?? {}), ...mergeCustodianInfo(loaded?.custodian), [edit.column]: v };
      await setAppSetting(supabase, CUSTODIAN_SETTING_KEY, next);
    } else if (edit.target === "council") {
      // 協力確認書の提出（事業所の所在地 / 住居地）の index 行目の提出先・提出日を書き換える
      if (!orgId || !loaded?.org) throw new Error("所属機関が未設定です");
      const intake = normalizeOrganizationIntake(loaded.org.intake);
      const key = edit.list === "office" ? "council_office_submissions" : "council_residence_submissions";
      const rows = intake[key].map((r) => ({ ...r }));
      while (rows.length <= edit.index) rows.push({ to: "", on: "" });
      rows[edit.index] = { ...rows[edit.index], [edit.field]: v };
      await updateOrganization(supabase, orgId, { intake: { ...intake, [key]: rows } });
    } else if (edit.target === "org") {
      if (!orgId) throw new Error("所属機関が未設定です");
      await updateOrganization(supabase, orgId, { [edit.column]: v });
    } else {
      if (!orgId || !loaded?.org) throw new Error("所属機関が未設定です");
      const intake = normalizeOrganizationIntake(loaded.org.intake);
      await updateOrganization(supabase, orgId, { intake: { ...intake, [edit.column]: v } });
    }
    setReloadKey((k) => k + 1);
    onSaved?.();
  };

  const groups = useMemo(() => {
    if (!loaded?.worker) return null;
    return buildApplicationCopyGroups({
      worker: loaded.worker,
      org: loaded.org,
      intake: loaded.org ? normalizeOrganizationIntake(loaded.org.intake) : null,
      wages: loaded.wages,
      histories: loaded.histories.map(toCalcHistory),
      planDates: loaded.planDates,
      desiredStatus,
      custodian: mergeCustodianInfo(loaded.custodian),
      interpreters: mergeSupportOrgLists(loaded.custodian).interpreters,
    });
  }, [loaded, desiredStatus]);

  if (!groups) return null;
  return <ApplicationCopyList groups={groups} orgMissing={!orgId} canEdit={canEdit} onSave={saveEdit} />;
}

// 一覧の表示（データの読み込みと分けて、単体でも描ける）
export function ApplicationCopyList({
  groups,
  orgMissing = false,
  canEdit = false,
  onSave,
}: {
  groups: CopyGroup[];
  orgMissing?: boolean;
  canEdit?: boolean;
  onSave?: (edit: CopyEdit, value: string) => Promise<void>; // 項目をその場で保存する
}) {
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<number>(0);
  const [copiedGroup, setCopiedGroup] = useState<number | null>(null);
  // 登録済みの値を編集中の項目（欄の番号-項目の番号）
  const [editing, setEditing] = useState<string | null>(null);

  const copyAll = async (i: number) => {
    try {
      await navigator.clipboard.writeText(copyGroupText(groups[i]));
      setCopiedGroup(i);
      setTimeout(() => setCopiedGroup(null), 1500);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };

  const filled = groups.reduce((n, g) => n + g.items.filter((i) => i.value).length, 0);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="rounded-lg bg-background p-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-1 text-left text-[11px] font-bold text-muted"
      >
        <span className="flex items-center gap-1">
          <ClipboardList size={13} className="text-brand" />
          申請書に貼る情報をコピー（外国人・所属機関・賃金・職歴・日付から自動で抽出）
        </span>
        <span className="tabular-nums">
          {filled} / {total}項目 {open ? "▲ 閉じる" : "▼ 開く"}
        </span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] leading-relaxed text-muted">
            申請書（申請人等作成用 1〜3・所属機関等作成用 1〜4）の項目順に並んでいます。右のコピーで1項目ずつ、
            年・月・日のように欄が分かれているものは部品ごとにもコピーできます。
            {canEdit && onSave
              ? "「未登録」の項目はその場で入力、登録済みの項目は鉛筆マークから編集して保存できます（外国人詳細・所属機関にも反映されます。所属機関等作成用 4 の登録支援機関の情報は全員共通の設定として保存されます）。"
              : "「未登録」は外国人詳細・所属機関で入れると出ます。"}
            {orgMissing && "所属機関が未設定のため、所属機関の項目は空です。"}
          </p>
          <div className="flex flex-wrap gap-1">
            {groups.map((g, i) => (
              <button
                key={g.title}
                type="button"
                onClick={() => setOpenGroup(i)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                  openGroup === i ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface text-muted"
                }`}
              >
                {g.title.replace(/（.*$/, "")}
              </button>
            ))}
          </div>
          {groups[openGroup] && (
            <div className="rounded-lg bg-surface p-2">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                <p className="text-[11px] font-bold">{groups[openGroup].title}</p>
                <button
                  type="button"
                  onClick={() => void copyAll(openGroup)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-[11px] font-bold text-muted"
                >
                  {copiedGroup === openGroup ? <Check size={12} className="text-status-reported-fg" /> : <Copy size={12} />}
                  {copiedGroup === openGroup ? "コピーしました" : "この欄をまとめてコピー"}
                </button>
              </div>
              {groups[openGroup].items.length === 0 ? (
                <p className="text-[11px] text-muted">登録がありません。</p>
              ) : (
                <div className="divide-y divide-border">
                  {groups[openGroup].items.map((item, i) => {
                    const key = `${openGroup}-${i}`;
                    const editable = canEdit && !!onSave && !!item.edit;
                    return (
                    <div key={`${item.label}-${i}`} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 py-1 text-[11px]">
                      <span className="w-full text-muted sm:w-[15rem] sm:shrink-0">{item.label}</span>
                      <span className="flex min-w-0 flex-1 items-start gap-1">
                        {editable && item.edit && (editing === key || !item.value) ? (
                          <InlineEditField
                            label={item.label}
                            edit={item.edit}
                            initial={item.editValue ?? item.value}
                            registered={!!item.value}
                            onSave={async (e, v) => {
                              await onSave!(e, v);
                              setEditing(null);
                            }}
                            onCancel={item.value ? () => setEditing(null) : undefined}
                          />
                        ) : item.value ? (
                          <>
                            <span className="min-w-0 break-all font-bold">{item.value}</span>
                            <CopyButton value={item.value} label={`${item.label}をコピー`} size={13} className="mt-0.5" />
                            {editable && (
                              <button
                                type="button"
                                onClick={() => setEditing(key)}
                                title={`${item.label}を編集`}
                                aria-label={`${item.label}を編集`}
                                className="mt-0.5 rounded p-0.5 text-muted hover:bg-background hover:text-foreground"
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="text-seal">未登録</span>
                        )}
                      </span>
                      {item.parts && item.parts.some(Boolean) && (
                        <span className="flex w-full flex-wrap gap-1 pl-0 sm:pl-[15.5rem]">
                          {item.parts.map((p, j) =>
                            p ? (
                              <PartChip key={j} value={p} />
                            ) : null,
                          )}
                        </span>
                      )}
                      {item.note && <span className="w-full text-[10px] text-muted sm:pl-[15.5rem]">{item.note}</span>}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 年・月・日などの部品を1つずつコピーする小さなボタン
function PartChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={`「${value}」をコピー`}
      className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] tabular-nums ${
        copied ? "border-status-reported-fg text-status-reported-fg" : "border-border text-muted"
      }`}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {value}
    </button>
  );
}

// 項目をその場で入力・編集して保存する欄（文字・日付・選択肢）。
// 未登録なら「未登録」と入力欄、登録済みなら今の値を入れた入力欄と「やめる」を出す
function InlineEditField({
  label,
  edit,
  initial = "",
  registered = false,
  onSave,
  onCancel,
}: {
  label: string;
  edit: CopyEdit;
  initial?: string; // 最初に入れておく値（登録済みの値）
  registered?: boolean; // true: 登録済みの値を編集している（空で保存すると消す）
  onSave: (edit: CopyEdit, value: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = "options" in edit ? edit.options : undefined;
  const isDate = "kind" in edit && edit.kind === "date";
  // エラー文に出すマイグレーション名（登録支援機関の情報は app_settings に保存する）
  const migration = edit.target === "custodian" ? "0149_app_settings.sql" : "0001_init.sql";
  const cls =
    "min-h-[28px] rounded border border-seal/40 bg-surface px-1.5 text-[11px] focus:border-brand focus:outline-none disabled:opacity-60";
  // 未登録のときは空では保存しない。登録済みのときは変わっていなければ保存しない（空にして消すのは可）
  const canSave = registered ? value.trim() !== initial.trim() : value.trim().length > 0;
  // 選択肢に無い値（古い登録値）も選べるように残す
  const optionList = options && value && !options.includes(value) ? [value, ...options] : options;

  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(edit, value);
    } catch (err) {
      setError(dbErrorMessage(err, migration, `${label}の保存に失敗しました`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-1">
        {!registered && <span className="text-seal">未登録</span>}
        {optionList ? (
          <select value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} className={cls} aria-label={label}>
            <option value="">{registered ? "（空にする）" : "選択してください"}</option>
            {optionList.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={isDate ? "date" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") onCancel?.();
            }}
            disabled={busy}
            placeholder="ここに入力"
            aria-label={label}
            autoFocus={registered}
            className={`${cls} ${isDate ? "" : "min-w-[10rem] flex-1"}`}
          />
        )}
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !canSave}
          className="rounded bg-brand px-2 py-1 text-[10px] font-bold text-brand-foreground disabled:opacity-50"
        >
          {busy ? "保存中…" : "保存"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-border px-2 py-1 text-[10px] font-bold text-muted disabled:opacity-50"
          >
            やめる
          </button>
        )}
      </span>
      {registered && !error && (
        <span className="text-[10px] text-muted">
          空にして保存すると登録を消します。{optionList ? "" : "Enterで保存、Escでやめる"}
        </span>
      )}
      {error && (
        <span role="alert" className="text-[10px] font-bold text-seal">
          {error}
        </span>
      )}
    </span>
  );
}
