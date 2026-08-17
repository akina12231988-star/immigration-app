"use client";

import { useState } from "react";
import { BackButton } from "@/components/BackButton";
import { Plus, Printer, Save, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import {
  deleteWorkerRoster,
  insertWorkerRoster,
  updateWorkerRoster,
} from "@/lib/supabase/queries/rosters";
import {
  isWithinRosterRetention,
  rosterJpDate,
  rosterRetentionEnd,
  rosterWorkKind,
  sortRosterHistory,
} from "@/lib/roster";
import { todayStr } from "@/lib/ssw/calc";
import type {
  RosterHistoryEntry,
  RosterPreviousJob,
  WorkerRoster,
} from "@/types/db";

interface RosterWorker {
  name: string;
  kana: string;
  birth: string | null;
  gender: string;
  address: string;
  field: string;
  myNumber: string;
  employmentStartOn: string | null;
  status: string;
  leavingOn: string | null;
  leavingKind: string;
  leavingReason: string;
}

// 名簿1枚分の編集中データ（worker_rosters の編集可能フィールド）
interface RosterForm {
  company_name: string;
  work_kind: string;
  history: RosterHistoryEntry[];
  previous_jobs: RosterPreviousJob[];
  leaving_on: string;
  leaving_reason: string;
  issued_on: string; // 発行年月日（'' = 未設定。保存時は null にする）
}

const NEW_ID = "new";

// 会社へ送る労働者名簿。会社ごとに保存でき（転職対応）、
// 履歴・前職・解雇の各欄は画面上で編集してから保存・印刷する
export function RosterSheet({
  workerId,
  canEdit,
  orgName,
  worker,
  defaultPreviousJobs,
  employmentStarts,
  initialRosters,
}: {
  workerId: string;
  canEdit: boolean;
  orgName: string;
  worker: RosterWorker;
  defaultPreviousJobs: string[];
  employmentStarts: { orgName: string; startOn: string }[]; // 所属機関別の雇用開始日
  initialRosters: WorkerRoster[];
}) {
  // 会社名に対応する雇用開始日（機関別の登録があればそれを、無ければ既存の雇用開始年月日）
  const startFor = (company: string): string | null =>
    employmentStarts.find((e) => e.orgName === company.trim())?.startOn ??
    worker.employmentStartOn;
  // 新規作成時の初期値: 外国人の登録データから自動で埋める
  const buildDefault = (): RosterForm => ({
    company_name: orgName,
    work_kind: rosterWorkKind(worker.field),
    history: startFor(orgName)
      ? [{ on: rosterJpDate(startFor(orgName)), content: "入社" }]
      : [],
    previous_jobs: defaultPreviousJobs.map((company) => ({ company, prefecture: "" })),
    leaving_on: worker.status === "退職" ? rosterJpDate(worker.leavingOn) : "",
    leaving_reason:
      worker.status === "退職"
        ? [worker.leavingKind, worker.leavingReason].filter(Boolean).join("・")
        : "",
    // 発行年月日はその会社の雇用開始年月日を初期値にする（画面で直せる）。
    // 雇用開始日が分からない会社は今日にする
    issued_on: startFor(orgName) ?? todayStr(),
  });

  const toForm = (r: WorkerRoster): RosterForm => ({
    company_name: r.company_name,
    work_kind: r.work_kind,
    history: sortRosterHistory(r.history ?? []),
    previous_jobs: r.previous_jobs ?? [],
    leaving_on: r.leaving_on,
    leaving_reason: r.leaving_reason,
    // 発行年月日が未設定の古い名簿も、その会社の雇用開始年月日で補う（保存するまでDBは変えない）
    issued_on: r.issued_on ?? startFor(r.company_name) ?? "",
  });

  const [rosters, setRosters] = useState<WorkerRoster[]>(initialRosters);
  const [selectedId, setSelectedId] = useState<string>(
    initialRosters[0]?.id ?? NEW_ID,
  );
  const [form, setForm] = useState<RosterForm>(() =>
    initialRosters[0] ? toForm(initialRosters[0]) : buildDefault(),
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof RosterForm>(key: K, value: RosterForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const select = (id: string) => {
    setSelectedId(id);
    setSaved(false);
    setError(null);
    if (id === NEW_ID) {
      setForm(buildDefault());
    } else {
      const roster = rosters.find((r) => r.id === id);
      if (roster) setForm(toForm(roster));
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      // 履歴は年月日の昇順（時系列順）に並び替えて保存する
      const payload = {
        ...form,
        history: sortRosterHistory(form.history),
        issued_on: form.issued_on || null,
      };
      setForm((f) => ({ ...f, history: payload.history }));
      if (selectedId === NEW_ID) {
        const row = await insertWorkerRoster(supabase, {
          worker_id: workerId,
          ...payload,
        });
        setRosters((rs) => [row, ...rs]);
        setSelectedId(row.id);
      } else {
        await updateWorkerRoster(supabase, selectedId, payload);
        setRosters((rs) =>
          rs.map((r) => (r.id === selectedId ? { ...r, ...payload } : r)),
        );
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteWorkerRoster(createClient(), selectedId);
      const rest = rosters.filter((r) => r.id !== selectedId);
      setRosters(rest);
      setDeleteOpen(false);
      if (rest[0]) {
        setSelectedId(rest[0].id);
        setForm(toForm(rest[0]));
      } else {
        setSelectedId(NEW_ID);
        setForm(buildDefault());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const selectedRoster = rosters.find((r) => r.id === selectedId);

  const TOOL_INPUT =
    "min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";
  // 名簿内のインライン入力（印刷時は枠なしの文字だけになる）
  const CELL_INPUT =
    "w-full bg-transparent text-sm font-bold placeholder:font-normal placeholder:text-gray-300 focus:outline-none print:placeholder:text-transparent";

  return (
    <>
      {/* 画面用ツールバー（印刷時は非表示） */}
      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref="/workers" />
          <h1 className="flex-1 text-lg font-bold">労働者名簿</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3 px-4 py-4 lg:px-8">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">保存済みの名簿（会社ごと）</span>
            <select value={selectedId} onChange={(e) => select(e.target.value)} className={TOOL_INPUT}>
              <option value={NEW_ID}>＋ 新しい名簿を作成</option>
              {rosters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.company_name || "会社名未設定"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">会社名（送付先・保存名）</span>
            <input
              value={form.company_name}
              onChange={(e) => set("company_name", e.target.value)}
              placeholder="例: 有限会社◯◯"
              disabled={!canEdit}
              className={TOOL_INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">
              発行年月日{startFor(form.company_name) ? "（雇用開始年月日を初期表示）" : ""}
            </span>
            <input
              type="date"
              value={form.issued_on}
              onChange={(e) => set("issued_on", e.target.value)}
              disabled={!canEdit}
              className={TOOL_INPUT}
            />
          </label>
          {canEdit && (
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-bold disabled:opacity-50"
            >
              <Save size={18} />
              {busy ? "保存中…" : saved ? "保存しました" : selectedId === NEW_ID ? "この会社の名簿を保存" : "上書き保存"}
            </button>
          )}
          {canEdit && selectedRoster && (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-bold text-seal disabled:opacity-50"
            >
              <Trash2 size={18} />
              削除
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-foreground"
          >
            <Printer size={18} />
            印刷・PDF保存
          </button>
        </div>
        {error && (
          <p role="alert" className="mx-4 mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal lg:mx-8">
            {error}
          </p>
        )}
        <p className="px-4 pb-1 text-[11px] leading-relaxed text-muted lg:px-8">
          業務の種類・履歴・前職・解雇の各欄は名簿の上で直接編集できます（「保存」でこの会社の名簿として記憶）。
          名前・住所・個人番号などの元データの修正は外国人詳細から行ってください。
        </p>
        <p className="px-4 pb-3 text-[11px] leading-relaxed text-muted lg:px-8">
          労働者名簿は労働基準法第107条に基づいて作成し、同法第109条により発行から5年間保存します。
          {form.issued_on &&
            `この名簿の保存期限: ${rosterJpDate(rosterRetentionEnd(form.issued_on))}まで`}
        </p>
      </div>

      <div className="print-root">
        <div className="worker-sheet mx-auto mb-6 max-w-[210mm] border border-border bg-white p-[12mm] text-black print:mb-0 print:border-0">
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 className="text-2xl font-black">労働者名簿</h2>
            <p className="text-xs text-gray-500">
              発行年月日: {rosterJpDate(form.issued_on) || "—"}
            </p>
          </div>

          {/* 基本情報 */}
          <table className="mb-5 w-[130mm] border-collapse text-sm">
            <tbody>
              <BasicRow label="名前">
                <span className="font-black">{worker.name || "　"}</span>
              </BasicRow>
              <BasicRow label="フリガナ">{worker.kana || "　"}</BasicRow>
              <BasicRow label="生年月日">{rosterJpDate(worker.birth) || "　"}</BasicRow>
              <BasicRow label="性別">{worker.gender || "　"}</BasicRow>
              <BasicRow label="住所">{worker.address || "　"}</BasicRow>
              <BasicRow label="業務の種類">
                {canEdit ? (
                  <input
                    value={form.work_kind}
                    onChange={(e) => set("work_kind", e.target.value)}
                    placeholder="例: 耕種農業の一般社員（役員なし）"
                    className={CELL_INPUT}
                  />
                ) : (
                  form.work_kind || "　"
                )}
              </BasicRow>
              <BasicRow label="個人番号">{worker.myNumber || "　"}</BasicRow>
              {/* この名簿の会社に対応する雇用開始日を表示（機関別の登録があればそれを使う） */}
              <BasicRow label="雇用開始年月日">
                {rosterJpDate(startFor(form.company_name)) || "　"}
              </BasicRow>
            </tbody>
          </table>

          {/* 履歴（入力欄を離れると年月日の昇順＝上から時系列順に自動で並び替える） */}
          <EditableRowsSection
            title="履歴"
            canEdit={canEdit}
            columns={[
              { label: "年月日", width: "w-[40mm]", placeholder: "例: 2026年7月31日" },
              { label: "内容", placeholder: "例: 入社" },
            ]}
            rows={form.history.map((h) => [h.on, h.content])}
            onChange={(rows) =>
              set("history", rows.map(([on = "", content = ""]) => ({ on, content })))
            }
            normalizeOnBlur={(rows) =>
              sortRosterHistory(
                rows.map(([on = "", content = ""]) => ({ on, content })),
              ).map((h) => [h.on, h.content])
            }
          />

          {/* 前職 */}
          <EditableRowsSection
            title="前職"
            canEdit={canEdit}
            columns={[
              { label: "会社名", placeholder: "例: ◯◯株式会社" },
              { label: "都道府県", width: "w-[40mm]", placeholder: "例: 愛知県" },
            ]}
            rows={form.previous_jobs.map((j) => [j.company, j.prefecture])}
            onChange={(rows) =>
              set(
                "previous_jobs",
                rows.map(([company = "", prefecture = ""]) => ({ company, prefecture })),
              )
            }
          />

          {/* 解雇・退職または死亡 */}
          <SectionHeading>解雇・退職または死亡</SectionHeading>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <HeaderCell className="w-[40mm]">年月日</HeaderCell>
                <HeaderCell>事由</HeaderCell>
              </tr>
            </thead>
            <tbody>
              <tr>
                <BodyCell>
                  {canEdit ? (
                    <input
                      value={form.leaving_on}
                      onChange={(e) => set("leaving_on", e.target.value)}
                      placeholder="年月日"
                      className={CELL_INPUT}
                    />
                  ) : (
                    form.leaving_on || "　"
                  )}
                </BodyCell>
                <BodyCell>
                  {canEdit ? (
                    <input
                      value={form.leaving_reason}
                      onChange={(e) => set("leaving_reason", e.target.value)}
                      placeholder="事由"
                      className={CELL_INPUT}
                    />
                  ) : (
                    form.leaving_reason || "　"
                  )}
                </BodyCell>
              </tr>
            </tbody>
          </table>

          <p className="mt-6 text-[10px] leading-relaxed text-gray-500">
            本名簿は労働基準法第107条に基づき作成し、同法第109条により発行日から5年間保存する。
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="労働者名簿を削除"
        message={
          selectedRoster && isWithinRosterRetention(selectedRoster.issued_on, todayStr())
            ? `「${selectedRoster.company_name || "会社名未設定"}」の労働者名簿は労働基準法により発行から5年間（${
                selectedRoster.issued_on
                  ? `${rosterJpDate(rosterRetentionEnd(selectedRoster.issued_on))}まで`
                  : "発行年月日未設定"
              }）の保存が必要です。本当に削除しますか？この操作は取り消せません。`
            : `「${selectedRoster?.company_name || "会社名未設定"}」の労働者名簿を削除します。この操作は取り消せません。`
        }
        busy={busy}
        onConfirm={remove}
        onCancel={() => setDeleteOpen(false)}
      />

      <style jsx global>{`
        @page {
          size: A4;
          margin: 0;
        }
        @media print {
          .worker-sheet {
            width: 210mm;
            min-height: 297mm;
            box-sizing: border-box;
          }
        }
      `}</style>
    </>
  );
}

// 履歴・前職のような「行の追加・削除ができる2列テーブル」の共通部品。
// 行が無いときも印刷で表が形になるように空行を1つ表示する。
// normalizeOnBlur を渡すと、入力欄を離れたときに行の並び替えなどの整形を行う
function EditableRowsSection({
  title,
  canEdit,
  columns,
  rows,
  onChange,
  normalizeOnBlur,
}: {
  title: string;
  canEdit: boolean;
  columns: { label: string; width?: string; placeholder?: string }[];
  rows: string[][];
  onChange: (rows: string[][]) => void;
  normalizeOnBlur?: (rows: string[][]) => string[][];
}) {
  const handleBlur = () => {
    if (normalizeOnBlur) onChange(normalizeOnBlur(rows));
  };
  const CELL_INPUT =
    "w-full bg-transparent text-sm font-bold placeholder:font-normal placeholder:text-gray-300 focus:outline-none print:placeholder:text-transparent";

  const setCell = (rowIdx: number, colIdx: number, value: string) =>
    onChange(
      rows.map((row, i) =>
        i === rowIdx ? row.map((v, j) => (j === colIdx ? value : v)) : row,
      ),
    );

  return (
    <div className="mb-5">
      <SectionHeading>{title}</SectionHeading>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((c) => (
              <HeaderCell key={c.label} className={c.width ?? ""}>
                {c.label}
              </HeaderCell>
            ))}
            {canEdit && <th className="w-8 print:hidden" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              {columns.map((c) => (
                <BodyCell key={c.label}>{"　"}</BodyCell>
              ))}
              {canEdit && <td className="print:hidden" />}
            </tr>
          )}
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c, j) => (
                <BodyCell key={c.label}>
                  {canEdit ? (
                    <input
                      value={row[j] ?? ""}
                      onChange={(e) => setCell(i, j, e.target.value)}
                      onBlur={handleBlur}
                      placeholder={c.placeholder}
                      className={CELL_INPUT}
                    />
                  ) : (
                    row[j] || "　"
                  )}
                </BodyCell>
              ))}
              {canEdit && (
                <td className="pl-1 print:hidden">
                  <button
                    type="button"
                    aria-label={`${title}の行を削除`}
                    onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-seal"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit && (
        <button
          type="button"
          onClick={() => onChange([...rows, columns.map(() => "")])}
          className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-muted print:hidden"
        >
          <Plus size={13} />
          行を追加
        </button>
      )}
    </div>
  );
}

function BasicRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border border-gray-300">
      <th className="w-[38mm] border border-gray-300 bg-gray-50 px-3 py-2 text-left text-xs font-bold text-gray-600">
        {label}
      </th>
      <td className="border border-gray-300 px-3 py-2 font-bold">{children}</td>
    </tr>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 bg-orange-100 px-2 py-1 text-sm font-bold">{children}</p>;
}

function HeaderCell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`border border-gray-300 bg-gray-50 px-3 py-1.5 text-left text-xs font-bold text-gray-600 ${className}`}
    >
      {children}
    </th>
  );
}

function BodyCell({ children }: { children: React.ReactNode }) {
  return <td className="border border-gray-300 px-3 py-1.5">{children}</td>;
}
