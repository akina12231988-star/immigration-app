"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ClipboardList, Copy, Plus, Settings2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { Modal } from "@/components/ui/Modal";
import { ApplicationPrepChecklist } from "@/components/workers/ApplicationPrepChecklist";
import { SavedPlanDatesSection } from "@/components/workers/ApplicationPrepExtras";
import { APPLICATION_CONTENT_CHOICES } from "@/lib/worker-situation";
import { listFilingAgents } from "@/lib/supabase/queries/agents";
import { createClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import {
  TODO_CHECK_KIND,
  TODO_KINDS,
  TODO_STAGES,
  displayTodoNo,
  isCheckingStatus,
  normalizeTodoKey,
  stageOfStatus,
  type TodoKind,
  type TodoStage,
  type TodoStatusOption,
} from "@/lib/todo";
import {
  deleteTodo,
  deleteTodoStatusOption,
  insertTodo,
  insertTodoStatusOption,
  listTodoStatusOptions,
  listTodos,
  renameTodoStatusOption,
  updateTodo,
  type TodoRow,
} from "@/lib/supabase/queries/todos";
import {
  createTodoCorrectionTicket,
  deleteTodoCorrection,
  listTodoCorrections,
  registerTodoCorrection,
  type TodoCorrectionView,
} from "./correction-actions";
import { compressImage } from "@/lib/image-compress";
import {
  paymentStatusLabel,
  requestKindLabel,
  type JudgmentRecord,
} from "@/lib/tax-cert";
import { isPrepListTarget } from "@/lib/renewal-placeholders";
import { todayStr } from "@/lib/application-alerts";

const INPUT =
  "min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

// 郵送請求（判定記録）のTODO番号でリンクした状況の要約
export interface MailingSummary {
  id: string;
  todoKey: string; // 正規化したTODO番号
  createdAt: string;
  kindLabel: string; // 課税・納税証明書 / 転出届 / 住民票
  to: string; // 請求先（自治体・市役所）
  progress: string; // 請求方法と日付（現在の状況）
  payment: string; // 納付・領収証送付状況
  person: string;
}

// あっせん有りのときに表示する、求人への採用の一連の流れ（求職管理簿から）
export interface JobFlowRow {
  id: string;
  worker_id: string;
  applied_on: string; // 求職申込日
  interview_on: string | null; // 面接日
  result_on: string | null; // 採用日（result が採用のとき）
  result: string;
  orgName: string;
  postingReceivedOn: string | null; // 求人申込日（求人受付日）
  postingJobType: string;
}

// TODO（NotionのTODOデータベースの置き換え）。
// 申請準備・退職の随時報告書・試験の申込の3つの構成で、番号は通しで自動採番。
// ステータス（経過）の選択肢は「選択肢の編集」から随時追加・変更・削除して運用できる
export function TodosClient({
  canEdit,
  fixedKind,
}: {
  canEdit: boolean;
  fixedKind?: TodoKind; // 指定すると、その構成だけの画面になる（例: 試験の申込）
}) {
  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [options, setOptions] = useState<TodoStatusOption[]>([]);
  const [workers, setWorkers] = useState<{ id: string; label: string }[]>([]);
  const [jobFlows, setJobFlows] = useState<JobFlowRow[]>([]);
  const [mailings, setMailings] = useState<MailingSummary[]>([]);
  // 申請一覧の「申請前＜準備中＞」に出ている人（申請準備のTODOにも新着として表示する）
  const [prepWorkers, setPrepWorkers] = useState<
    { workerId: string; name: string; todoNo: string; orgName: string }[]
  >([]);
  const [kind, setKind] = useState<TodoKind>(fixedKind ?? "申請準備");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 申請取次士の名簿（申請準備のTODOで誰が取次するかを選ぶ）
  const [agents, setAgents] = useState<string[]>([]);
  // TODOの詳細（申請準備 書類チェックリスト）をその場で開くモーダル
  const [prepModal, setPrepModal] = useState<{
    workerId: string;
    name: string;
    photoPath: string | null;
    healthCheckOn: string | null;
  } | null>(null);

  // TODOの行から申請準備の詳細（必要な書類）を開く。写真・健診日は開くときに取得する
  const openPrep = (t: TodoRow) => {
    if (!t.worker_id) return;
    const workerId = t.worker_id;
    void createClient()
      .from("workers")
      .select("photo_path, health_check_on")
      .eq("id", workerId)
      .maybeSingle()
      .then(({ data }) => {
        const w = data as { photo_path: string | null; health_check_on: string | null } | null;
        setPrepModal({
          workerId,
          name: t.worker_name ?? "（外国人）",
          photoPath: w?.photo_path ?? null,
          healthCheckOn: w?.health_check_on ?? null,
        });
      });
  };

  // 追加フォーム
  const [newWorkerId, setNewWorkerId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newNo, setNewNo] = useState("");
  const [adding, setAdding] = useState(false);

  const load = () => {
    const supabase = createClient();
    return Promise.all([listTodos(supabase), listTodoStatusOptions(supabase)])
      .then(([t, o]) => {
        setTodos(t);
        setOptions(o);
        setError(null);
        // あっせん有りのときに出す「求人への採用の流れ」（申請準備のTODOの外国人分）。
        // ここで return しないこと（下の「申請前＜準備中＞」や郵送請求の読み込みも必要。
        // 以前は TODO が0件のとき return していて、準備中の人の取り込みが動かないバグがあった）
        const workerIds = [
          ...new Set(
            t.filter((r) => r.kind === "申請準備" && r.worker_id).map((r) => r.worker_id as string),
          ),
        ];
        if (workerIds.length === 0) {
          setJobFlows([]);
        } else {
          void supabase
            .from("job_applications")
            .select(
              "id, worker_id, applied_on, interview_on, result_on, result, organizations(name), job_postings(received_on, job_type)",
            )
            .in("worker_id", workerIds)
            .order("applied_on", { ascending: false })
            .then(({ data }) => {
              const rows =
                (data as unknown as {
                  id: string;
                  worker_id: string;
                  applied_on: string;
                  interview_on: string | null;
                  result_on: string | null;
                  result: string;
                  organizations: { name: string } | null;
                  job_postings: { received_on: string | null; job_type: string } | null;
                }[]) ?? [];
              setJobFlows(
                rows.map((r) => ({
                  id: r.id,
                  worker_id: r.worker_id,
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
        }
        // 申請一覧の「申請前＜準備中＞」の人（同じ判定 isPrepListTarget）を新着として出す
        void supabase
          .from("workers")
          .select(
            "id, name, status, residence_expiry_date, residence_renewal_status, application_prep_kind, residence_renewal_todo, organizations(name)",
          )
          .eq("residence_renewal_status", "準備中")
          .then(({ data: pw, error: pwErr }) => {
            // 読み込みに失敗したときは黙って0件にせず、理由を表示する
            if (pwErr) {
              setError(`「申請前＜準備中＞」の人の読み込みに失敗しました: ${pwErr.message}`);
              return;
            }
            const rows =
              (pw as unknown as {
                id: string;
                name: string;
                status: string;
                residence_expiry_date: string | null;
                residence_renewal_status: string;
                application_prep_kind: string;
                residence_renewal_todo: string | null;
                organizations: { name: string } | null;
              }[]) ?? [];
            const today = todayStr();
            setPrepWorkers(
              rows
                .filter((w) =>
                  isPrepListTarget(w as Parameters<typeof isPrepListTarget>[0], today),
                )
                .map((w) => ({
                  workerId: w.id,
                  name: w.name,
                  todoNo: w.residence_renewal_todo ?? "",
                  orgName: w.organizations?.name ?? "",
                })),
            );
          });
        // 郵送請求（判定記録）のTODO番号とリンクして、現在の状況を出す
        void supabase
          .from("judgment_records")
          .select("id, data, created_at")
          .order("created_at", { ascending: false })
          .then(({ data: jr }) => {
            const rows = (jr as { id: string; data: unknown; created_at: string }[] | null) ?? [];
            const out: MailingSummary[] = [];
            for (const row of rows) {
              const r = row.data as JudgmentRecord | null;
              if (!r) continue;
              const key = normalizeTodoKey(String(r.todoNumber ?? ""));
              if (!key) continue;
              const isCity = r.requestKind === "tenshutsu" || r.requestKind === "juminhyo";
              let progress: string;
              if (r.postDate) progress = `ポスト投函済み（${r.postDate}）`;
              else if (r.mailRequestDate) progress = `郵送請求中（請求日 ${r.mailRequestDate}）`;
              else if (r.requestMethod === "mail") progress = "郵送請求（投函日未記録）";
              else progress = "窓口請求";
              out.push({
                id: row.id,
                todoKey: key,
                createdAt: row.created_at,
                kindLabel: requestKindLabel(r.requestKind),
                to: (isCity ? (r.cityOffice ?? "") : r.municipalityName) || r.municipalityName || "",
                progress,
                payment: paymentStatusLabel(r.mainPaymentStatus),
                person: r.personName ?? "",
              });
            }
            setMailings(out);
          });
      })
      .catch((err) => setError(dbErrorMessage(err, "0102_todos.sql", "TODOの読み込みに失敗しました")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
    // 追加フォームの外国人の候補
    void createClient()
      .from("workers")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        setWorkers(
          ((data as { id: string; name: string }[] | null) ?? []).map((w) => ({
            id: w.id,
            label: w.name,
          })),
        );
      });
    // 申請取次士の名簿（無くても他の機能は使える）
    listFilingAgents(createClient())
      .then((rows) => setAgents(rows.map((a) => a.name)))
      .catch(() => undefined);
  }, []);

  // まだ申請準備のTODOに入っていない「申請前＜準備中＞」の人（外国人・番号のどちらでも重複を除く）
  const prepPending = useMemo(() => {
    const importedWorkers = new Set(
      todos.filter((t) => t.kind === "申請準備" && t.worker_id).map((t) => t.worker_id),
    );
    const importedNos = new Set(
      todos
        .filter((t) => t.kind === "申請準備")
        .map((t) => normalizeTodoKey(t.todo_no))
        .filter(Boolean),
    );
    return prepWorkers.filter((w) => {
      if (importedWorkers.has(w.workerId)) return false;
      const key = normalizeTodoKey(w.todoNo);
      return !(key && importedNos.has(key));
    });
  }, [prepWorkers, todos]);

  // 「申請前＜準備中＞」の人は自動で申請準備のTODOに取り込む（準備中の管理はTODOで行い、
  // ステータスが「入管へ申請！！」になった人だけが申請一覧に表示される）
  const [autoImporting, setAutoImporting] = useState(false);
  const autoImportedRef = useRef(false); // 取り込み失敗時に何度も繰り返さないよう1回だけ実行
  useEffect(() => {
    if (!canEdit || loading || autoImportedRef.current) return;
    if (fixedKind && fixedKind !== "申請準備") return;
    if (prepPending.length === 0) return;
    autoImportedRef.current = true;
    void (async () => {
      setAutoImporting(true);
      for (const w of prepPending) {
        await insertTodo(createClient(), {
          kind: "申請準備",
          worker_id: w.workerId,
          title: "申請準備",
          todo_no: w.todoNo || undefined,
        }).catch(() => undefined);
      }
      await load();
      setAutoImporting(false);
    })();
  }, [canEdit, loading, fixedKind, prepPending]);

  const kindOptions = useMemo(() => options.filter((o) => o.kind === kind), [options, kind]);
  const checkOptions = useMemo(
    () => options.filter((o) => o.kind === TODO_CHECK_KIND),
    [options],
  );
  const kindTodos = useMemo(() => todos.filter((t) => t.kind === kind), [todos, kind]);

  const run = async (fn: () => Promise<void>, migration = "0102_todos.sql") => {
    try {
      await fn();
      await load();
    } catch (err) {
      setError(dbErrorMessage(err, migration, "保存に失敗しました"));
    }
  };

  const add = () =>
    run(async () => {
      setAdding(true);
      try {
        await insertTodo(createClient(), {
          kind,
          worker_id: newWorkerId || null,
          title: newTitle.trim(),
          todo_no: newNo.trim() || undefined,
        });
        setNewWorkerId("");
        setNewTitle("");
        setNewNo("");
      } finally {
        setAdding(false);
      }
    });

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
        <ClipboardList size={14} className="mt-0.5 shrink-0" />
        NotionのTODOの置き換えです。番号は通しで自動採番されます（申請準備からTODO番号を発行したときもここに入ります）。ステータス（経過）の選択肢は「選択肢の編集」からいつでも追加・変更できます。
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* 3つの構成の切り替え（fixedKind 指定時はその構成だけの画面にする） */}
      {!fixedKind && (
      <div className="flex flex-wrap gap-2">
        {TODO_KINDS.map((k) => {
          const active = kind === k;
          const count = todos.filter(
            (t) => t.kind === k && stageOfStatus(t.status, options.filter((o) => o.kind === k)) !== "完了",
          ).length;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-xl border px-3 py-2 text-sm font-bold ${
                active ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface text-muted"
              }`}
            >
              {k}（残{count}）
            </button>
          );
        })}
      </div>
      )}

      {/* ② 退職の随時報告書は、退職＜随時報告＞のページと連動して使う */}
      {kind === "退職の随時報告書" && (
        <p className="rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-muted">
          退職の随時報告書には
          <Link href="/resignations" className="mx-1 font-bold text-brand hover:underline">
            退職＜随時報告＞
          </Link>
          のページがあります。届出書の作成・署名済み届出書の添付・投函の記録はそちらで行い、TODO番号はそのページの「TODO番号」から自動発行できます。ここでは番号と経過の一覧管理だけを行います。
        </p>
      )}

      {/* 申請準備のTODOは、必ず申請準備ページの「新規で申請書類準備」「更新で申請書類準備」から
          登録する（準備中にすると自動でTODOに入る）。手入力の追加フォームは出さない */}
      {kind === "申請準備" && (
        <p className="rounded-xl border border-border bg-background px-3 py-2.5 text-xs leading-relaxed text-muted">
          申請準備のTODOは、
          {fixedKind ? (
            "上の「新規で申請書類準備」「更新で申請書類準備」"
          ) : (
            <>
              <Link href="/workers/renewals" className="mx-0.5 font-bold text-brand hover:underline">
                申請準備
              </Link>
              の「新規で申請書類準備」「更新で申請書類準備」
            </>
          )}
          から登録してください（対応状況を「準備中」にすると自動でここに入り、番号は TODO-2000 から自動で割り当てられます）。
        </p>
      )}

      {/* 追加 */}
      {canEdit && kind !== "申請準備" && (
        <Card className="flex flex-wrap items-end gap-2 p-4">
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">外国人（任意）</span>
            <Combobox
              options={workers}
              value={newWorkerId}
              onChange={setNewWorkerId}
              placeholder="氏名で検索して選択"
            />
          </label>
          <label className="flex min-w-[12rem] flex-[2] flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">内容（任意）</span>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={`例: ${kind}のTODO`}
              className={INPUT}
            />
          </label>
          <label className="flex w-28 flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">番号（空で自動）</span>
            <input
              value={newNo}
              onChange={(e) => setNewNo(e.target.value)}
              placeholder="自動"
              className={`${INPUT} text-right tabular-nums`}
            />
          </label>
          <Button icon={<Plus size={15} />} disabled={adding} onClick={() => void add()}>
            {adding ? "追加中…" : "TODOを追加"}
          </Button>
        </Card>
      )}

      {/* 申請前＜準備中＞の人の自動取り込み中の表示 */}
      {kind === "申請準備" && autoImporting && (
        <Card className="border-brand/40 p-4 text-center text-xs text-muted">
          「申請前＜準備中＞」の人を申請準備のTODOに取り込んでいます…（{prepPending.length}件）
        </Card>
      )}

      {/* 「申請前＜準備中＞」の人は自動でTODOに入る。ここに出るのは、
          自動取り込みができなかったとき（権限なし・保存失敗など）の案内と手動取り込み */}
      {kind === "申請準備" && !loading && !autoImporting && prepPending.length > 0 && (
        <Card className="border-brand/40 p-4">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold">
              まだTODOに入っていない「申請前＜準備中＞」の人（{prepPending.length}件）
            </p>
            {canEdit && (
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    for (const w of prepPending) {
                      await insertTodo(createClient(), {
                        kind: "申請準備",
                        worker_id: w.workerId,
                        title: "申請準備",
                        todo_no: w.todoNo || undefined,
                      }).catch(() => undefined);
                    }
                  })
                }
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-foreground"
              >
                すべてTODOに取り込む
              </button>
            )}
          </div>
          <p className="mb-2 text-[11px] text-muted">
            準備中の人は通常このページを開くと自動でTODOに入ります（申請一覧のTODO番号をそのまま引き継ぎます）。ここに残っている場合は「すべてTODOに取り込む」を押してください。TODOのステータスが「入管へ申請！！」になると申請一覧に表示されます。
          </p>
          <div className="space-y-1">
            {prepPending.map((w) => (
              <div
                key={w.workerId}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-background px-2 py-1.5 text-xs"
              >
                <span className="w-24 shrink-0 font-bold tabular-nums">
                  {w.todoNo || "番号なし"}
                </span>
                <Link
                  href={`/workers/${w.workerId}`}
                  className="min-w-0 flex-1 truncate font-bold text-brand hover:underline"
                >
                  {w.name}
                </Link>
                <span className="truncate text-muted">{w.orgName}</span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        await insertTodo(createClient(), {
                          kind: "申請準備",
                          worker_id: w.workerId,
                          title: "申請準備",
                          todo_no: w.todoNo || undefined,
                        });
                      })
                    }
                    className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-brand"
                  >
                    取り込む
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 未着手 → 進行中 → 完了 の順に表示 */}
      {loading ? (
        <Card className="p-6 text-center text-sm text-muted">読み込み中…</Card>
      ) : (
        TODO_STAGES.map((stage) => {
          const rows = kindTodos.filter((t) => stageOfStatus(t.status, kindOptions) === stage);
          return (
            <Card key={stage} className="p-4">
              <h2 className="mb-2 text-sm font-bold text-muted">
                {stage}（{rows.length}件）
              </h2>
              {rows.length === 0 ? (
                <p className="rounded-xl bg-background p-3 text-center text-xs text-muted">
                  {stage}のTODOはありません。
                </p>
              ) : (
                <div className="space-y-2">
                  {rows.map((t) => (
                    <TodoItem
                      key={t.id}
                      todo={t}
                      statusOptions={kindOptions}
                      checkOptions={checkOptions}
                      canEdit={canEdit}
                      agents={agents}
                      onOpenPrep={t.kind === "申請準備" && t.worker_id ? () => openPrep(t) : undefined}
                      jobFlows={jobFlows.filter((f) => f.worker_id === t.worker_id)}
                      mailings={mailings.filter(
                        (m) => m.todoKey && m.todoKey === normalizeTodoKey(t.todo_no),
                      )}
                      onChange={(patch) =>
                        run(
                          () => updateTodo(createClient(), t.id, patch),
                          // 取次士・本人申請の列は 0106 で追加。未適用ならその案内を出す
                          "agent_name" in patch || "self_apply" in patch
                            ? "0106_todos_apply_fields.sql"
                            : "0102_todos.sql",
                        )
                      }
                      onDelete={() => {
                        if (
                          window.confirm(
                            `TODO No.${t.todo_no}（${t.worker_name ?? (t.title || "内容なし")}）を削除します。よろしいですか？`,
                          )
                        ) {
                          void run(() => deleteTodo(createClient(), t.id));
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </Card>
          );
        })
      )}

      {/* ステータス（経過）の選択肢の編集。状況に応じて随時変更してそのまま運用できる */}
      {canEdit && !loading && (
        <details className="rounded-2xl border border-border bg-surface p-4">
          <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-bold text-muted">
            <Settings2 size={15} />
            選択肢の編集（{kind}・チェック）
          </summary>
          <div className="mt-3 space-y-4">
            <OptionsEditor
              label={`${kind}のステータス（経過）`}
              kind={kind}
              options={kindOptions}
              onChanged={load}
              onError={setError}
            />
            <OptionsEditor
              label="チェックのステータス（経過が「〜チェック中」のときの確認）"
              kind={TODO_CHECK_KIND}
              options={checkOptions}
              onChanged={load}
              onError={setError}
            />
          </div>
        </details>
      )}

      {/* TODOの詳細（申請準備 書類チェックリスト）。行の「必要な書類・準備の詳細」から開く */}
      {prepModal && (
        <Modal
          open
          wide
          title={`${prepModal.name}｜申請準備`}
          onClose={() => {
            setPrepModal(null);
            void load(); // ステータスなどの変更を一覧に反映
          }}
        >
          <ApplicationPrepChecklist
            workerId={prepModal.workerId}
            canEdit={canEdit}
            photoPath={prepModal.photoPath}
            healthCheckOn={prepModal.healthCheckOn}
            embedEmployment
          />
        </Modal>
      )}
    </div>
  );
}

function TodoItem({
  todo,
  statusOptions,
  checkOptions,
  canEdit,
  agents = [],
  onOpenPrep,
  jobFlows = [],
  mailings = [],
  onChange,
  onDelete,
}: {
  todo: TodoRow;
  statusOptions: TodoStatusOption[];
  checkOptions: TodoStatusOption[];
  canEdit: boolean;
  agents?: string[]; // 申請取次士の名簿（申請準備のTODOで選ぶ）
  onOpenPrep?: () => void; // TODOの詳細（申請準備 書類チェックリスト）を開く
  jobFlows?: JobFlowRow[]; // あっせん有りのときに出す、求人への採用の流れ
  mailings?: MailingSummary[]; // 同じTODO番号の郵送請求（判定記録）の状況
  onChange: (
    patch: Partial<
      Pick<
        TodoRow,
        | "todo_no"
        | "title"
        | "status"
        | "check_status"
        | "assen"
        | "assen_note"
        | "agent_name"
        | "self_apply"
      >
    >,
  ) => void;
  onDelete: () => void;
}) {
  const [no, setNo] = useState(todo.todo_no);
  const [title, setTitle] = useState(todo.title);
  const [assenNote, setAssenNote] = useState(todo.assen_note ?? "");

  const selectFor = (
    value: string,
    opts: TodoStatusOption[],
    onSelect: (v: string) => void,
    extraEmptyLabel?: string,
  ) => (
    <select
      value={value}
      onChange={(e) => onSelect(e.target.value)}
      disabled={!canEdit}
      className={`${INPUT} min-w-0`}
    >
      {extraEmptyLabel !== undefined && <option value="">{extraEmptyLabel}</option>}
      {/* 選択肢から消された（または自由入力の）値もそのまま残す */}
      {value && !opts.some((o) => o.name === value) && <option value={value}>{value}</option>}
      {TODO_STAGES.map((stage) => {
        const group = opts.filter((o) => o.stage === stage);
        return group.length > 0 ? (
          <optgroup key={stage} label={stage}>
            {group.map((o) => (
              <option key={o.id} value={o.name}>
                {o.name}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </select>
  );

  return (
    <div className="rounded-xl border border-border bg-background p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* 番号（編集可） */}
        <input
          value={no}
          onChange={(e) => setNo(e.target.value)}
          onBlur={() => {
            if (no.trim() && no.trim() !== todo.todo_no) onChange({ todo_no: no.trim() });
            else setNo(todo.todo_no);
          }}
          disabled={!canEdit}
          aria-label="TODO番号"
          className="w-28 rounded-lg border border-border bg-surface px-2 py-1 text-center text-sm font-bold tabular-nums"
        />
        {/* 「TODO-番号：内容　準備中」の形でコピー（Notionやメッセージへの貼り付け用） */}
        {todo.kind === "申請準備" && <CopyTodoLineButton todo={todo} />}
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-0.5">
          {todo.worker_id ? (
            <>
              <Link href={`/workers/${todo.worker_id}`} className="truncate font-bold text-brand hover:underline">
                {todo.worker_name ?? "（外国人）"}
              </Link>
              {/* 申請準備のTODOは、外国人詳細の賃金（1-6号別紙）とリンクして作成を進める。
                  会社の同意の確認チェックもその中にある */}
              {todo.kind === "申請準備" && (
                <>
                  {/* TODOの詳細（必要な書類のチェックリスト）はここから開く。
                      氏名クリック（外国人詳細）とは別の導線 */}
                  {onOpenPrep && (
                    <button
                      type="button"
                      onClick={onOpenPrep}
                      className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold text-brand-foreground"
                    >
                      📋 必要な書類・準備の詳細
                    </button>
                  )}
                  {/* 賃金（1-6号別紙）・雇用契約書は申請準備の中で直接入力する
                      （申請の時点でこの内容だったという記録。外国人詳細は雇用開始後の話） */}
                  {onOpenPrep && (
                    <>
                      <button
                        type="button"
                        onClick={onOpenPrep}
                        className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-brand"
                      >
                        賃金（1-6号別紙）
                      </button>
                      <button
                        type="button"
                        onClick={onOpenPrep}
                        className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-brand"
                      >
                        雇用契約書・雇用条件書
                      </button>
                    </>
                  )}
                  <Link
                    href={`/todos/plan-dates?workerId=${todo.worker_id}&name=${encodeURIComponent(
                      todo.worker_name ?? "",
                    )}&todo=${encodeURIComponent(todo.todo_no)}`}
                    className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-brand"
                  >
                    📅 日付計算
                  </Link>
                </>
              )}
            </>
          ) : (
            <span className="text-xs text-muted">外国人ひも付けなし</span>
          )}
        </span>
        {canEdit && (
          <button type="button" aria-label="削除" onClick={onDelete} className="shrink-0 text-seal">
            <Trash2 size={15} />
          </button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {todo.kind === "申請準備" ? (
          /* 申請準備の内容は自由入力ではなく、申請登録と同じ申請内容の候補から選ぶ。
             「※本人申請」の候補を選ぶと本人申請にもチェックが入る */
          <select
            value={title}
            disabled={!canEdit}
            onChange={(e) => {
              const v = e.target.value;
              setTitle(v);
              const choice = APPLICATION_CONTENT_CHOICES.find((c) => c.label === v);
              onChange({ title: v, ...(choice?.selfApply ? { self_apply: true } : {}) });
            }}
            aria-label="申請の内容"
            className={`${INPUT} min-w-0`}
          >
            <option value="">内容を選択</option>
            {/* 旧の自由入力の値（「申請準備」など）もそのまま残す */}
            {title && !APPLICATION_CONTENT_CHOICES.some((c) => c.label === title) && (
              <option value={title}>{title}</option>
            )}
            {APPLICATION_CONTENT_CHOICES.map((c) => (
              <option key={c.label} value={c.label}>
                {c.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title !== todo.title) onChange({ title });
            }}
            disabled={!canEdit}
            placeholder="内容"
            className={`${INPUT} min-w-0`}
          />
        )}
        {selectFor(todo.status, statusOptions, (v) => onChange({ status: v }))}
      </div>
      {/* 経過が「〜チェック中」のときは確認ステータスも出す */}
      {isCheckingStatus(todo.status) && (
        <div className="mt-2 flex items-center gap-2">
          <span className="shrink-0 text-[11px] font-bold text-muted">チェック</span>
          {selectFor(todo.check_status ?? "", checkOptions, (v) => onChange({ check_status: v }), "未選択")}
        </div>
      )}

      {/* 申請準備のTODO: 申請取次士・本人申請、あっせんの有無、チェック後の訂正記録 */}
      {todo.kind === "申請準備" && (
        <div className="mt-2 space-y-2 border-t border-dashed border-border pt-2">
          {/* 誰が取次するか（申請取次士）と、本人申請でするかの記録（0106） */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[11px] font-bold text-muted">
              申請取次士
              <select
                value={todo.agent_name ?? ""}
                disabled={!canEdit}
                onChange={(e) => onChange({ agent_name: e.target.value })}
                className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-xs"
              >
                <option value="">未定</option>
                {/* 名簿から外れた保存済みの名前も選択肢として残す */}
                {todo.agent_name && !agents.includes(todo.agent_name) && (
                  <option value={todo.agent_name}>{todo.agent_name}</option>
                )}
                {agents.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] font-bold">
              <input
                type="checkbox"
                checked={todo.self_apply ?? false}
                disabled={!canEdit}
                onChange={(e) => onChange({ self_apply: e.target.checked })}
                className="h-4 w-4"
              />
              本人申請でする
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-[11px] font-bold text-muted">あっせん</span>
            <select
              value={todo.assen ?? ""}
              onChange={(e) => onChange({ assen: e.target.value })}
              disabled={!canEdit}
              className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-xs"
            >
              <option value="">未設定</option>
              <option value="あり">あり（求人からの採用）</option>
              <option value="なし">なし</option>
            </select>
          </div>
          {todo.assen === "なし" && (
            <label className="block">
              <span className="text-[11px] font-bold text-muted">
                どのような経緯での申請書類作成か（あっせん無しの場合に記入）
              </span>
              <textarea
                value={assenNote}
                onChange={(e) => setAssenNote(e.target.value)}
                onBlur={() => {
                  if (assenNote !== (todo.assen_note ?? "")) onChange({ assen_note: assenNote });
                }}
                disabled={!canEdit}
                rows={2}
                placeholder="例: 知人の紹介で本人から直接依頼があり、会社と面談のうえ雇用が決まった など"
                className={`${INPUT} mt-0.5 w-full py-2`}
              />
            </label>
          )}
          {todo.assen === "あり" && (
            <div className="rounded-lg bg-background p-2">
              <p className="mb-1 text-[11px] font-bold text-muted">
                求人への採用の一連の流れ（求職管理簿から）
              </p>
              {jobFlows.length === 0 ? (
                <p className="text-[11px] text-muted">
                  この外国人の応募（求職管理簿）が見つかりません。求職一覧で応募・採用を登録してください。
                </p>
              ) : (
                <div className="space-y-1">
                  {jobFlows.map((f) => (
                    <p key={f.id} className="text-[11px] leading-relaxed">
                      <span className="font-bold">{f.orgName}</span>
                      {f.postingJobType && `（${f.postingJobType}）`}
                      求人申込日 {f.postingReceivedOn ?? "—"} → 求職申込日 {f.applied_on} → 面接日{" "}
                      {f.interview_on ?? "—"} → {f.result === "採用" ? "採用日" : f.result}{" "}
                      {f.result_on ?? "—"}
                    </p>
                  ))}
                  <p className="text-[10px] text-muted">
                    これらの日付は特定技能支援計画書の日付計算のカレンダーにも載せる予定です。
                  </p>
                </div>
              )}
            </div>
          )}
          {/* 郵送請求の状況（同じTODO番号の判定記録とリンク） */}
          <div className="rounded-lg bg-background p-2">
            <p className="mb-1 flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold text-muted">
              📮 郵送請求の状況（TODO番号 {todo.todo_no} とリンク）
              {/* 開いた先で、その人の記録一覧を最初から表示する */}
              <Link
                href={`/mailing?q=${encodeURIComponent(todo.worker_name || todo.todo_no)}`}
                className="font-bold text-brand hover:underline"
              >
                郵送請求を開く →
              </Link>
            </p>
            {mailings.length === 0 ? (
              <p className="text-[11px] text-muted">
                このTODO番号の郵送請求はまだありません（郵送請求の判定記録にTODO番号を入れるとここに出ます）。
              </p>
            ) : (
              <div className="space-y-0.5">
                {mailings.map((m) => (
                  <p key={m.id} className="text-[11px] leading-relaxed">
                    <span className="font-bold">{m.kindLabel}</span>
                    {m.to && `（${m.to}）`}　{m.progress}
                    {m.payment && `　納付: ${m.payment}`}
                    <span className="text-[10px] text-muted">　記録 {m.createdAt.slice(0, 10)}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
          {/* 支援計画書の日付（日付計算の保存結果）。この場で見られて編集もできる */}
          {todo.worker_id && (
            <SavedPlanDatesSection
              workerId={todo.worker_id}
              todoNo={todo.todo_no}
              canEdit={canEdit}
            />
          )}
          {/* チェック後の申請書類の訂正記録 */}
          <CorrectionSection todoId={todo.id} canEdit={canEdit} />
        </div>
      )}
    </div>
  );
}

// 「TODO-番号：内容　準備中」の形でコピーするボタン。
// 登録後の番号は TODO-数字 で表示し、そのまま貼り付けて使えるようにする
function CopyTodoLineButton({ todo }: { todo: TodoRow }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = `${displayTodoNo(todo.todo_no)}：${todo.title || "申請準備"}　準備中`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label="TODO番号と内容をコピー"
      title="「TODO-番号：内容　準備中」の形でコピー"
      className="shrink-0 text-muted hover:text-brand"
    >
      {copied ? <Check size={14} className="text-status-approved-fg" /> : <Copy size={14} />}
    </button>
  );
}

// 申請書類の訂正記録（チェック後）。訂正書類名・訂正箇所の画像・訂正内容を複数保存できる
function CorrectionSection({ todoId, canEdit }: { todoId: string; canEdit: boolean }) {
  const [rows, setRows] = useState<TodoCorrectionView[]>([]);
  const [open, setOpen] = useState(false);
  const [docName, setDocName] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => listTodoCorrections(todoId).then(setRows).catch(() => undefined);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todoId]);

  const add = async () => {
    if (!docName.trim() && !content.trim() && !file) return;
    setBusy(true);
    setError(null);
    try {
      let path: string | undefined;
      let fileName: string | undefined;
      let mimeType: string | undefined;
      if (file) {
        const { blob, mimeType: mt, fileName: fn } = await compressImage(file);
        const ticket = await createTodoCorrectionTicket(todoId, fn, mt);
        if (!ticket.ok) throw new Error(ticket.message);
        const { error: upErr } = await createClient()
          .storage.from("app-files")
          .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mt });
        if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
        path = ticket.path;
        fileName = fn;
        mimeType = mt;
      }
      const res = await registerTodoCorrection(todoId, {
        doc_name: docName.trim(),
        content: content.trim(),
        path,
        fileName,
        mimeType,
      });
      if (!res.ok) throw new Error(res.message);
      setDocName("");
      setContent("");
      setFile(null);
      await load();
    } catch (err) {
      setError(
        dbErrorMessage(err, "0103_todo_prep_extras.sql", "訂正記録の保存に失敗しました"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-lg bg-background p-2"
    >
      <summary className="cursor-pointer text-[11px] font-bold text-muted">
        📝 申請書類の訂正記録（チェック後）{rows.length > 0 && `（${rows.length}件）`}
      </summary>
      <div className="mt-2 space-y-2">
        {error && <p className="rounded-lg bg-seal/10 px-2 py-1.5 text-[11px] text-seal">{error}</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-start gap-2 rounded-lg border border-border bg-surface p-2">
            {r.url && (
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.url} alt="訂正箇所" className="h-14 w-14 rounded border border-border object-cover" />
              </a>
            )}
            <span className="min-w-0 flex-1 text-[11px]">
              <span className="block font-bold">{r.doc_name || "（書類名なし）"}</span>
              <span className="block whitespace-pre-wrap">{r.content}</span>
              <span className="block text-[10px] text-muted">{r.created_at.slice(0, 10)}</span>
            </span>
            {canEdit && (
              <button
                type="button"
                aria-label="この訂正記録を削除"
                onClick={() => {
                  if (window.confirm("この訂正記録を削除します。よろしいですか？")) {
                    void deleteTodoCorrection(r.id).then(load);
                  }
                }}
                className="shrink-0 text-seal"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <div className="space-y-1.5 rounded-lg border border-dashed border-border p-2">
            <input
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="訂正書類名（例: 1-6号別紙）"
              className="min-h-[34px] w-full rounded-lg border border-border bg-surface px-2 text-xs"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={2}
              placeholder="訂正内容"
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="min-w-0 flex-1 text-[11px]"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void add()}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-brand disabled:opacity-50"
              >
                <Plus size={12} />
                {busy ? "保存中…" : "訂正記録を追加"}
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

// ステータス（経過）の選択肢の編集。名前を書き換えて欄の外を押すと保存、×で削除、追加もできる
function OptionsEditor({
  label,
  kind,
  options,
  onChanged,
  onError,
}: {
  label: string;
  kind: TodoStatusOption["kind"];
  options: TodoStatusOption[];
  onChanged: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newStage, setNewStage] = useState<TodoStage>("進行中");

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
      await onChanged();
    } catch (err) {
      onError(dbErrorMessage(err, "0102_todos.sql", "選択肢の保存に失敗しました"));
    }
  };

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="mb-2 text-xs font-bold text-muted">{label}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TODO_STAGES.map((stage) => (
          <div key={stage}>
            <p className="mb-1 text-[11px] font-bold text-muted">{stage}</p>
            <div className="space-y-1">
              {options
                .filter((o) => o.stage === stage)
                .map((o) => (
                  <OptionRow
                    key={o.id}
                    option={o}
                    onRename={(name) => run(() => renameTodoStatusOption(createClient(), o.id, name))}
                    onDelete={() => {
                      if (window.confirm(`選択肢「${o.name}」を削除します。よろしいですか？（この選択肢が入っているTODOの表示はそのまま残ります）`)) {
                        void run(() => deleteTodoStatusOption(createClient(), o.id));
                      }
                    }}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={newStage}
          onChange={(e) => setNewStage(e.target.value as TodoStage)}
          className={`${INPUT} w-28`}
        >
          {TODO_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新しい選択肢の名前"
          className={`${INPUT} min-w-0 flex-1`}
        />
        <button
          type="button"
          disabled={!newName.trim()}
          onClick={() => {
            const name = newName.trim();
            void run(async () => {
              await insertTodoStatusOption(createClient(), {
                kind,
                stage: newStage,
                name,
                sort_no: options.filter((o) => o.stage === newStage).length + 1,
              });
              setNewName("");
            });
          }}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-bold text-brand disabled:opacity-50"
        >
          <Plus size={13} />
          追加
        </button>
      </div>
    </div>
  );
}

function OptionRow({
  option,
  onRename,
  onDelete,
}: {
  option: TodoStatusOption;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(option.name);
  return (
    <div className="flex items-center gap-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const v = name.trim();
          if (v && v !== option.name) onRename(v);
          else setName(option.name);
        }}
        className="min-h-[34px] w-full min-w-0 rounded-lg border border-border bg-surface px-2 text-xs"
      />
      <button type="button" aria-label="この選択肢を削除" onClick={onDelete} className="shrink-0 text-seal">
        <Trash2 size={13} />
      </button>
    </div>
  );
}
