"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  Mail,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { WorkerCertDocRows } from "@/components/workers/WorkerCertDocRows";
import { Jisshu2Section } from "@/components/workers/Jisshu2Section";
import {
  WorkerRenewalFields,
  type RenewalFieldsWorker,
} from "@/components/workers/WorkerRenewalFields";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { listOnboardingDocs } from "@/lib/supabase/queries/onboarding";
import {
  deletePrepChecklist,
  EMPTY_PREP_DOC_STATUS,
  listPrepChecklists,
  listPrepDocStatuses,
  updatePrepChecklistExtras,
  updatePrepChecklistTodoNo,
  upsertPrepChecklist,
  upsertPrepDocStatus,
  type PrepChecklistRow,
  type PrepDocStatusInput,
} from "@/lib/supabase/queries/application-prep";
import {
  deleteTodo,
  insertTodo,
  listTodoStatusOptions,
  renameTodoNo,
  type TodoRow,
} from "@/lib/supabase/queries/todos";
import { normalizeTodoKey, type TodoStatusOption } from "@/lib/todo";
import {
  JointApplicationField,
  PrepAddressField,
  PrepAssenSection,
  PrepEmploymentSection,
  PrepOrgInfo,
  PrepSignStatusField,
  PrepTodoStatusField,
  PrepWageSummary,
  SavedPlanDatesSection,
} from "@/components/workers/ApplicationPrepExtras";
import { dbErrorMessage } from "@/lib/errors";
import { listActiveCustodyNoByWorker } from "@/lib/supabase/queries/custody";
import { formatStorageNo } from "@/lib/custody";
import { getHealthCheckDetail } from "@/lib/supabase/queries/health-check";
import {
  EMPTY_HEALTH_DETAIL,
  healthCheckValidUntil,
  isHealthDetailComplete,
  type HealthCheckDetail,
} from "@/lib/health-check";
import {
  clearOnboardingDocFile,
  getOnboardingDocDownloadUrl,
  getOnboardingDocPreviewUrl,
} from "@/app/(app)/onboarding/actions";
import { getWorkerPhotoUrl } from "@/app/(app)/workers/actions";
import { uploadOnboardingDoc } from "@/lib/onboarding-files";
import { uploadWorkerPhoto } from "@/lib/worker-photo";
import { listWorkerAddresses } from "@/lib/supabase/queries/worker-addresses";
import { addressOnDate, reiwaJan1, type WorkerAddress } from "@/lib/worker-address";
import { gensenDocKey, reiwaYear } from "@/lib/onboarding";
import {
  notifyWorkerDocsChanged,
  notifyWorkerPhotoChanged,
  useWorkerDocsChanged,
  useWorkerPhotoChanged,
} from "@/lib/worker-docs-events";
import { todayStr } from "@/lib/ssw/calc";
import {
  EMPTY_PREP_META,
  evaluatePrepChecklist,
  isPrepPageKeyOf,
  letterPackTrackingUrl,
  parseAttachItems,
  PREP_APP_TYPE_LABELS,
  PREP_APP_TYPES,
  PREP_CERT_PATTERNS,
  PREP_DOC_ALWAYS_EXTRAS,
  PREP_DOC_ATTACH_ITEMS,
  PREP_DOC_STATUS_OPTIONS,
  PREP_MAIL_AFTER_HIDDEN,
  PREP_TANTOU_OPTIONS,
  serializeAttachItems,
  prepDocLabel,
  prepPageKey,
  prepStatusOption,
  prepYearDocKey,
  type PrepChecklistMeta,
  type PrepDocDef,
  type PrepDocStatus,
  type PrepStatusExtra,
} from "@/lib/application-prep";
import type { OnboardingDocumentRow } from "@/types/db";

// 申請準備の書類チェックリスト。申請種別（変更/更新）と国保・年金の加入で必要書類が
// 切り替わり、今どれが不足しているかを一覧で把握できる。各書類はこの画面から直接添付でき、
// 保存先は既存のセクションと共有する（在留カード=外国人書類、顔写真=写真 など）。
export function ApplicationPrepChecklist({
  workerId,
  canEdit = false,
  photoPath,
  healthCheckOn,
  worker,
  organizations,
  embedEmployment = false,
}: {
  workerId: string;
  canEdit?: boolean;
  photoPath: string | null;
  healthCheckOn: string | null;
  // 渡すと、申請準備（在留更新対象）と同じ入力欄をこの画面にも出す。
  // ここで「準備中」にすると申請一覧の「申請前＜準備中＞」に出る
  worker?: RenewalFieldsWorker;
  organizations?: { id: string; name: string }[];
  // モーダル表示（TODO・申請一覧）のとき true: 賃金（1-6号別紙）もこの中で直接入力する。
  // 外国人詳細では賃金の記録カードが別にあるため false（リンク表示のみ）
  embedEmployment?: boolean;
}) {
  // TODO番号ごとの準備リスト。selected が表示中のリスト（todo_no）
  const [lists, setLists] = useState<PrepChecklistRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  // 申請準備の入力欄に渡す外国人。リストを追加すると対応状況・TODO番号が変わるので、
  // この画面の中でも最新の値を持ち、入力欄を作り直して反映する
  const [renewalWorker, setRenewalWorker] = useState(worker);
  const [prevWorker, setPrevWorker] = useState(worker);
  if (worker !== prevWorker) {
    // 親（外国人詳細）で保存し直したら、その内容に合わせる
    setPrevWorker(worker);
    setRenewalWorker(worker);
  }
  const [newTodo, setNewTodo] = useState("");
  const [creating, setCreating] = useState(false);
  const [healthDetail, setHealthDetail] = useState<HealthCheckDetail>(EMPTY_HEALTH_DETAIL);
  // 健康診断の受診日（workers.health_check_on）。この画面から入力・修正できる
  const [healthOn, setHealthOn] = useState<string | null>(healthCheckOn);
  const saveHealthOn = (v: string | null) => {
    setHealthOn(v);
    void updateWorker(createClient(), workerId, { health_check_on: v }).catch((err) =>
      setError(err instanceof Error ? err.message : "受診日の保存に失敗しました"),
    );
  };
  const [addresses, setAddresses] = useState<WorkerAddress[]>([]);
  const [docs, setDocs] = useState<OnboardingDocumentRow[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 顔写真は workers.photo_path と連動（最新の1枚を共有）
  const [photoExists, setPhotoExists] = useState<boolean>(!!photoPath);
  const [photoUrl, setPhotoUrl] = useState<string>("");

  const uploadRef = useRef<{ docKey: string; label: string } | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // 書類ごとの準備状況（ステータス）。チェックリストID → 書類ID → 入力値
  const [docStatusesByList, setDocStatusesByList] = useState<
    Record<string, Record<string, PrepDocStatusInput>>
  >({});
  // 在留カード・パスポートの「預かった」で表示する預かり番号（保管ボックスと連動）
  const [custodyNo, setCustodyNo] = useState<number | null>(null);

  // 在留カード・パスポートの充足判定は移行先（在留カード・指定書／パスポートの記録）を見る
  const [hasResidenceCard, setHasResidenceCard] = useState(false);
  const [hasPassportFile, setHasPassportFile] = useState(false);

  // 外国人の基本情報（現在の住所・所属機関・合格名）。モーダル表示でも使えるようこの場で取得する
  const [workerRow, setWorkerRow] = useState<{
    name: string;
    address: string;
    current_organization_id: string | null;
    application_prep_organization_id: string | null;
    specialty_grade: string;
    other_qualifications: string;
    residence_status: string;
    residence_card_no: string;
    residence_expiry_date: string;
    passport_no: string;
    passport_expiry_date: string;
  } | null>(null);

  // 申請準備のTODO（この外国人分）とステータスの選択肢。名前の下に常時表示して編集できる
  const [workerTodos, setWorkerTodos] = useState<TodoRow[]>([]);
  const [todoOptions, setTodoOptions] = useState<TodoStatusOption[]>([]);
  const loadWorkerTodos = () => {
    const supabase = createClient();
    void supabase
      .from("todos")
      .select("*")
      .eq("worker_id", workerId)
      .eq("kind", "申請準備")
      .order("created_at", { ascending: false })
      .then(({ data }) =>
        // 削除フォルダ（0108）に入っているTODOは除く
        setWorkerTodos((((data as TodoRow[] | null) ?? [])).filter((t) => !t.deleted_at)),
      );
    listTodoStatusOptions(supabase).then(setTodoOptions).catch(() => undefined);
  };

  const loadDocs = () =>
    listOnboardingDocs(createClient(), workerId).then(setDocs).catch(() => undefined);

  const loadMovedDocs = () => {
    const supabase = createClient();
    void supabase
      .from("worker_documents")
      .select("id")
      .eq("worker_id", workerId)
      .eq("kind", "在留カード")
      .limit(1)
      .then(({ data }) => setHasResidenceCard(!!data && data.length > 0));
    void supabase
      .from("worker_passport_files")
      .select("id")
      .eq("worker_id", workerId)
      .limit(1)
      .then(({ data }) => setHasPassportFile(!!data && data.length > 0));
  };

  useEffect(() => {
    listPrepChecklists(createClient(), workerId)
      .then((rows) => {
        setLists(rows);
        setSelected(rows[0]?.todo_no ?? null);
      })
      .catch(() => undefined);
    getHealthCheckDetail(createClient(), workerId).then(setHealthDetail).catch(() => undefined);
    listWorkerAddresses(createClient(), workerId).then(setAddresses).catch(() => undefined);
    listActiveCustodyNoByWorker(createClient())
      .then((m) => setCustodyNo(m.get(workerId) ?? null))
      .catch(() => undefined);
    void loadDocs();
    loadMovedDocs();
    loadWorkerTodos();
    void createClient()
      .from("workers")
      .select(
        "name, address, current_organization_id, application_prep_organization_id, specialty_grade, other_qualifications, residence_status, residence_card_no, residence_expiry_date, passport_no, passport_expiry_date",
      )
      .eq("id", workerId)
      .maybeSingle()
      .then(({ data }) => {
        const w = data as {
          name: string;
          address: string | null;
          current_organization_id: string | null;
          application_prep_organization_id: string | null;
          specialty_grade: string | null;
          other_qualifications: string | null;
          residence_status: string | null;
          residence_card_no: string | null;
          residence_expiry_date: string | null;
          passport_no: string | null;
          passport_expiry_date: string | null;
        } | null;
        if (w) {
          setWorkerRow({
            name: w.name,
            address: w.address ?? "",
            current_organization_id: w.current_organization_id,
            application_prep_organization_id: w.application_prep_organization_id,
            specialty_grade: w.specialty_grade ?? "",
            other_qualifications: w.other_qualifications ?? "",
            residence_status: w.residence_status ?? "",
            residence_card_no: w.residence_card_no ?? "",
            residence_expiry_date: w.residence_expiry_date ?? "",
            passport_no: w.passport_no ?? "",
            passport_expiry_date: w.passport_expiry_date ?? "",
          });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  // 源泉徴収票セクションなど、他の場所で添付・削除されたときもここに反映する
  useWorkerDocsChanged(workerId, () => {
    void loadDocs();
    loadMovedDocs();
  });

  // 外国人詳細の見出しで登録された顔写真もここに反映する
  useWorkerPhotoChanged(workerId, (url) => {
    setPhotoExists(true);
    setPhotoUrl(url);
  });

  const current =
    selected != null ? (lists.find((l) => l.todo_no === selected) ?? null) : null;
  const meta: PrepChecklistMeta = current ?? EMPTY_PREP_META;

  // 表示中のTODO番号に対応する申請準備のTODO（番号の書き方の揺れは正規化して突き合わせる）
  const selectedKey = selected != null ? normalizeTodoKey(selected) : "";
  const currentTodo = selectedKey
    ? (workerTodos.find((t) => normalizeTodoKey(t.todo_no) === selectedKey) ?? null)
    : (workerTodos[0] ?? null);

  // 申請準備の所属機関（転職先）が入っていればそちら、無ければ現在の所属機関
  const prepOrgId =
    workerRow?.application_prep_organization_id ?? workerRow?.current_organization_id ?? null;

  // 追加項目（単独/連名・連名相手・署名ステータス）の保存（0105）
  async function saveExtras(
    patch: Partial<
      Pick<
        PrepChecklistRow,
        | "joint_kind"
        | "joint_worker_id"
        | "joint_todo_no"
        | "joint_lead"
        | "sign_status"
        | "planned_app_on"
      >
    >,
  ) {
    if (current == null) return;
    const id = current.id;
    setLists((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setError(null);
    try {
      await updatePrepChecklistExtras(createClient(), id, patch);
    } catch (err) {
      setError(dbErrorMessage(err, "0105_prep_checklist_extras.sql", "保存に失敗しました"));
    }
  }

  // 表示中のリストを切り替えたら、そのリストの書類ステータスを読み込む
  const currentId = current?.id ?? null;
  const docStatuses: Record<string, PrepDocStatusInput> = currentId
    ? (docStatusesByList[currentId] ?? {})
    : {};
  useEffect(() => {
    if (!currentId) return;
    let cancelled = false;
    listPrepDocStatuses(createClient(), currentId)
      .then((rows) => {
        if (cancelled) return;
        const next: Record<string, PrepDocStatusInput> = {};
        for (const r of rows) {
          next[r.doc_id] = {
            status: r.status,
            note: r.note,
            amount: r.amount,
            date_on: r.date_on,
            tracking_out: r.tracking_out,
            tracking_back: r.tracking_back,
            mail_after_apply: r.mail_after_apply,
            attach_items: r.attach_items ?? "",
          };
        }
        setDocStatusesByList((prev) => ({ ...prev, [currentId]: next }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentId]);

  // 書類ステータスの更新。save=false はテキスト入力中（保存はフォーカスが外れた時）
  const patchDocStatus = (docId: string, patch: Partial<PrepDocStatusInput>, save = true) => {
    if (!currentId) return;
    const next = { ...EMPTY_PREP_DOC_STATUS, ...(docStatuses[docId] ?? {}), ...patch };
    setDocStatusesByList((prev) => ({
      ...prev,
      [currentId]: { ...(prev[currentId] ?? {}), [docId]: next },
    }));
    if (save) {
      upsertPrepDocStatus(createClient(), currentId, docId, next).catch((err) =>
        setError(err instanceof Error ? err.message : "準備状況の保存に失敗しました"),
      );
    }
  };

  const today = todayStr();
  const filledDocKeys = new Set(docs.filter((d) => d.storage_path).map((d) => d.doc_key));
  // 健康診断書の完了判定は詳細（様式・受診項目・就労可の後日結果）まで含める
  const healthComplete = isHealthDetailComplete(
    healthDetail,
    filledDocKeys.has("kenshin"),
    healthOn,
    today,
  );
  // 完了判定は「添付＋準備状況が完了」の両方（ステータスの無い書類は添付のみ）
  const statusValues = Object.fromEntries(
    Object.entries(docStatuses).map(([docId, v]) => [docId, v.status]),
  );
  const { items, missing } = evaluatePrepChecklist(
    meta,
    {
      filledDocKeys,
      photoPath: photoExists ? "yes" : null,
      healthComplete,
      hasResidenceCard,
      hasPassportFile,
    },
    statusValues,
  );

  const currentReiwa = reiwaYear(today);
  // 課税・納税証明書の基準日（対象年度の1月1日）時点の住所
  const kazeiRefAddress =
    meta.target_reiwa != null ? addressOnDate(addresses, reiwaJan1(meta.target_reiwa)) : null;

  // 書類の実際の保存キー（源泉徴収票は対象年度の前年分で変わる）。写真はキーなし。
  const resolveDocKey = (def: PrepDocDef): string | null => {
    switch (def.source.kind) {
      case "doc":
        return def.source.docKey;
      case "docYear":
        // 課税・納税証明書は対象年度ごとに別ファイルとして蓄積する
        return meta.target_reiwa != null
          ? prepYearDocKey(def.source.baseKey, meta.target_reiwa)
          : null;
      case "gensenYear":
        return meta.target_reiwa != null ? gensenDocKey(meta.target_reiwa - 1) : null;
      case "health":
        return "kenshin";
      case "photo":
      // 在留カード・パスポートは移行先（在留カード・指定書／パスポートの記録）で管理するためキーなし
      case "residenceCardDoc":
      case "passportFile":
        return null;
    }
  };

  async function patchMeta(patch: Partial<PrepChecklistMeta>) {
    if (selected == null || current == null) return;
    const next: PrepChecklistMeta = {
      app_type: current.app_type,
      has_kokuho: current.has_kokuho,
      has_nenkin: current.has_nenkin,
      target_reiwa: current.target_reiwa,
      kenshin_items_ok: current.kenshin_items_ok,
      tantou: current.tantou,
      cert_pattern: current.cert_pattern,
      ...patch,
    };
    setLists((ls) => ls.map((l) => (l.todo_no === selected ? { ...l, ...patch } : l)));
    setError(null);
    try {
      await upsertPrepChecklist(createClient(), workerId, selected, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    }
  }

  // 新しい準備リストを作成する。番号が空なら通し番号で自動採番し、TODO一覧にも登録する
  async function createList() {
    let todo = newTodo.trim();
    if (todo && lists.some((l) => l.todo_no === todo)) {
      setSelected(todo);
      setNewTodo("");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      if (!todo) {
        // 自動採番（既存のNotion由来の番号の続き）。TODO一覧（/todos）にも行を作る
        const row = await insertTodo(createClient(), {
          kind: "申請準備",
          worker_id: workerId,
          title: "申請準備",
        });
        todo = row.todo_no;
      } else {
        // 手入力の番号もTODO一覧に登録する（TODO機能が未適用・番号重複なら黙って続行）
        await insertTodo(createClient(), {
          kind: "申請準備",
          worker_id: workerId,
          title: "申請準備",
          todo_no: todo,
        }).catch(() => undefined);
      }
      await upsertPrepChecklist(createClient(), workerId, todo, EMPTY_PREP_META);
      // 申請準備で番号を入れたときと同じように、この番号で「準備中」にする。
      // これで申請一覧の「申請前＜準備中＞」にも出る（すでに対応状況が
      // 入っている人は、その状況を変えない）
      if (worker) {
        await updateWorker(createClient(), workerId, {
          residence_renewal_todo: todo,
          ...(worker.residence_renewal_status === "" ? { residence_renewal_status: "準備中" } : {}),
        });
        setRenewalWorker((w) =>
          w
            ? {
                ...w,
                residence_renewal_todo: todo,
                residence_renewal_status: w.residence_renewal_status || "準備中",
              }
            : w,
        );
      }
      const rows = await listPrepChecklists(createClient(), workerId);
      setLists(rows);
      setSelected(todo);
      setNewTodo("");
    } catch (err) {
      setError(dbErrorMessage(err, "0102_todos.sql", "作成に失敗しました"));
    } finally {
      setCreating(false);
    }
  }

  // 表示中のリストのTODO番号を変更する（TODO一覧側の番号も一緒にそろえる）
  async function renameList() {
    if (selected == null || current == null) return;
    const next = window.prompt("新しいTODO番号を入力してください", selected)?.trim();
    if (!next || next === selected) return;
    if (lists.some((l) => l.todo_no === next)) {
      setError(`TODO番号「${next}」の準備リストはすでにあります。`);
      return;
    }
    setError(null);
    try {
      await updatePrepChecklistTodoNo(createClient(), current.id, next);
      // TODO一覧（/todos）と申請準備の対応状況の番号もそろえる（無ければ何もしない）
      await renameTodoNo(createClient(), "申請準備", workerId, selected, next).catch(() => undefined);
      if (worker && renewalWorker?.residence_renewal_todo === selected) {
        await updateWorker(createClient(), workerId, { residence_renewal_todo: next });
        setRenewalWorker((w) => (w ? { ...w, residence_renewal_todo: next } : w));
      }
      const rows = await listPrepChecklists(createClient(), workerId);
      setLists(rows);
      setSelected(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "番号の変更に失敗しました");
    }
  }

  // 表示中のTODOの準備リストを削除する（添付済みの書類ファイル自体は消えない）。
  // 間違えて「リストを追加」したときは、番号のチップの🗑からもここに来る
  async function removeList() {
    if (selected == null) return;
    const label = selected || "（番号未設定）";
    if (!window.confirm(`「${label}」の準備リストを削除します。添付済みの書類ファイルは削除されません。TODO一覧の同じ番号のTODOは削除フォルダに移動します。よろしいですか？`))
      return;
    setError(null);
    try {
      await deletePrepChecklist(createClient(), workerId, selected);
      // TODO一覧（/todos）にできた同じ番号の行も削除フォルダへ移す（無ければ何もしない）
      if (selected) {
        const supabase = createClient();
        const { data: t } = await supabase
          .from("todos")
          .select("id")
          .eq("kind", "申請準備")
          .eq("worker_id", workerId)
          .eq("todo_no", selected)
          .is("deleted_at", null)
          .limit(1)
          .then((res) => (res.error ? { data: null } : res));
        const todoId = ((t as { id: string }[] | null) ?? [])[0]?.id;
        if (todoId) await deleteTodo(supabase, todoId).catch(() => undefined);
      }
      const rows = lists.filter((l) => l.todo_no !== selected);
      setLists(rows);
      setSelected(rows[0]?.todo_no ?? null);
      loadWorkerTodos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  }

  function startAttach(def: PrepDocDef) {
    setError(null);
    if (def.source.kind === "photo") {
      photoInputRef.current?.click();
      return;
    }
    const key = resolveDocKey(def);
    if (!key) {
      setError("先に対象年度（令和）を入力してください。");
      return;
    }
    uploadRef.current = { docKey: key, label: prepDocLabel(def, meta.target_reiwa, currentReiwa) };
    docInputRef.current?.click();
  }

  // 画像の追加添付（2枚目以降）。空いている枝番キー（{base}_p2, _p3 …）へ保存する
  function startAttachPage(def: PrepDocDef, files: OnboardingDocumentRow[]) {
    setError(null);
    const key = resolveDocKey(def);
    if (!key) {
      setError("先に対象年度（令和）を入力してください。");
      return;
    }
    const keys = new Set(files.map((f) => f.doc_key));
    let page = 2;
    while (keys.has(prepPageKey(key, page))) page++;
    uploadRef.current = {
      docKey: prepPageKey(key, page),
      label: `${prepDocLabel(def, meta.target_reiwa, currentReiwa)}（${page}枚目）`,
    };
    docInputRef.current?.click();
  }

  // その書類に添付済みのファイル一覧（基本キー＋追加添付の枝番キー。年度なしの旧形式も含む）
  function docFilesFor(def: PrepDocDef): OnboardingDocumentRow[] {
    const key = resolveDocKey(def);
    if (!key) return [];
    let files = docs.filter((d) => d.storage_path && isPrepPageKeyOf(key, d.doc_key));
    if (files.length === 0 && def.source.kind === "docYear") {
      const base = def.source.baseKey;
      files = docs.filter((d) => d.storage_path && isPrepPageKeyOf(base, d.doc_key));
    }
    return files.sort((a, b) => a.doc_key.localeCompare(b.doc_key, "en"));
  }

  async function uploadDoc(
    target: { docKey: string; label: string },
    file: File | undefined,
  ) {
    if (!file) return;
    setBusyKey(target.docKey);
    setError(null);
    try {
      await uploadOnboardingDoc(workerId, { key: target.docKey, label: target.label, num: 0 }, file);
      await loadDocs();
      // 源泉徴収票など、外国人詳細の他のセクションと共有している書類にも反映する
      notifyWorkerDocsChanged(workerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDocFile(file: File | undefined) {
    const target = uploadRef.current;
    if (target) await uploadDoc(target, file);
  }

  // ドラッグ&ドロップでの添付。顔写真はそのまま、書類は既存の枚数に応じた枝番キーへ保存する
  async function dropAttach(def: PrepDocDef, file: File | undefined) {
    if (!file) return;
    setError(null);
    if (def.source.kind === "photo") {
      await handlePhotoFile(file);
      return;
    }
    const key = resolveDocKey(def);
    if (!key) {
      setError("先に対象年度（令和）を入力してください。");
      return;
    }
    const existing = docFilesFor(def);
    if (existing.length === 0) {
      await uploadDoc(
        { docKey: key, label: prepDocLabel(def, meta.target_reiwa, currentReiwa) },
        file,
      );
      return;
    }
    const keys = new Set(existing.map((f) => f.doc_key));
    let page = 2;
    while (keys.has(prepPageKey(key, page))) page++;
    await uploadDoc(
      {
        docKey: prepPageKey(key, page),
        label: `${prepDocLabel(def, meta.target_reiwa, currentReiwa)}（${page}枚目）`,
      },
      file,
    );
  }

  async function handlePhotoFile(file: File | undefined) {
    if (!file) return;
    setBusyKey("photo");
    setError(null);
    try {
      const url = await uploadWorkerPhoto(workerId, file);
      setPhotoExists(true);
      setPhotoUrl(url);
      // 外国人詳細の見出しの写真もこの最新版に差し替える
      notifyWorkerPhotoChanged(workerId, url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "写真のアップロードに失敗しました");
    } finally {
      setBusyKey(null);
    }
  }

  async function removeDoc(key: string, label: string) {
    if (!window.confirm(`「${label}」の保存データを削除します。よろしいですか？`)) return;
    setBusyKey(key);
    setError(null);
    try {
      const res = await clearOnboardingDocFile(workerId, key);
      if (!res.ok) throw new Error(res.message);
      await loadDocs();
      notifyWorkerDocsChanged(workerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusyKey(null);
    }
  }

  async function previewDoc(id: string) {
    const res = await getOnboardingDocPreviewUrl(id);
    if (!res.ok) return setError(res.message);
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function downloadDoc(id: string) {
    const res = await getOnboardingDocDownloadUrl(id);
    if (!res.ok) return setError(res.message);
    const a = document.createElement("a");
    a.href = res.url;
    a.download = res.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function previewPhoto() {
    let url = photoUrl;
    if (!url && photoPath) url = await getWorkerPhotoUrl(photoPath);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  const inputCls =
    "rounded-lg border border-border bg-surface px-2.5 py-2 text-sm focus:border-brand focus:outline-none disabled:opacity-60";

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted">
        <ClipboardList size={15} />
        申請準備 書類チェックリスト
      </h2>
      <p className="mb-3 text-[11px] text-muted">
        Notion申請TODO番号ごとに準備リストを作成できます。申請種別と加入状況を選ぶと、必要書類と不足がわかります。各書類はこの場で添付できます。
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* 申請準備TODOのステータス（本人の名前の下に常時表示・編集可） */}
      <PrepTodoStatusField
        todo={currentTodo}
        options={todoOptions}
        canEdit={canEdit}
        onError={setError}
        onChanged={loadWorkerTodos}
      />

      {/* 現在の住所（未登録なら入力して保存できる） */}
      <PrepAddressField
        workerId={workerId}
        address={workerRow?.address ?? ""}
        canEdit={canEdit}
        onSaved={(a) => setWorkerRow((w) => (w ? { ...w, address: a } : w))}
      />

      {/* PC: TODO番号〜保険の選択までを左に、書類関係を右に表示して下にスクロールする */}
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
      <div className="lg:sticky lg:top-0 lg:self-start">

      {/* TODO番号ごとの準備リスト切り替え */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3">
        <p className="mb-2 text-xs font-bold text-muted">申請TODO番号</p>
        {lists.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {lists.map((l) => (
              <span
                key={l.id}
                className={`inline-flex items-center overflow-hidden rounded-full ${
                  selected === l.todo_no
                    ? "bg-brand text-brand-foreground"
                    : "border border-border text-muted"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelected(l.todo_no)}
                  className="px-3 py-1.5 text-xs font-bold"
                >
                  {l.todo_no || "（番号未設定）"}
                </button>
                {/* 間違えて追加したリストはここからすぐ削除できる（選択中のものだけ表示） */}
                {canEdit && selected === l.todo_no && (
                  <button
                    type="button"
                    aria-label={`準備リスト ${l.todo_no || "（番号未設定）"} を削除`}
                    onClick={removeList}
                    className="py-1.5 pl-0.5 pr-2.5"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {/* 追加フォームはTODO番号がまだ無いときだけ出す（1人1番号が基本。
            間違えて登録した番号は上のチップの🗑で削除してから登録し直す） */}
        {canEdit ? (
          lists.length === 0 && (
            <div className="flex gap-2">
              <input
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                placeholder="空のまま追加でTODO番号を自動採番"
                className={`${inputCls} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={createList}
                disabled={creating}
                className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-brand-foreground disabled:opacity-50"
              >
                {creating ? "作成中…" : "リストを追加"}
              </button>
            </div>
          )
        ) : (
          lists.length === 0 && <p className="text-xs text-muted">準備リストはまだありません。</p>
        )}

        {/* この番号が単独申請か連名申請か。連名なら相手を名前検索してTODO番号と紐づける */}
        {current != null && (
          <JointApplicationField
            workerId={workerId}
            workerName={workerRow?.name ?? ""}
            row={current}
            canEdit={canEdit}
            onChange={(patch) => void saveExtras(patch)}
          />
        )}

        {/* 申請準備（在留更新対象）と同じ入力欄。ここで「準備中」にすると
            申請一覧の「申請前＜準備中＞」に出る（担当者は下の欄で選ぶ） */}
        {renewalWorker && canEdit && (
          <div className="mt-3 border-t border-dashed border-border pt-3">
            <p className="mb-2 text-xs font-bold text-muted">
              申請準備の対応状況（申請一覧の「申請前＜準備中＞」に反映されます）
            </p>
            <WorkerRenewalFields
              key={`${renewalWorker.residence_renewal_todo}/${renewalWorker.residence_renewal_status}`}
              worker={renewalWorker}
              organizations={organizations}
              canEdit={canEdit}
              today={today}
              fixedTodo={selected ?? renewalWorker.residence_renewal_todo ?? ""}
              showTantou={false}
              showLinks={false}
              showPrepKind
            />
          </div>
        )}
      </div>

      {/* 条件の選択（申請種別の下に所属機関の情報を表示する） */}
      {current != null && (
      <div className="mb-3 space-y-2.5 rounded-xl border border-border bg-background p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-bold text-muted">
            申請種別
            <select
              value={meta.app_type}
              disabled={!canEdit}
              onChange={(e) => patchMeta({ app_type: e.target.value as PrepChecklistMeta["app_type"] })}
              className={inputCls}
            >
              <option value="">選択してください</option>
              {PREP_APP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PREP_APP_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-bold text-muted">
            対象年度 令和
            <input
              type="number"
              min={1}
              max={99}
              value={meta.target_reiwa ?? ""}
              disabled={!canEdit}
              placeholder={`${reiwaYear(today)}`}
              onChange={(e) =>
                patchMeta({ target_reiwa: e.target.value ? Number(e.target.value) : null })
              }
              className={`${inputCls} w-20 tabular-nums`}
            />
            年
          </label>
          <label className="flex items-center gap-1.5 text-xs font-bold text-muted">
            担当者
            <select
              value={meta.tantou}
              disabled={!canEdit}
              onChange={(e) => patchMeta({ tantou: e.target.value })}
              className={inputCls}
            >
              <option value="">未定（あとで申請一覧から設定可）</option>
              {PREP_TANTOU_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* 申請種別の下: 所属機関の情報（住所・電話・代表者・協力確認書・売上高・定期報告/賃金台帳） */}
        <PrepOrgInfo orgId={prepOrgId} />

        {/* 合格証の組み合わせ（申請内容で必要な合格証が変わる。更新申請では不要） */}
        {meta.app_type && meta.app_type !== "更新" && (
          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1 text-xs font-bold text-muted">
              合格証の組み合わせ
              <select
                value={meta.cert_pattern}
                disabled={!canEdit}
                onChange={(e) =>
                  patchMeta({ cert_pattern: e.target.value as PrepChecklistMeta["cert_pattern"] })
                }
                className={inputCls}
              >
                <option value="">未選択（合格証3種をすべて表示）</option>
                {PREP_CERT_PATTERNS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {/* 本人の合格証の登録状況。下までスクロールしなくても組み合わせを選べるようにする */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted">本人の登録状況:</span>
              {(
                [
                  ["専門級", "cert_senmonkyu"],
                  ["日本語", "cert_nihongo"],
                  ["専門外", "cert_senmongai"],
                  ["技能評価調書", "prep_hyoka_chosho"],
                ] as const
              ).map(([certLabel, certKey]) => {
                const has = filledDocKeys.has(certKey);
                return (
                  <span
                    key={certKey}
                    className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      has
                        ? "bg-status-approved-bg text-status-approved-fg"
                        : "bg-seal/10 text-seal"
                    }`}
                  >
                    {has && <CheckCircle2 size={11} />}
                    {certLabel} {has ? "登録済み" : "未登録"}
                  </span>
                );
              })}
            </div>
            {/* 外国人詳細で登録している合格証の項目と、アップロード済みの合格証データ。
                ここで内容を確認してから上の組み合わせを選べる */}
            <div className="space-y-1 rounded-lg bg-surface/60 p-2">
              <p className="text-[11px] font-bold text-muted">外国人詳細で登録している合格証</p>
              <p className="text-[11px]">
                専門級の合格名: {workerRow?.specialty_grade || "未登録"}
                <span className="mx-1 text-muted">／</span>
                その他の資格・合格名: {workerRow?.other_qualifications || "未登録"}
              </p>
              {(
                [
                  ["専門級の合格証", "cert_senmonkyu"],
                  ["日本語の合格証", "cert_nihongo"],
                  ["専門外の合格証", "cert_senmongai"],
                  ["技能評価調書", "prep_hyoka_chosho"],
                ] as const
              ).map(([certLabel, certKey]) => {
                const certFiles = docs.filter(
                  (d) => d.storage_path && isPrepPageKeyOf(certKey, d.doc_key),
                );
                return (
                  <div key={certKey} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-bold">{certLabel}:</span>
                    {certFiles.length === 0 ? (
                      <span className="text-muted">データなし</span>
                    ) : (
                      certFiles.map((f) => (
                        <span key={f.id} className="inline-flex items-center gap-1">
                          <span className="max-w-[11rem] truncate">{f.file_name}</span>
                          <IconButton label="表示" onClick={() => void previewDoc(f.id)}>
                            <Eye size={11} />
                          </IconButton>
                          <IconButton label="ダウンロード" onClick={() => void downloadDoc(f.id)}>
                            <Download size={11} />
                          </IconButton>
                        </span>
                      ))
                    )}
                  </div>
                );
              })}
              <p className="text-[10px] text-muted">
                この登録状況とデータを見て、上の「合格証の組み合わせ」を選んでください。
              </p>
              {/* まだ添付していない合格証・調書はここから添付できる（外国人詳細と同じ保存先） */}
              <div className="border-t border-dashed border-border pt-1.5">
                <p className="mb-1 text-[10px] font-bold text-muted">
                  添付・差し替え（外国人詳細と同じ保存先に入ります）
                </p>
                <WorkerCertDocRows
                  workerId={workerId}
                  canEdit={canEdit}
                  defs={[
                    { key: "cert_senmonkyu", label: "専門級の合格証" },
                    { key: "cert_nihongo", label: "日本語の合格証" },
                    { key: "cert_senmongai", label: "専門外の合格証" },
                    { key: "prep_hyoka_chosho", label: "技能評価調書" },
                  ]}
                />
              </div>
              {/* 良好に修了した技能実習2号（職種名・作業名・良好修了の証明）もこの場で入力できる */}
              <Jisshu2Section workerId={workerId} canEdit={canEdit} />
            </div>
          </div>
        )}
        {/* 在留カード・パスポート情報（外国人詳細から自動反映。どの申請種別でも表示） */}
        {workerRow && (
          <div className="space-y-0.5 rounded-lg bg-surface/60 p-2">
            <p className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold text-muted">
              在留カード・パスポート情報（外国人詳細から自動反映）
              <Link
                href={`/workers/${workerId}`}
                className="font-bold text-brand hover:underline"
              >
                外国人詳細で直す →
              </Link>
            </p>
            {(
              [
                ["在留資格", workerRow.residence_status],
                ["在留カード番号", workerRow.residence_card_no],
                ["在留期限", workerRow.residence_expiry_date],
                ["パスポート番号", workerRow.passport_no],
                ["パスポート有効期限", workerRow.passport_expiry_date],
              ] as const
            ).map(([label, value]) => (
              <p key={label} className="text-[11px] leading-relaxed">
                <span className="text-muted">{label}: </span>
                {value ? (
                  <span className="font-bold">{value}</span>
                ) : (
                  <span className="text-seal">未登録</span>
                )}
              </p>
            ))}
            {/* 外国人詳細の登録内容から自動で作られる履歴書もここから確認できる */}
            <p className="border-t border-dashed border-border pt-1 text-[11px]">
              <Link
                href={`/workers/${workerId}/resume`}
                target="_blank"
                className="font-bold text-brand hover:underline"
              >
                📄 履歴書を開く →
              </Link>
              <span className="ml-1 text-muted">
                （外国人詳細の登録内容から自動作成。職歴・住所もここで確認できます）
              </span>
            </p>
          </div>
        )}
        {/* 在留資格認定・特定活動は国保・国民年金の加入を問わないため、チェック欄を出さない */}
        {meta.app_type !== "認定" && meta.app_type !== "特定活動" && (
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs font-bold">
              <input
                type="checkbox"
                checked={meta.has_kokuho}
                disabled={!canEdit}
                onChange={(e) => patchMeta({ has_kokuho: e.target.checked })}
                className="h-4 w-4"
              />
              国民健康保険に加入
            </label>
            <label className="flex items-center gap-1.5 text-xs font-bold">
              <input
                type="checkbox"
                checked={meta.has_nenkin}
                disabled={!canEdit}
                onChange={(e) => patchMeta({ has_nenkin: e.target.checked })}
                className="h-4 w-4"
              />
              国民年金に加入
            </label>
          </div>
        )}
      </div>
      )}

      {/* 左カラムここまで */}
      </div>

      {/* 右カラム: 必要書類などの書類関係の情報（下にスクロールして見ていく） */}
      <div>
      {current == null ? (
        <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
          TODO番号を追加すると、そのTODOに対する準備リストが表示されます。
        </p>
      ) : (
        <>
      {!meta.app_type ? (
        <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
          申請種別を選ぶと、必要書類のチェックリストが表示されます。
        </p>
      ) : (
        <>
          {/* 不足サマリ */}
          {missing.length === 0 ? (
            <p className="mb-3 flex items-center gap-1.5 rounded-xl bg-status-approved-bg px-3 py-2.5 text-sm font-bold text-status-approved-fg">
              <CheckCircle2 size={15} />
              必要書類はすべて揃っています
            </p>
          ) : (
            <div className="mb-3 rounded-xl border border-seal/40 bg-seal/5 px-3 py-2.5">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-seal">
                <TriangleAlert size={15} />
                不足 {missing.length}件
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-seal">
                {missing.map((m) => (
                  <li key={m.def.id}>{prepDocLabel(m.def, meta.target_reiwa, currentReiwa)}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 課税・納税証明書の「1月1日時点の住所」案内（郵送請求先の判断用） */}
          {meta.target_reiwa != null && (
            <div className="mb-3 rounded-xl border border-status-applied-fg/30 bg-status-applied-bg/40 px-3 py-2.5 text-xs text-status-applied-fg">
              <p className="font-bold">
                令和{meta.target_reiwa}年1月1日（{reiwaJan1(meta.target_reiwa)}）時点の住所
              </p>
              <p className="mt-0.5">
                {kazeiRefAddress
                  ? `${kazeiRefAddress.address} → この住所の市区町村へ課税・市県民税納税証明書を郵送請求してください。`
                  : "住所歴が未登録です。外国人詳細の「住所歴」に転入日と住所を登録すると、請求先を判定できます。"}
              </p>
            </div>
          )}

          {/* 書類一覧 */}
          <div className="overflow-hidden rounded-xl border border-border">
            {items.map((item) => {
              const key = resolveDocKey(item.def);
              const files = docFilesFor(item.def);
              const isPhoto = item.def.source.kind === "photo";
              return (
                <DocRow
                  key={item.def.id}
                  item={item}
                  meta={meta}
                  workerId={workerId}
                  files={files}
                  isPhoto={isPhoto}
                  canEdit={canEdit}
                  busy={busyKey != null && (isPhoto ? busyKey === "photo" : busyKey.startsWith(key ?? " "))}
                  ds={{ ...EMPTY_PREP_DOC_STATUS, ...(docStatuses[item.def.id] ?? {}) }}
                  custodyNo={custodyNo}
                  healthOn={healthOn}
                  plannedAppOn={current?.planned_app_on ?? null}
                  onSaveHealthOn={saveHealthOn}
                  onSavePlannedAppOn={(v) => void saveExtras({ planned_app_on: v })}
                  onPatchStatus={(patch, save) => patchDocStatus(item.def.id, patch, save)}
                  onAttach={() => startAttach(item.def)}
                  onDropFiles={(files) => void dropAttach(item.def, files[0])}
                  onAddPage={() => startAttachPage(item.def, files)}
                  onRemoveFile={(f) =>
                    void removeDoc(
                      f.doc_key,
                      `${prepDocLabel(item.def, meta.target_reiwa, currentReiwa)}（${f.file_name}）`,
                    )
                  }
                  onPreviewFile={(f) => void previewDoc(f.id)}
                  onPreviewPhoto={() => void previewPhoto()}
                  onDownloadFile={(f) => void downloadDoc(f.id)}
                />
              );
            })}
          </div>
        </>
      )}

      {/* 必要な書類の下: 署名・賃金（1-6号別紙）・あっせん・日付計算 */}
      <div className="mt-3 space-y-3">
        {/* 本人から署名をもらったかどうかのステータス */}
        <PrepSignStatusField
          value={current.sign_status}
          canEdit={canEdit}
          onChange={(v) => void saveExtras({ sign_status: v })}
        />
        {/* 賃金（1-6号別紙）: モーダル表示ではこの中で直接入力し、
            「申請の時点でこの内容」という記録を申請準備に残す。
            外国人詳細では賃金の記録カードが別にあるため、要約とリンクのみ */}
        {embedEmployment ? (
          <PrepEmploymentSection workerId={workerId} canEdit={canEdit} showWages />
        ) : (
          <>
            <PrepWageSummary workerId={workerId} />
            {/* 雇用契約書・雇用条件書（日付なし版・正式版）は申請準備の中で保管する */}
            <PrepEmploymentSection workerId={workerId} canEdit={canEdit} showWages={false} />
          </>
        )}
        {/* あっせんの有無（申請準備のTODOと共有） */}
        <PrepAssenSection
          workerId={workerId}
          todo={currentTodo}
          canEdit={canEdit}
          onError={setError}
          onChanged={loadWorkerTodos}
        />
        {/* 支援計画書の日付計算ツール（求人日付のカレンダー表示付き）と保存済みの日付 */}
        <Link
          href={`/todos/plan-dates?workerId=${workerId}&name=${encodeURIComponent(
            workerRow?.name ?? "",
          )}&todo=${encodeURIComponent(current.todo_no)}`}
          className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold text-brand"
        >
          📅 日付計算: 支援計画書の日付計算ツール（求人日付のカレンダー表示付き）を開く →
        </Link>
        <SavedPlanDatesSection workerId={workerId} todoNo={current.todo_no} canEdit={canEdit} />
      </div>

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={renameList}
            className="flex items-center gap-1 text-xs font-bold text-brand"
          >
            TODO番号を変更（{current.todo_no || "番号未設定"}）
          </button>
          <button
            type="button"
            onClick={removeList}
            className="flex items-center gap-1 text-xs font-bold text-seal"
          >
            <Trash2 size={13} />
            この準備リスト（{(current.todo_no || "番号未設定")}）を削除
          </button>
        </div>
      )}
        </>
      )}

      {/* 右カラム・PC2カラムのグリッドここまで */}
      </div>
      </div>

      {/* 書類（画像・PDF）用の隠しファイル入力 */}
      <input
        ref={docInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          void handleDocFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {/* 顔写真用の隠しファイル入力（画像のみ） */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handlePhotoFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </Card>
  );
}

function DocRow({
  item,
  meta,
  workerId,
  files,
  isPhoto,
  canEdit,
  busy,
  ds,
  custodyNo,
  healthOn = null,
  plannedAppOn = null,
  onSaveHealthOn,
  onSavePlannedAppOn,
  onPatchStatus,
  onAttach,
  onDropFiles,
  onAddPage,
  onRemoveFile,
  onPreviewFile,
  onPreviewPhoto,
  onDownloadFile,
}: {
  item: PrepDocStatus;
  meta: PrepChecklistMeta;
  workerId: string;
  files: OnboardingDocumentRow[];
  isPhoto: boolean;
  canEdit: boolean;
  busy: boolean;
  ds: PrepDocStatusInput;
  custodyNo: number | null;
  healthOn?: string | null; // 健康診断の受診日（健康診断書の行で使う）
  plannedAppOn?: string | null; // 申請予定日（健康診断書の有効チェックに使う）
  onSaveHealthOn?: (v: string | null) => void;
  onSavePlannedAppOn?: (v: string | null) => void;
  onPatchStatus: (patch: Partial<PrepDocStatusInput>, save?: boolean) => void;
  onAttach: () => void;
  onDropFiles: (files: FileList) => void;
  onAddPage: () => void;
  onRemoveFile: (f: OnboardingDocumentRow) => void;
  onPreviewFile: (f: OnboardingDocumentRow) => void;
  onPreviewPhoto: () => void;
  onDownloadFile: (f: OnboardingDocumentRow) => void;
}) {
  const { def, satisfied, fileSatisfied } = item;
  const label = prepDocLabel(def, meta.target_reiwa, reiwaYear(todayStr()));
  const hasFile = files.length > 0;

  // 書類ごとの準備状況（ステータス）。選択肢と、選択に応じた付随入力を表示する
  const statusOptions = PREP_DOC_STATUS_OPTIONS[def.id];
  const selectedOption = prepStatusOption(def.id, ds.status);
  const extras: PrepStatusExtra[] = [
    ...(selectedOption?.extras ?? []),
    ...(PREP_DOC_ALWAYS_EXTRAS[def.id] ?? []),
  ];

  return (
    <FileDropArea
      onFiles={onDropFiles}
      disabled={!canEdit || busy}
      className="border-b border-border bg-background px-3 py-2.5 text-sm last:border-b-0"
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${satisfied ? "bg-status-approved-fg" : "bg-seal"}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold">{label}</span>
            {def.viaMail && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-status-applied-bg px-1.5 py-0.5 text-[10px] font-bold text-status-applied-fg">
                <Mail size={10} />
                郵送請求
              </span>
            )}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                satisfied
                  ? "bg-status-approved-bg text-status-approved-fg"
                  : "bg-seal/10 text-seal"
              }`}
            >
              {satisfied ? "完了" : "不足"}
            </span>
            {!satisfied && fileSatisfied && (
              <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-bold text-muted ring-1 ring-border">
                添付済み・準備状況が未完了
              </span>
            )}
          </span>
          {def.note && <span className="mt-0.5 block text-[11px] text-muted">※ {def.note}</span>}
          {def.managedIn && (
            <span className="mt-0.5 block text-[11px] text-muted">「{def.managedIn}」と共有</span>
          )}
        </span>

        {/* 添付・操作 */}
        <div className="flex shrink-0 items-center gap-1">
          {busy ? (
            <Loader2 size={15} className="animate-spin text-muted" />
          ) : (
            <>
              {isPhoto && fileSatisfied && (
                <IconButton label="表示" onClick={onPreviewPhoto}>
                  <Eye size={13} />
                </IconButton>
              )}
              {canEdit && (
                <IconButton label={hasFile || (isPhoto && fileSatisfied) ? "差し替え" : "添付"} onClick={onAttach}>
                  <Upload size={13} />
                  {hasFile || (isPhoto && fileSatisfied) ? "差し替え" : "添付"}
                </IconButton>
              )}
              {canEdit && !isPhoto && hasFile && (
                <IconButton label="画像を追加" onClick={onAddPage}>
                  <Upload size={13} />
                  追加
                </IconButton>
              )}
            </>
          )}
        </div>
      </div>

      {/* 添付ファイル一覧（複数添付に対応。1件ずつ表示・DL・削除できる） */}
      {files.length > 0 && (
        <div className="ml-[18px] mt-1.5 space-y-1">
          {files.map((f, i) => (
            <div key={f.id} className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                {files.length > 1 && <span className="mr-1 font-bold">{i + 1}枚目:</span>}
                {f.file_name}
              </span>
              <IconButton label="表示" onClick={() => onPreviewFile(f)}>
                <Eye size={12} />
              </IconButton>
              <IconButton label="ダウンロード" onClick={() => onDownloadFile(f)}>
                <Download size={12} />
              </IconButton>
              {canEdit && (
                <IconButton label="削除" tone="danger" onClick={() => onRemoveFile(f)}>
                  <Trash2 size={12} />
                </IconButton>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 郵送請求への導線 */}
      {def.viaMail && (
        <Link
          href="/mailing"
          className="ml-[18px] mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
        >
          <ExternalLink size={11} />
          郵送請求ツールを開く
        </Link>
      )}

      {/* 健康診断書: 様式・受診項目・就労可の後日結果は別ページで管理 */}
      {def.source.kind === "health" && (
        <div className="ml-[18px] mt-1.5 space-y-1.5">
          <Link
            href={`/workers/${workerId}/health-check`}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
          >
            <ExternalLink size={11} />
            受診項目・就労可の詳細を確認/入力
          </Link>
          {/* 受診日から1年後まで使用できる。申請予定日に対して使えるかをその場でチェックする */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-muted">
            <label className="flex items-center gap-1.5">
              受診日
              <input
                type="date"
                value={healthOn ?? ""}
                disabled={!canEdit}
                onChange={(e) => onSaveHealthOn?.(e.target.value || null)}
                className="min-h-[32px] rounded-lg border border-border bg-surface px-1.5 text-xs focus:border-brand focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-1.5">
              申請予定日
              <input
                type="date"
                value={plannedAppOn ?? ""}
                disabled={!canEdit}
                onChange={(e) => onSavePlannedAppOn?.(e.target.value || null)}
                className="min-h-[32px] rounded-lg border border-border bg-surface px-1.5 text-xs focus:border-brand focus:outline-none"
              />
            </label>
          </div>
          {(() => {
            const until = healthCheckValidUntil(healthOn);
            if (!until) {
              return (
                <p className="text-[11px] leading-relaxed text-muted">
                  受診日を入力すると、申請予定日に対して使用できるか（受診日から1年後まで有効）を自動でチェックします。
                </p>
              );
            }
            const refDate = plannedAppOn || todayStr();
            const refLabel = plannedAppOn ? `申請予定日（${plannedAppOn}）` : `今日（${refDate}）`;
            const ok = refDate <= until;
            return (
              <p
                className={`rounded-lg px-2 py-1.5 text-[11px] font-bold leading-relaxed ${
                  ok
                    ? "bg-status-approved-bg text-status-approved-fg"
                    : "bg-seal/10 text-seal"
                }`}
              >
                {ok
                  ? `✓ ${refLabel}に使用できます（有効期限: ${until} まで）`
                  : `⚠ ${refLabel}には使用できません（有効期限: ${until}）。再受診が必要です。`}
              </p>
            );
          })()}
        </div>
      )}

      {/* 年金記録: 記号の意味と未納アラートは別ページで確認 */}
      {def.id === "nenkin" && (
        <Link
          href={`/workers/${workerId}/pension`}
          className="ml-[18px] mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
        >
          <ExternalLink size={11} />
          記号の確認・支払/免除の判定
        </Link>
      )}

      {/* 準備状況（ステータス）: 書類ごとの選択肢と付随入力 */}
      {statusOptions && (
        <div className="ml-[18px] mt-2 space-y-1.5 rounded-lg bg-surface/60 p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-muted">準備状況</span>
            <select
              value={ds.status}
              disabled={!canEdit}
              onChange={(e) => onPatchStatus({ status: e.target.value })}
              className="min-h-[32px] max-w-full rounded-lg border border-border bg-background px-1.5 text-xs focus:border-brand focus:outline-none disabled:opacity-60"
            >
              <option value="">未選択</option>
              <optgroup label="準備中">
                {statusOptions
                  .filter((o) => !o.done)
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.value}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="完了">
                {statusOptions
                  .filter((o) => o.done)
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.value}
                    </option>
                  ))}
              </optgroup>
            </select>
            {selectedOption && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  selectedOption.done
                    ? "bg-status-approved-bg text-status-approved-fg"
                    : "bg-status-applied-bg text-status-applied-fg"
                }`}
              >
                {selectedOption.done ? "完了" : "準備中"}
              </span>
            )}
          </div>
          {extras.map((extra, i) => (
            <StatusExtraField
              key={`${ds.status}-${i}`}
              extra={extra}
              ds={ds}
              custodyNo={custodyNo}
              canEdit={canEdit}
              onPatch={onPatchStatus}
            />
          ))}
          {/* 添付する資料項目の選択（年金記録: 年金記録／免除申請書） */}
          {PREP_DOC_ATTACH_ITEMS[def.id] && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] text-muted">添付する資料項目:</span>
              {PREP_DOC_ATTACH_ITEMS[def.id].map((item) => {
                const selected = parseAttachItems(ds.attach_items);
                const checked = selected.includes(item);
                return (
                  <label key={item} className="flex items-center gap-1.5 text-[11px] font-bold">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!canEdit}
                      onChange={(e) =>
                        onPatchStatus({
                          attach_items: serializeAttachItems(
                            e.target.checked
                              ? [...selected, item]
                              : selected.filter((x) => x !== item),
                          ),
                        })
                      }
                      className="h-3.5 w-3.5"
                    />
                    {item}
                  </label>
                );
              })}
            </div>
          )}
          {canEdit && !PREP_MAIL_AFTER_HIDDEN.has(def.id) && (
            <label className="flex items-center gap-1.5 text-[11px]">
              <input
                type="checkbox"
                checked={ds.mail_after_apply}
                onChange={(e) => onPatchStatus({ mail_after_apply: e.target.checked })}
                className="h-3.5 w-3.5"
              />
              申請後に発行され次第、入管へ郵送する（申請詳細にアラート表示・郵送したらチェックを外す）
            </label>
          )}
        </div>
      )}
    </FileDropArea>
  );
}

// 準備状況に付随する入力・表示（依頼先・金額・受診日・預かり番号・郵送請求・レターパック追跡）
function StatusExtraField({
  extra,
  ds,
  custodyNo,
  canEdit,
  onPatch,
}: {
  extra: PrepStatusExtra;
  ds: PrepDocStatusInput;
  custodyNo: number | null;
  canEdit: boolean;
  onPatch: (patch: Partial<PrepDocStatusInput>, save?: boolean) => void;
}) {
  const inputCls =
    "min-h-[32px] w-full rounded-lg border border-border bg-background px-2 text-xs focus:border-brand focus:outline-none disabled:opacity-60";
  switch (extra.kind) {
    case "text":
      return (
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted">{extra.label}</span>
          <input
            value={ds.note}
            readOnly={!canEdit}
            onChange={(e) => onPatch({ note: e.target.value }, false)}
            onBlur={() => onPatch({}, true)}
            className={inputCls}
          />
        </label>
      );
    case "tantou":
      return (
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted">{extra.label}</span>
          <select
            value={ds.note}
            disabled={!canEdit}
            onChange={(e) => onPatch({ note: e.target.value })}
            className={inputCls}
          >
            <option value="">選択してください</option>
            {/* 名簿から外れた保存済みの値（旧・自由入力など）も選択肢として残す */}
            {ds.note &&
              !PREP_TANTOU_OPTIONS.includes(ds.note as (typeof PREP_TANTOU_OPTIONS)[number]) && (
                <option value={ds.note}>{ds.note}</option>
              )}
            {PREP_TANTOU_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      );
    case "textarea":
      return (
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted">{extra.label}</span>
          <textarea
            value={ds.note}
            readOnly={!canEdit}
            rows={2}
            onChange={(e) => onPatch({ note: e.target.value }, false)}
            onBlur={() => onPatch({}, true)}
            className={`${inputCls} min-h-[48px] py-1.5 leading-relaxed`}
          />
        </label>
      );
    case "amount":
      return (
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted">{extra.label}</span>
          <input
            value={ds.amount}
            readOnly={!canEdit}
            inputMode="numeric"
            placeholder="例: 12,000円"
            onChange={(e) => onPatch({ amount: e.target.value }, false)}
            onBlur={() => onPatch({}, true)}
            className={inputCls}
          />
        </label>
      );
    case "date":
      return (
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted">{extra.label}</span>
          <input
            type="date"
            value={ds.date_on ?? ""}
            disabled={!canEdit}
            onChange={(e) => onPatch({ date_on: e.target.value || null })}
            className={inputCls}
          />
        </label>
      );
    case "custody":
      return (
        <p className="text-[11px] font-bold tabular-nums">
          預かり番号:{" "}
          {custodyNo != null ? (
            <span className="text-brand">{formatStorageNo(custodyNo)}</span>
          ) : (
            <span className="font-medium text-muted">
              未預かり（保管ボックスに登録すると表示されます）
            </span>
          )}
        </p>
      );
    case "mailing":
      return (
        <Link
          href="/mailing"
          className="inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
        >
          <ExternalLink size={11} />
          郵送請求ツールで請求状況を確認する
        </Link>
      );
    case "tracking":
      return (
        <div className="space-y-1.5">
          <TrackingNoField
            label="送付レターパックの追跡番号"
            value={ds.tracking_out}
            canEdit={canEdit}
            onChange={(v) => onPatch({ tracking_out: v }, false)}
            onBlur={() => onPatch({}, true)}
          />
          <TrackingNoField
            label="返信用レターパックの追跡番号"
            value={ds.tracking_back}
            canEdit={canEdit}
            onChange={(v) => onPatch({ tracking_back: v }, false)}
            onBlur={() => onPatch({}, true)}
          />
        </div>
      );
  }
}

// レターパック追跡番号の入力（コピー＋日本郵便の追跡ページへのリンク付き）
function TrackingNoField({
  label,
  value,
  canEdit,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  canEdit: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };
  return (
    <div>
      <span className="mb-0.5 block text-[11px] text-muted">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          value={value}
          readOnly={!canEdit}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="例: 1234-5678-9012"
          className="min-h-[32px] min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs tabular-nums focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          onClick={copy}
          aria-label={`${label}をコピー`}
          className="shrink-0 text-muted hover:text-brand disabled:opacity-40"
          disabled={!value.trim()}
        >
          {copied ? <CheckCircle2 size={14} className="text-status-approved-fg" /> : <Copy size={14} />}
        </button>
        {value.trim() && (
          <a
            href={letterPackTrackingUrl(value)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[11px] font-bold text-brand hover:underline"
          >
            追跡
          </a>
        )}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  tone = "default",
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold ${
        tone === "danger" ? "text-seal" : "text-brand"
      }`}
    >
      {children}
    </button>
  );
}
