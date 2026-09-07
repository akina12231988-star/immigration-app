"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { NameSearchBox } from "@/components/ui/NameSearchBox";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { createClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import { compressImage } from "@/lib/image-compress";
import { todayStr } from "@/lib/application-alerts";
import { remainingLabel } from "@/lib/worker-alerts";
import { organizationSuggestions, matchesOrganizationName } from "@/lib/org-search";
import { matchesWorkerName } from "@/lib/worker-search";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import {
  listTodoStatusOptions,
  listTodos,
  updateTodo,
  type TodoRow,
} from "@/lib/supabase/queries/todos";
import { displayTodoNo, type TodoStatusOption } from "@/lib/todo";
import {
  SSW_CANCEL_TODO_TITLE,
  SSW_COLUMNS,
  SSW_DECLINE_REASONS,
  SSW_INSURANCE_TODO_KIND,
  SSW_JOIN_TODO_TITLE,
  SSW_SECTIONS,
  SSW_SORTS,
  SSW_STATE_LABELS,
  SSW_TASK_GROUPS,
  buildSswInsuranceRows,
  isSswActionRow,
  isSswInsuranceTarget,
  sortSswRows,
  sswColumnOf,
  slashDate,
  sswApplyCopyText,
  sswApplyFields,
  sswDeclineNote,
  sswInsuranceMonths,
  sswTodosByWorker,
  tomorrowOf,
  sswTaskOf,
  type SswInsuranceRow,
  type SswInsuranceWorker,
  type SswSortKey,
} from "@/lib/ssw-insurance";
import {
  ensureSswTodo,
  listSswCerts,
  listSswInsuranceWorkers,
  updateSswInsurance,
  type SswCertRow,
} from "@/lib/supabase/queries/ssw-insurance";
import {
  createSswCertTicket,
  deleteSswCert,
  getSswCertPreviewUrl,
  registerSswCert,
} from "./actions";
import type { Organization } from "@/types/db";

const MIGRATION = "0139_ssw_insurance.sql";

const INPUT =
  "min-h-[38px] rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

const ROW_BTN =
  "rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-bold text-brand hover:border-brand disabled:opacity-50";

// 特定技能総合保険の管理画面（TODO ＞ 特定技能総合保険）。
// 未加入・期限切れ・退職（解約）を仕分けして、加入手続き・解約手続きのTODOを作り、
// 加入したら被保険者証明書を貼り付けて番号と有効期限を記録する。
export function SswInsuranceClient({ canEdit }: { canEdit: boolean }) {
  const [workers, setWorkers] = useState<SswInsuranceWorker[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [options, setOptions] = useState<TodoStatusOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgFilter, setOrgFilter] = useState("");
  // 氏名でも探せるようにする（所属機関名の欄に人の名前を入れても出てこないため）
  const [nameFilter, setNameFilter] = useState("");
  // 特定技能総合保険は特定技能の人の保険なので、既定では特定技能の人だけを出す
  const [onlySsw, setOnlySsw] = useState(true);
  const [sort, setSort] = useState<SswSortKey>("expiry");
  const [openId, setOpenId] = useState<string | null>(null);
  const today = todayStr();

  // 画面に出す4つ（外国人・所属機関・TODO・TODOの経過の選択肢）をまとめて取る
  const fetchAll = () => {
    const supabase = createClient();
    return Promise.all([
      listSswInsuranceWorkers(supabase),
      listOrganizations(supabase),
      listTodos(supabase),
      listTodoStatusOptions(supabase),
    ]);
  };

  const reload = useCallback(async () => {
    const [ws, os, ts, opts] = await fetchAll();
    setWorkers(ws);
    setOrgs(os);
    setTodos(ts);
    setOptions(opts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then(([ws, os, ts, opts]) => {
        if (cancelled) return;
        setWorkers(ws);
        setOrgs(os);
        setTodos(ts);
        setOptions(opts);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(dbErrorMessage(err, MIGRATION, "読み込みに失敗しました"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 所属機関ID → 機関名と特定技能総合保険の負担区分（'' / 会社負担 / 外国人負担）
  const orgBurden = useMemo(
    () =>
      new Map(
        orgs.map((o) => [
          o.id,
          { name: o.name, burden: o.intake?.ssw_insurance_burden ?? "" },
        ]),
      ),
    [orgs],
  );

  const rows = useMemo(() => {
    const targets = onlySsw
      ? workers.filter((w) => isSswInsuranceTarget(w.residence_status))
      : workers;
    return buildSswInsuranceRows(
      targets,
      orgBurden,
      sswTodosByWorker(todos, options),
      today,
    );
  }, [workers, orgBurden, todos, options, onlySsw, today]);

  const shown = useMemo(() => {
    let list = rows;
    if (orgFilter.trim()) {
      list = list.filter((r) => r.orgName && matchesOrganizationName({ name: r.orgName }, orgFilter));
    }
    if (nameFilter.trim()) {
      list = list.filter((r) => matchesWorkerName(r.worker, nameFilter));
    }
    return list;
  }, [rows, orgFilter, nameFilter]);

  // 所属機関名の検索候補（今の一覧に出ている機関だけ）
  const orgCandidates = useMemo(() => {
    const names = new Set<string>();
    for (const r of rows) if (r.orgName) names.add(r.orgName);
    return [...names].sort((a, b) => a.localeCompare(b, "ja")).map((name) => ({ id: name, name }));
  }, [rows]);

  // 意思確認の結果を保存する（加入する／加入しない）。
  // 加入しないときは、理由（備考）と、どの所属機関にいたときの判断かも残す
  const setWill = async (row: SswInsuranceRow, join: boolean, note?: string) => {
    setError(null);
    try {
      await updateSswInsurance(createClient(), row.worker.id, {
        ssw_insurance_self_join: join,
        ssw_insurance_declined: !join,
        ssw_insurance_declined_on: join ? null : today,
        ssw_insurance_declined_org_id: join ? null : row.worker.current_organization_id,
        ...(note === undefined ? {} : { ssw_insurance_note: note }),
      });
      await reload();
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, "保存に失敗しました"));
    }
  };

  // 加入手続き・解約手続きのTODOを作る
  const makeTodo = async (workerId: string, title: string) => {
    setError(null);
    try {
      await ensureSswTodo(
        createClient(),
        workerId,
        title as typeof SSW_JOIN_TODO_TITLE | typeof SSW_CANCEL_TODO_TITLE,
      );
      await reload();
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, "TODOの作成に失敗しました"));
    }
  };

  // TODOの経過（未着手／申込手続中／完了）を変える
  const setTodoStatus = async (todoId: string, status: string) => {
    setError(null);
    try {
      await updateTodo(createClient(), todoId, { status });
      await reload();
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, "経過の保存に失敗しました"));
    }
  };

  const statusOptions = useMemo(
    () => options.filter((o) => o.kind === SSW_INSURANCE_TODO_KIND),
    [options],
  );

  // 対応が必要な人（期限切れ・退職の解約・まもなく期限・未加入・意思確認）
  const actionRows = useMemo(
    () => sortSswRows(shown.filter(isSswActionRow), sort),
    [shown, sort],
  );

  const renderRow = (row: SswInsuranceRow) => (
    <SswWorkerRow
      key={row.worker.id}
      row={row}
      canEdit={canEdit}
      today={today}
      statusOptions={statusOptions}
      open={openId === row.worker.id}
      onToggle={() => setOpenId(openId === row.worker.id ? null : row.worker.id)}
      onWill={(join, note) => void setWill(row, join, note)}
      onMakeTodo={(title) => void makeTodo(row.worker.id, title)}
      onTodoStatus={(todoId, status) => void setTodoStatus(todoId, status)}
      onSaved={() => void reload()}
      onError={setError}
    />
  );

  return (
    <div className="space-y-4 p-4">
      <p className="flex items-start gap-1.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-xs leading-relaxed text-muted">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        特定技能総合保険の加入状況をまとめた画面です。未加入・期限切れの人に「加入手続き」のTODO、退職した人に「解約手続き」のTODOを作れます（TODO一覧の「特定技能総合保険」にも入ります）。加入したら被保険者証明書を貼り付けて、証明書番号と有効期限を記録してください。
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <label className="flex min-w-[14rem] flex-1 items-center gap-1.5 text-sm">
          🔍
          <input
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="外国人の氏名で検索（ふりがなでも探せます）"
            aria-label="外国人の氏名で検索"
            className="min-h-[38px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none"
          />
        </label>
        <div className="min-w-[16rem] flex-1">
          <NameSearchBox
            candidates={orgCandidates}
            value={orgFilter}
            onChange={setOrgFilter}
            placeholder="所属機関名で絞り込み（「BASE」などでも探せます）"
            suggest={organizationSuggestions}
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs font-bold text-muted">
          並び替え
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SswSortKey)}
            className={INPUT}
          >
            {SSW_SORTS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs font-bold text-muted">
          <input
            type="checkbox"
            checked={onlySsw}
            onChange={(e) => setOnlySsw(e.target.checked)}
            className="h-4 w-4"
          />
          特定技能の人だけ表示
        </label>
      </Card>

      {loading ? (
        <Card className="p-6 text-center text-sm text-muted">読み込み中…</Card>
      ) : (
        <>
          {/* 加入手続きと解約手続きは別の欄に分け、それぞれ左＝未着手・右＝申込手続中の2列で出す */}
          {SSW_TASK_GROUPS.map((group) => {
            const groupRows = actionRows.filter((r) => sswTaskOf(r) === group.key);
            if (groupRows.length === 0) return null;
            return (
              <div key={group.key} className="space-y-2">
                <div className="px-0.5">
                  <p className="text-sm font-black">
                    {group.title}（{groupRows.length}件）
                  </p>
                  <p className="text-[11px] leading-relaxed text-muted">{group.lead}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {SSW_COLUMNS.map((column) => {
                    const list = groupRows.filter((r) => sswColumnOf(r) === column.key);
                    return (
                      <Card key={column.key} className="p-4">
                        <p className="text-sm font-bold">
                          {column.title}（{list.length}件）
                        </p>
                        <p className="mt-1 mb-3 text-[11px] leading-relaxed text-muted">
                          {column.lead}
                        </p>
                        {list.length === 0 ? (
                          <p className="rounded-xl border border-border bg-background p-4 text-center text-[11px] text-muted">
                            この列に出す人はいません。
                          </p>
                        ) : (
                          <div className="space-y-2">{list.map(renderRow)}</div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* 対応が要らない人（加入中・加入しない）は畳んで下に置く */}
          {SSW_SECTIONS.filter((section) => section.collapsed).map((section) => {
            const list = shown.filter((r) => r.state === section.key);
            if (list.length === 0) return null;
            return (
              <Card key={section.key} className="p-4">
                <details>
                  <summary className="cursor-pointer text-sm font-bold text-muted">
                    {section.title}（{list.length}件）
                  </summary>
                  <p className="mt-1 mb-3 text-[11px] leading-relaxed text-muted">{section.lead}</p>
                  <div className="space-y-2">{list.map(renderRow)}</div>
                </details>
              </Card>
            );
          })}
        </>
      )}

      {!loading && shown.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted">
          該当する人はいません。
          {onlySsw && (
            <span className="mt-1 block text-[11px]">
              在留資格が特定技能で登録されていない人は出ません。「特定技能の人だけ表示」のチェックを外すと出てくることがあります。
            </span>
          )}
        </Card>
      )}
    </div>
  );
}

// 一覧の1行（氏名・所属機関・負担区分・有効期限とボタン）
function SswWorkerRow({
  row,
  canEdit,
  today,
  statusOptions,
  open,
  onToggle,
  onWill,
  onMakeTodo,
  onTodoStatus,
  onSaved,
  onError,
}: {
  row: SswInsuranceRow;
  canEdit: boolean;
  today: string;
  statusOptions: TodoStatusOption[];
  open: boolean;
  onToggle: () => void;
  onWill: (join: boolean, note?: string) => void;
  onMakeTodo: (title: string) => void;
  onTodoStatus: (todoId: string, status: string) => void;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const w = row.worker;
  const expiry = w.ssw_insurance_expiry_date;
  const cancelRow = row.state === "cancel";
  // 「加入しない」を押したときに出す、理由（備考）の入力欄
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState<string>(SSW_DECLINE_REASONS[0]);
  const [declineOther, setDeclineOther] = useState("");
  // 加入しないを選べる行（未加入・意思確認・期限切れ・まもなく期限）。
  // 退職の解約手続きと、加入中の人には出さない
  const canDecline =
    row.state === "notJoined" ||
    row.state === "willCheck" ||
    row.state === "expired" ||
    row.state === "soon";
  const todo = cancelRow ? row.todos.cancel : row.todos.join;
  const todoTitle = cancelRow ? SSW_CANCEL_TODO_TITLE : SSW_JOIN_TODO_TITLE;

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <Link href={`/workers/${w.id}`} className="text-sm font-bold text-brand hover:underline">
              {w.name}
            </Link>
            {/* 2列にすると欄の見出しが無くなるので、区分を行に付ける */}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                row.state === "expired" || row.state === "cancel"
                  ? "bg-seal/10 text-seal"
                  : "bg-background text-muted"
              }`}
            >
              {SSW_STATE_LABELS[row.state]}
            </span>
          </span>
          <p className="mt-0.5 text-[11px] text-muted">
            {w.kana && <span className="mr-2">{w.kana}</span>}
            {w.nationality && <span className="mr-2">{w.nationality}</span>}
            {row.orgName || "所属機関 未設定"}
            {row.burden && <span className="ml-2">（{row.burden}）</span>}
          </p>
        </div>
        <div className="text-right text-[11px]">
          {expiry ? (
            <p className={row.state === "expired" ? "font-bold text-seal" : "text-muted"}>
              有効期限 {slashDate(expiry)}（{remainingLabel(expiry, today)}）
            </p>
          ) : (
            <p className="font-bold text-seal">未加入</p>
          )}
          {w.ssw_insurance_no && <p className="text-muted">証明書番号 {w.ssw_insurance_no}</p>}
          {w.ssw_insurance_declined && w.ssw_insurance_declined_on && (
            <p className="text-muted">意思確認 {slashDate(w.ssw_insurance_declined_on)}</p>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {row.state === "willCheck" && canEdit && (
          <button type="button" className={ROW_BTN} onClick={() => onWill(true)}>
            本人が加入を希望
          </button>
        )}
        {canDecline && canEdit && !declining && (
          <button
            type="button"
            className={`${ROW_BTN} text-seal`}
            onClick={() => {
              setDeclineReason(SSW_DECLINE_REASONS[0]);
              setDeclineOther("");
              setDeclining(true);
            }}
          >
            加入しない
          </button>
        )}
        {row.state === "declined" && canEdit && (
          <button type="button" className={ROW_BTN} onClick={() => onWill(true)}>
            加入する（希望あり）に戻す
          </button>
        )}

        {row.state !== "declined" && row.state !== "active" && (
          todo ? (
            <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              <Link href="/todos" className="font-bold text-brand hover:underline">
                {displayTodoNo(todo.todo_no)}
              </Link>
              {todo.title}
              <select
                value={todo.status}
                disabled={!canEdit}
                onChange={(e) => onTodoStatus(todo.id, e.target.value)}
                className={`${INPUT} min-h-[32px] py-0 text-[11px]`}
                aria-label="進捗状況"
              >
                {/* 保存済みの経過が選択肢に無いときも表示できるようにしておく */}
                {statusOptions.some((o) => o.name === todo.status) ? null : (
                  <option value={todo.status}>{todo.status}</option>
                )}
                {statusOptions.map((o) => (
                  <option key={o.id} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </select>
            </span>
          ) : (
            canEdit && (
              <button
                type="button"
                className={ROW_BTN}
                onClick={() => onMakeTodo(todoTitle)}
              >
                <Plus size={12} className="mr-1 inline" />
                {todoTitle}のTODOを作成
              </button>
            )
          )
        )}

        {row.state !== "declined" && (
          <button type="button" className={ROW_BTN} onClick={onToggle}>
            {open ? <ChevronDown size={12} className="mr-1 inline" /> : <ChevronRight size={12} className="mr-1 inline" />}
            加入の入力内容・被保険者証明書
          </button>
        )}
      </div>

      {/* 加入しない理由（備考）。何が理由で加入しないのかを残す */}
      {declining && (
        <div className="mt-2 rounded-xl border border-seal/40 bg-surface p-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-seal">加入しない理由（備考に残します）</span>
            <select
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              className={INPUT}
            >
              {SSW_DECLINE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r === "その他" ? "その他（テキスト入力）" : r}
                </option>
              ))}
            </select>
          </label>
          {declineReason === "その他" && (
            <label className="mt-2 flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">
                理由（あとで見たときに分かるように書いてください）
              </span>
              <textarea
                value={declineOther}
                onChange={(e) => setDeclineOther(e.target.value)}
                rows={2}
                placeholder="例: 外国人負担のため本人に確認したところ、加入を希望しなかった（2026/09/07 電話）"
                className="min-h-[56px] rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </label>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`${ROW_BTN} text-seal`}
              disabled={declineReason === "その他" && !declineOther.trim()}
              onClick={() => {
                onWill(false, sswDeclineNote(declineReason, declineOther));
                setDeclining(false);
              }}
            >
              加入しないで保存
            </button>
            <button type="button" className={ROW_BTN} onClick={() => setDeclining(false)}>
              やめる
            </button>
            <span className="text-[11px] text-muted">
              保存すると、この所属機関にいる間は保険のTODOに出なくなります（転職したらまた出ます）。
            </span>
          </div>
        </div>
      )}

      {/* 備考（加入しない理由など） */}
      {!declining && w.ssw_insurance_note && (
        <p className="mt-2 rounded-lg bg-surface px-2.5 py-1.5 text-[11px] leading-relaxed text-muted">
          備考: {w.ssw_insurance_note}
        </p>
      )}

      {open && (
        <SswWorkerPanel
          row={row}
          canEdit={canEdit}
          today={today}
          onSaved={onSaved}
          onError={onError}
        />
      )}
    </div>
  );
}

// 加入の申込に入れる内容（外国人情報から）と、被保険者証明書の登録
function SswWorkerPanel({
  row,
  canEdit,
  today,
  onSaved,
  onError,
}: {
  row: SswInsuranceRow;
  canEdit: boolean;
  today: string;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const w = row.worker;
  // 保険始期希望日は「着金日以降」のため、既定は明日にしている
  const [startOn, setStartOn] = useState(tomorrowOf(today));
  const [certs, setCerts] = useState<SswCertRow[]>([]);
  const [certNo, setCertNo] = useState(w.ssw_insurance_no ?? "");
  const [expiry, setExpiry] = useState(w.ssw_insurance_expiry_date ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadCerts = useCallback(async () => {
    try {
      setCerts(await listSswCerts(createClient(), w.id));
    } catch {
      /* まだマイグレーション未適用のときは何も出さない */
    }
  }, [w.id]);

  // 開いたときに、その人の被保険者証明書の記録を読む
  useEffect(() => {
    let cancelled = false;
    listSswCerts(createClient(), w.id)
      .then((rows) => {
        if (!cancelled) setCerts(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [w.id]);

  const fields = sswApplyFields(w, row.orgName, startOn);
  const months = sswInsuranceMonths(startOn, w.residence_expiry_date);

  const save = async () => {
    if (!expiry) {
      onError("有効期限を入力してください");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      let path = "";
      let fileName = "";
      let mimeType = "";
      if (file) {
        const compressed = await compressImage(file);
        fileName = compressed.fileName;
        mimeType = compressed.mimeType;
        const ticket = await createSswCertTicket(w.id, fileName, mimeType);
        if (!ticket.ok) throw new Error(ticket.message);
        const { error: upErr } = await createClient()
          .storage.from("app-files")
          .uploadToSignedUrl(ticket.path, ticket.token, compressed.blob, { contentType: mimeType });
        if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
        path = ticket.path;
      }
      const res = await registerSswCert({
        workerId: w.id,
        certNo: certNo.trim(),
        expiryDate: expiry,
        path,
        fileName,
        mimeType,
      });
      if (!res.ok) throw new Error(res.message);
      // 一覧・アラートが見るのは workers 側なので、番号と期限をこちらにも入れる
      await updateSswInsurance(createClient(), w.id, {
        ssw_insurance_no: certNo.trim(),
        ssw_insurance_expiry_date: expiry,
        ssw_insurance_declined: false,
        ssw_insurance_declined_on: null,
      });
      setFile(null);
      await loadCerts();
      onSaved();
    } catch (err) {
      onError(dbErrorMessage(err, MIGRATION, "登録に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  const preview = async (id: string) => {
    const res = await getSswCertPreviewUrl(id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else onError(res.message);
  };

  const remove = async (cert: SswCertRow) => {
    if (!window.confirm("この被保険者証明書の記録を削除します。よろしいですか？")) return;
    const res = await deleteSswCert(cert.id);
    if (res.ok) await loadCerts();
    else onError(res.message);
  };

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-surface p-3">
      {/* 加入月数を決めるときに見る、今の在留資格と在留期限 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-background px-2.5 py-2 text-[11px]">
        <span className="text-muted">
          現在の在留資格{" "}
          <b className="text-sm text-foreground">{w.residence_status || "未登録"}</b>
        </span>
        <span className="text-muted">
          在留期限{" "}
          <b className="text-sm text-foreground">
            {w.residence_expiry_date ? slashDate(w.residence_expiry_date) : "未登録"}
          </b>
          {w.residence_expiry_date && `（${remainingLabel(w.residence_expiry_date, today)}）`}
        </span>
      </div>

      {/* ① 加入の申込に入れる内容（外国人情報から。1つずつコピーできる） */}
      <div>
        <p className="mb-1.5 text-[11px] font-bold text-muted">
          加入の申込に入れる内容（外国人情報から）
        </p>
        <div className="space-y-1">
          {fields.map((f) => (
            <div
              key={f.label}
              className="flex items-center gap-2 rounded-lg bg-background px-2.5 py-1.5"
            >
              <span className="w-52 shrink-0 text-[11px] text-muted">{f.label}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold">
                {f.value || <span className="text-seal">{f.hint ?? "未登録"}</span>}
              </span>
              {f.value && <CopyButton value={f.value} label={`${f.label}をコピー`} />}
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">着金日以降の保険始期希望日</span>
            <input
              type="date"
              value={startOn}
              onChange={(e) => setStartOn(e.target.value)}
              className={INPUT}
            />
          </label>
          <button
            type="button"
            className={ROW_BTN}
            onClick={() => void navigator.clipboard?.writeText(sswApplyCopyText(fields))}
          >
            まとめてコピー
          </button>
        </div>
        <p className="mt-2 rounded-lg bg-background px-2.5 py-2 text-[11px] leading-relaxed">
          {w.residence_expiry_date ? (
            months ? (
              <>
                在留期限 <b>{slashDate(w.residence_expiry_date)}</b> まで加入するには、
                <b className="mx-1 text-brand">{months}ヶ月</b>
                を選んでください（{slashDate(startOn)} から{months}ヶ月）。
              </>
            ) : (
              <span className="text-seal">
                保険始期希望日が在留期限（{slashDate(w.residence_expiry_date)}）を過ぎています。日付を確認してください。
              </span>
            )
          ) : (
            <span className="text-seal">
              在留期限が未登録のため、加入月数を計算できません。外国人詳細で在留期限を入れてください。
            </span>
          )}
        </p>
      </div>

      {/* ② 被保険者証明書（加入したら貼り付けて番号・期限を入れる） */}
      <div>
        <p className="mb-1.5 text-[11px] font-bold text-muted">
          加入したら被保険者証明書を登録（ドラッグ＆ドロップで貼り付け）
        </p>
        <FileDropArea
          onFiles={(list) => {
            if (canEdit && list.length > 0) setFile(list[0]);
          }}
          disabled={!canEdit || busy}
          className="rounded-xl border border-dashed border-border bg-background p-3"
        >
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">被保険者証明書番号</span>
              <input
                value={certNo}
                onChange={(e) => setCertNo(e.target.value)}
                placeholder="証明書の番号"
                disabled={!canEdit}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">有効期限</span>
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                disabled={!canEdit}
                className={INPUT}
              />
            </label>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button
              variant="secondary"
              icon={<Upload size={14} />}
              disabled={!canEdit || busy}
              onClick={() => inputRef.current?.click()}
            >
              ファイルを選ぶ
            </Button>
            <Button
              icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              disabled={!canEdit || busy}
              onClick={() => void save()}
            >
              {busy ? "登録中…" : "登録する"}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            {file ? (
              <span className="font-bold text-brand">
                {file.name}
                <button
                  type="button"
                  className="ml-1.5 align-middle text-muted hover:text-seal"
                  onClick={() => setFile(null)}
                  aria-label="選んだファイルを取り消す"
                >
                  <X size={12} />
                </button>
              </span>
            ) : (
              "ここに被保険者証明書（画像・PDF）をドロップできます。ファイルなしで番号と期限だけの記録もできます。"
            )}
          </p>
        </FileDropArea>

        {certs.length > 0 && (
          <div className="mt-2 space-y-1">
            {certs.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded-lg bg-background px-2.5 py-1.5 text-[11px]"
              >
                <FileText size={13} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">
                  {c.file_name || "（ファイルなし）"}
                  {c.cert_no && <span className="ml-2 text-muted">番号 {c.cert_no}</span>}
                  {c.expiry_date && (
                    <span className="ml-2 text-muted">期限 {slashDate(c.expiry_date)}</span>
                  )}
                </span>
                {c.file_name && (
                  <button
                    type="button"
                    onClick={() => void preview(c.id)}
                    aria-label="表示"
                    className="text-muted hover:text-brand"
                  >
                    <Eye size={14} />
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void remove(c)}
                    aria-label="削除"
                    className="text-muted hover:text-seal"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
