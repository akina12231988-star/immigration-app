"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileSpreadsheet, GripVertical, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { UnsavedChangesGuard } from "@/components/UnsavedChangesGuard";
import { createClient } from "@/lib/supabase/client";
import {
  deleteOrgPayrollItems,
  upsertOrgPayrollItems,
  upsertPeriodicReportEntries,
  type PeriodicReportEntryInput,
} from "@/lib/supabase/queries/periodic-report";
import {
  buildPayrollRequestRows,
  fiscalYearLabel,
  jpDate,
  lastEndedFiscalYear,
  manualPayrollRequestRow,
  ymText,
  type PayrollPermit,
  type PayrollRequestCandidate,
  type PayrollRequestRow,
} from "@/lib/payroll-request";
import {
  buildReport36,
  hoursText,
  OVERTIME_TIME_CATEGORY,
  parseHoursInput,
  reportMonthsFor,
  round1,
  type Section36,
} from "@/lib/periodic-report";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { downloadBlob } from "@/lib/xlsx-export";
import {
  PAYROLL_ITEM_CATEGORIES,
  RESIDENCE_STATUSES,
  type OrgPayrollItemRow,
  type PeriodicReportEntryRow,
} from "@/types/db";

const FIELD =
  "min-h-[32px] rounded-lg border border-border bg-surface px-1.5 text-sm focus:border-brand focus:outline-none";

// 画面で編集する項目1行（保存前の新しい行も id を持つ）
interface ItemDraft {
  id: string;
  name: string;
  category: string;
  isNew: boolean;
}

// 画面で編集する人×月の1件
interface EntryDraft {
  work_days: number | null;
  total_hours: number | null;
  overtime_hours: number | null;
  amounts: Record<string, number>;
  excluded: boolean;
  note: string;
}

const emptyDraft = (excluded: boolean): EntryDraft => ({
  work_days: null,
  total_hours: null,
  overtime_hours: null,
  amounts: {},
  excluded,
  note: "",
});

// よくある項目（項目がまだ無い機関で、たたき台として一括登録する）
const STARTER_ITEMS: { name: string; category: string }[] = [
  { name: "基本給", category: "基本給など" },
  { name: "時間外手当", category: "超過労働給与" },
  { name: "通勤手当", category: "通勤手当" },
  { name: "精皆勤手当", category: "精皆勤手当" },
  { name: "家族手当", category: "家族手当" },
  { name: "賞与", category: "賞与など" },
  { name: "食費", category: "控除 食費" },
  { name: "寮費（水道光熱費含む）", category: "控除 居住費" },
  { name: "健康保険料", category: "控除 税・社会保険料" },
  { name: "厚生年金保険料", category: "控除 税・社会保険料" },
  { name: "雇用保険料", category: "控除 税・社会保険料" },
  { name: "所得税", category: "控除 税・社会保険料" },
  { name: "住民税", category: "控除 税・社会保険料" },
];

// 月の途中の入社・退職にあたる月か（平均から除く月の初期値に使う）
function suggestExcluded(row: PayrollRequestRow, candidate: PayrollRequestCandidate, ym: string): boolean {
  const midStart = (d: string | null) => !!d && d.slice(0, 7) === ym && !d.endsWith("-01");
  if (midStart(row.sswStart) || midStart(candidate.startOn)) return true;
  const leaving = candidate.leavingOn;
  if (leaving && leaving.slice(0, 7) === ym) {
    // 月末日でない退職は月の途中の終了。月末日は Date で割り出す
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(leaving);
    if (m) {
      const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
      if (Number(m[3]) !== last) return true;
    }
  }
  return false;
}

// 定期報告書（3-6号）のための賃金台帳の入力と平均値。
// 上: 機関ごとの賃金台帳の項目の設定（名前・3-6号のどの欄か・並び）
// 中: 対象者ごとの人×月の入力（届いた賃金台帳を見ながら転記）
// 下: 3-6号「4 労働条件等」の平均値（1号・2号の列と昇給率）
export function PeriodicReportClient({
  organizationId,
  organizationName,
  candidates: initialCandidates,
  permitsByWorker,
  messengerByWorker = {},
  initialItems,
  initialEntries,
  tablesReady,
  today,
}: {
  organizationId: string;
  organizationName: string;
  candidates: PayrollRequestCandidate[];
  permitsByWorker: Record<string, PayrollPermit[]>;
  messengerByWorker?: Record<string, string>; // 本人のメッセンジャーのリンク（在留資格の確認の連絡用）
  initialItems: OrgPayrollItemRow[];
  initialEntries: PeriodicReportEntryRow[];
  tablesReady: boolean; // false = 0236 未適用（読めなかった）
  today: string;
}) {
  // 在留資格をこの画面で入れたら、すぐ名簿の判定にも反映できるよう手元に持つ
  const [candidates, setCandidates] = useState(initialCandidates);
  const [fy, setFy] = useState(() => lastEndedFiscalYear(today));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // ---- 項目の設定 ----
  const [items, setItems] = useState<ItemDraft[]>(() =>
    initialItems.map((i) => ({ id: i.id, name: i.name, category: i.category, isNew: false })),
  );
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [itemsDirty, setItemsDirty] = useState(false);
  const [showItems, setShowItems] = useState(initialItems.length === 0);
  const setItem = (i: number, patch: Partial<ItemDraft>) => {
    setItems((cur) => cur.map((it, j) => (j === i ? { ...it, ...patch } : it)));
    setItemsDirty(true);
  };
  // つまみ（⠿）をドラッグして並べ替える。ドラッグ中は重なった行と入れ替えていく
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const moveItemTo = (from: number, to: number) => {
    setItems((cur) => {
      if (from === to || from < 0 || to < 0 || from >= cur.length || to >= cur.length) return cur;
      const next = [...cur];
      const [picked] = next.splice(from, 1);
      next.splice(to, 0, picked);
      return next;
    });
    setItemsDirty(true);
  };
  const addItem = (name = "", category = "基本給など") => {
    setItems((cur) => [...cur, { id: crypto.randomUUID(), name, category, isNew: true }]);
    setItemsDirty(true);
  };
  const removeItem = (i: number) => {
    setItems((cur) => {
      const it = cur[i];
      if (!it.isNew) setRemovedIds((ids) => [...ids, it.id]);
      return cur.filter((_, j) => j !== i);
    });
    setItemsDirty(true);
  };
  const saveItems = async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      // Supabase のクライアントは保存のときだけ作る（表示だけならログイン情報が無くても開けるように）
      const supabase = createClient();
      await upsertOrgPayrollItems(
        supabase,
        items.map((it, i) => ({
          id: it.id,
          organization_id: organizationId,
          name: it.name.trim(),
          category: it.category,
          sort_order: i,
        })),
      );
      await deleteOrgPayrollItems(supabase, removedIds);
      setRemovedIds([]);
      setItems((cur) => cur.map((it) => ({ ...it, isNew: false })));
      setItemsDirty(false);
      setSaved("項目を保存しました");
      return true;
    } catch (e) {
      setError(`項目の保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const itemsById = useMemo(
    () => Object.fromEntries(items.map((it) => [it.id, { category: it.category }])),
    [items],
  );
  // 時間外・休日・深夜などの時間数の項目（時:分で入力して（3）へ合算）
  const timeItems = items.filter((it) => it.category === OVERTIME_TIME_CATEGORY);
  const hasTimeItems = timeItems.length > 0;
  const payItems = items.filter(
    (it) => !it.category.startsWith("控除") && it.category !== "集計しない" && it.category !== OVERTIME_TIME_CATEGORY,
  );
  const deductItems = items.filter((it) => it.category.startsWith("控除"));
  const skipItems = items.filter((it) => it.category === "集計しない");

  // ---- 対象者と入力 ----
  const candidateById = useMemo(() => Object.fromEntries(candidates.map((c) => [c.id, c])), [candidates]);
  // 自動の抽出に載らなかった人を手で対象に入れた分（年度を変えるとリセット）
  const [manualIds, setManualIds] = useState<string[]>([]);
  const { rows, excluded: excludedWorkers } = useMemo(() => {
    const auto = buildPayrollRequestRows(candidates, permitsByWorker, fy);
    const manualRows: PayrollRequestRow[] = [];
    for (const id of manualIds) {
      const c = candidateById[id];
      if (!c || auto.rows.some((r) => r.id === id)) continue;
      const row = manualPayrollRequestRow(c, fy);
      if (row) manualRows.push(row);
    }
    return {
      rows: [...auto.rows, ...manualRows].sort((a, b) => (a.kana || a.name).localeCompare(b.kana || b.name, "ja")),
      excluded: auto.excluded.filter((e) => !manualIds.includes(e.id)),
    };
  }, [candidates, permitsByWorker, fy, manualIds, candidateById]);

  // 在籍の期間の表示（だれが在籍中で、だれがいつからいつまでいたのか）
  const tenureText = (id: string): string => {
    const c = candidateById[id];
    if (!c) return "";
    const start = c.startOn ? jpDate(c.startOn) : "雇用開始日 未登録";
    return c.leavingOn ? `${start}〜${jpDate(c.leavingOn)} 退職` : `${start}〜 在籍中`;
  };

  // ---- 在留資格の表示と、未登録の人のその場での登録 ----
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const saveStatus = async (id: string) => {
    const v = statusDrafts[id] ?? "";
    if (!v) return;
    setStatusBusy(id);
    setError(null);
    try {
      await updateWorker(createClient(), id, { residence_status: v });
      setCandidates((cur) => cur.map((c) => (c.id === id ? { ...c, residenceStatus: v } : c)));
      setSaved(`${candidateById[id]?.name ?? ""} の在留資格を「${v}」で登録しました`);
    } catch (e) {
      setError(`在留資格の登録に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setStatusBusy(null);
    }
  };
  // 未登録の人向け: 在留資格の選択＋登録、本人のメッセンジャーへのリンク（確認の連絡用）
  const statusEditor = (id: string) => (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="font-bold text-seal">在留資格 未登録</span>
      <select
        value={statusDrafts[id] ?? ""}
        onChange={(e) => setStatusDrafts((cur) => ({ ...cur, [id]: e.target.value }))}
        className={`${FIELD} min-h-[28px]`}
      >
        <option value="">在留資格を選ぶ…</option>
        {RESIDENCE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => saveStatus(id)}
        disabled={!statusDrafts[id] || statusBusy === id}
        className="inline-flex min-h-[28px] items-center rounded-lg bg-brand px-2 text-[11px] font-bold text-brand-foreground disabled:opacity-40"
      >
        {statusBusy === id ? "登録中…" : "登録"}
      </button>
      {messengerByWorker[id] && (
        <a
          href={messengerByWorker[id]}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[28px] items-center rounded-lg border border-brand px-2 text-[11px] font-bold text-brand"
        >
          本人のメッセンジャー
        </a>
      )}
    </span>
  );

  // 人×月の下書き（キー: workerId|ym）。初期値はDBの実績
  const [drafts, setDrafts] = useState<Record<string, EntryDraft>>(() => {
    const out: Record<string, EntryDraft> = {};
    for (const e of initialEntries) {
      out[`${e.worker_id}|${e.ym}`] = {
        work_days: e.work_days,
        total_hours: e.total_hours,
        overtime_hours: e.overtime_hours,
        amounts: e.amounts ?? {},
        excluded: e.excluded,
        note: e.note,
      };
    }
    return out;
  });
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [openWorker, setOpenWorker] = useState<string | null>(null);
  const [showPrevYear, setShowPrevYear] = useState<Record<string, boolean>>({});

  const draftOf = (workerId: string, ym: string, row?: PayrollRequestRow): EntryDraft =>
    drafts[`${workerId}|${ym}`] ??
    emptyDraft(row ? suggestExcluded(row, candidateById[workerId], ym) : false);
  const setDraft = (workerId: string, ym: string, row: PayrollRequestRow, patch: Partial<EntryDraft>) => {
    const key = `${workerId}|${ym}`;
    setDrafts((cur) => ({ ...cur, [key]: { ...draftOf(workerId, ym, row), ...patch } }));
    setDirtyKeys((cur) => new Set(cur).add(key));
  };

  const saveEntries = async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const supabase = createClient();
      const entries: PeriodicReportEntryInput[] = [...dirtyKeys].map((key) => {
        const [workerId, ym] = key.split("|");
        const d = drafts[key];
        return {
          organization_id: organizationId,
          worker_id: workerId,
          ym,
          work_days: d.work_days,
          total_hours: d.total_hours,
          overtime_hours: d.overtime_hours,
          amounts: d.amounts,
          excluded: d.excluded,
          note: d.note,
        };
      });
      await upsertPeriodicReportEntries(supabase, entries);
      setDirtyKeys(new Set());
      setSaved(`入力を保存しました（${entries.length}か月分）`);
      return true;
    } catch (e) {
      setError(`入力の保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  // 保存せずに別の画面へ行こうとしたときの確認（保存して移動・保存せずに移動・このページに戻る）
  const hasUnsaved = dirtyKeys.size > 0 || itemsDirty;
  const saveAll = async (): Promise<boolean> => {
    if (itemsDirty && !(await saveItems())) return false;
    if (dirtyKeys.size > 0 && !(await saveEntries())) return false;
    return true;
  };

  // 入力欄に出す月（依頼期間と同じ: 特定技能になる前・退職後の月は出さない）
  const monthsFor = useCallback(
    (row: PayrollRequestRow, year: number): string[] => reportMonthsFor(row, fy, year),
    [fy],
  );

  // ---- 3-6号の平均値（様式の出力と同じ共通の集計を使う） ----
  const preview = useMemo(
    () => buildReport36(rows, (workerId, ym) => drafts[`${workerId}|${ym}`] ?? null, itemsById, fy),
    [rows, drafts, itemsById, fy],
  );

  // ---- 様式のダウンロード（本紙・別紙1） ----
  const [supportDelegated, setSupportDelegated] = useState(true);
  const [formNote, setFormNote] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const b1Pages = Math.max(1, Math.ceil(rows.length / 5));
  const downloadForm = async (kind: "honshi" | "besshi1", page?: number) => {
    const key = `${kind}${page ?? ""}`;
    setDownloading(key);
    setError(null);
    try {
      const res = await fetch("/api/periodic-report-form", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, fy, kind, page, supportDelegated, note: formNote, manualIds }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "様式の生成に失敗しました");
      }
      const orgSafe = organizationName.replace(/[\\/:*?"<>|]/g, "-");
      const name =
        kind === "honshi"
          ? `参考様式第3-6号_${fy}年度_${orgSafe}.xlsx`
          : `参考様式第3-6号別紙1_${fy}年度_${orgSafe}${b1Pages > 1 ? `_${page}枚目` : ""}.xlsx`;
      downloadBlob(await res.blob(), name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(null);
    }
  };

  const fyOptions = [fy + 1, fy, fy - 1, fy - 2].sort((a, b) => b - a);
  const cell = "border border-border px-1.5 py-1 text-right tabular-nums";
  const head = "border border-border bg-background px-1.5 py-1 text-center text-[11px] font-bold text-muted";

  // Enterで下の項目（同じ月の次の行）へ。月の最後まで行ったら次の月のいちばん上へ
  // （賃金台帳は1か月分が縦に並んでいるので、縦に転記できるようにする）。
  // 行の番号: 0=日数 / 1=実労働時間 / 2〜=時間数の項目（無ければ2=超過の直接入力）/ そのあと金額の項目
  const moneyRowBase = 2 + timeItems.length + (hasTimeItems ? 0 : 1);
  const gridRowCount = moneyRowBase + payItems.length + deductItems.length + skipItems.length;
  const focusNext = (workerId: string, months: string[], mi: number, ri: number) => {
    for (let m = mi; m < months.length; m += 1) {
      for (let r = m === mi ? ri + 1 : 0; r < gridRowCount; r += 1) {
        const el = document.querySelector<HTMLInputElement>(
          `[data-nav="${workerId}|${months[m]}|${r}"]`,
        );
        if (el && !el.disabled) {
          el.focus();
          el.select();
          return;
        }
      }
    }
  };
  // 時間数は「21:10」（21時間10分）の形で出し入れする。
  // 「2110」と打って確定（Enter・欄を離れる）すると「21:10」になり、計算には 21+10/60 の小数で使う
  const [hoursEditing, setHoursEditing] = useState<Record<string, string>>({});
  const hoursInput = (
    value: number | null,
    onChange: (v: number | null) => void,
    disabled: boolean,
    nav: { id: string; onEnter: () => void },
  ) => (
    <input
      value={hoursEditing[nav.id] ?? hoursText(value)}
      onChange={(e) => setHoursEditing((cur) => ({ ...cur, [nav.id]: e.target.value }))}
      onBlur={() => {
        const t = hoursEditing[nav.id];
        if (t === undefined) return;
        onChange(parseHoursInput(t));
        setHoursEditing((cur) => {
          const next = { ...cur };
          delete next[nav.id];
          return next;
        });
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          nav.onEnter(); // 次の欄へ移ると blur が走って「21:10」に確定する
        }
      }}
      data-nav={nav.id}
      inputMode="numeric"
      placeholder="21:10"
      disabled={disabled}
      className={`${FIELD} w-full min-w-[64px] text-right ${disabled ? "opacity-40" : ""}`}
    />
  );
  // 金額・日数の欄。表示はカンマ区切り（104,000）、入力中はそのまま打てて、
  // 確定（Enter・欄を離れる）でカンマが入る。全角数字も半角に直して受ける
  const [numEditing, setNumEditing] = useState<Record<string, string>>({});
  const parseNumInput = (text: string): number | null => {
    const t = text
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[^0-9.\-]/g, "");
    if (t === "" || t === "-" || t === ".") return null;
    const v = Number(t);
    return Number.isFinite(v) ? v : null;
  };
  const numInput = (
    value: number | null,
    onChange: (v: number | null) => void,
    disabled = false,
    nav?: { id: string; onEnter: () => void },
  ) => (
    <input
      value={
        (nav && numEditing[nav.id]) ?? (value == null ? "" : value.toLocaleString("ja-JP"))
      }
      onChange={(e) => {
        if (nav) {
          setNumEditing((cur) => ({ ...cur, [nav.id]: e.target.value }));
        } else {
          onChange(parseNumInput(e.target.value));
        }
      }}
      onBlur={
        nav
          ? () => {
              const t = numEditing[nav.id];
              if (t === undefined) return;
              onChange(parseNumInput(t));
              setNumEditing((cur) => {
                const next = { ...cur };
                delete next[nav.id];
                return next;
              });
            }
          : undefined
      }
      onKeyDown={
        nav
          ? (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                nav.onEnter(); // 次の欄へ移ると blur が走ってカンマ入りで確定する
              }
            }
          : undefined
      }
      data-nav={nav?.id}
      inputMode="decimal"
      disabled={disabled}
      className={`${FIELD} w-full min-w-[64px] text-right ${disabled ? "opacity-40" : ""}`}
    />
  );

  const yen = (n: number) => n.toLocaleString("ja-JP");

  return (
    <>
      {/* 保存していない入力があるまま離れようとしたら「保存しますか？」の確認を出す */}
      <UnsavedChangesGuard dirty={hasUnsaved} onSave={saveAll} saveLabel="入力を保存" />
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
        <BackButton fallbackHref={`/organizations/${organizationId}`} />
        <h1 className="flex-1 text-lg font-bold">定期報告書　賃金台帳の入力（{organizationName}）</h1>
      </div>

      <div className="flex flex-col gap-4 px-4 py-3 lg:px-8">
        <p className="text-xs leading-relaxed text-muted">
          届いた賃金台帳を見ながら、人×月で金額を転記する画面です。はじめに「1
          賃金台帳の項目」を台帳と同じ名前・並びで登録してください（3-6号のどの欄に入るかも選びます。翌年も引き継がれます）。
          入力すると下に3-6号「4 労働条件等」の平均値と昇給率が出ます。
          月の途中で入社・退職した月は、要領のとおり平均から除きます（「除外」に自動で印が付くので、違うときは外してください）。
        </p>

        {!tablesReady && (
          <p className="rounded-lg bg-seal/10 px-3 py-2 text-xs font-bold text-seal">
            マイグレーション 0236_periodic_report.sql がまだ適用されていないようです。Supabase の SQL Editor で適用してから使ってください。
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
            {error}
          </p>
        )}
        {saved && !error && (
          <p role="status" className="rounded-lg bg-brand/10 px-3 py-2 text-xs text-brand">
            {saved}
          </p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
            対象年度
            <select
              value={fy}
              onChange={(e) => {
                setFy(Number(e.target.value));
                setManualIds([]);
              }}
              className={FIELD}
            >
              {fyOptions.map((y) => (
                <option key={y} value={y}>
                  {fiscalYearLabel(y)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={saveEntries}
            disabled={busy || dirtyKeys.size === 0}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground disabled:opacity-40"
          >
            <Save size={16} />
            入力を保存（{dirtyKeys.size}か月分）
          </button>
        </div>

        {/* 1 賃金台帳の項目 */}
        <section className="rounded-lg border border-border bg-background px-3 py-2">
          <button type="button" onClick={() => setShowItems((v) => !v)} className="flex w-full items-center gap-1 text-left text-sm font-bold">
            {showItems ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            1　賃金台帳の項目（{items.length}件{itemsDirty ? "・未保存" : ""}）
          </button>
          {showItems && (
            <div className="mt-2 flex flex-col gap-1.5">
              <p className="text-xs text-muted">
                届いた賃金台帳と同じ名前・並びで登録すると転記しやすくなります。並べ替えは左の⠿をつかんで上下に動かします。「集計しない」は差引支給額など3-6号に関係ない項目に使います。
              </p>
              {items.map((it, i) => (
                <div
                  key={it.id}
                  onDragOver={(e) => {
                    // ドラッグ中の行がこの行に重なったら、その位置へ動かす（離す前に並びが見える）
                    e.preventDefault();
                    if (dragIndex == null || dragIndex === i) return;
                    moveItemTo(dragIndex, i);
                    setDragIndex(i);
                  }}
                  className={`flex flex-wrap items-center gap-1.5 rounded-lg ${dragIndex === i ? "bg-brand/10 ring-1 ring-brand" : ""}`}
                >
                  <span
                    draggable
                    onDragStart={(e) => {
                      setDragIndex(i);
                      e.dataTransfer.effectAllowed = "move";
                      // ドラッグの絵は行全体にする（つまみだけだと分かりにくい）
                      const row = e.currentTarget.parentElement;
                      if (row) e.dataTransfer.setDragImage(row, 20, 20);
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    title="つかんで上下に動かすと並べ替えられます"
                    className="cursor-grab touch-none rounded-lg border border-border p-1.5 text-muted active:cursor-grabbing"
                  >
                    <GripVertical size={14} />
                  </span>
                  <input value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} placeholder="項目名（例: 皆勤手当）" className={`${FIELD} w-full sm:w-[240px]`} />
                  <select value={it.category} onChange={(e) => setItem(i, { category: e.target.value })} className={FIELD}>
                    {PAYROLL_ITEM_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => removeItem(i)} className="rounded-lg border border-border p-1.5 text-seal" aria-label="消す">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => addItem()} className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-brand px-2.5 text-xs font-bold text-brand">
                  <Plus size={14} />
                  行を足す
                </button>
                {items.length === 0 && (
                  <button
                    type="button"
                    onClick={() => STARTER_ITEMS.forEach((s) => addItem(s.name, s.category))}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-bold text-muted"
                  >
                    よくある項目を入れる（あとで直せます）
                  </button>
                )}
                <button
                  type="button"
                  onClick={saveItems}
                  disabled={busy || !itemsDirty}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-40"
                >
                  <Save size={14} />
                  項目を保存
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 2 人×月の入力 */}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold">2　賃金台帳の転記（対象 {rows.length}名）</h2>
          {rows.length === 0 && (
            <p className="rounded-lg bg-seal/10 px-3 py-2 text-xs font-bold text-seal">
              この年度に特定技能1号・2号として在籍していた人が見つかりません。
            </p>
          )}
          {rows.map((row) => {
            const open = openWorker === row.id;
            const yearsToShow: number[] = [fy, ...(row.prevYear && showPrevYear[row.id] ? [fy - 1] : [])];
            return (
              <div key={row.id} className="rounded-lg border border-border bg-background">
                <button
                  type="button"
                  onClick={() => setOpenWorker(open ? null : row.id)}
                  className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm"
                >
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="font-bold">{row.name}</span>
                  {/* だれが在籍中で、いつからいつまでいたのかをひと目で分かるように */}
                  <span className={`text-xs font-bold ${candidateById[row.id]?.leavingOn ? "text-muted" : "text-brand"}`}>
                    {tenureText(row.id)}
                  </span>
                  {/* 現在の在留資格もひと目で分かるように（未登録は赤で出し、開くと登録できる） */}
                  <span className={`text-xs ${candidateById[row.id]?.residenceStatus ? "text-muted" : "font-bold text-seal"}`}>
                    在留資格: {candidateById[row.id]?.residenceStatus || "未登録"}
                  </span>
                  <span className="text-xs text-muted">
                    {row.grade}・入力は{ymText(row.fromYm)}〜{ymText(row.toYm)}
                    {row.prevYear ? "・昇給率の対象（前年度分も入力）" : ""}
                  </span>
                  {row.note && <span className="text-xs text-muted">（{row.note}）</span>}
                </button>
                {open && (
                  <div className="flex flex-col gap-3 border-t border-border px-3 py-2">
                    {row.warning && (
                      <p className="flex items-center gap-1 rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">
                        <TriangleAlert size={14} className="shrink-0" />
                        {row.warning}
                      </p>
                    )}
                    {!candidateById[row.id]?.residenceStatus && (
                      <div className="text-xs">{statusEditor(row.id)}</div>
                    )}
                    {row.prevYear && (
                      <label className="inline-flex items-center gap-1.5 text-xs font-bold text-muted">
                        <input
                          type="checkbox"
                          checked={!!showPrevYear[row.id]}
                          onChange={(e) => setShowPrevYear((cur) => ({ ...cur, [row.id]: e.target.checked }))}
                          className="size-4"
                        />
                        前年度（{fy - 1}年度）の入力欄も出す（昇給率の計算に使います）
                      </label>
                    )}
                    {yearsToShow.map((year) => {
                      const months = monthsFor(row, year);
                      return (
                        <div key={year} className="overflow-x-auto">
                          <p className="mb-1 text-xs font-bold text-muted">{fiscalYearLabel(year)}</p>
                          <table className="w-full min-w-[640px] border-collapse text-sm">
                            <thead>
                              <tr>
                                <th className={`${head} min-w-[140px] text-left`}>項目</th>
                                {months.map((ym) => (
                                  <th key={ym} className={head}>
                                    {Number(ym.slice(5))}月
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="border border-border px-1.5 py-1 text-xs">実労働日数</td>
                                {months.map((ym, mi) => {
                                  const d = draftOf(row.id, ym, row);
                                  return (
                                    <td key={ym} className={cell}>
                                      {numInput(d.work_days, (v) => setDraft(row.id, ym, row, { work_days: v }), d.excluded, {
                                        id: `${row.id}|${ym}|0`,
                                        onEnter: () => focusNext(row.id, months, mi, 0),
                                      })}
                                    </td>
                                  );
                                })}
                              </tr>
                              <tr>
                                <td className="border border-border px-1.5 py-1 text-xs">
                                  実労働時間数
                                  <span className="block text-[10px] text-muted">21:10 の形（2110 と打つと : が入ります）</span>
                                </td>
                                {months.map((ym, mi) => {
                                  const d = draftOf(row.id, ym, row);
                                  return (
                                    <td key={ym} className={cell}>
                                      {hoursInput(d.total_hours, (v) => setDraft(row.id, ym, row, { total_hours: v }), d.excluded, {
                                        id: `${row.id}|${ym}|1`,
                                        onEnter: () => focusNext(row.id, months, mi, 1),
                                      })}
                                    </td>
                                  );
                                })}
                              </tr>
                              {/* 時間外・休日・深夜などの時間数の項目（賃金台帳に別々にあるとき。合計は下の行に自動で出る） */}
                              {timeItems.map((it, ti) => (
                                <tr key={it.id}>
                                  <td className="border border-border px-1.5 py-1 text-xs">
                                    {it.name || "（名前なし）"}
                                    <span className="block text-[10px] text-muted">時:分（21:10 の形）・（3）へ合算</span>
                                  </td>
                                  {months.map((ym, mi) => {
                                    const d = draftOf(row.id, ym, row);
                                    return (
                                      <td key={ym} className={cell}>
                                        {hoursInput(
                                          d.amounts[it.id] ?? null,
                                          (v) => {
                                            const amounts = { ...d.amounts };
                                            if (v == null) delete amounts[it.id];
                                            else amounts[it.id] = v;
                                            setDraft(row.id, ym, row, { amounts });
                                          },
                                          d.excluded,
                                          { id: `${row.id}|${ym}|${2 + ti}`, onEnter: () => focusNext(row.id, months, mi, 2 + ti) },
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                              {hasTimeItems ? (
                                // 時間数の項目があるときは、超過の合計を自動で出す（直接入力の古い値が残っていたら消せる）
                                <tr>
                                  <td className="border border-border px-1.5 py-1 text-xs">
                                    うち超過実労働時間数（合計）
                                    <span className="block text-[10px] text-muted">上の時間数の合算・自動</span>
                                  </td>
                                  {months.map((ym) => {
                                    const d = draftOf(row.id, ym, row);
                                    const itemSum = timeItems.reduce((a, it) => a + (d.amounts[it.id] ?? 0), 0);
                                    const hasAny = d.overtime_hours != null || timeItems.some((it) => d.amounts[it.id] != null);
                                    return (
                                      <td key={ym} className={`${cell} text-xs text-muted`}>
                                        {hasAny ? hoursText((d.overtime_hours ?? 0) + itemSum) : ""}
                                        {d.overtime_hours != null && (
                                          <button
                                            type="button"
                                            onClick={() => setDraft(row.id, ym, row, { overtime_hours: null })}
                                            className="block w-full text-right text-[10px] text-seal underline"
                                            title="内訳と二重にならないよう、以前の直接入力を消す"
                                          >
                                            直接入力 {hoursText(d.overtime_hours)} を消す
                                          </button>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ) : (
                                <tr>
                                  <td className="border border-border px-1.5 py-1 text-xs">
                                    うち超過実労働時間数
                                    <span className="block text-[10px] text-muted">21:10 の形</span>
                                  </td>
                                  {months.map((ym, mi) => {
                                    const d = draftOf(row.id, ym, row);
                                    return (
                                      <td key={ym} className={cell}>
                                        {hoursInput(d.overtime_hours, (v) => setDraft(row.id, ym, row, { overtime_hours: v }), d.excluded, {
                                          id: `${row.id}|${ym}|2`,
                                          onEnter: () => focusNext(row.id, months, mi, 2),
                                        })}
                                      </td>
                                    );
                                  })}
                                </tr>
                              )}
                              {[...payItems, ...deductItems, ...skipItems].map((it, iiRaw) => {
                                const ii = moneyRowBase - 3 + iiRaw; // 行番号の底上げ（時間数の項目のぶん）
                                return (
                                <tr key={it.id}>
                                  <td className="border border-border px-1.5 py-1 text-xs">
                                    {it.name || "（名前なし）"}
                                    <span className="block text-[10px] text-muted">{it.category}</span>
                                  </td>
                                  {months.map((ym, mi) => {
                                    const d = draftOf(row.id, ym, row);
                                    return (
                                      <td key={ym} className={cell}>
                                        {numInput(
                                          d.amounts[it.id] ?? null,
                                          (v) => {
                                            const amounts = { ...d.amounts };
                                            if (v == null) delete amounts[it.id];
                                            else amounts[it.id] = v;
                                            setDraft(row.id, ym, row, { amounts });
                                          },
                                          d.excluded,
                                          {
                                            id: `${row.id}|${ym}|${3 + ii}`,
                                            onEnter: () => focusNext(row.id, months, mi, 3 + ii),
                                          },
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                                );
                              })}
                              <tr>
                                <td className="border border-border px-1.5 py-1 text-xs">
                                  除外（月の途中の入社・退職）
                                  <span className="block text-[10px] text-muted">平均の計算に入れない月</span>
                                </td>
                                {months.map((ym) => {
                                  const d = draftOf(row.id, ym, row);
                                  return (
                                    <td key={ym} className="border border-border px-1.5 py-1 text-center">
                                      <input type="checkbox" checked={d.excluded} onChange={(e) => setDraft(row.id, ym, row, { excluded: e.target.checked })} className="size-4" />
                                    </td>
                                  );
                                })}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {excludedWorkers.length > 0 && (
            <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted">
              <p className="font-bold">対象に入れていない人（{excludedWorkers.length}名）</p>
              <ul className="mt-1 space-y-1 pl-1">
                {excludedWorkers.map((e) => {
                  const canAdd = !!manualPayrollRequestRow(candidateById[e.id] ?? ({} as PayrollRequestCandidate), fy);
                  return (
                    <li key={e.id} className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-foreground">{e.name}</span>
                      <span className="font-bold">{tenureText(e.id)}</span>
                      {candidateById[e.id]?.residenceStatus ? (
                        <span>在留資格: {candidateById[e.id].residenceStatus}</span>
                      ) : (
                        statusEditor(e.id)
                      )}
                      {canAdd && (
                        <button
                          type="button"
                          onClick={() => setManualIds((cur) => [...cur, e.id])}
                          className="inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-brand px-2 text-[11px] font-bold text-brand"
                        >
                          <Plus size={12} />
                          対象に入れて入力する
                        </button>
                      )}
                      <span className="block w-full pl-2 sm:w-auto sm:flex-1 sm:pl-0">{e.reason}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5">
                「対象に入れて入力する」で、許可の記録が無くてもその人の入力を始められます（期間は在籍期間から出すので、特定活動だった月が入っていないか確認してください）。
              </p>
            </div>
          )}
        </section>

        {/* 3 3-6号の平均値 */}
        <section className="rounded-lg border border-border bg-background px-3 py-2">
          <h2 className="text-sm font-bold">3　3-6号「4 労働条件等」の平均値（入力から自動計算）</h2>
          <p className="mt-1 text-xs text-muted">
            月の途中の入社・退職の月（除外）と未入力の月は平均に入れません。賞与は支払われた人数で割っています。
            昇給率は2年以上継続して在籍している人の（4）−（①〜④）で、前年度の入力がそろった人だけで計算します。
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${head} text-left`}>欄</th>
                  <th className={head}>特定技能1号（{preview.oneCount}名・{preview.one.months}人月）</th>
                  <th className={head}>特定技能2号（{preview.twoCount}名・{preview.two.months}人月）</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["（1）実労働日数", (s: Section36) => `${s.workDays} 日／月`],
                    ["（2）所定内実労働時間数", (s: Section36) => `${s.regularHours} 時間／月`],
                    ["（3）超過実労働時間数", (s: Section36) => `${s.overtimeHours} 時間／月`],
                    ["（4）きまって支給する現金給与額", (s: Section36) => `${yen(s.cashPay)} 円／月`],
                    ["　①うち超過労働給与額", (s: Section36) => `${yen(s.overtimePay)} 円／月`],
                    ["　②うち通勤手当", (s: Section36) => `${yen(s.commute)} 円／月`],
                    ["　③うち精皆勤手当", (s: Section36) => `${yen(s.attendance)} 円／月`],
                    ["　④うち家族手当", (s: Section36) => `${yen(s.family)} 円／月`],
                    ["（5）賞与、期末手当等特別給与額", (s: Section36) => `${yen(s.bonus)} 円`],
                    ["（6）①食費", (s: Section36) => `${yen(s.food)} 円／月`],
                    ["（6）②居住費", (s: Section36) => `${yen(s.housing)} 円／月`],
                    ["（6）③税・社会保険料", (s: Section36) => `${yen(s.taxSocial)} 円／月`],
                    ["（6）④その他", (s: Section36) => `${yen(s.otherDeduction)} 円／月`],
                  ] as [string, (s: Section36) => string][]
                ).map(([label, fmt]) => (
                  <tr key={label}>
                    <td className="border border-border px-1.5 py-1 text-xs">{label}</td>
                    <td className={cell}>{preview.oneCount === 0 ? "－" : fmt(preview.one)}</td>
                    <td className={cell}>{preview.twoCount === 0 ? "－" : fmt(preview.two)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="border border-border px-1.5 py-1 text-xs">（7）昇給率</td>
                  <td className={cell}>
                    {preview.raise1 == null ? `－（対象 ${preview.raise1Targets}名）` : `${round1(preview.raise1).toFixed(1)} ％（対象 ${preview.raise1Targets}名）`}
                  </td>
                  <td className={cell}>
                    {preview.raise2 == null ? `－（対象 ${preview.raise2Targets}名）` : `${round1(preview.raise2).toFixed(1)} ％（対象 ${preview.raise2Targets}名）`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {(preview.one.note || preview.two.note) && (
            <p className="mt-1 text-xs text-seal">
              {preview.one.note && `特定技能1号: 集計できる月が無いため0＋備考「${preview.one.note}」。`}
              {preview.two.note && `特定技能2号: 集計できる月が無いため0＋備考「${preview.two.note}」。`}
            </p>
          )}
        </section>

        {/* 4 様式のダウンロード */}
        <section className="rounded-lg border border-border bg-background px-3 py-2">
          <h2 className="text-sm font-bold">4　様式のダウンロード（公式のExcelに転記）</h2>
          <p className="mt-1 text-xs text-muted">
            保存済みの入力から作ります
            {dirtyKeys.size > 0 && (
              <span className="font-bold text-seal">（未保存の入力が{dirtyKeys.size}か月分あります。先に「入力を保存」を押してください）</span>
            )}
            。本紙は機関の情報（法人番号・ふりがな・住所・担当者）を所属機関の登録内容から入れます。空欄になるときはそちらを登録してください。
            別紙1は5名ごとに1枚です。別紙2（署名欄）と提出前の署名は今までどおり様式の上で行ってください。
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              支援の実施状況
              <select value={supportDelegated ? "1" : "0"} onChange={(e) => setSupportDelegated(e.target.value === "1")} className={FIELD}>
                <option value="1">支援の全部委託あり（登録支援機関に全部委託）</option>
                <option value="0">自社支援のみ</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
              本紙の備考に書き足す一言（空なら自動の備考だけ）
              <input value={formNote} onChange={(e) => setFormNote(e.target.value)} className={`${FIELD} min-w-[260px]`} />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadForm("honshi")}
              disabled={downloading != null || rows.length === 0}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground disabled:opacity-40"
            >
              <FileSpreadsheet size={16} />
              {downloading === "honshi" ? "作成中…" : "3-6号（本紙）をダウンロード"}
            </button>
            {Array.from({ length: b1Pages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => downloadForm("besshi1", page)}
                disabled={downloading != null || rows.length === 0}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-brand px-4 text-sm font-bold text-brand disabled:opacity-40"
              >
                <FileSpreadsheet size={16} />
                {downloading === `besshi1${page}`
                  ? "作成中…"
                  : b1Pages > 1
                    ? `別紙1（${(page - 1) * 5 + 1}〜${Math.min(page * 5, rows.length)}人目）`
                    : "別紙1をダウンロード"}
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
