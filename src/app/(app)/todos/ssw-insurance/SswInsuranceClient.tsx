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
  TriangleAlert,
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
  SSW_INSURANCE_TODO_KIND,
  SSW_JOIN_TODO_TITLE,
  SSW_SECTIONS,
  buildSswInsuranceRows,
  isSswInsuranceTarget,
  slashDate,
  sswApplyCopyText,
  sswApplyFields,
  sswInsuranceMonths,
  sswTodosByWorker,
  tomorrowOf,
  type SswInsuranceRow,
  type SswInsuranceWorker,
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
  // 特定技能総合保険は特定技能の人の保険なので、既定では特定技能の人だけを出す
  const [onlySsw, setOnlySsw] = useState(true);
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

  const shown = useMemo(
    () =>
      orgFilter.trim()
        ? rows.filter((r) => r.orgName && matchesOrganizationName({ name: r.orgName }, orgFilter))
        : rows,
    [rows, orgFilter],
  );

  // 所属機関名の検索候補（今の一覧に出ている機関だけ）
  const orgCandidates = useMemo(() => {
    const names = new Set<string>();
    for (const r of rows) if (r.orgName) names.add(r.orgName);
    return [...names].sort((a, b) => a.localeCompare(b, "ja")).map((name) => ({ id: name, name }));
  }, [rows]);

  // 意思確認の結果を保存する（加入する／加入しない）
  const setWill = async (workerId: string, join: boolean) => {
    setError(null);
    try {
      await updateSswInsurance(createClient(), workerId, {
        ssw_insurance_self_join: join,
        ssw_insurance_declined: !join,
        ssw_insurance_declined_on: join ? null : today,
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
        SSW_SECTIONS.map((section) => {
          const list = shown.filter((r) => r.state === section.key);
          if (list.length === 0) return null;
          const alert = section.key === "expired" || section.key === "cancel";
          return (
            <Card key={section.key} className={`p-4 ${alert ? "border-seal/40" : ""}`}>
              <p className={`flex items-center gap-1.5 text-sm font-bold ${alert ? "text-seal" : ""}`}>
                {alert && <TriangleAlert size={15} />}
                {section.title}（{list.length}件）
              </p>
              <p className="mt-1 mb-3 text-[11px] leading-relaxed text-muted">{section.lead}</p>
              <div className="space-y-2">
                {list.map((row) => (
                  <SswWorkerRow
                    key={row.worker.id}
                    row={row}
                    canEdit={canEdit}
                    today={today}
                    statusOptions={statusOptions}
                    open={openId === row.worker.id}
                    onToggle={() =>
                      setOpenId(openId === row.worker.id ? null : row.worker.id)
                    }
                    onWill={(join) => void setWill(row.worker.id, join)}
                    onMakeTodo={(title) => void makeTodo(row.worker.id, title)}
                    onTodoStatus={(todoId, status) => void setTodoStatus(todoId, status)}
                    onSaved={() => void reload()}
                    onError={setError}
                  />
                ))}
              </div>
            </Card>
          );
        })
      )}

      {!loading && shown.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted">
          該当する人はいません。
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
  onWill: (join: boolean) => void;
  onMakeTodo: (title: string) => void;
  onTodoStatus: (todoId: string, status: string) => void;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const w = row.worker;
  const expiry = w.ssw_insurance_expiry_date;
  const cancelRow = row.state === "cancel";
  const todo = cancelRow ? row.todos.cancel : row.todos.join;
  const todoTitle = cancelRow ? SSW_CANCEL_TODO_TITLE : SSW_JOIN_TODO_TITLE;

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/workers/${w.id}`} className="text-sm font-bold text-brand hover:underline">
            {w.name}
          </Link>
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
          <>
            <button type="button" className={ROW_BTN} onClick={() => onWill(true)}>
              本人が加入を希望
            </button>
            <button
              type="button"
              className={`${ROW_BTN} text-seal`}
              onClick={() => onWill(false)}
            >
              加入しない
            </button>
          </>
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
